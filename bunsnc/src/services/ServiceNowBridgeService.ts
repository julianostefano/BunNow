/**
 * ServiceNow Bridge Service - Bridge entre rotas proxy internas e ServiceNow real
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este serviço faz o bridge entre:
 * 1. Self-referencing calls para /api/v1/servicenow/tickets/ (rotas proxy internas)
 * 2. Chamadas diretas ao ServiceNow usando SAML authentication
 *
 * Arquitetura:
 * - Recebe requests das rotas proxy internas
 * - Usa ServiceNowFetchClient com SAML auth para calls diretos
 * - makeAuthenticatedFetch() + shouldUseProxy() para conexão real
 */

import { ServiceNowFetchClient, ServiceNowRecord, ServiceNowQueryResult } from './ServiceNowFetchClient';
import { serviceNowRateLimiter } from './ServiceNowRateLimit';
import { serviceNowCircuitBreaker } from './CircuitBreaker';

// Interface para requests bridge
export interface BridgeRequestConfig {
  table: string;
  params?: Record<string, any>;
  data?: Record<string, any>;
  sysId?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
}

// Interface para response padronizado
export interface BridgeResponse<T = any> {
  success: boolean;
  result?: T;
  total?: number;
  error?: string;
  duration?: number;
}

/**
 * ServiceNow Bridge Service
 * Faz bridge entre proxy routes e ServiceNow real usando SAML auth
 */
export class ServiceNowBridgeService {
  private fetchClient: ServiceNowFetchClient;
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
  };

  constructor(fetchClient?: ServiceNowFetchClient) {
    // Dependency injection para eliminar dependência circular
    // Se fetchClient não for injetado, cria um novo (fallback)
    this.fetchClient = fetchClient || new ServiceNowFetchClient();
    console.log('🌉 ServiceNow Bridge Service initialized with dependency injection');
  }

  /**
   * Query table via bridge (self-referencing → direct ServiceNow)
   */
  async queryTable(
    table: string,
    params: Record<string, any> = {}
  ): Promise<BridgeResponse<ServiceNowRecord[]>> {
    const startTime = Date.now();

    try {
      console.log(`🔍 Bridge Query: ${table}`, params);

      // Usar ServiceNowFetchClient com SAML auth para call direto
      await this.fetchClient.authenticate();

      // Usar makeAuthenticatedFetch via FetchClient interno
      const directServiceNowUrl = `https://iberdrola.service-now.com/api/now/table/${table}`;
      const url = new URL(directServiceNowUrl);

      // Add query parameters
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });

      const response = await this.fetchClient['makeAuthenticatedFetch'](url.toString(), {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`ServiceNow API returned status ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;

      this.updateMetrics(true, duration);

      console.log(`✅ Bridge Query completed in ${duration}ms`);

      return {
        success: true,
        result: data.result || [],
        total: data.result?.length || 0,
        duration
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.updateMetrics(false, duration);

      console.error(`❌ Bridge Query failed after ${duration}ms:`, error.message);

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Create record via bridge (self-referencing → direct ServiceNow)
   */
  async createRecord(
    table: string,
    data: Record<string, any>
  ): Promise<BridgeResponse<ServiceNowRecord>> {
    const startTime = Date.now();

    try {
      console.log(`🆕 Bridge Create: ${table}`);

      // Usar ServiceNowFetchClient com SAML auth para call direto
      await this.fetchClient.authenticate();

      const directServiceNowUrl = `https://iberdrola.service-now.com/api/now/table/${table}`;

      const response = await this.fetchClient['makeAuthenticatedFetch'](directServiceNowUrl, {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`ServiceNow API returned status ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      this.updateMetrics(true, duration);

      console.log(`✅ Bridge Create completed in ${duration}ms`);

      return {
        success: true,
        result: result.result,
        duration
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.updateMetrics(false, duration);

      console.error(`❌ Bridge Create failed after ${duration}ms:`, error.message);

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Update record via bridge (self-referencing → direct ServiceNow)
   */
  async updateRecord(
    table: string,
    sysId: string,
    data: Record<string, any>
  ): Promise<BridgeResponse<ServiceNowRecord>> {
    const startTime = Date.now();

    try {
      console.log(`📝 Bridge Update: ${table}/${sysId}`);

      // Usar ServiceNowFetchClient com SAML auth para call direto
      await this.fetchClient.authenticate();

      const directServiceNowUrl = `https://iberdrola.service-now.com/api/now/table/${table}/${sysId}`;

      const response = await this.fetchClient['makeAuthenticatedFetch'](directServiceNowUrl, {
        method: 'PUT',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`ServiceNow API returned status ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      this.updateMetrics(true, duration);

      console.log(`✅ Bridge Update completed in ${duration}ms`);

      return {
        success: true,
        result: result.result,
        duration
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.updateMetrics(false, duration);

      console.error(`❌ Bridge Update failed after ${duration}ms:`, error.message);

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Delete record via bridge (self-referencing → direct ServiceNow)
   */
  async deleteRecord(
    table: string,
    sysId: string
  ): Promise<BridgeResponse<void>> {
    const startTime = Date.now();

    try {
      console.log(`🗑️ Bridge Delete: ${table}/${sysId}`);

      // Usar ServiceNowFetchClient com SAML auth para call direto
      await this.fetchClient.authenticate();

      const directServiceNowUrl = `https://iberdrola.service-now.com/api/now/table/${table}/${sysId}`;

      const response = await this.fetchClient['makeAuthenticatedFetch'](directServiceNowUrl, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`ServiceNow API returned status ${response.status}: ${response.statusText}`);
      }

      const duration = Date.now() - startTime;

      this.updateMetrics(true, duration);

      console.log(`✅ Bridge Delete completed in ${duration}ms`);

      return {
        success: true,
        duration
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.updateMetrics(false, duration);

      console.error(`❌ Bridge Delete failed after ${duration}ms:`, error.message);

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Get specific record via bridge
   */
  async getRecord(
    table: string,
    sysId: string,
    params: Record<string, any> = {}
  ): Promise<BridgeResponse<ServiceNowRecord | null>> {
    const startTime = Date.now();

    try {
      console.log(`🔍 Bridge Get: ${table}/${sysId}`);

      // Usar ServiceNowFetchClient com SAML auth para call direto
      await this.fetchClient.authenticate();

      const directServiceNowUrl = `https://iberdrola.service-now.com/api/now/table/${table}/${sysId}`;
      const url = new URL(directServiceNowUrl);

      // Add query parameters
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });

      const response = await this.fetchClient['makeAuthenticatedFetch'](url.toString(), {
        method: 'GET'
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: true,
            result: null,
            duration
          };
        }
        throw new Error(`ServiceNow API returned status ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.updateMetrics(true, duration);

      console.log(`✅ Bridge Get completed in ${duration}ms`);

      return {
        success: true,
        result: data.result || null,
        duration
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.updateMetrics(false, duration);

      console.error(`❌ Bridge Get failed after ${duration}ms:`, error.message);

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Check if bridge service is healthy
   */
  async healthCheck(): Promise<BridgeResponse<{ status: string; auth: boolean }>> {
    try {
      const authValid = this.fetchClient.isAuthValid();

      return {
        success: true,
        result: {
          status: 'healthy',
          auth: authValid
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset authentication (force re-auth)
   */
  resetAuth(): void {
    this.fetchClient.resetAuth();
    console.log('🔄 Bridge Service authentication reset');
  }

  /**
   * Update internal metrics
   */
  private updateMetrics(success: boolean, duration: number): void {
    this.metrics.totalRequests++;

    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update average response time using exponential moving average
    const totalRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
    if (totalRequests === 1) {
      this.metrics.averageResponseTime = duration;
    } else {
      this.metrics.averageResponseTime = Math.round(
        this.metrics.averageResponseTime * 0.9 + duration * 0.1
      );
    }
  }
}

// Singleton instance para reuso
export const serviceNowBridgeService = new ServiceNowBridgeService();