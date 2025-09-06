/**
 * ServiceNow Actions Service Simple Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ServiceNowActionsService } from '../services/ServiceNowActionsService';
import { ServiceNowNotesService } from '../services/ServiceNowNotesService';

// Mock ServiceNow client
const mockServiceNowClient = {
  makeRequestFullFields: async (table: string, query: string, limit: number) => {
    console.log(`Mock ServiceNow query: ${table} - ${query}`);
    return {
      result: [{
        sys_id: 'test-123',
        number: 'INC0012345',
        state: '2', // In Progress
        priority: '3'
      }]
    };
  },
  makeRequest: async (method: string, endpoint: string, data: any) => {
    console.log(`Mock ServiceNow ${method}: ${endpoint}`, data);
    return {
      result: {
        sys_id: 'test-123',
        state: data.state || '6'
      }
    };
  }
} as any;

// Mock Notes service
const mockNotesService = {
  addTicketNote: async (request: any) => {
    console.log(`Mock add note: ${request.table}/${request.sysId}`);
    return 'note-123';
  }
} as any;

describe('ServiceNow Actions Service Simple Tests', () => {
  let actionsService: ServiceNowActionsService;

  beforeEach(() => {
    actionsService = new ServiceNowActionsService(mockServiceNowClient, mockNotesService);
  });

  it('should create actions service successfully', () => {
    expect(actionsService).toBeDefined();
  });

  it('should resolve ticket with resolution code and notes', async () => {
    const request = {
      table: 'incident',
      sysId: 'test-123',
      resolutionCode: 'Solved (Permanently)',
      resolutionNotes: 'Issue resolved by restarting the service.'
    };

    const result = await actionsService.resolveTicket(request);

    expect(result.success).toBe(true);
    expect(result.sysId).toBe('test-123');
    expect(result.previousState).toBe('2');
    expect(result.newState).toBe('6');
    expect(result.message).toContain('Solved (Permanently)');
  });

  it('should close ticket with close code and notes', async () => {
    // Mock resolved ticket (state 6)
    mockServiceNowClient.makeRequestFullFields = async () => ({
      result: [{
        sys_id: 'test-123',
        number: 'INC0012345',
        state: '6', // Resolved
        priority: '3'
      }]
    });

    const request = {
      table: 'incident',
      sysId: 'test-123',
      closeCode: 'Solved (Permanently)',
      closeNotes: 'Confirmed resolution with user.'
    };

    const result = await actionsService.closeTicket(request);

    expect(result.success).toBe(true);
    expect(result.sysId).toBe('test-123');
    expect(result.newState).toBe('7');
    expect(result.message).toContain('Solved (Permanently)');
  });

  it('should reopen closed ticket', async () => {
    // Mock closed ticket (state 7)
    mockServiceNowClient.makeRequestFullFields = async () => ({
      result: [{
        sys_id: 'test-123',
        number: 'INC0012345',
        state: '7', // Closed
        priority: '3'
      }]
    });

    const request = {
      table: 'incident',
      sysId: 'test-123',
      reopenNotes: 'Issue has reoccurred, reopening for investigation.',
      reason: 'Problem reoccurred'
    };

    const result = await actionsService.reopenTicket(request);

    expect(result.success).toBe(true);
    expect(result.sysId).toBe('test-123');
    expect(result.previousState).toBe('7');
    expect(result.newState).toBe('2');
    expect(result.message).toContain('Problem reoccurred');
  });

  it('should assign ticket to user', async () => {
    const request = {
      table: 'incident',
      sysId: 'test-123',
      assignedTo: 'john.doe',
      assignmentNotes: 'Assigning to John for technical expertise.'
    };

    const result = await actionsService.assignTicket(request);

    expect(result.success).toBe(true);
    expect(result.sysId).toBe('test-123');
    expect(result.message).toContain('john.doe');
  });

  it('should assign ticket to group', async () => {
    const request = {
      table: 'incident',
      sysId: 'test-123',
      assignmentGroup: 'IT Support Level 2',
      assignmentNotes: 'Escalating to Level 2 support.'
    };

    const result = await actionsService.assignTicket(request);

    expect(result.success).toBe(true);
    expect(result.sysId).toBe('test-123');
    expect(result.message).toContain('IT Support Level 2');
  });

  it('should update ticket priority', async () => {
    const request = {
      table: 'incident',
      sysId: 'test-123',
      newPriority: '1' as const,
      justification: 'Critical business impact - multiple users affected.'
    };

    const result = await actionsService.updatePriority(request);

    expect(result.success).toBe(true);
    expect(result.sysId).toBe('test-123');
    expect(result.message).toContain('Crítica');
  });

  it('should update ticket category', async () => {
    const request = {
      table: 'incident',
      sysId: 'test-123',
      category: 'Network',
      subcategory: 'Connectivity',
      justification: 'Root cause analysis identified network connectivity issue.'
    };

    const result = await actionsService.updateCategory(request);

    expect(result.success).toBe(true);
    expect(result.sysId).toBe('test-123');
    expect(result.message).toContain('Network > Connectivity');
  });

  it('should handle assignment validation error', async () => {
    const request = {
      table: 'incident',
      sysId: 'test-123'
      // Missing both assignedTo and assignmentGroup
    };

    const result = await actionsService.assignTicket(request);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Either assignedTo or assignmentGroup must be provided');
  });

  it('should validate state transitions', async () => {
    // Mock closed ticket trying to resolve (invalid transition)
    mockServiceNowClient.makeRequestFullFields = async () => ({
      result: [{
        sys_id: 'test-123',
        number: 'INC0012345',
        state: '7', // Closed
        priority: '3'
      }]
    });

    const request = {
      table: 'incident',
      sysId: 'test-123',
      resolutionCode: 'Solved (Permanently)',
      resolutionNotes: 'Trying to resolve closed ticket.'
    };

    const result = await actionsService.resolveTicket(request);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid state transition');
  });
});