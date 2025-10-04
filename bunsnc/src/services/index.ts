/**
 * BunSNC Services - Consolidated Export Index
 * 5 Core Services Architecture (75% reduction from 20+ services)
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// === 1. SYSTEM SERVICE - Infrastructure Management ===
export {
  SystemService,
  createSystemService,
  // FIX v5.5.19: systemService instance removed from SystemService.ts
  // Use SystemService.getInstance() inside handlers instead
  // systemService,
} from "./SystemService";

// === 2. CONSOLIDATED SERVICENOW SERVICE - Complete ServiceNow Operations ===
// FIX v5.5.19: consolidatedServiceNowService instance removed - now using lazy Proxy export below
export {
  ConsolidatedServiceNowService,
  createConsolidatedServiceNowService,
} from "./ConsolidatedServiceNowService";

// === 3. CONSOLIDATED DATA SERVICE - Unified Data Management ===
// FIX v5.5.19: dataService instance removed - now using lazy Proxy export below
export {
  ConsolidatedDataService,
  createDataService,
  defaultDataServiceConfig,
} from "./ConsolidatedDataService";

// === 4. CONSOLIDATED BUSINESS LOGIC SERVICE - Business Rules Engine ===
// FIX v5.5.19: businessLogicService instance removed - TODO: add lazy Proxy if needed
export {
  ConsolidatedBusinessLogicService,
  createBusinessLogicService,
} from "./ConsolidatedBusinessLogicService";

// === 5. UNIFIED STREAMING SERVICE - Real-time Communication ===
// FIX v5.5.19: unifiedStreamingService instance removed - TODO: add lazy Proxy if needed
export { UnifiedStreamingService } from "./UnifiedStreamingService";

// === ADDITIONAL EXPORTS ===

// Auth Client (maintained for backward compatibility)
// FIX v5.5.19: serviceNowAuthClient instance removed - now using lazy Proxy export below
export { ServiceNowAuthClient } from "./ServiceNowAuthClient";

// Rate Limiter (utility service)
export {
  ServiceNowRateLimiter,
  serviceNowRateLimiter,
} from "./ServiceNowRateLimit";

// Ticket Search Service (independent search without circular dependencies)
export {
  TicketSearchService,
  ticketSearchService,
} from "./TicketSearchService";

// Synonym Service (query expansion and terminology mapping)
export { SynonymService, synonymService } from "./SynonymService";

// ServiceNow Bridge Service (proxy bridge to real ServiceNow)
export { ServiceNowBridgeService } from "./ServiceNowBridgeService";

// === TYPE EXPORTS ===
export type {
  SystemConfig,
  SystemHealthStatus,
  PerformanceMetric,
} from "./SystemService";

export type {
  ServiceNowRecord,
  QueryOptions,
  AttachmentUploadRequest,
  AttachmentInfo,
  BatchOperation,
} from "./ConsolidatedServiceNowService";

export type {
  CacheStats,
  DataFreshnessStrategy,
  DataServiceConfig,
} from "./ConsolidatedDataService";

export type {
  SLABreachInfo,
  BusinessRule,
  WorkflowContext,
} from "./ConsolidatedBusinessLogicService";

export type {
  StreamConnection,
  UnifiedStreamEvent,
  StreamingConfig,
} from "./UnifiedStreamingService";

// === LEGACY COMPATIBILITY ===
// FIX v5.5.19: Export factories instead of instances to prevent startup hang
// Root cause: Top-level service instantiations violate ElysiaJS best practices
// See: docs/reports/ELYSIA_COMPLIANCE_REPORT_v5.5.19.md - CRITICAL-2

// Export factory functions with legacy names for smooth migration
export {
  createConsolidatedServiceNowService as createAttachmentService,
  createConsolidatedServiceNowService as createBatchService,
  createConsolidatedServiceNowService as createServiceNowService,
  createConsolidatedServiceNowService as createTicketService,
} from "./ConsolidatedServiceNowService";

// Export classes directly - consumers must instantiate
export { ServiceNowAuthClient as AuthService } from "./ServiceNowAuthClient";

// Export data service factory with legacy names
// Note: defaultDataServiceConfig already exported in main DATA SERVICE section above

// Export business logic service factory
export { createBusinessLogicService as createSlaTrackingService } from "./ConsolidatedBusinessLogicService";

// FIX v5.5.19: LAZY SINGLETON EXPORTS for backward compatibility
// These provide lazy initialization - services created on first access, not during import
// This maintains backward compatibility while preventing startup hang

// Lazy dataService singleton
let _dataServiceInstance: any = null;
export const dataService = new Proxy({} as any, {
  get(target, prop) {
    if (!_dataServiceInstance) {
      _dataServiceInstance = createDataService(defaultDataServiceConfig);
    }
    return _dataServiceInstance[prop];
  },
});

// Lazy authService singleton
let _authServiceInstance: any = null;
export const serviceNowAuthClient = new Proxy({} as any, {
  get(target, prop) {
    if (!_authServiceInstance) {
      _authServiceInstance = new ServiceNowAuthClient();
    }
    return _authServiceInstance[prop];
  },
});

// Lazy consolidatedServiceNowService singleton
let _consolidatedServiceNowInstance: any = null;
export const consolidatedServiceNowService = new Proxy({} as any, {
  get(target, prop) {
    if (!_consolidatedServiceNowInstance) {
      _consolidatedServiceNowInstance = createConsolidatedServiceNowService();
    }
    return _consolidatedServiceNowInstance[prop];
  },
});

// Lazy unifiedStreamingService singleton
let _unifiedStreamingInstance: any = null;
export const unifiedStreamingService = new Proxy({} as any, {
  get(target, prop) {
    if (!_unifiedStreamingInstance) {
      _unifiedStreamingInstance = UnifiedStreamingService.getInstance();
    }
    return _unifiedStreamingInstance[prop];
  },
});

// FIX v5.5.20: ServiceNowBridgeService removed from barrel export
// Root cause: Never was a top-level instantiation problem (not in 3 CRITICAL)
// Consumers import class directly and instantiate locally via .derive()
// See: plugins/client-integration.ts, modules/servicenow-proxy/index.ts

// Re-export with legacy names
export { consolidatedServiceNowService as attachmentService };
export { consolidatedServiceNowService as batchService };
export { consolidatedServiceNowService as serviceNowService };
export { consolidatedServiceNowService as ticketService };
export { serviceNowAuthClient as authService };
export { dataService as enhancedTicketStorageService };
export { dataService as hybridDataService };

// REMOVED: Top-level service instance exports (commented in v5.5.19)
// export { consolidatedServiceNowService as attachmentService } from "./ConsolidatedServiceNowService";
// export { consolidatedServiceNowService as batchService } from "./ConsolidatedServiceNowService";
// export { consolidatedServiceNowService as serviceNowService } from "./ConsolidatedServiceNowService";
// export { serviceNowAuthClient as authService } from "./ServiceNowAuthClient";
// export { dataService as enhancedTicketStorageService } from "./ConsolidatedDataService";
// export { dataService as hybridDataService } from "./ConsolidatedDataService";
// export { businessLogicService as slaTrackingService } from "./ConsolidatedBusinessLogicService";
// export { consolidatedServiceNowService as ticketService } from "./ConsolidatedServiceNowService";

/**
 * CONSOLIDATED ARCHITECTURE SUMMARY
 *
 * Before: 20+ fragmented services
 * After: 5 unified core services (75% reduction)
 *
 * Benefits:
 * - Reduced complexity and maintenance overhead
 * - Improved performance with singleton pattern
 * - Professional enterprise architecture
 * - Event-driven communication
 * - 100% backward compatibility maintained
 */
