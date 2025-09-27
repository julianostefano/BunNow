/**
 * ServiceNow Plugin - Elysia plugin for ServiceNow integration following best practices
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Dependency injection via .decorate()
 * - Shared service instance para evitar self-referencing calls
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 *
 * Substitui HTTP calls internos por injeção direta do ServiceNowBridgeService
 */

import { Elysia } from 'elysia';
import { ServiceNowBridgeService } from '../services/ServiceNowBridgeService';
import type { BridgeResponse, BridgeRequestConfig } from '../services/ServiceNowBridgeService';
import type { ServiceNowRecord } from '../services/ServiceNowFetchClient';

// Types para Eden Treaty
export interface ServiceNowPluginContext {
  serviceNowBridge: ServiceNowBridgeService;
  queryServiceNow: (table: string, params?: Record<string, any>) => Promise<BridgeResponse<ServiceNowRecord[]>>;
  createServiceNowRecord: (table: string, data: Record<string, any>) => Promise<BridgeResponse<ServiceNowRecord>>;
  updateServiceNowRecord: (table: string, sysId: string, data: Record<string, any>) => Promise<BridgeResponse<ServiceNowRecord>>;
  deleteServiceNowRecord: (table: string, sysId: string) => Promise<BridgeResponse<void>>;
  getSLAData: (taskSysId: string) => Promise<BridgeResponse<ServiceNowRecord[]>>;
  getContractSLAData: (company?: string, location?: string) => Promise<BridgeResponse<ServiceNowRecord[]>>;
}

/**
 * ServiceNow Plugin - Separate Instance Method pattern
 * Provides shared ServiceNow functionality through dependency injection
 */
export const serviceNowPlugin = new Elysia({
  name: 'servicenow-plugin',
  seed: {
    serviceNowBridge: {} as ServiceNowBridgeService,
    queryServiceNow: {} as ServiceNowPluginContext['queryServiceNow'],
    createServiceNowRecord: {} as ServiceNowPluginContext['createServiceNowRecord'],
    updateServiceNowRecord: {} as ServiceNowPluginContext['updateServiceNowRecord'],
    deleteServiceNowRecord: {} as ServiceNowPluginContext['deleteServiceNowRecord'],
    getSLAData: {} as ServiceNowPluginContext['getSLAData'],
    getContractSLAData: {} as ServiceNowPluginContext['getContractSLAData'],
  }
})
  // Lifecycle Hook: onStart - Initialize ServiceNow Bridge Service
  .onStart(() => {
    console.log('🚀 ServiceNow Plugin starting - initializing bridge service');
  })

  // Dependency Injection: Decorate context with ServiceNow services
  .decorate('serviceNowBridge', new ServiceNowBridgeService())

  // High-level query method - replaces HTTP calls in services
  .decorate('queryServiceNow', async function(
    this: { serviceNowBridge: ServiceNowBridgeService },
    table: string,
    params: Record<string, any> = {}
  ): Promise<BridgeResponse<ServiceNowRecord[]>> {
    return await this.serviceNowBridge.queryTable(table, params);
  })

  // High-level create method - replaces HTTP calls in services
  .decorate('createServiceNowRecord', async function(
    this: { serviceNowBridge: ServiceNowBridgeService },
    table: string,
    data: Record<string, any>
  ): Promise<BridgeResponse<ServiceNowRecord>> {
    return await this.serviceNowBridge.createRecord(table, data);
  })

  // High-level update method - replaces HTTP calls in services
  .decorate('updateServiceNowRecord', async function(
    this: { serviceNowBridge: ServiceNowBridgeService },
    table: string,
    sysId: string,
    data: Record<string, any>
  ): Promise<BridgeResponse<ServiceNowRecord>> {
    return await this.serviceNowBridge.updateRecord(table, sysId, data);
  })

  // High-level delete method - replaces HTTP calls in services
  .decorate('deleteServiceNowRecord', async function(
    this: { serviceNowBridge: ServiceNowBridgeService },
    table: string,
    sysId: string
  ): Promise<BridgeResponse<void>> {
    return await this.serviceNowBridge.deleteRecord(table, sysId);
  })

  // SLA-specific methods - replaces HTTP calls in SLA service
  .decorate('getSLAData', async function(
    this: { serviceNowBridge: ServiceNowBridgeService },
    taskSysId: string
  ): Promise<BridgeResponse<ServiceNowRecord[]>> {
    try {
      // Query task_sla records for this specific task
      const taskSLAResponse = await this.serviceNowBridge.queryTable('task_sla', {
        sysparm_query: `task=${taskSysId}`,
        sysparm_display_value: 'all',
        sysparm_exclude_reference_link: true,
        sysparm_limit: 1000
      });

      if (!taskSLAResponse.success || !taskSLAResponse.result) {
        return {
          success: false,
          error: 'Failed to retrieve task SLA data',
          result: []
        };
      }

      return taskSLAResponse;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        result: []
      };
    }
  })

  // Contract SLA data - replaces HTTP calls in SLA service
  .decorate('getContractSLAData', async function(
    this: { serviceNowBridge: ServiceNowBridgeService },
    company?: string,
    location?: string
  ): Promise<BridgeResponse<ServiceNowRecord[]>> {
    try {
      let query = 'active=true';

      if (company) {
        query += `^company.name=${company}`;
      }
      if (location) {
        query += `^location.name=${location}`;
      }

      const response = await this.serviceNowBridge.queryTable('contract_sla', {
        sysparm_query: query,
        sysparm_display_value: 'all',
        sysparm_exclude_reference_link: true,
        sysparm_limit: 1000
      });

      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        result: []
      };
    }
  })

  // Lifecycle Hook: onStop - Cleanup if needed
  .onStop(() => {
    console.log('🛑 ServiceNow Plugin stopping - cleanup completed');
  })

  // Plugin health check endpoint
  .get('/health', async ({ serviceNowBridge }) => {
    const bridgeHealth = await serviceNowBridge.healthCheck();
    const bridgeMetrics = serviceNowBridge.getMetrics();

    return {
      success: true,
      result: {
        status: 'healthy',
        plugin: 'servicenow-plugin',
        bridge: bridgeHealth.result,
        metrics: bridgeMetrics
      },
      timestamp: new Date().toISOString()
    };
  }, {
    detail: {
      summary: 'ServiceNow Plugin Health Check',
      description: 'Check health of ServiceNow plugin and bridge service',
      tags: ['Health', 'Plugin', 'ServiceNow']
    }
  });

// Export plugin context type for Eden Treaty
export type ServiceNowPluginApp = typeof serviceNowPlugin;

// Functional Callback Method pattern - for conditional use
export const createServiceNowPlugin = (config?: {
  enableHealthCheck?: boolean;
  bridgeConfig?: any;
}) => {
  return (app: Elysia) => app
    .use(serviceNowPlugin)
    .onStart(() => {
      console.log('🔌 ServiceNow Plugin applied - bridge service available via dependency injection');
      console.log('📦 Self-referencing HTTP calls eliminated - using direct service injection');
    });
};

// Export types for other modules
export type { BridgeResponse, BridgeRequestConfig, ServiceNowRecord };