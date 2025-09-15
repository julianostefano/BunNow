/**
 * System Transaction Manager - Simplified transaction management
 * Consolidates functionality from TransactionManager with MongoDB sessions
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from 'events';
import { MongoClient, ClientSession } from 'mongodb';
import { logger } from '../../utils/Logger';

export interface Transaction {
  id: string;
  sessionId: string;
  status: 'active' | 'committed' | 'aborted' | 'timeout';
  operations: TransactionOperation[];
  startTime: Date;
  timeout: number;
  isolation: string;
  metadata?: Record<string, any>;
}

export interface TransactionOperation {
  id: string;
  type: 'create' | 'update' | 'delete' | 'find';
  collection: string;
  data: any;
  filter?: any;
  result?: any;
  timestamp: Date;
}

export class SystemTransactionManager extends EventEmitter {
  private client: MongoClient;
  private transactions: Map<string, Transaction> = new Map();
  private sessions: Map<string, ClientSession> = new Map();
  private isInitialized = false;
  private cleanupInterval?: Timer;
  private transactionCounter = 0;

  constructor(mongoConfig: any) {
    super();
    this.client = mongoConfig.client;
  }

  /**
   * Initialize transaction manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.info('💾 [SystemTransactions] Initializing transaction manager...');

      // Check if MongoDB supports transactions
      const serverStatus = await this.client.db().admin().serverStatus();
      const version = serverStatus.version;
      logger.debug(` [SystemTransactions] MongoDB version: ${version}`);

      // Start cleanup interval for expired transactions
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpiredTransactions();
      }, 60000); // Every minute

      this.isInitialized = true;
      logger.info(' [SystemTransactions] Transaction manager initialized');
    } catch (error) {
      logger.error(' [SystemTransactions] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Start a new transaction
   */
  async startTransaction(options?: {
    timeout?: number;
    isolation?: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    try {
      const transactionId = `txn_${++this.transactionCounter}_${Date.now()}`;
      const session = this.client.startSession();

      // Start MongoDB session transaction
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' }
      });

      const transaction: Transaction = {
        id: transactionId,
        sessionId: session.id.toString(),
        status: 'active',
        operations: [],
        startTime: new Date(),
        timeout: options?.timeout || 300000, // 5 minutes default
        isolation: options?.isolation || 'snapshot',
        metadata: options?.metadata
      };

      this.transactions.set(transactionId, transaction);
      this.sessions.set(transactionId, session);

      logger.info(` [SystemTransactions] Started transaction: ${transactionId}`);
      this.emit('transactionStarted', { transactionId, transaction });

      return transactionId;

    } catch (error) {
      logger.error(' [SystemTransactions] Failed to start transaction:', error);
      throw error;
    }
  }

  /**
   * Commit a transaction
   */
  async commitTransaction(transactionId: string): Promise<void> {
    try {
      const transaction = this.transactions.get(transactionId);
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }

      if (transaction.status !== 'active') {
        throw new Error(`Cannot commit transaction in status: ${transaction.status}`);
      }

      const session = this.sessions.get(transactionId);
      if (!session) {
        throw new Error(`Session not found for transaction: ${transactionId}`);
      }

      // Commit MongoDB transaction
      await session.commitTransaction();
      await session.endSession();

      // Update transaction status
      transaction.status = 'committed';

      // Cleanup
      this.sessions.delete(transactionId);

      const duration = Date.now() - transaction.startTime.getTime();
      logger.info(` [SystemTransactions] Committed transaction: ${transactionId} in ${duration}ms`);
      this.emit('transactionCommitted', { transactionId, transaction, duration });

    } catch (error) {
      await this.rollbackTransaction(transactionId);
      logger.error(' [SystemTransactions] Failed to commit transaction:', error);
      throw error;
    }
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    try {
      const transaction = this.transactions.get(transactionId);
      if (!transaction) {
        logger.warn(`Transaction not found for rollback: ${transactionId}`);
        return;
      }

      const session = this.sessions.get(transactionId);
      if (session) {
        await session.abortTransaction();
        await session.endSession();
        this.sessions.delete(transactionId);
      }

      // Update transaction status
      transaction.status = 'aborted';

      const duration = Date.now() - transaction.startTime.getTime();
      logger.info(` [SystemTransactions] Rolled back transaction: ${transactionId} after ${duration}ms`);
      this.emit('transactionRolledBack', { transactionId, transaction, duration });

    } catch (error) {
      logger.error(' [SystemTransactions] Failed to rollback transaction:', error);
      this.emit('transactionFailed', { transactionId, error });
      throw error;
    }
  }

  /**
   * Execute operation within transaction
   */
  async executeInTransaction<T>(
    operation: (transactionId: string) => Promise<T>,
    options?: { timeout?: number; retries?: number }
  ): Promise<T> {
    const maxRetries = options?.retries || 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let transactionId: string | null = null;

      try {
        transactionId = await this.startTransaction({ timeout: options?.timeout });

        const result = await operation(transactionId);

        await this.commitTransaction(transactionId);
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (transactionId) {
          await this.rollbackTransaction(transactionId);
        }

        logger.warn(` [SystemTransactions] Transaction attempt ${attempt}/${maxRetries} failed:`, lastError.message);

        if (attempt < maxRetries) {
          const delay = attempt * 1000; // 1s, 2s, 3s delay
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(` [SystemTransactions] All transaction attempts failed after ${maxRetries} retries`);
    throw lastError!;
  }

  /**
   * Add operation to transaction
   */
  async addOperation(transactionId: string, operation: Omit<TransactionOperation, 'id' | 'timestamp'>): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    if (transaction.status !== 'active') {
      throw new Error(`Cannot add operation to transaction in status: ${transaction.status}`);
    }

    const operationWithId: TransactionOperation = {
      ...operation,
      id: `op_${transaction.operations.length + 1}_${Date.now()}`,
      timestamp: new Date()
    };

    transaction.operations.push(operationWithId);
    logger.debug(` [SystemTransactions] Added operation to transaction ${transactionId}: ${operation.type} on ${operation.collection}`);
  }

  /**
   * Get transaction session for MongoDB operations
   */
  getTransactionSession(transactionId: string): ClientSession | null {
    return this.sessions.get(transactionId) || null;
  }

  /**
   * Get transaction details
   */
  getTransaction(transactionId: string): Transaction | null {
    return this.transactions.get(transactionId) || null;
  }

  /**
   * Get all active transactions
   */
  getActiveTransactions(): Transaction[] {
    return Array.from(this.transactions.values()).filter(txn => txn.status === 'active');
  }

  /**
   * Get active transaction count
   */
  async getActiveTransactionCount(): Promise<number> {
    return this.getActiveTransactions().length;
  }

  /**
   * Cleanup expired transactions
   */
  private async cleanupExpiredTransactions(): Promise<void> {
    const now = Date.now();
    const expiredTransactions: string[] = [];

    for (const [transactionId, transaction] of this.transactions) {
      if (transaction.status === 'active' &&
          (now - transaction.startTime.getTime()) > transaction.timeout) {
        expiredTransactions.push(transactionId);
      }
    }

    for (const transactionId of expiredTransactions) {
      try {
        await this.rollbackTransaction(transactionId);
        const transaction = this.transactions.get(transactionId);
        if (transaction) {
          transaction.status = 'timeout';
        }
        logger.warn(`⏰ [SystemTransactions] Rolled back expired transaction: ${transactionId}`);
      } catch (error) {
        logger.error(` [SystemTransactions] Failed to cleanup expired transaction ${transactionId}:`, error);
      }
    }

    // Remove old completed transactions (keep for 1 hour)
    const oneHourAgo = now - 3600000;
    for (const [transactionId, transaction] of this.transactions) {
      if ((transaction.status === 'committed' || transaction.status === 'aborted' || transaction.status === 'timeout') &&
          transaction.startTime.getTime() < oneHourAgo) {
        this.transactions.delete(transactionId);
      }
    }
  }

  /**
   * Get transaction statistics
   */
  async getStats(): Promise<any> {
    try {
      const allTransactions = Array.from(this.transactions.values());
      const activeTransactions = allTransactions.filter(t => t.status === 'active');
      const committedTransactions = allTransactions.filter(t => t.status === 'committed');
      const abortedTransactions = allTransactions.filter(t => t.status === 'aborted');
      const timeoutTransactions = allTransactions.filter(t => t.status === 'timeout');

      // Calculate average transaction duration for completed transactions
      const completedTransactions = [...committedTransactions, ...abortedTransactions];
      const avgDuration = completedTransactions.length > 0
        ? completedTransactions.reduce((sum, txn) => {
            const duration = txn.status === 'committed' || txn.status === 'aborted'
              ? Date.now() - txn.startTime.getTime()
              : 0;
            return sum + duration;
          }, 0) / completedTransactions.length
        : 0;

      return {
        total: allTransactions.length,
        active: activeTransactions.length,
        committed: committedTransactions.length,
        aborted: abortedTransactions.length,
        timeout: timeoutTransactions.length,
        success_rate: allTransactions.length > 0
          ? Math.round((committedTransactions.length / allTransactions.length) * 100)
          : 0,
        avg_duration_ms: Math.round(avgDuration),
        active_sessions: this.sessions.size
      };
    } catch (error) {
      logger.error(' [SystemTransactions] Failed to get stats:', error);
      return {};
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check MongoDB connection
      await this.client.db().admin().ping();

      // Check if we have too many active transactions (potential memory leak)
      const activeCount = this.getActiveTransactions().length;
      if (activeCount > 100) {
        logger.warn(` [SystemTransactions] High number of active transactions: ${activeCount}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error(' [SystemTransactions] Health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
      }

      // Rollback all active transactions
      const activeTransactions = this.getActiveTransactions();
      await Promise.all(
        activeTransactions.map(txn =>
          this.rollbackTransaction(txn.id).catch(error =>
            logger.warn(`Failed to rollback transaction ${txn.id} during cleanup:`, error)
          )
        )
      );

      // Close remaining sessions
      for (const [transactionId, session] of this.sessions) {
        try {
          await session.endSession();
        } catch (error) {
          logger.warn(`Failed to end session ${transactionId}:`, error);
        }
      }

      this.transactions.clear();
      this.sessions.clear();

      logger.info('🧹 [SystemTransactions] Cleanup completed');
    } catch (error) {
      logger.error(' [SystemTransactions] Cleanup failed:', error);
      throw error;
    }
  }
}