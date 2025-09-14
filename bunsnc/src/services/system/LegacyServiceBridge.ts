/**
 * Legacy Service Bridge - Compatibility layer for consolidated services
 * Provides backward compatibility for legacy service interfaces
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/Logger';

export interface LegacyOperation {
  service: string;
  operation: string;
  data: any;
  timestamp: Date;
  requestId: string;
}

export interface ServiceMapping {
  legacyService: string;
  newService: string;
  methodMapping: Record<string, string>;
  dataTransformations?: Record<string, (data: any) => any>;
}

export class LegacyServiceBridge extends EventEmitter {
  private isInitialized = false;
  private operationHistory: LegacyOperation[] = new Map();
  private serviceMappings: Map<string, ServiceMapping> = new Map();
  private deprecationWarnings: Set<string> = new Set();

  constructor() {
    super();
    this.setupServiceMappings();
  }

  /**
   * Initialize legacy service bridge
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.info('🔗 [LegacyBridge] Initializing legacy service bridge...');

      // Set up service mappings and transformations
      this.setupServiceMappings();

      this.isInitialized = true;
      logger.info('✅ [LegacyBridge] Legacy service bridge initialized');
    } catch (error) {
      logger.error('❌ [LegacyBridge] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Setup service mappings for backward compatibility
   */
  private setupServiceMappings(): void {
    // AttachmentService -> SystemService
    this.serviceMappings.set('AttachmentService', {
      legacyService: 'AttachmentService',
      newService: 'SystemService',
      methodMapping: {
        'uploadAttachment': 'handleLegacyAttachment',
        'downloadAttachment': 'handleLegacyAttachment',
        'listAttachments': 'handleLegacyAttachment',
        'deleteAttachment': 'handleLegacyAttachment'
      }
    });

    // BatchService -> SystemService
    this.serviceMappings.set('BatchService', {
      legacyService: 'BatchService',
      newService: 'SystemService',
      methodMapping: {
        'processBatch': 'handleLegacyBatch',
        'addBatchOperation': 'handleLegacyBatch',
        'executeBatch': 'handleLegacyBatch',
        'getBatchStatus': 'handleLegacyBatch'
      }
    });

    // SystemService -> SystemService
    this.serviceMappings.set('SystemService', {
      legacyService: 'SystemService',
      newService: 'SystemService',
      methodMapping: {
        'recordMetric': 'recordPerformanceMetric',
        'getMetrics': 'getPerformanceStats',
        'updateThresholds': 'updatePerformanceThresholds',
        'getSystemMetrics': 'getPerformanceStats'
      }
    });

    // TaskManager -> SystemService
    this.serviceMappings.set('TaskManager', {
      legacyService: 'TaskManager',
      newService: 'SystemService',
      methodMapping: {
        'addTask': 'addTask',
        'getTask': 'getTask',
        'cancelTask': 'cancelTask',
        'getTaskStatus': 'getTaskStats',
        'scheduleTask': 'scheduleRecurringTask'
      }
    });

    // GroupService -> SystemService
    this.serviceMappings.set('GroupService', {
      legacyService: 'GroupService',
      newService: 'SystemService',
      methodMapping: {
        'getGroups': 'getGroups',
        'getGroup': 'getGroup',
        'createGroup': 'createGroup',
        'updateGroup': 'updateGroup',
        'deleteGroup': 'deleteGroup'
      }
    });

    // TransactionManager -> SystemService
    this.serviceMappings.set('TransactionManager', {
      legacyService: 'TransactionManager',
      newService: 'SystemService',
      methodMapping: {
        'startTransaction': 'startTransaction',
        'commitTransaction': 'commitTransaction',
        'rollbackTransaction': 'rollbackTransaction',
        'executeInTransaction': 'executeInTransaction'
      }
    });

    logger.debug('✅ [LegacyBridge] Service mappings configured');
  }

  /**
   * Handle legacy attachment operations
   */
  async handleAttachment(operation: string, data: any): Promise<any> {
    this.logDeprecationWarning('AttachmentService', operation);

    try {
      switch (operation) {
        case 'uploadAttachment':
          return this.simulateAttachmentUpload(data);
        case 'downloadAttachment':
          return this.simulateAttachmentDownload(data);
        case 'listAttachments':
          return this.simulateAttachmentList(data);
        case 'deleteAttachment':
          return this.simulateAttachmentDelete(data);
        default:
          throw new Error(`Unsupported attachment operation: ${operation}`);
      }
    } catch (error) {
      logger.error(`❌ [LegacyBridge] Attachment operation failed: ${operation}`, error);
      throw error;
    }
  }

  /**
   * Handle legacy batch operations
   */
  async handleBatch(operation: string, data: any): Promise<any> {
    this.logDeprecationWarning('BatchService', operation);

    try {
      switch (operation) {
        case 'processBatch':
          return this.simulateBatchProcessing(data);
        case 'addBatchOperation':
          return this.simulateBatchAddOperation(data);
        case 'executeBatch':
          return this.simulateBatchExecution(data);
        case 'getBatchStatus':
          return this.simulateBatchStatus(data);
        default:
          throw new Error(`Unsupported batch operation: ${operation}`);
      }
    } catch (error) {
      logger.error(`❌ [LegacyBridge] Batch operation failed: ${operation}`, error);
      throw error;
    }
  }

  /**
   * Handle legacy ServiceNow operations
   */
  async handleServiceNow(operation: string, data: any): Promise<any> {
    this.logDeprecationWarning('ServiceNowService', operation);

    try {
      // Simulate ServiceNow operations for backward compatibility
      switch (operation) {
        case 'create':
          return this.simulateServiceNowCreate(data);
        case 'read':
          return this.simulateServiceNowRead(data);
        case 'update':
          return this.simulateServiceNowUpdate(data);
        case 'delete':
          return this.simulateServiceNowDelete(data);
        case 'query':
          return this.simulateServiceNowQuery(data);
        default:
          throw new Error(`Unsupported ServiceNow operation: ${operation}`);
      }
    } catch (error) {
      logger.error(`❌ [LegacyBridge] ServiceNow operation failed: ${operation}`, error);
      throw error;
    }
  }

  /**
   * Log deprecation warning for legacy service usage
   */
  private logDeprecationWarning(service: string, operation: string): void {
    const key = `${service}.${operation}`;
    if (!this.deprecationWarnings.has(key)) {
      logger.warn(`⚠️ [LegacyBridge] DEPRECATED: ${service}.${operation}() is deprecated and will be removed in a future version. Please migrate to the new SystemService API.`);
      this.deprecationWarnings.add(key);
    }
  }

  /**
   * Record legacy operation for monitoring
   */
  private recordOperation(service: string, operation: string, data: any): void {
    const legacyOp: LegacyOperation = {
      service,
      operation,
      data,
      timestamp: new Date(),
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };

    this.operationHistory.push(legacyOp);

    // Keep only last 100 operations
    if (this.operationHistory.length > 100) {
      this.operationHistory = this.operationHistory.slice(-100);
    }

    this.emit('legacyOperationUsed', legacyOp);
  }

  /**
   * Simulate attachment operations for backward compatibility
   */
  private async simulateAttachmentUpload(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      success: true,
      attachmentId: `att_${Date.now()}`,
      filename: data.filename || 'document.txt',
      size: data.size || 1024,
      message: 'Legacy attachment upload simulated'
    };
  }

  private async simulateAttachmentDownload(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      success: true,
      attachmentId: data.attachmentId,
      content: Buffer.from('Simulated attachment content'),
      filename: 'downloaded_file.txt',
      message: 'Legacy attachment download simulated'
    };
  }

  private async simulateAttachmentList(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 30));
    return {
      success: true,
      attachments: [
        { id: 'att_1', filename: 'document1.pdf', size: 2048 },
        { id: 'att_2', filename: 'image1.png', size: 1536 }
      ],
      total: 2,
      message: 'Legacy attachment list simulated'
    };
  }

  private async simulateAttachmentDelete(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 25));
    return {
      success: true,
      attachmentId: data.attachmentId,
      message: 'Legacy attachment delete simulated'
    };
  }

  /**
   * Simulate batch operations for backward compatibility
   */
  private async simulateBatchProcessing(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 200));
    return {
      success: true,
      batchId: `batch_${Date.now()}`,
      operations: data.operations?.length || 0,
      status: 'completed',
      message: 'Legacy batch processing simulated'
    };
  }

  private async simulateBatchAddOperation(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 10));
    return {
      success: true,
      operationId: `op_${Date.now()}`,
      batchId: data.batchId,
      message: 'Legacy batch operation added'
    };
  }

  private async simulateBatchExecution(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 150));
    return {
      success: true,
      batchId: data.batchId,
      executed: true,
      results: data.operations?.map((op: any, index: number) => ({
        operationId: `op_${index}`,
        status: 'success',
        result: { id: `result_${index}` }
      })) || [],
      message: 'Legacy batch execution simulated'
    };
  }

  private async simulateBatchStatus(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 5));
    return {
      success: true,
      batchId: data.batchId,
      status: 'completed',
      progress: 100,
      message: 'Legacy batch status simulated'
    };
  }

  /**
   * Simulate ServiceNow operations for backward compatibility
   */
  private async simulateServiceNowCreate(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      success: true,
      sys_id: `sys_${Date.now()}`,
      table: data.table || 'incident',
      data: data.data || {},
      message: 'Legacy ServiceNow create simulated'
    };
  }

  private async simulateServiceNowRead(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      success: true,
      sys_id: data.sys_id,
      table: data.table || 'incident',
      data: { sys_id: data.sys_id, state: 1, short_description: 'Test' },
      message: 'Legacy ServiceNow read simulated'
    };
  }

  private async simulateServiceNowUpdate(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 75));
    return {
      success: true,
      sys_id: data.sys_id,
      table: data.table || 'incident',
      updated: true,
      message: 'Legacy ServiceNow update simulated'
    };
  }

  private async simulateServiceNowDelete(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 60));
    return {
      success: true,
      sys_id: data.sys_id,
      table: data.table || 'incident',
      deleted: true,
      message: 'Legacy ServiceNow delete simulated'
    };
  }

  private async simulateServiceNowQuery(data: any): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 120));
    return {
      success: true,
      table: data.table || 'incident',
      query: data.query || '',
      records: [
        { sys_id: 'sys_1', state: 1, short_description: 'Test 1' },
        { sys_id: 'sys_2', state: 2, short_description: 'Test 2' }
      ],
      count: 2,
      message: 'Legacy ServiceNow query simulated'
    };
  }

  /**
   * Get legacy bridge statistics
   */
  async getStats(): Promise<any> {
    try {
      const operationCounts: Record<string, number> = {};
      const serviceCounts: Record<string, number> = {};

      this.operationHistory.forEach(op => {
        const key = `${op.service}.${op.operation}`;
        operationCounts[key] = (operationCounts[key] || 0) + 1;
        serviceCounts[op.service] = (serviceCounts[op.service] || 0) + 1;
      });

      return {
        total_operations: this.operationHistory.length,
        operation_counts: operationCounts,
        service_counts: serviceCounts,
        deprecation_warnings: this.deprecationWarnings.size,
        service_mappings: this.serviceMappings.size,
        bridge_active: this.isInitialized
      };
    } catch (error) {
      logger.error('❌ [LegacyBridge] Failed to get stats:', error);
      return {};
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Bridge is healthy if initialized and service mappings are configured
      return this.isInitialized && this.serviceMappings.size > 0;
    } catch (error) {
      logger.error('❌ [LegacyBridge] Health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.operationHistory = [];
    this.deprecationWarnings.clear();
    logger.info('🧹 [LegacyBridge] Cleanup completed');
  }
}