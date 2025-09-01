/**
 * BunSNC - Complete ServiceNow Client Library for TypeScript/Bun
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Main entry point providing 100% PySNC compatibility with modern TypeScript/Bun performance
 */

// Core exports
export { ServiceNowClient as BunSNC } from './client/ServiceNowClient';
export { ServiceNowClient } from './client/ServiceNowClient';
export { GlideRecord } from './record/GlideRecord';
export { GlideElement } from './record/GlideElement';

// API exports
export { TableAPI } from './api/TableAPI';
export { AttachmentAPI } from './api/AttachmentAPI';
export { BatchAPI } from './api/BatchAPI';

// Query system exports
export { QueryBuilder } from './query/QueryBuilder';
export { QueryCondition } from './query/QueryCondition';
export { OrCondition } from './query/OrCondition';
export { JoinQuery } from './query/JoinQuery';
export { RLQuery } from './query/RLQuery';

// Service exports
export { ServiceNowService } from './services/servicenow.service';

// Exception exports
export * from './exceptions';

// Type exports
export type {
  ServiceNowRecord,
  QueryOptions,
  DisplayValue,
  ServiceNowError
} from './types/servicenow';

export type {
  BatchRequest,
  BatchResult,
  IBatchAPI
} from './api/BatchAPI';

export type {
  ITableAPI
} from './api/TableAPI';

export type {
  IAttachmentAPI
} from './api/AttachmentAPI';

export type {
  IServiceNowClient
} from './client/ServiceNowClient';

// Convenience re-exports
export type { IGlideRecord } from './record/GlideRecord';

// Phase 3 factory function for quick setup
export function createServiceNowClient(
  instanceUrl: string,
  authToken: string,
  options?: { validateConnection?: boolean }
) {
  return new ServiceNowClient(instanceUrl, authToken, options);
}

// Default export (PySNC-style compatibility)
export { ServiceNowClient as default } from './client/ServiceNowClient';