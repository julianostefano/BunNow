/**
 * ServiceNow Fetch Client - Native Fetch Implementation (ElysiaJS Best Practices 2025)
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { serviceNowSAMLAuth } from "./auth/ServiceNowSAMLAuth";
import { samlConfigManager } from "./auth/SAMLConfigManager";
import { SAMLAuthenticationData, SAML_NO_PROXY_DOMAINS } from "../types/saml";
import { serviceNowRateLimiter } from "./ServiceNowRateLimit";
import { serviceNowCircuitBreaker } from "./CircuitBreaker";
import { ServiceNowBridgeService } from "./ServiceNowBridgeService";

export interface ServiceNowRecord {
  sys_id: string;
  number: string;
  state: string;
  short_description?: string;
  assignment_group?: {
    display_value: string;
    value: string;
  };
  priority?: string;
  opened_by?: {
    display_value: string;
    value: string;
  };
  sys_created_on?: string;
  sys_updated_on?: string;
  [key: string]: any;
}

export interface ServiceNowQueryResult {
  result: ServiceNowRecord[];
  total?: number;
}

export interface FetchRequestConfig {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  params?: Record<string, any>;
}

export interface RateLimitConfig {
  maxRequestsPerSecond: number;
  maxConcurrentRequests: number;
  maxRetries: number;
}

export class ServiceNowFetchClient {
  // bridgeService removido para eliminar dependência circular
  private readonly baseUrl: string;
  private samlAuthData: SAMLAuthenticationData | null = null;
  private isAuthenticated = false;

  // Rate limiting
  private requestTimes: number[] = [];
  private concurrentRequests = 0;
  private readonly rateLimitConfig: RateLimitConfig;

  // Request metrics
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
  };

  constructor(config?: Partial<RateLimitConfig>) {
    // Eliminada dependência circular com ServiceNowBridgeService
    this.baseUrl = "ServiceNow Direct Client"; // For logging purposes only
    this.rateLimitConfig = {
      maxRequestsPerSecond: parseInt(process.env.SERVICENOW_RATE_LIMIT || "25"),
      maxConcurrentRequests: parseInt(
        process.env.SERVICENOW_MAX_CONCURRENT || "18",
      ),
      maxRetries: 3,
      ...config,
    };

    console.log("🔌 ServiceNowFetchClient initialized without circular dependency");
    console.log(`   - Client Type: ${this.baseUrl}`);
    console.log(
      `   - Rate limit: ${this.rateLimitConfig.maxRequestsPerSecond} req/sec`,
    );
    console.log(
      `   - Max concurrent: ${this.rateLimitConfig.maxConcurrentRequests}`,
    );
  }

  /**
   * Determine if URL should use proxy - EXACT COPY from ServiceNowSAMLAuth (what works)
   * Returns proxy URL to use, or undefined for direct connection
   */
  private shouldUseProxy(
    url: string,
    configProxy?: string,
  ): string | undefined {
    // Check environment variables first (SAME as SAML auth)
    const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const proxy = configProxy || envProxy;

    if (!proxy) return undefined;

    // Check NO_PROXY environment variable
    const noProxy = process.env.NO_PROXY;
    if (noProxy) {
      const noProxyDomains = noProxy.split(",").map((d) => d.trim());
      try {
        const urlObj = new URL(url);
        for (const domain of noProxyDomains) {
          if (urlObj.hostname.includes(domain) || domain === "*") {
            console.log(`Domain excluded by NO_PROXY: ${url} (${domain})`);
            return undefined;
          }
        }
      } catch (error: unknown) {
        console.error("Error parsing URL for NO_PROXY check:", error);
      }
    }

    try {
      const urlObj = new URL(url);

      // Check hardcoded no-proxy domains (SAML/ADFS servers)
      for (const domain of SAML_NO_PROXY_DOMAINS) {
        if (urlObj.hostname.includes(domain)) {
          console.log(`Domain should not use proxy: ${url} (${domain})`);
          return undefined;
        }
      }

      console.log(`Domain should use proxy: ${url} (${proxy})`);
      return proxy;
    } catch (error: unknown) {
      console.error("Error parsing URL for proxy decision:", error);
      return undefined;
    }
  }

  /**
   * Authenticate using SAML - Smart auth with stored data reuse
   */
  async authenticate(): Promise<void> {
    if (this.isAuthenticated && this.samlAuthData) {
      return;
    }

    console.log("🔐 Checking ServiceNow authentication...");

    try {
      // Step 1: Try to use existing authentication data from MongoDB
      const existingAuthData = await samlConfigManager.getAuthData();

      if (existingAuthData) {
        console.log("📦 Found stored authentication data", {
          cookiesCount: existingAuthData.cookies.length,
          hasUserToken: !!existingAuthData.userToken,
          lastValidated: existingAuthData.lastValidated,
        });

        // Step 2: Validate if existing auth is still valid
        const config = await serviceNowSAMLAuth.getStoredConfig();
        if (config) {
          try {
            const validation = await serviceNowSAMLAuth.validateAuth(
              config,
              existingAuthData,
            );

            if (validation.isValid) {
              console.log("✅ Using valid stored authentication data");
              this.samlAuthData = existingAuthData;
              this.isAuthenticated = true;
              return; // Use existing auth data
            } else {
              console.log(
                "⚠️ Stored authentication is invalid, will re-authenticate",
              );
            }
          } catch (validationError) {
            console.log(
              "⚠️ Auth validation failed, will re-authenticate:",
              validationError.message,
            );
          }
        }
      } else {
        console.log("📝 No stored authentication data found");
      }

      // Step 3: Perform new authentication only if needed
      await this.performNewAuthentication();
    } catch (error) {
      console.error("❌ Authentication process failed:", error);
      this.isAuthenticated = false;
      throw error;
    }
  }

  /**
   * Perform new SAML authentication
   */
  private async performNewAuthentication(): Promise<void> {
    console.log("🔄 Performing new SAML authentication...");

    // Try to get stored configuration first
    let config = await serviceNowSAMLAuth.getStoredConfig();

    // If no stored config, create from environment variables
    if (!config) {
      config = this.createConfigFromEnv();
      console.log("📝 Created SAML config from environment variables");
    } else {
      console.log("📦 Using stored SAML configuration");
    }

    this.samlAuthData = await serviceNowSAMLAuth.authenticate(config);
    this.isAuthenticated = true;

    console.log("✅ New SAML authentication successful", {
      cookiesCount: this.samlAuthData.cookies.length,
      hasUserToken: !!this.samlAuthData.userToken,
      sessionId: !!this.samlAuthData.sessionId,
    });
  }

  /**
   * Make authenticated request to auth service proxy instead of direct ServiceNow
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
        `🚀 Auth service proxy request: ${config.method || "GET"} ${url.toString()}`,
      );

      const response = await fetch(url.toString(), fetchConfig);
      const duration = Date.now() - startTime;

      console.log(`✅ Auth service proxy request completed in ${duration}ms`);

      if (!response.ok) {
        console.error(`❌ Auth service proxy request failed:`, {
          url: url.toString(),
          method: config.method || "GET",
          status: response.status,
          statusText: response.statusText,
        });

        throw new Error(
          `Auth service proxy returned status ${response.status}: ${response.statusText}`,
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
        `❌ Auth service proxy error after ${duration}ms:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Create SAML configuration from environment variables
   * CRITICAL FIX: SAML auth MUST use direct ServiceNow URL, not proxy
   */
  private createConfigFromEnv() {
    // SAML authentication requires DIRECT ServiceNow URL (não proxy)
    const directServiceNowUrl = "https://iberdrola.service-now.com";

    const config = {
      username: process.env.SERVICENOW_USERNAME || "",
      password: process.env.SERVICENOW_PASSWORD || "",
      baseUrl: directServiceNowUrl, // DIRECT URL for SAML handshake
      instance: "iberdrola",
      proxy: process.env.SERVICENOW_PROXY,
    };

    if (!config.username || !config.password) {
      throw new Error(
        "SERVICENOW_USERNAME and SERVICENOW_PASSWORD must be set in environment variables",
      );
    }

    console.log("🔐 SAML Config:", {
      baseUrl: config.baseUrl,
      instance: config.instance,
      hasUsername: !!config.username,
      hasPassword: !!config.password,
      useProxy: !!config.proxy
    });

    return config;
  }

  /**
   * Make request with ALL fields (no sysparm_fields limitation)
   * Used for complete field mapping and analysis
   * Now uses proxy endpoints instead of direct ServiceNow connection
   */
  async makeRequestFullFields(
    table: string,
    query: string,
    limit: number = 1,
    skipPeriodFilter: boolean = false,
  ): Promise<ServiceNowQueryResult> {
    return this.executeWithRateLimit(async () => {
      try {
        // Build query with optional period filter
        let finalQuery = query;

        if (!skipPeriodFilter && !query.includes("sys_created_onBETWEEN")) {
          // Generate current month filter (SAME pattern as ServiceNowQueryService)
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
          const monthStart = `${currentYear}-${currentMonth}-01`;
          const monthEnd = `${currentYear}-${currentMonth}-31`;

          finalQuery = `sys_created_onBETWEEN${monthStart}@${monthEnd}`;
          if (query) {
            finalQuery += `^${query}`;
          }
        }

        // Use direct ServiceNow call (no bridge service to avoid circular dependency)
        const params = new URLSearchParams({
          sysparm_query: finalQuery,
          sysparm_display_value: "all",
          sysparm_exclude_reference_link: "true",
          sysparm_limit: limit.toString(),
        });

        const url = `https://iberdrola.service-now.com/api/now/table/${table}?${params.toString()}`;

        const response = await this.makeAuthenticatedFetch(url, {
          method: "GET",
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        console.log(`✅ ServiceNow ${table} direct request completed`);

        return { result: result.result || [] };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`ServiceNow ${table} bridge request error:`, errorMessage);
        throw error;
      }
    });
  }

  /**
   * Make authenticated fetch request using EXACT same implementation as ServiceNowSAMLAuth
   */
  private async makeAuthenticatedFetch(
    url: string,
    config: FetchRequestConfig = {},
  ): Promise<Response> {
    if (!this.samlAuthData) {
      throw new Error("Not authenticated - call authenticate() first");
    }

    // Determine proxy to use based on domain rules (same as SAML auth)
    // Use proxy from stored config if available (like SAML auth does)
    const configProxy = process.env.SERVICENOW_PROXY;
    const proxyUrl = this.shouldUseProxy(url, configProxy);

    // Build headers
    const headers: Record<string, string> = {
      "User-Agent":
        this.samlAuthData.userAgent || "bunsnc-servicenow-client/1.0",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...config.headers,
    };

    // Add SAML authentication headers
    Object.entries(this.samlAuthData.headers).forEach(([key, value]) => {
      headers[key] = value;
    });

    // Add user token if available
    if (this.samlAuthData.userToken) {
      headers["X-UserToken"] = this.samlAuthData.userToken;
    }

    // Build cookie string
    const cookieString = this.samlAuthData.cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    if (cookieString) {
      headers["Cookie"] = cookieString;
    }

    // Use 15 minutes timeout (as specified by user)
    const timeout = 900000; // 15 minutes timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Build fetch configuration EXACTLY like ServiceNowSAMLAuth
      const fetchConfig: any = {
        method: config.method || "GET",
        headers,
        body: config.body,
        signal: controller.signal,
        verbose: true, // Add verbose logging as suggested by error messages
        ...(proxyUrl && { proxy: proxyUrl }),
      };

      console.log(
        `🌐 ServiceNow API request: ${config.method || "GET"} ${url}`,
        {
          proxy: proxyUrl
            ? proxyUrl.replace(/\/\/.*@/, "//***:***@")
            : "direct",
          hasAuthentication: true,
          cookieCount: this.samlAuthData.cookies.length,
          hasUserToken: !!this.samlAuthData.userToken,
        },
      );

      const response = await fetch(url, fetchConfig as RequestInit);
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Execute request with rate limiting and circuit breaker
   */
  private async executeWithRateLimit<T>(
    requestFn: () => Promise<T>,
  ): Promise<T> {
    // Use the improved rate limiter and circuit breaker
    return serviceNowCircuitBreaker.execute(async () => {
      return serviceNowRateLimiter.executeRequest(requestFn, "normal");
    });
  }

  /**
   * Wait for rate limit availability
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // Clean old request times
    this.requestTimes = this.requestTimes.filter((time) => time > oneSecondAgo);

    if (this.requestTimes.length >= this.rateLimitConfig.maxRequestsPerSecond) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = 1000 - (now - oldestRequest) + 50; // Add 50ms buffer

      if (waitTime > 0) {
        console.log(`🚦 Rate limit: waiting ${waitTime}ms`);
        await this.sleep(waitTime);
      }
    }

    this.requestTimes.push(now);
  }

  /**
   * Wait for concurrent request slot
   */
  private async waitForConcurrentSlot(): Promise<void> {
    let waitTime = 0;
    const maxWaitTime = 30000; // 30 seconds max wait

    while (
      this.concurrentRequests >= this.rateLimitConfig.maxConcurrentRequests
    ) {
      if (waitTime >= maxWaitTime) {
        throw new Error("ServiceNow concurrent request timeout");
      }

      console.log(
        `⏳ Max concurrent requests reached (${this.concurrentRequests}/${this.rateLimitConfig.maxConcurrentRequests}), waiting...`,
      );
      await this.sleep(500);
      waitTime += 500;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || "";

    return (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("connection") ||
      message.includes("rate limit") ||
      message.includes("503") ||
      message.includes("429")
    );
  }

  /**
   * Update request metrics
   */
  private updateMetrics(success: boolean, duration: number): void {
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update average response time using exponential moving average
    const totalRequests =
      this.metrics.successfulRequests + this.metrics.failedRequests;
    if (totalRequests === 1) {
      this.metrics.averageResponseTime = duration;
    } else {
      this.metrics.averageResponseTime = Math.round(
        this.metrics.averageResponseTime * 0.9 + duration * 0.1,
      );
    }
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Get authentication status
   */
  isAuthValid(): boolean {
    return this.isAuthenticated && !!this.samlAuthData;
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Reset authentication (force re-auth on next request)
   */
  resetAuth(): void {
    this.isAuthenticated = false;
    this.samlAuthData = null;
    console.log("🔄 ServiceNow authentication reset");
  }
}
