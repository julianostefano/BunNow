/**
 * ServiceNow Authentication Core - Base Authentication and Configuration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Removed Axios - Using native Bun fetch
import { serviceNowRateLimiter } from "../ServiceNowRateLimit";
import Redis from "ioredis";
import { RedisCache } from "../../bigdata/redis/RedisCache";
import { RedisStreamManager } from "../../bigdata/redis/RedisStreamManager";
import { serviceNowSAMLAuth } from "./ServiceNowSAMLAuth";
import { SAMLConfig, SAMLAuthenticationData } from "../../types/saml";

export interface AuthServiceResponse {
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>;
  headers: Record<string, string>;
}

export interface ServiceNowRecord {
  sys_id: string;
  number: string;
  state: string;
  short_description?: string;
  assignment_group?: {
    display_value: string;
    link: string;
  };
  priority?: string;
  opened_by?: {
    display_value: string;
    link: string;
  };
  sys_created_on?: string;
  sys_updated_on?: string;
  [key: string]: any;
}

export interface ServiceNowQueryResult {
  records: ServiceNowRecord[];
  total: number;
}

export class ServiceNowAuthCore {
  protected authData: AuthServiceResponse | null = null;
  protected samlAuthData: SAMLAuthenticationData | null = null;
  protected isAuthenticated = false;
  protected lastAuthTime = 0;
  protected authTTL = 30 * 60 * 1000; // 30 minutes
  protected redisCache: RedisCache;
  protected redisStreamManager: RedisStreamManager;
  protected authType: "external" | "saml" = "external";
  protected requestHeaders: Record<string, string> = {};
  protected proxyUrl: string;

  protected readonly AUTH_SERVICE_URL = "http://10.219.8.210:8000/auth";
  protected readonly SERVICENOW_INSTANCE = "iberdrola";
  protected readonly SERVICENOW_BASE_URL = `https://${this.SERVICENOW_INSTANCE}.service-now.com`;

  protected readonly PROXY_CONFIG = {
    host: "10.219.77.12",
    port: 8080,
    auth: {
      username: "AMER%5CE966380",
      password: "Neoenergia%402026",
    },
  };

  constructor() {
    this.setupEnvironment();
    this.initializeFetchClient();
    this.initializeRedis();
    this.setupLogging();

    // Determine authentication type from environment
    this.authType =
      (process.env.SERVICENOW_AUTH_TYPE as "external" | "saml") || "external";
    console.log(`🔐 ServiceNow authentication type: ${this.authType}`);
  }

  private setupEnvironment(): void {
    process.env.http_proxy =
      "http://AMER%5CE966380:Neoenergia%402026@10.219.77.12:8080";
    process.env.https_proxy =
      "http://AMER%5CE966380:Neoenergia%402026@10.219.77.12:8080";
    process.env.no_proxy =
      "10.219.8.210,localhost,127.0.0.1,ibfs.iberdrola.com,10.219.0.41";
  }

  private initializeFetchClient(): void {
    // ServiceNow MUST use proxy - corporate rule
    this.proxyUrl =
      process.env.SERVICENOW_PROXY ||
      "http://AMER%5CE966380:Neoenergia%402026@10.219.77.12:8080";

    console.log(
      `🌐 ServiceNow API will use proxy: ${this.proxyUrl.replace(/\/\/.*@/, "//***:***@")}`,
    );
    console.log(`📋 Proxy format details:`);
    console.log(`  - Full URL: ${this.proxyUrl}`);
    console.log(`  - Username: AMER\\E966380 (encoded as AMER%5CE966380)`);
    console.log(`  - Password: Neoenergia@2026 (encoded as Neoenergia%402026)`);
    console.log(`  - Host: 10.219.77.12`);
    console.log(`  - Port: 8080`);

    // Set proxy environment variables for Bun fetch to use automatically
    process.env.HTTP_PROXY = this.proxyUrl;
    process.env.HTTPS_PROXY = this.proxyUrl;

    console.log("🔧 Proxy environment variables set for Bun fetch");

    // Initialize default headers for all requests
    this.requestHeaders = {
      "User-Agent": "BunSNC-ServiceNow-Client/1.0",
      Accept: "application/json",
      "Content-Type": "application/json",
      Connection: "keep-alive",
    };

    console.log("✅ Native Bun fetch client initialized");
  }

  private initializeRedis(): void {
    const redis = new Redis({
      host: process.env.REDIS_HOST || "10.219.8.210",
      port: parseInt(process.env.REDIS_PORT || "6380"),
      password: process.env.REDIS_PASSWORD || "nexcdc2025",
      db: parseInt(process.env.REDIS_DB || "1"),
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    this.redisCache = new RedisCache(redis, {
      keyPrefix: "servicenow:cache:",
      defaultTtl: 120, // 2 minutes for faster refresh
      enableMetrics: true,
    });

    this.redisStreamManager = new RedisStreamManager({
      host: process.env.REDIS_HOST || "10.219.8.210",
      port: parseInt(process.env.REDIS_PORT || "6380"),
      password: process.env.REDIS_PASSWORD || "nexcdc2025",
    });
  }

  private setupLogging(): void {
    console.log(" ServiceNow Auth Client initialized with Redis Streams");
    console.log(` ServiceNow URL: ${this.SERVICENOW_BASE_URL}`);
    console.log(` Using environment proxy variables`);
    console.log("📦 Redis cache enabled");
  }

  /**
   * Authenticate with ServiceNow using configured authentication type
   */
  protected async authenticate(): Promise<void> {
    const now = Date.now();

    if (this.isAuthenticated && now - this.lastAuthTime < this.authTTL) {
      return;
    }

    if (this.authType === "saml") {
      await this.authenticateWithSAML();
    } else {
      await this.authenticateWithExternalService();
    }
  }

  /**
   * Authenticate with ServiceNow using external auth service (legacy) with proxy retry
   */
  private async authenticateWithExternalService(): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🔐 Authenticating with ServiceNow external auth service (attempt ${attempt}/${maxRetries})...`,
        );
        console.log(`Auth URL: ${this.AUTH_SERVICE_URL}`);
        console.log(`Proxy: ${this.proxyUrl.replace(/\/\/.*@/, "//***:***@")}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 900000); // 15 minutes timeout

        try {
          const authConfig: RequestInit = {
            method: "GET",
            headers: this.requestHeaders,
            signal: controller.signal,
          };

          // Configure proxy and SSL for auth request
          const bunAuthConfig = authConfig as any;
          bunAuthConfig.verbose = true;
          bunAuthConfig.tls = {
            rejectUnauthorized: false,
            checkServerIdentity: () => undefined,
          };
          bunAuthConfig.proxy = this.proxyUrl;

          console.log(`Proxy format being used: ${this.proxyUrl}`);

          const authResponse = await fetch(this.AUTH_SERVICE_URL, authConfig, {
            verbose: true,
          });

          if (!authResponse.ok) {
            throw new Error(
              `Auth service returned status ${authResponse.status}: ${authResponse.statusText}`,
            );
          }

          this.authData = (await authResponse.json()) as AuthServiceResponse;

          if (!this.authData.cookies || !Array.isArray(this.authData.cookies)) {
            throw new Error("Invalid auth response: missing cookies");
          }

          this.configureFetchWithAuth();

          this.isAuthenticated = true;
          this.lastAuthTime = Date.now();

          console.log(
            `✅ External ServiceNow authentication successful on attempt ${attempt} (${this.authData.cookies.length} cookies)`,
          );
          return; // Success, exit retry loop
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error: any) {
        lastError = error;
        console.error(`❌ Auth attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          const delayMs = attempt * 2000; // Progressive delay: 2s, 4s
          console.log(`Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retries failed
    this.isAuthenticated = false;
    throw new Error(
      `ServiceNow authentication failed after ${maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Authenticate with ServiceNow using SAML
   */
  private async authenticateWithSAML(): Promise<void> {
    try {
      console.log("🔐 Authenticating with ServiceNow SAML...");

      const samlConfig: SAMLConfig = {
        username: process.env.SERVICENOW_USERNAME || "",
        password: process.env.SERVICENOW_PASSWORD || "",
        baseUrl: this.SERVICENOW_BASE_URL,
        instance: this.SERVICENOW_INSTANCE,
        proxy: process.env.SERVICENOW_PROXY,
      };

      if (!samlConfig.username || !samlConfig.password) {
        throw new Error(
          "SAML credentials not configured. Set SERVICENOW_USERNAME and SERVICENOW_PASSWORD",
        );
      }

      this.samlAuthData = await serviceNowSAMLAuth.authenticate(samlConfig);

      // Convert SAML auth data to legacy format for compatibility
      this.authData = {
        cookies: this.samlAuthData.cookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
        })),
        headers: this.samlAuthData.headers,
      };

      this.configureFetchWithAuth();

      this.isAuthenticated = true;
      this.lastAuthTime = Date.now();

      console.log(
        `✅ SAML ServiceNow authentication successful (${this.samlAuthData.cookies.length} cookies)`,
      );
      console.log(
        `🎫 User token: ${this.samlAuthData.userToken ? "present" : "not found"}`,
      );
      console.log(
        `🆔 Session ID: ${this.samlAuthData.sessionId ? "present" : "not found"}`,
      );
    } catch (error: any) {
      console.error("❌ SAML ServiceNow authentication failed:", error.message);
      this.isAuthenticated = false;
      throw new Error(`SAML authentication failed: ${error.message}`);
    }
  }

  /**
   * Configure fetch client with cookies and headers from auth service
   */
  private configureFetchWithAuth(): void {
    if (!this.authData) return;

    const cookieString = this.authData.cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    this.requestHeaders["Cookie"] = cookieString;

    Object.entries(this.authData.headers).forEach(([key, value]) => {
      this.requestHeaders[key] = value;
    });

    // Add SAML-specific headers if available
    if (this.authType === "saml" && this.samlAuthData?.userToken) {
      this.requestHeaders["X-UserToken"] = this.samlAuthData.userToken;
    }

    console.log(
      `⚙️ Fetch configured with ${this.authType} ServiceNow auth data`,
    );
  }

  /**
   * Make basic authenticated request to ServiceNow using native fetch
   */
  protected async makeBasicRequest(config: {
    url: string;
    method?: string;
    data?: any;
    params?: Record<string, string>;
  }): Promise<any> {
    await this.authenticate();

    return serviceNowRateLimiter.executeRequest(async () => {
      const startTime = Date.now();

      try {
        // Build URL with query parameters
        const url = new URL(config.url, this.SERVICENOW_BASE_URL);
        if (config.params) {
          Object.entries(config.params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
          });
        }

        // Build headers
        const headers = { ...this.requestHeaders };

        // Build fetch config with proxy support and SSL bypass
        const fetchConfig: RequestInit = {
          method: config.method || "GET",
          headers,
          // Use 15-minute timeout for ServiceNow response time (as specified by user)
          signal: AbortSignal.timeout(900000),
        };

        // Configure SSL/TLS and proxy for Bun fetch
        const bunConfig = fetchConfig as any;
        bunConfig.verbose = true; // Verbose logging
        bunConfig.tls = {
          rejectUnauthorized: false, // Accept invalid certificates
          checkServerIdentity: () => undefined, // Bypass server identity check
        };

        // Explicit proxy configuration for Bun
        if (this.proxyUrl) {
          bunConfig.proxy = this.proxyUrl;
          console.log(
            `Proxy configured: ${this.proxyUrl.replace(/\/\/.*@/, "//***:***@")}`,
          );
        }

        // Add body for POST/PUT requests
        if (
          config.data &&
          (config.method === "POST" || config.method === "PUT")
        ) {
          fetchConfig.body = JSON.stringify(config.data);
        }

        // Proxy already configured above in bunConfig

        console.log(
          `🚀 ServiceNow request: ${config.method || "GET"} ${url.toString()}`,
        );
        console.log(`⏱️ Timeout configured: 600 seconds (10 minutes)`);

        const response = await fetch(url.toString(), fetchConfig, {
          verbose: true,
        });
        const duration = Date.now() - startTime;

        console.log(`✅ ServiceNow request completed in ${duration}ms`);

        if (duration > 60000) {
          console.warn(
            `⚠️ Long ServiceNow request: ${url.toString()} took ${Math.round(duration / 1000)}s`,
          );
        }

        if (!response.ok) {
          console.error(`❌ ServiceNow request failed after ${duration}ms:`, {
            url: url.toString(),
            method: config.method || "GET",
            status: response.status,
            statusText: response.statusText,
          });

          if (response.status === 401) {
            this.isAuthenticated = false;
            throw new Error("ServiceNow authentication expired");
          }

          throw new Error(
            `ServiceNow API returned status ${response.status}: ${response.statusText}`,
          );
        }

        const data = await response.json();

        if (data?.result) {
          return data;
        }

        throw new Error(`ServiceNow API returned status ${response.status}`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error(
          `❌ ServiceNow API error after ${duration}ms:`,
          error.message,
        );

        if (
          error.name === "TimeoutError" ||
          error.message?.includes("timeout")
        ) {
          throw new Error(`ServiceNow request timeout after ${duration}ms`);
        }

        throw error;
      }
    }, "normal");
  }

  /**
   * Get Redis cache instance
   */
  public getCache(): RedisCache {
    return this.redisCache;
  }

  /**
   * Get Redis stream manager instance
   */
  public getStreamManager(): RedisStreamManager {
    return this.redisStreamManager;
  }

  /**
   * Get ServiceNow base URL
   */
  public getBaseUrl(): string {
    return this.SERVICENOW_BASE_URL;
  }

  /**
   * Check authentication status
   */
  public isAuthValid(): boolean {
    const now = Date.now();
    return this.isAuthenticated && now - this.lastAuthTime < this.authTTL;
  }

  /**
   * Get current authentication type
   */
  public getAuthType(): "external" | "saml" {
    return this.authType;
  }

  /**
   * Get SAML authentication data (if using SAML)
   */
  public getSAMLAuthData(): SAMLAuthenticationData | null {
    return this.samlAuthData;
  }

  /**
   * Validate current SAML authentication
   */
  public async validateSAMLAuth(): Promise<boolean> {
    if (this.authType !== "saml" || !this.samlAuthData) {
      return false;
    }

    try {
      const samlConfig: SAMLConfig = {
        username: process.env.SERVICENOW_USERNAME || "",
        password: process.env.SERVICENOW_PASSWORD || "",
        baseUrl: this.SERVICENOW_BASE_URL,
        instance: this.SERVICENOW_INSTANCE,
        proxy: process.env.SERVICENOW_PROXY,
      };

      const validationResult = await serviceNowSAMLAuth.validateAuth(
        samlConfig,
        this.samlAuthData,
      );

      if (!validationResult.isValid) {
        console.warn(
          "🚨 SAML authentication validation failed:",
          validationResult.error,
        );
        this.isAuthenticated = false;
      }

      return validationResult.isValid;
    } catch (error: unknown) {
      console.error("❌ SAML validation error:", error);
      return false;
    }
  }
}
