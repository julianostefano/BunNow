/**
 * TransactionManager - Transaction Support and Rollback for BunSNC
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { logger } from './Logger';
import { performanceMonitor } from './PerformanceMonitor';
import type { ServiceNowRecord } from '../types/servicenow';

export interface TransactionOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  sysId?: string;
  data?: ServiceNowRecord;
  originalData?: ServiceNowRecord; // For rollback
  timestamp: number;
  executed: boolean;
  rollbackData?: any;
}

export interface TransactionOptions {
  name?: string;
  timeout?: number; // milliseconds
  autoCommit?: boolean;
  isolation?: 'read_uncommitted' | 'read_committed' | 'repeatable_read' | 'serializable';
  maxRetries?: number;
}

export interface TransactionResult {
  transactionId: string;
  success: boolean;
  operations: number;
  duration: number;
  errors: Array<{
    operationId: string;
    error: string;
  }>;
  rollbackPerformed: boolean;
}

export class Transaction {
  private operations: TransactionOperation[] = [];
  private executed = false;
  private rolledBack = false;
  private startTime: number;
  
  constructor(
    public readonly id: string,
    public readonly options: TransactionOptions,
    private client: any // ServiceNowClient
  ) {
    this.startTime = performance.now();
    
    logger.debug('Transaction started', 'Transaction', {
      transactionId: this.id,
      options: this.options
    });
  }

  /**
   * Add a create operation to the transaction
   */
  create(table: string, data: ServiceNowRecord): string {
    if (this.executed) {
      throw new Error('Cannot add operations to an executed transaction');
    }

    const operationId = `create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.operations.push({
      id: operationId,
      type: 'create',
      table,
      data,
      timestamp: Date.now(),
      executed: false
    });

    logger.debug('Create operation added to transaction', 'Transaction', {
      transactionId: this.id,
      operationId,
      table
    });

    return operationId;
  }

  /**
   * Add an update operation to the transaction
   */
  update(table: string, sysId: string, data: ServiceNowRecord, originalData?: ServiceNowRecord): string {
    if (this.executed) {
      throw new Error('Cannot add operations to an executed transaction');
    }

    const operationId = `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.operations.push({
      id: operationId,
      type: 'update',
      table,
      sysId,
      data,
      originalData,
      timestamp: Date.now(),
      executed: false
    });

    logger.debug('Update operation added to transaction', 'Transaction', {
      transactionId: this.id,
      operationId,
      table,
      sysId
    });

    return operationId;
  }

  /**
   * Add a delete operation to the transaction
   */
  delete(table: string, sysId: string, originalData?: ServiceNowRecord): string {
    if (this.executed) {
      throw new Error('Cannot add operations to an executed transaction');
    }

    const operationId = `delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.operations.push({
      id: operationId,
      type: 'delete',
      table,
      sysId,
      originalData,
      timestamp: Date.now(),
      executed: false
    });

    logger.debug('Delete operation added to transaction', 'Transaction', {
      transactionId: this.id,
      operationId,
      table,
      sysId
    });

    return operationId;
  }

  /**
   * Execute all operations in the transaction
   */
  async commit(): Promise<TransactionResult> {
    if (this.executed) {
      throw new Error('Transaction already executed');
    }

    this.executed = true;
    const operation = logger.operation('commit_transaction', 'transaction', this.id, {
      operationCount: this.operations.length,
      options: this.options
    });

    performanceMonitor.startTimer(`transaction_${this.id}`, 'Transaction');
    
    const errors: Array<{ operationId: string; error: string }> = [];
    let rollbackPerformed = false;

    try {
      // Execute operations in sequence
      for (const op of this.operations) {
        try {
          await this.executeOperation(op);
          op.executed = true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push({
            operationId: op.id,
            error: errorMessage
          });
          
          logger.error(`Transaction operation failed: ${op.id}`, error, 'Transaction', {
            transactionId: this.id,
            operationType: op.type,
            table: op.table
          });
          
          // If any operation fails, rollback
          rollbackPerformed = await this.rollback();
          break;
        }
      }

      const duration = performanceMonitor.endTimer(`transaction_${this.id}`);
      const success = errors.length === 0;

      const result: TransactionResult = {
        transactionId: this.id,
        success,
        operations: this.operations.length,
        duration,
        errors,
        rollbackPerformed
      };

      if (success) {
        operation.success('Transaction committed successfully', {
          operations: this.operations.length,
          duration
        });
        
        performanceMonitor.recordMetric({
          name: 'transaction_success',
          value: 1,
          unit: 'count',
          timestamp: Date.now(),
          tags: { 
            transactionId: this.id,
            operations: this.operations.length.toString()
          }
        });
      } else {
        operation.error('Transaction failed and rolled back', new Error(`${errors.length} operation(s) failed`));
        
        performanceMonitor.recordMetric({
          name: 'transaction_failure',
          value: 1,
          unit: 'count',
          timestamp: Date.now(),
          tags: { 
            transactionId: this.id,
            errors: errors.length.toString()
          }
        });
      }

      return result;

    } catch (error) {
      operation.error('Transaction execution failed', error);
      
      // Attempt rollback
      rollbackPerformed = await this.rollback();
      
      const duration = performanceMonitor.endTimer(`transaction_${this.id}`);
      
      return {
        transactionId: this.id,
        success: false,
        operations: this.operations.length,
        duration,
        errors: [{
          operationId: 'transaction',
          error: error instanceof Error ? error.message : String(error)
        }],
        rollbackPerformed
      };
    }
  }

  /**
   * Rollback all executed operations
   */
  async rollback(): Promise<boolean> {
    if (this.rolledBack) {
      logger.warn('Transaction already rolled back', 'Transaction', {
        transactionId: this.id
      });
      return true;
    }

    this.rolledBack = true;
    const operation = logger.operation('rollback_transaction', 'transaction', this.id, {
      operationsToRollback: this.operations.filter(op => op.executed).length
    });

    let rollbackSuccess = true;

    try {
      // Rollback operations in reverse order
      const executedOperations = this.operations.filter(op => op.executed).reverse();
      
      for (const op of executedOperations) {
        try {
          await this.rollbackOperation(op);
        } catch (error) {
          rollbackSuccess = false;
          logger.error(`Rollback failed for operation: ${op.id}`, error, 'Transaction', {
            transactionId: this.id,
            operationType: op.type,
            table: op.table
          });
        }
      }

      if (rollbackSuccess) {
        operation.success('Transaction rolled back successfully');
      } else {
        operation.error('Partial rollback - some operations failed to rollback', new Error('Rollback partially failed'));
      }

      performanceMonitor.recordMetric({
        name: 'transaction_rollback',
        value: 1,
        unit: 'count',
        timestamp: Date.now(),
        tags: { 
          transactionId: this.id,
          success: rollbackSuccess.toString()
        }
      });

      return rollbackSuccess;

    } catch (error) {
      operation.error('Rollback failed', error);
      return false;
    }
  }

  /**
   * Get transaction status
   */
  getStatus(): any {
    return {
      id: this.id,
      executed: this.executed,
      rolledBack: this.rolledBack,
      operations: this.operations.length,
      executedOperations: this.operations.filter(op => op.executed).length,
      duration: this.executed ? performance.now() - this.startTime : undefined,
      options: this.options
    };
  }

  private async executeOperation(operation: TransactionOperation): Promise<any> {
    switch (operation.type) {
      case 'create':
        const created = await this.client.create(operation.table, operation.data!);
        operation.rollbackData = { sysId: created.sys_id };
        return created;

      case 'update':
        const updated = await this.client.update(operation.table, operation.sysId!, operation.data!);
        // rollbackData already set with originalData
        return updated;

      case 'delete':
        const deleted = await this.client.delete(operation.table, operation.sysId!);
        // rollbackData already set with originalData
        return deleted;

      default:
        throw new Error(`Unsupported operation type: ${(operation as any).type}`);
    }
  }

  private async rollbackOperation(operation: TransactionOperation): Promise<void> {
    switch (operation.type) {
      case 'create':
        // Delete the created record
        if (operation.rollbackData?.sysId) {
          await this.client.delete(operation.table, operation.rollbackData.sysId);
        }
        break;

      case 'update':
        // Restore original data
        if (operation.originalData && operation.sysId) {
          await this.client.update(operation.table, operation.sysId, operation.originalData);
        }
        break;

      case 'delete':
        // Recreate the deleted record
        if (operation.originalData) {
          const recreated = await this.client.create(operation.table, operation.originalData);
          // Note: This will create a new sys_id, original sys_id cannot be restored
          logger.warn('Deleted record recreated with new sys_id', 'Transaction', {
            transactionId: this.id,
            originalSysId: operation.sysId,
            newSysId: recreated.sys_id
          });
        }
        break;
    }
  }
}

export class TransactionManager {
  private static instance: TransactionManager;
  private transactions: Map<string, Transaction> = new Map();
  private enabled: boolean = true;

  private constructor() {
    logger.debug('TransactionManager initialized', 'TransactionManager');
  }

  static getInstance(): TransactionManager {
    if (!TransactionManager.instance) {
      TransactionManager.instance = new TransactionManager();
    }
    return TransactionManager.instance;
  }

  /**
   * Enable or disable transaction support
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`Transaction support ${enabled ? 'enabled' : 'disabled'}`, 'TransactionManager');
  }

  /**
   * Begin a new transaction
   */
  begin(client: any, options: TransactionOptions = {}): Transaction {
    if (!this.enabled) {
      throw new Error('Transaction support is disabled');
    }

    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const defaultOptions: TransactionOptions = {
      timeout: 300000, // 5 minutes
      autoCommit: false,
      isolation: 'read_committed',
      maxRetries: 3,
      ...options
    };

    const transaction = new Transaction(transactionId, defaultOptions, client);
    this.transactions.set(transactionId, transaction);

    logger.info('Transaction began', 'TransactionManager', {
      transactionId,
      options: defaultOptions
    });

    // Set timeout if specified
    if (defaultOptions.timeout) {
      setTimeout(() => {
        if (this.transactions.has(transactionId)) {
          const tx = this.transactions.get(transactionId)!;
          if (!tx.getStatus().executed) {
            logger.warn('Transaction timed out, attempting rollback', 'TransactionManager', {
              transactionId
            });
            tx.rollback().catch(error => {
              logger.error('Timeout rollback failed', error, 'TransactionManager', {
                transactionId
              });
            });
          }
        }
      }, defaultOptions.timeout);
    }

    return transaction;
  }

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId: string): Transaction | undefined {
    return this.transactions.get(transactionId);
  }

  /**
   * Get all active transactions
   */
  getActiveTransactions(): Transaction[] {
    return Array.from(this.transactions.values())
      .filter(tx => !tx.getStatus().executed);
  }

  /**
   * Clean up completed transactions
   */
  cleanup(): void {
    const completedTxs: string[] = [];
    
    this.transactions.forEach((tx, id) => {
      const status = tx.getStatus();
      if (status.executed || status.rolledBack) {
        // Keep transactions for a while for audit purposes
        const age = Date.now() - (status.duration ? Date.now() - status.duration : Date.now());
        if (age > 3600000) { // 1 hour
          completedTxs.push(id);
        }
      }
    });

    completedTxs.forEach(id => {
      this.transactions.delete(id);
    });

    if (completedTxs.length > 0) {
      logger.debug(`Cleaned up ${completedTxs.length} completed transactions`, 'TransactionManager');
    }
  }

  /**
   * Get transaction statistics
   */
  getStats(): any {
    const transactions = Array.from(this.transactions.values());
    const active = transactions.filter(tx => !tx.getStatus().executed);
    const completed = transactions.filter(tx => tx.getStatus().executed && !tx.getStatus().rolledBack);
    const rolledBack = transactions.filter(tx => tx.getStatus().rolledBack);

    return {
      total: transactions.length,
      active: active.length,
      completed: completed.length,
      rolledBack: rolledBack.length,
      enabled: this.enabled
    };
  }

  /**
   * Force rollback all active transactions
   */
  async rollbackAll(): Promise<number> {
    const active = this.getActiveTransactions();
    let rolledBack = 0;

    for (const tx of active) {
      try {
        await tx.rollback();
        rolledBack++;
      } catch (error) {
        logger.error('Force rollback failed', error, 'TransactionManager', {
          transactionId: tx.id
        });
      }
    }

    logger.info(`Force rolled back ${rolledBack} active transactions`, 'TransactionManager');
    return rolledBack;
  }
}

// Global transaction manager instance
export const transactionManager = TransactionManager.getInstance();
export default transactionManager;