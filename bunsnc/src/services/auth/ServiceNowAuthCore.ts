/**
 * ServiceNow Authentication Core - Base Authentication and Configuration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { serviceNowRateLimiter } from '../ServiceNowRateLimit';
import Redis from 'ioredis';
import { RedisCache } from '../../bigdata/redis/RedisCache';
import { RedisStreamManager } from '../../bigdata/redis/RedisStreamManager';

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
  protected isAuthenticated = false;
  protected lastAuthTime = 0;
  protected authTTL = 30 * 60 * 1000; // 30 minutes
  protected redisCache: RedisCache;
  protected redisStreamManager: RedisStreamManager;

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
  }

  private setupEnvironment(): void {
    process.env.http_proxy = 'http://AMER%5CE966380:Neoenergia%402026@10.219.77.12:8080';
    process.env.https_proxy = 'http://AMER%5CE966380:Neoenergia%402026@10.219.77.12:8080';
    process.env.no_proxy = '10.219.8.210,localhost,127.0.0.1,ibfs.iberdrola.com,10.219.0.41';
  }

  private initializeAxios(): void {
    this.axiosClient = axios.create({
      baseURL: this.SERVICENOW_BASE_URL,
      timeout: 240000, // 240 seconds timeout (4 minutes)
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false // verify=False from Python
      }),
      headers: {
        'User-Agent': 'BunSNC-ServiceNow-Client/1.0'
      }
    });
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
    console.log('🔐 ServiceNow Auth Client initialized with Redis Streams');
    console.log(`🌐 ServiceNow URL: ${this.SERVICENOW_BASE_URL}`);
    console.log(`🔄 Using environment proxy variables`);
    console.log('📦 Redis cache enabled');
  }

  /**
   * Authenticate with ServiceNow using auth service pattern from Python scripts
   */
  protected async authenticate(): Promise<void> {
    const now = Date.now();
    
    if (this.isAuthenticated && (now - this.lastAuthTime) < this.authTTL) {
      return;
    }

    try {
      console.log('🔑 Authenticating with ServiceNow auth service...');
      
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
      this.lastAuthTime = now;
      
      console.log(`✅ ServiceNow authentication successful (${this.authData.cookies.length} cookies)`);

    } catch (error: any) {
      console.error('❌ ServiceNow authentication failed:', error.message);
      this.isAuthenticated = false;
      throw new Error(`ServiceNow authentication failed: ${error.message}`);
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

    console.log('🔧 Axios configured with ServiceNow auth data');
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
}