/**
 * TicketRepository Simple Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TicketRepository } from '../repositories/TicketRepository';
import { IncidentSchema } from '../schemas/TicketSchemas';

// Mock MongoDB client and database
const mockCollection = {
  createIndex: async () => ({}),
  replaceOne: async () => ({ upsertedId: 'test-id' }),
  findOne: async (query: any) => {
    if (query.sys_id === 'test-123') {
      return {
        _id: 'test-mongo-id',
        sys_id: 'test-123',
        number: 'INC0012345',
        table: 'incident',
        state: '2',
        short_description: 'Test incident',
        priority: '3',
        caller_id: 'test-user',
        opened_at: new Date(),
        sys_created_on: new Date(),
        sys_updated_on: new Date(),
        last_synced: new Date(),
        sync_status: 'synced'
      } as IncidentSchema;
    }
    return null;
  },
  find: () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          toArray: async () => []
        })
      })
    }),
    toArray: async () => []
  }),
  updateOne: async () => ({ modifiedCount: 1 }),
  insertOne: async () => ({ insertedId: 'audit-id' }),
  countDocuments: async () => 0
};

const mockDb = {
  collection: () => mockCollection,
  listCollections: () => ({ hasNext: async () => false }),
  createCollection: async () => ({}),
  admin: () => ({ ping: async () => true }),
  command: async () => ({})
};

const mockClient: any = {
  db: () => mockDb
};

describe('TicketRepository Simple Tests', () => {
  let repository: TicketRepository;

  beforeEach(() => {
    repository = new TicketRepository(mockClient, 'test_db');
  });

  it('should create TicketRepository successfully', () => {
    expect(repository).toBeDefined();
  });

  it('should save incident ticket with validation', async () => {
    const incident: IncidentSchema = {
      sys_id: 'test-123',
      number: 'INC0012345',
      table: 'incident',
      state: '2',
      short_description: 'Test incident description',
      priority: '3',
      caller_id: 'test-user-123',
      opened_at: new Date(),
      sys_created_on: new Date(),
      sys_updated_on: new Date(),
      last_synced: new Date(),
      sync_status: 'synced'
    };

    await expect(repository.saveTicket(incident)).resolves.toBeUndefined();
  });

  it('should reject invalid incident without caller_id', async () => {
    const invalidIncident: any = {
      sys_id: 'test-456',
      number: 'INC0012346',
      table: 'incident',
      state: '2',
      short_description: 'Test incident',
      priority: '3',
      // Missing caller_id - required for incidents
      opened_at: new Date(),
      sys_created_on: new Date(),
      sys_updated_on: new Date()
    };

    await expect(repository.saveTicket(invalidIncident))
      .rejects.toThrow('Missing required field: caller_id');
  });

  it('should reject invalid state for incident', async () => {
    const invalidStateIncident: IncidentSchema = {
      sys_id: 'test-789',
      number: 'INC0012347',
      table: 'incident',
      state: '99', // Invalid state
      short_description: 'Test incident',
      priority: '3',
      caller_id: 'test-user',
      opened_at: new Date(),
      sys_created_on: new Date(),
      sys_updated_on: new Date(),
      last_synced: new Date(),
      sync_status: 'synced'
    };

    await expect(repository.saveTicket(invalidStateIncident))
      .rejects.toThrow('Invalid state \'99\' for table incident');
  });

  it('should reject invalid priority', async () => {
    const invalidPriorityIncident: IncidentSchema = {
      sys_id: 'test-101',
      number: 'INC0012348',
      table: 'incident',
      state: '2',
      short_description: 'Test incident',
      priority: '10', // Invalid priority
      caller_id: 'test-user',
      opened_at: new Date(),
      sys_created_on: new Date(),
      sys_updated_on: new Date(),
      last_synced: new Date(),
      sync_status: 'synced'
    };

    await expect(repository.saveTicket(invalidPriorityIncident))
      .rejects.toThrow('Invalid priority \'10\'');
  });

  it('should get ticket by sys_id and table', async () => {
    const ticket = await repository.getTicket('test-123', 'incident');
    
    expect(ticket).toBeDefined();
    expect(ticket?.sys_id).toBe('test-123');
    expect(ticket?.number).toBe('INC0012345');
    expect(ticket?.table).toBe('incident');
  });

  it('should return null for non-existent ticket', async () => {
    const ticket = await repository.getTicket('non-existent', 'incident');
    expect(ticket).toBeNull();
  });

  it('should update ticket with audit logging', async () => {
    const updates = {
      state: '6',
      resolved_at: new Date(),
      resolution_code: 'Solved (Permanently)'
    };

    await expect(repository.updateTicket('test-123', 'incident', updates, 'admin'))
      .resolves.toBeUndefined();
  });

  it('should throw error updating non-existent ticket', async () => {
    const updates = { state: '6' };

    await expect(repository.updateTicket('non-existent', 'incident', updates))
      .rejects.toThrow('Ticket incident/non-existent not found');
  });

  it('should mark sync status correctly', async () => {
    await expect(repository.markSyncStatus('test-123', 'incident', 'error', 'Sync failed'))
      .resolves.toBeUndefined();
    
    await expect(repository.markSyncStatus('test-123', 'incident', 'synced'))
      .resolves.toBeUndefined();
  });

  it('should throw error for unsupported table type', async () => {
    const invalidTable: any = {
      sys_id: 'test-999',
      number: 'TEST999',
      table: 'unsupported_table',
      state: '1',
      short_description: 'Test',
      priority: '3',
      opened_at: new Date(),
      sys_created_on: new Date(),
      sys_updated_on: new Date(),
      last_synced: new Date(),
      sync_status: 'synced'
    };

    await expect(repository.saveTicket(invalidTable))
      .rejects.toThrow('Unsupported table type: unsupported_table');
  });

  it('should log audit entry successfully', async () => {
    const auditEntry = {
      ticket_sys_id: 'test-123',
      ticket_table: 'incident',
      ticket_number: 'INC0012345',
      action: 'updated' as const,
      changes: { state: { old_value: '2', new_value: '6' } },
      performed_by: 'test-user',
      performed_at: new Date(),
      source: 'bunsnc' as const
    };

    await expect(repository.logAudit(auditEntry)).resolves.toBeUndefined();
  });
});