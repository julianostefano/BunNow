/**
 * BunSNC Services - Consolidated Export Index
 * 5 Core Services Architecture (75% reduction from 20+ services)
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// === 1. SYSTEM SERVICE - Infrastructure Management ===
export {
  SystemService,
  createSystemService,
  systemService
} from './SystemService';

// === 2. CONSOLIDATED SERVICENOW SERVICE - Complete ServiceNow Operations ===
export {
  ConsolidatedServiceNowService,
  consolidatedServiceNowService
} from './ConsolidatedServiceNowService';

// === 3. CONSOLIDATED DATA SERVICE - Unified Data Management ===
export {
  ConsolidatedDataService,
  createDataService,
  dataService
} from './ConsolidatedDataService';

// === 4. CONSOLIDATED BUSINESS LOGIC SERVICE - Business Rules Engine ===
export {
  ConsolidatedBusinessLogicService,
  createBusinessLogicService,
  businessLogicService
} from './ConsolidatedBusinessLogicService';

// === 5. UNIFIED STREAMING SERVICE - Real-time Communication ===
export {
  UnifiedStreamingService,
  unifiedStreamingService
} from './UnifiedStreamingService';

// === ADDITIONAL EXPORTS ===

// Auth Client (maintained for backward compatibility)
export { ServiceNowAuthClient } from './ServiceNowAuthClient';
export { serviceNowAuthClient } from './ServiceNowAuthClient';

// Rate Limiter (utility service)
export { ServiceNowRateLimiter, serviceNowRateLimiter } from './ServiceNowRateLimit';

// === TYPE EXPORTS ===
export type {
  SystemConfig,
  SystemHealthStatus,
  PerformanceMetric
} from './SystemService';

export type {
  ServiceNowRecord,
  QueryOptions,
  AttachmentUploadRequest,
  AttachmentInfo,
  BatchOperation
} from './ConsolidatedServiceNowService';

export type {
  CacheStats,
  DataFreshnessStrategy,
  DataServiceConfig
} from './ConsolidatedDataService';

export type {
  SLABreachInfo,
  BusinessRule,
  WorkflowContext
} from './ConsolidatedBusinessLogicService';

export type {
  StreamConnection,
  UnifiedStreamEvent,
  StreamingConfig
} from './UnifiedStreamingService';

// === LEGACY COMPATIBILITY ===
// Re-export consolidated services with legacy names for smooth migration
export { systemService as performanceMonitoringService } from './SystemService';
export { systemService as taskManager } from './SystemService';
export { systemService as groupService } from './SystemService';
export { consolidatedServiceNowService as attachmentService } from './ConsolidatedServiceNowService';
export { consolidatedServiceNowService as batchService } from './ConsolidatedServiceNowService';
export { dataService as enhancedTicketStorageService } from './ConsolidatedDataService';
export { dataService as hybridDataService } from './ConsolidatedDataService';
export { businessLogicService as slaTrackingService } from './ConsolidatedBusinessLogicService';

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