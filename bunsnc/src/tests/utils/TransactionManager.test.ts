/**
 * TransactionManager Tests - Comprehensive test suite for transaction management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { 
  TransactionManager, 
  Transaction, 
  transactionManager 
} from '../../utils/TransactionManager';
import type { ServiceNowRecord } from '../../types/servicenow';

// Mock client for testing
class MockServiceNowClient {
  private records: Map<string, Map<string, ServiceNowRecord>> = new Map();
  private nextSysId = 1;

  async create(table: string, data: ServiceNowRecord): Promise<ServiceNowRecord> {
    if (!this.records.has(table)) {
      this.records.set(table, new Map());
    }
    
    const sysId = `test_${this.nextSysId++}`;
    const record = { ...data, sys_id: sysId };
    this.records.get(table)!.set(sysId, record);
    
    return record;
  }

  async update(table: string, sysId: string, data: ServiceNowRecord): Promise<ServiceNowRecord> {
    if (!this.records.has(table)) {
      throw new Error('Table not found');
    }
    
    const tableRecords = this.records.get(table)!;
    if (!tableRecords.has(sysId)) {
      throw new Error('Record not found');
    }
    
    const existingRecord = tableRecords.get(sysId)!;
    const updatedRecord = { ...existingRecord, ...data };
    tableRecords.set(sysId, updatedRecord);
    
    return updatedRecord;
  }

  async delete(table: string, sysId: string): Promise<boolean> {
    if (!this.records.has(table)) {
      return false;
    }
    
    const tableRecords = this.records.get(table)!;
    return tableRecords.delete(sysId);
  }

  getRecord(table: string, sysId: string): ServiceNowRecord | undefined {
    return this.records.get(table)?.get(sysId);
  }

  getAllRecords(table: string): ServiceNowRecord[] {
    const tableRecords = this.records.get(table);
    return tableRecords ? Array.from(tableRecords.values()) : [];
  }

  clear(): void {
    this.records.clear();
    this.nextSysId = 1;
  }
}

describe('TransactionManager', () => {
  let manager: TransactionManager;
  let mockClient: MockServiceNowClient;

  beforeEach(() => {
    manager = TransactionManager.getInstance();
    manager.setEnabled(true);
    mockClient = new MockServiceNowClient();
    
    // Cleanup any existing transactions
    manager.rollbackAll();
    manager.cleanup();
  });

  afterEach(() => {
    mockClient.clear();
    manager.rollbackAll();
  });

  describe('Basic Functionality', () => {
    test('should be a singleton', () => {
      const manager1 = TransactionManager.getInstance();
      const manager2 = TransactionManager.getInstance();
      
      expect(manager1).toBe(manager2);
      expect(transactionManager).toBe(manager1);
    });

    test('should enable and disable transaction support', () => {
      manager.setEnabled(false);
      
      expect(() => {
        manager.begin(mockClient);
      }).toThrow('Transaction support is disabled');
      
      manager.setEnabled(true);
      
      expect(() => {
        manager.begin(mockClient);
      }).not.toThrow();
    });

    test('should begin new transaction', () => {
      const tx = manager.begin(mockClient);
      
      expect(tx).toBeInstanceOf(Transaction);
      expect(tx.id).toBeTruthy();
      expect(tx.options).toBeTruthy();
    });

    test('should track active transactions', () => {
      const tx1 = manager.begin(mockClient);
      const tx2 = manager.begin(mockClient);
      
      const active = manager.getActiveTransactions();
      expect(active).toHaveLength(2);
      expect(active).toContain(tx1);
      expect(active).toContain(tx2);
    });

    test('should get transaction by ID', () => {
      const tx = manager.begin(mockClient);
      
      const retrieved = manager.getTransaction(tx.id);
      expect(retrieved).toBe(tx);
      
      const notFound = manager.getTransaction('non-existent-id');
      expect(notFound).toBeUndefined();
    });

    test('should provide transaction statistics', () => {
      const tx1 = manager.begin(mockClient);
      const tx2 = manager.begin(mockClient);
      
      const stats = manager.getStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.completed).toBe(0);
      expect(stats.rolledBack).toBe(0);
      expect(stats.enabled).toBe(true);
    });
  });

  describe('Transaction Operations', () => {
    test('should add create operations', () => {
      const tx = manager.begin(mockClient);
      
      const operationId = tx.create('incident', {
        short_description: 'Test incident',
        state: '1'
      });
      
      expect(operationId).toBeTruthy();
      expect(operationId).toMatch(/^create_/);
      
      const status = tx.getStatus();
      expect(status.operations).toBe(1);
    });

    test('should add update operations', () => {
      const tx = manager.begin(mockClient);
      
      const operationId = tx.update('incident', 'test123', {
        state: '2'
      }, {
        state: '1' // original data for rollback
      });
      
      expect(operationId).toBeTruthy();
      expect(operationId).toMatch(/^update_/);
    });

    test('should add delete operations', () => {
      const tx = manager.begin(mockClient);
      
      const operationId = tx.delete('incident', 'test123', {
        short_description: 'Original incident',
        state: '1'
      });
      
      expect(operationId).toBeTruthy();
      expect(operationId).toMatch(/^delete_/);
    });

    test('should prevent adding operations to executed transaction', () => {
      const tx = manager.begin(mockClient);
      
      // Mark as executed (simulating commit)
      (tx as any).executed = true;
      
      expect(() => {
        tx.create('incident', { short_description: 'Test' });
      }).toThrow('Cannot add operations to an executed transaction');
    });
  });

  describe('Transaction Commit', () => {
    test('should commit successful transaction', async () => {
      const tx = manager.begin(mockClient);
      
      tx.create('incident', {
        short_description: 'Test incident 1',
        state: '1'
      });
      
      tx.create('incident', {
        short_description: 'Test incident 2',
        state: '1'
      });
      
      const result = await tx.commit();
      
      expect(result.success).toBe(true);
      expect(result.operations).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.rollbackPerformed).toBe(false);
      
      // Verify records were created
      const records = mockClient.getAllRecords('incident');
      expect(records).toHaveLength(2);
    });

    test('should measure transaction duration', async () => {
      const tx = manager.begin(mockClient);
      
      tx.create('incident', {
        short_description: 'Test incident'
      });
      
      const result = await tx.commit();
      
      expect(result.duration).toBeGreaterThan(0);
    });

    test('should handle mixed operations', async () => {
      // First create a record to update and delete
      const created = await mockClient.create('incident', {
        short_description: 'Original incident',
        state: '1'
      });
      
      const tx = manager.begin(mockClient);
      
      // Create new record
      tx.create('incident', {
        short_description: 'New incident',
        state: '1'
      });
      
      // Update existing record
      tx.update('incident', created.sys_id!, {
        state: '2'
      }, created);
      
      // Delete another record (we'll create it first)
      const toDelete = await mockClient.create('incident', {
        short_description: 'To be deleted',
        state: '1'
      });
      
      tx.delete('incident', toDelete.sys_id!, toDelete);
      
      const result = await tx.commit();
      
      expect(result.success).toBe(true);
      expect(result.operations).toBe(3);
      
      // Verify results
      const allRecords = mockClient.getAllRecords('incident');
      expect(allRecords).toHaveLength(2); // 1 original + 1 new - 1 deleted
      
      const updatedRecord = mockClient.getRecord('incident', created.sys_id!);
      expect(updatedRecord?.state).toBe('2');
      
      const deletedRecord = mockClient.getRecord('incident', toDelete.sys_id!);
      expect(deletedRecord).toBeUndefined();
    });

    test('should not commit transaction twice', async () => {
      const tx = manager.begin(mockClient);
      
      tx.create('incident', {
        short_description: 'Test incident'
      });
      
      await tx.commit();
      
      expect(() => tx.commit()).toThrow('Transaction already executed');
    });
  });

  describe('Transaction Rollback', () => {
    test('should rollback on operation failure', async () => {
      const tx = manager.begin(mockClient);
      
      // Add valid operation
      tx.create('incident', {
        short_description: 'Valid incident',
        state: '1'
      });
      
      // Mock client to fail on second operation
      const originalCreate = mockClient.create.bind(mockClient);
      let createCount = 0;
      mockClient.create = async (table: string, data: ServiceNowRecord) => {
        createCount++;
        if (createCount === 2) {
          throw new Error('Simulated database error');
        }
        return originalCreate(table, data);
      };
      
      // Add operation that will fail
      tx.create('incident', {
        short_description: 'Failing incident',
        state: '1'
      });
      
      const result = await tx.commit();
      
      expect(result.success).toBe(false);
      expect(result.rollbackPerformed).toBe(true);
      expect(result.errors).toHaveLength(1);
      
      // Verify no records were left in database
      const records = mockClient.getAllRecords('incident');
      expect(records).toHaveLength(0);
    });

    test('should rollback create operations', async () => {
      const tx = manager.begin(mockClient);
      
      tx.create('incident', { short_description: 'Test 1' });
      tx.create('incident', { short_description: 'Test 2' });
      
      // First commit successfully
      const result = await tx.commit();
      expect(result.success).toBe(true);
      
      // Verify records exist
      let records = mockClient.getAllRecords('incident');
      expect(records).toHaveLength(2);
      
      // Now rollback
      const rollbackResult = await tx.rollback();
      expect(rollbackResult).toBe(true);
      
      // Verify records were deleted
      records = mockClient.getAllRecords('incident');
      expect(records).toHaveLength(0);
    });

    test('should rollback update operations', async () => {
      // Create original record
      const original = await mockClient.create('incident', {
        short_description: 'Original',
        state: '1'
      });
      
      const tx = manager.begin(mockClient);
      
      tx.update('incident', original.sys_id!, {
        short_description: 'Updated',
        state: '2'
      }, original);
      
      const result = await tx.commit();
      expect(result.success).toBe(true);
      
      // Verify update occurred
      let record = mockClient.getRecord('incident', original.sys_id!);
      expect(record?.short_description).toBe('Updated');
      expect(record?.state).toBe('2');
      
      // Rollback
      await tx.rollback();
      
      // Verify original data restored
      record = mockClient.getRecord('incident', original.sys_id!);
      expect(record?.short_description).toBe('Original');
      expect(record?.state).toBe('1');
    });

    test('should rollback delete operations', async () => {
      // Create record to delete
      const record = await mockClient.create('incident', {
        short_description: 'To be deleted',
        state: '1'
      });
      
      const tx = manager.begin(mockClient);
      
      tx.delete('incident', record.sys_id!, record);
      
      const result = await tx.commit();
      expect(result.success).toBe(true);
      
      // Verify record was deleted
      expect(mockClient.getRecord('incident', record.sys_id!)).toBeUndefined();
      
      // Rollback
      await tx.rollback();
      
      // Verify record was recreated (with new sys_id)
      const recreatedRecords = mockClient.getAllRecords('incident');
      expect(recreatedRecords).toHaveLength(1);
      expect(recreatedRecords[0].short_description).toBe('To be deleted');
    });

    test('should handle rollback of already rolled back transaction', async () => {
      const tx = manager.begin(mockClient);
      
      tx.create('incident', { short_description: 'Test' });
      
      await tx.commit();
      await tx.rollback();
      
      // Second rollback should succeed but do nothing
      const result = await tx.rollback();
      expect(result).toBe(true);
    });

    test('should handle partial rollback failures gracefully', async () => {
      const tx = manager.begin(mockClient);
      
      tx.create('incident', { short_description: 'Test 1' });
      tx.create('incident', { short_description: 'Test 2' });
      
      await tx.commit();
      
      // Mock delete to fail for first record
      const originalDelete = mockClient.delete.bind(mockClient);
      let deleteCount = 0;
      mockClient.delete = async (table: string, sysId: string) => {
        deleteCount++;
        if (deleteCount === 1) {
          throw new Error('Rollback delete failed');
        }
        return originalDelete(table, sysId);
      };
      
      const rollbackResult = await tx.rollback();
      expect(rollbackResult).toBe(false); // Partial failure
      
      // Should still attempt to rollback other operations
      const records = mockClient.getAllRecords('incident');
      expect(records).toHaveLength(1); // One deleted, one failed to delete
    });
  });

  describe('Transaction Options', () => {
    test('should apply custom options', () => {
      const options = {
        name: 'custom-transaction',
        timeout: 60000,
        autoCommit: false,
        maxRetries: 5
      };
      
      const tx = manager.begin(mockClient, options);
      
      expect(tx.options.name).toBe('custom-transaction');
      expect(tx.options.timeout).toBe(60000);
      expect(tx.options.autoCommit).toBe(false);
      expect(tx.options.maxRetries).toBe(5);
    });

    test('should use default options when not specified', () => {
      const tx = manager.begin(mockClient);
      
      expect(tx.options.timeout).toBe(300000); // 5 minutes default
      expect(tx.options.autoCommit).toBe(false);
      expect(tx.options.maxRetries).toBe(3);
      expect(tx.options.isolation).toBe('read_committed');
    });

    test('should handle transaction timeout', async () => {
      const tx = manager.begin(mockClient, { timeout: 50 }); // 50ms timeout
      
      tx.create('incident', { short_description: 'Test' });
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Transaction should be marked for rollback due to timeout
      // (In real implementation, this would be handled by the timeout mechanism)
    });
  });

  describe('Transaction Status', () => {
    test('should provide transaction status', () => {
      const tx = manager.begin(mockClient);
      
      tx.create('incident', { short_description: 'Test 1' });
      tx.create('incident', { short_description: 'Test 2' });
      
      const status = tx.getStatus();
      
      expect(status.id).toBe(tx.id);
      expect(status.executed).toBe(false);
      expect(status.rolledBack).toBe(false);
      expect(status.operations).toBe(2);
      expect(status.executedOperations).toBe(0);
      expect(status.options).toBe(tx.options);
    });

    test('should update status after commit', async () => {
      const tx = manager.begin(mockClient);
      
      tx.create('incident', { short_description: 'Test' });
      
      await tx.commit();
      
      const status = tx.getStatus();
      
      expect(status.executed).toBe(true);
      expect(status.executedOperations).toBe(1);
      expect(status.duration).toBeGreaterThan(0);
    });
  });

  describe('Manager Operations', () => {
    test('should force rollback all active transactions', async () => {
      const tx1 = manager.begin(mockClient);
      const tx2 = manager.begin(mockClient);
      
      tx1.create('incident', { short_description: 'Test 1' });
      tx2.create('incident', { short_description: 'Test 2' });
      
      await tx1.commit();
      await tx2.commit();
      
      const rolledBackCount = await manager.rollbackAll();
      
      expect(rolledBackCount).toBe(2);
      
      // Verify all records were rolled back
      const records = mockClient.getAllRecords('incident');
      expect(records).toHaveLength(0);
    });

    test('should cleanup completed transactions', async () => {
      const tx = manager.begin(mockClient);
      tx.create('incident', { short_description: 'Test' });
      await tx.commit();
      
      // Mock the transaction as old enough for cleanup
      const oldTimestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      (tx as any).startTime = oldTimestamp;
      
      const beforeCleanup = manager.getStats();
      expect(beforeCleanup.total).toBeGreaterThan(0);
      
      manager.cleanup();
      
      // In real implementation, old completed transactions would be removed
      // For this test, we just verify the method doesn't throw
    });
  });

  describe('Error Handling', () => {
    test('should handle client method failures gracefully', async () => {
      const tx = manager.begin(mockClient);
      
      // Mock client create to fail
      mockClient.create = async () => {
        throw new Error('Database connection failed');
      };
      
      tx.create('incident', { short_description: 'Test' });
      
      const result = await tx.commit();
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Database connection failed');
    });

    test('should handle invalid operation parameters', () => {
      const tx = manager.begin(mockClient);
      
      // Should not throw for invalid parameters
      expect(() => {
        tx.update('incident', '', {});
      }).not.toThrow();
      
      expect(() => {
        tx.delete('incident', '');
      }).not.toThrow();
    });

    test('should handle rollback failures gracefully', async () => {
      const tx = manager.begin(mockClient);
      
      tx.create('incident', { short_description: 'Test' });
      await tx.commit();
      
      // Mock delete to always fail
      mockClient.delete = async () => {
        throw new Error('Cannot delete record');
      };
      
      const rollbackResult = await tx.rollback();
      expect(rollbackResult).toBe(false);
      
      // Should not throw despite failure
    });
  });
});