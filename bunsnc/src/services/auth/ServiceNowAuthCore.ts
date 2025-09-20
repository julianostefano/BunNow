/**
 * ServiceNow Authentication Core - Base Authentication and Configuration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { serviceNowRateLimiter } from '../ServiceNowRateLimit';
import Redis from 'ioredis';
import { RedisCache } from '../../bigdata/redis/RedisCache';
import { RedisStreamManager } from '../../bigdata/redis/RedisStreamManager';
import { serviceNowSAMLAuth } from './ServiceNowSAMLAuth';
import { SAMLConfig, SAMLAuthenticationData } from '../../types/saml';

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
  protected axiosClient: AxiosInstance;
  protected authData: AuthServiceResponse | null = null;
  protected samlAuthData: SAMLAuthenticationData | null = null;
  protected isAuthenticated = false;
  protected lastAuthTime = 0;
  protected authTTL = 30 * 60 * 1000; // 30 minutes
  protected redisCache: RedisCache;
  protected redisStreamManager: RedisStreamManager;
  protected authType: 'external' | 'saml' = 'external';

  protected readonly AUTH_SERVICE_URL = 'http://10.219.8.210:8000/auth';
  protected readonly SERVICENOW_INSTANCE = 'iberdrola';
  protected readonly SERVICENOW_BASE_URL = `https://${this.SERVICENOW_INSTANCE}.service-now.com`;
  
  protected readonly PROXY_CONFIG = {
    host: '10.219.77.12',
    port: 8080,
    auth: {
      username: 'AMER%5CE966380',
      password: 'Neoenergia%402026'
    }
  };

  constructor() {
    this.setupEnvironment();
    this.initializeAxios();
    this.initializeRedis();
    this.setupLogging();

    // Determine authentication type from environment
    this.authType = (process.env.SERVICENOW_AUTH_TYPE as 'external' | 'saml') || 'external';
    console.log(`🔐 ServiceNow authentication type: ${this.authType}`);
  }

  private setupEnvironment(): void {
    process.env.http_proxy = 'http://AMER%5CE966380:Neoenergia%402026@10.219.77.12:8080';
    process.env.https_proxy = 'http://AMER%5CE966380:Neoenergia%402026@10.219.77.12:8080';
    process.env.no_proxy = '10.219.8.210,localhost,127.0.0.1,ibfs.iberdrola.com,10.219.0.41';
  }

  private initializeAxios(): void {
    const https = require('https');
    const http = require('http');

    this.axiosClient = axios.create({
      baseURL: this.SERVICENOW_BASE_URL,
      timeout: 60000, // 60 seconds timeout (reduced from 240s)
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
        keepAliveMsecs: 30000, // 30 seconds keep-alive
        maxSockets: 10, // Limit concurrent connections
        maxFreeSockets: 5, // Keep some connections open
        timeout: 60000, // Agent timeout
        scheduling: 'fifo'
      }),
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 10,
        maxFreeSockets: 5,
        timeout: 60000,
        scheduling: 'fifo'
      }),
      headers: {
        'User-Agent': 'BunSNC-ServiceNow-Client/1.0',
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=30, max=100'
      },
      maxRedirects: 3,
      validateStatus: (status) => status >= 200 && status < 300
    });

    // Add request interceptor for better error logging
    this.axiosClient.interceptors.request.use(
      (config) => {
        config.metadata = { startTime: Date.now() };
        return config;
      },
      (error) => {
        console.error('❌ Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for better error logging and metrics
    this.axiosClient.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata?.startTime;
        if (duration > 10000) { // Log slow requests (>10s)
          console.warn(`⚠️ Slow ServiceNow request: ${response.config.url} took ${duration}ms`);
        }
        return response;
      },
      (error) => {
        const duration = error.config?.metadata?.startTime ? Date.now() - error.config.metadata.startTime : 0;
        console.error(`❌ ServiceNow request failed after ${duration}ms:`, {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          code: error.code,
          message: error.message?.substring(0, 200)
        });
        return Promise.reject(error);
      }
    );
  }

  private initializeRedis(): void {
    const redis = new Redis({
      host: process.env.REDIS_HOST || '10.219.8.210',
      port: parseInt(process.env.REDIS_PORT || '6380'),
      password: process.env.REDIS_PASSWORD || 'nexcdc2025',
      db: parseInt(process.env.REDIS_DB || '1'),
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    this.redisCache = new RedisCache(redis, {
      keyPrefix: 'servicenow:cache:',
      defaultTtl: 120, // 2 minutes for faster refresh
      enableMetrics: true
    });

    this.redisStreamManager = new RedisStreamManager({
      host: process.env.REDIS_HOST || '10.219.8.210',
      port: parseInt(process.env.REDIS_PORT || '6380'),
      password: process.env.REDIS_PASSWORD || 'nexcdc2025',
    });
  }

  private setupLogging(): void {
    console.log(' ServiceNow Auth Client initialized with Redis Streams');
    console.log(` ServiceNow URL: ${this.SERVICENOW_BASE_URL}`);
    console.log(` Using environment proxy variables`);
    console.log('📦 Redis cache enabled');
  }

  /**
   * Authenticate with ServiceNow using configured authentication type
   */
  protected async authenticate(): Promise<void> {
    const now = Date.now();

    if (this.isAuthenticated && (now - this.lastAuthTime) < this.authTTL) {
      return;
    }

    if (this.authType === 'saml') {
      await this.authenticateWithSAML();
    } else {
      await this.authenticateWithExternalService();
    }
  }

  /**
   * Authenticate with ServiceNow using external auth service (legacy)
   */
  private async authenticateWithExternalService(): Promise<void> {
    try {
      console.log('🔐 Authenticating with ServiceNow external auth service...');

      const authResponse = await axios.get(this.AUTH_SERVICE_URL, {
        timeout: 15000,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      this.authData = authResponse.data as AuthServiceResponse;

      if (!this.authData.cookies || !Array.isArray(this.authData.cookies)) {
        throw new Error('Invalid auth response: missing cookies');
      }

      this.configureAxiosWithAuth();

      this.isAuthenticated = true;
      this.lastAuthTime = Date.now();

      console.log(`✅ External ServiceNow authentication successful (${this.authData.cookies.length} cookies)`);

    } catch (error: any) {
      console.error('❌ External ServiceNow authentication failed:', error.message);
      this.isAuthenticated = false;
      throw new Error(`ServiceNow authentication failed: ${error.message}`);
    }
  }

  /**
   * Authenticate with ServiceNow using SAML
   */
  private async authenticateWithSAML(): Promise<void> {
    try {
      console.log('🔐 Authenticating with ServiceNow SAML...');

      const samlConfig: SAMLConfig = {
        username: process.env.SERVICENOW_USERNAME || '',
        password: process.env.SERVICENOW_PASSWORD || '',
        baseUrl: this.SERVICENOW_BASE_URL,
        instance: this.SERVICENOW_INSTANCE,
        proxy: process.env.SERVICENOW_PROXY
      };

      if (!samlConfig.username || !samlConfig.password) {
        throw new Error('SAML credentials not configured. Set SERVICENOW_USERNAME and SERVICENOW_PASSWORD');
      }

      this.samlAuthData = await serviceNowSAMLAuth.authenticate(samlConfig);

      // Convert SAML auth data to legacy format for compatibility
      this.authData = {
        cookies: this.samlAuthData.cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path
        })),
        headers: this.samlAuthData.headers
      };

      this.configureAxiosWithAuth();

      this.isAuthenticated = true;
      this.lastAuthTime = Date.now();

      console.log(`✅ SAML ServiceNow authentication successful (${this.samlAuthData.cookies.length} cookies)`);
      console.log(`🎫 User token: ${this.samlAuthData.userToken ? 'present' : 'not found'}`);
      console.log(`🆔 Session ID: ${this.samlAuthData.sessionId ? 'present' : 'not found'}`);

    } catch (error: any) {
      console.error('❌ SAML ServiceNow authentication failed:', error.message);
      this.isAuthenticated = false;
      throw new Error(`SAML authentication failed: ${error.message}`);
    }
  }

  /**
   * Configure axios client with cookies and headers from auth service
   */
  private configureAxiosWithAuth(): void {
    if (!this.authData) return;

    const cookieString = this.authData.cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');

    this.axiosClient.defaults.headers.common['Cookie'] = cookieString;

    Object.entries(this.authData.headers).forEach(([key, value]) => {
      this.axiosClient.defaults.headers.common[key] = value;
    });

    // Add SAML-specific headers if available
    if (this.authType === 'saml' && this.samlAuthData?.userToken) {
      this.axiosClient.defaults.headers.common['X-UserToken'] = this.samlAuthData.userToken;
    }

    console.log(`⚙️ Axios configured with ${this.authType} ServiceNow auth data`);
  }

  /**
   * Make basic authenticated request to ServiceNow
   */
  protected async makeBasicRequest(config: AxiosRequestConfig): Promise<any> {
    await this.authenticate();
    
    return serviceNowRateLimiter.executeRequest(async () => {
      try {
        const response = await this.axiosClient(config);
        
        if (response.status === 200 && response.data?.result) {
          return response.data;
        }
        
        throw new Error(`ServiceNow API returned status ${response.status}`);
        
      } catch (error: any) {
        console.error('ServiceNow API error:', error.message);
        
        if (error.response?.status === 401) {
          this.isAuthenticated = false;
          throw new Error('ServiceNow authentication expired');
        }
        
        throw error;
      }
    });
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
    return this.isAuthenticated && (now - this.lastAuthTime) < this.authTTL;
  }

  /**
   * Get current authentication type
   */
  public getAuthType(): 'external' | 'saml' {
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
    if (this.authType !== 'saml' || !this.samlAuthData) {
      return false;
    }

    try {
      const samlConfig: SAMLConfig = {
        username: process.env.SERVICENOW_USERNAME || '',
        password: process.env.SERVICENOW_PASSWORD || '',
        baseUrl: this.SERVICENOW_BASE_URL,
        instance: this.SERVICENOW_INSTANCE,
        proxy: process.env.SERVICENOW_PROXY
      };

      const validationResult = await serviceNowSAMLAuth.validateAuth(samlConfig, this.samlAuthData);

      if (!validationResult.isValid) {
        console.warn('🚨 SAML authentication validation failed:', validationResult.error);
        this.isAuthenticated = false;
      }

      return validationResult.isValid;
    } catch (error) {
      console.error('❌ SAML validation error:', error);
      return false;
    }
  }
}