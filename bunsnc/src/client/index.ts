/**
 * BunSNC Client SDK - Type-Safe ServiceNow Integration Client
 * Built with Eden Treaty for full type safety and excellent DX
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Main client class and factory function
export { 
  BunSNCClient, 
  createBunSNCClient, 
  bunSNCClient 
} from './EdenClient';

// All type definitions
export * from './types';

// Utility functions and helpers
export { 
  createMockClient,
  createTestClient,
  isValidTaskType,
  isValidTaskStatus,
  isValidTaskPriority,
  formatTaskDuration,
  formatFileSize,
  parseTaskFilters
} from './utils';

// Constants and enums
export {
  DEFAULT_CLIENT_CONFIG,
  TASK_POLLING_INTERVALS,
  API_ENDPOINTS,
  ERROR_CODES
} from './constants';

// Example usage exports for documentation
export { 
  basicUsageExample,
  advancedUsageExample,
  batchOperationsExample,
  realTimeMonitoringExample 
} from './examples';

/**
 * Quick start function to create and configure a client
 */
export function quickStart(config?: {
  serverUrl?: string;
  auth?: { username: string; password: string } | { token: string };
  timeout?: number;
}) {
  const { BunSNCClient } = require('./EdenClient');
  
  return new BunSNCClient({
    baseUrl: config?.serverUrl || 'http://localhost:3008',
    timeout: config?.timeout || 30000,
    auth: config?.auth,
  });
}