/**
 * ServiceNow Authentication Core - Base Authentication and Configuration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Removed Axios - Using native Bun fetch
import { serviceNowRateLimiter } from "../ServiceNowRateLimit";
import { Redis as RedisClient } from "ioredis";
import { getRedisConnection } from "../../utils/RedisConnection";
import { RedisCache } from "../../bigdata/redis/RedisCache";
import { RedisStreamManager } from "../../bigdata/redis/RedisStreamManager";
import { serviceNowSAMLAuth } from "./ServiceNowSAMLAuth";
import { SAMLConfig, SAMLAuthenticationData } from "../../types/saml";
import { ServiceNowBridgeService } from "../ServiceNowBridgeService";

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
  protected redisCache: RedisCache | null = null;
  protected redisStreamManager: RedisStreamManager | null = null;
  protected authType: "external" | "saml" = "external";
  protected requestHeaders: Record<string, string> = {};
  protected bridgeService: ServiceNowBridgeService;
  // proxyUrl removed - using AUTH_SERVICE_PROXY_URL consistently

  protected readonly AUTH_SERVICE_URL = "http://10.219.8.210:8000/auth";
  protected readonly AUTH_SERVICE_PROXY_URL =
    process.env.AUTH_SERVICE_PROXY_URL || "http://10.219.8.210:3008"; // Auth service as ServiceNow proxy
  protected readonly SERVICENOW_INSTANCE = "iberdrola";
  protected readonly SERVICENOW_BASE_URL = `https://${this.SERVICENOW_INSTANCE}.service-now.com`;

  // Proxy configuration moved to use AUTH_SERVICE_PROXY_URL consistently
  // Legacy PROXY_CONFIG removed - all requests now go through auth service proxy

  constructor() {
    this.setupEnvironment();
    this.initializeFetchClient();
    this.setupLogging();

    // Initialize ServiceNow Bridge Service directly - NO MORE HTTP SELF-REFERENCING CALLS
    this.bridgeService = new ServiceNowBridgeService();
    console.log(
      "🔌 ServiceNowAuthCore using bridge service directly - self-referencing calls eliminated",
    );

    // Determine authentication type from environment
    this.authType =
      (process.env.SERVICENOW_AUTH_TYPE as "external" | "saml") || "external";
    console.log(`🔐 ServiceNow authentication type: ${this.authType}`);

    // Initialize Redis asynchronously and store the promise for dependent operations
    this.initializeRedis();
  }

  private setupEnvironment(): void {
    // Remove proxy environment variables - using AUTH_SERVICE_PROXY_URL instead
    // All ServiceNow requests now go through the auth service proxy
    process.env.no_proxy =
      "10.219.8.210,localhost,127.0.0.1,ibfs.iberdrola.com,10.219.0.41";
  }

  private initializeFetchClient(): void {
    // Use AUTH_SERVICE_PROXY_URL consistently - no more direct ServiceNow calls
    console.log(
      `🚀 ServiceNow requests will use Auth Service Proxy: ${this.AUTH_SERVICE_PROXY_URL}`,
    );
    console.log(`📋 Auth Service Proxy details:`);
    console.log(`  - Proxy URL: ${this.AUTH_SERVICE_PROXY_URL}`);
    console.log(`  - All ServiceNow API calls routed through auth service`);
    console.log(
      `  - Eliminates 61s timeout through optimized connection handling`,
    );

    // Initialize default headers for all requests
    this.requestHeaders = {
      "User-Agent": "BunSNC-ServiceNow-Client/1.0",
      Accept: "application/json",
      "Content-Type": "application/json",
      Connection: "keep-alive",
    };

    console.log("✅ Auth Service Proxy client initialized");
  }

  private async initializeRedis(): Promise<void> {
    try {
      console.log("🔄 Initializing Redis components for ServiceNowAuthCore");

      // Initialize Redis components lazily - they will get shared connection when first used
      const redis = await getRedisConnection({
        host: process.env.REDIS_HOST || "10.219.8.210",
        port: parseInt(process.env.REDIS_PORT || "6380"),
        password: process.env.REDIS_PASSWORD || "nexcdc2025",
        db: parseInt(process.env.REDIS_DB || "1"),
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      });

      // Initialize RedisCache
      this.redisCache = new RedisCache(redis, {
        keyPrefix: "servicenow:cache:",
        defaultTtl: 120, // 2 minutes for faster refresh
        enableMetrics: true,
      });

      // Create RedisStreamManager with config (it will use shared connection internally)
      this.redisStreamManager = new RedisStreamManager({
        host: process.env.REDIS_HOST || "10.219.8.210",
        port: parseInt(process.env.REDIS_PORT || "6380"),
        password: process.env.REDIS_PASSWORD || "nexcdc2025",
      });

      console.log(
        "✅ ServiceNowAuthCore Redis components initialized with shared connection",
      );
    } catch (error) {
      console.error(
        "❌ Failed to initialize Redis components in ServiceNowAuthCore - continuing without Redis:",
        error,
      );
      this.redisCache = null;
      this.redisStreamManager = null;
      // Não fazer throw - permite aplicação funcionar sem Redis
    }
  }

  protected async ensureRedisInitialized(): Promise<void> {
    // Se Redis não foi inicializado, tenta inicializar novamente
    if (!this.redisCache && !this.redisStreamManager) {
      await this.initializeRedis();
    }
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
        console.log(`Using Auth Service Proxy: ${this.AUTH_SERVICE_PROXY_URL}`);

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
          // No longer using direct proxy - auth service handles all routing
          console.log(`Auth service will handle ServiceNow communication`);

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
   * Make authenticated request to auth service proxy instead of direct ServiceNow
   * This method uses the auth service as proxy to avoid 61s infrastructure timeout
   */
  protected async makeProxyRequest(config: {
    url: string;
    method?: string;
    params?: Record<string, string>;
  }): Promise<any> {
    const startTime = Date.now();

    try {
      // Build URL with query parameters
      const url = new URL(config.url);
      if (config.params) {
        Object.entries(config.params).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      // Simple headers - auth service will handle ServiceNow authentication
      const headers = {
        "User-Agent": "BunSNC-ServiceNow-Client/1.0",
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const fetchConfig: RequestInit = {
        method: config.method || "GET",
        headers,
        signal: AbortSignal.timeout(900000), // 15 minutes timeout
      };

      console.log(
        `🚀 ServiceNow proxy request: ${config.method || "GET"} ${url.toString()}`,
      );

      const response = await fetch(url.toString(), fetchConfig);
      const duration = Date.now() - startTime;

      console.log(`✅ ServiceNow proxy request completed in ${duration}ms`);

      if (!response.ok) {
        console.error(`❌ ServiceNow proxy request failed:`, {
          url: url.toString(),
          method: config.method || "GET",
          status: response.status,
          statusText: response.statusText,
        });

        throw new Error(
          `ServiceNow proxy returned status ${response.status}: ${response.statusText}`,
        );
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(
        `❌ ServiceNow proxy error after ${duration}ms:`,
        error.message,
      );
      throw error;
    }
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
        // Use auth service proxy instead of direct ServiceNow connection
        // Parse table from URL path
        const urlPath = config.url.replace("/api/now/table/", "");
        const tableName = urlPath.split("?")[0].split("/")[0];

        // Build proxy URL - use auth service as proxy to avoid 61s timeout
        const proxyUrl = `${this.AUTH_SERVICE_PROXY_URL}/api/v1/servicenow/tickets/${tableName}`;
        const url = new URL(proxyUrl);

        if (config.params) {
          Object.entries(config.params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
          });
        }

        // Simple headers - auth service will handle ServiceNow authentication
        const headers = {
          "User-Agent": "BunSNC-ServiceNow-Client/1.0",
          Accept: "application/json",
          "Content-Type": "application/json",
        };

        const fetchConfig: RequestInit = {
          method: config.method || "GET",
          headers,
          signal: AbortSignal.timeout(900000), // 15 minutes timeout
        };

        // Add body for POST/PUT requests
        if (
          config.data &&
          (config.method === "POST" || config.method === "PUT")
        ) {
          fetchConfig.body = JSON.stringify(config.data);
        }

        console.log(
          `🚀 ServiceNow proxy request: ${config.method || "GET"} ${url.toString()}`,
        );

        const response = await fetch(url.toString(), fetchConfig);
        const duration = Date.now() - startTime;

        console.log(`✅ ServiceNow proxy request completed in ${duration}ms`);

        if (!response.ok) {
          console.error(`❌ ServiceNow proxy request failed:`, {
            url: url.toString(),
            method: config.method || "GET",
            status: response.status,
            statusText: response.statusText,
          });

          throw new Error(
            `ServiceNow proxy returned status ${response.status}: ${response.statusText}`,
          );
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return await response.json();
        } else {
          return await response.text();
        }
      } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error(
          `❌ ServiceNow proxy error after ${duration}ms:`,
          error.message,
        );

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
   * Get ServiceNow base URL (now proxied through auth service)
   */
  public getBaseUrl(): string {
    return "ServiceNow Bridge Service";
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
