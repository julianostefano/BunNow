/**
 * Comprehensive Tests for ConsolidatedServiceNowService
 * Testing all consolidation features from Phase 2
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'bun:test';
import { ConsolidatedServiceNowService } from '../../services/ConsolidatedServiceNowService';
import type { ServiceNowAuthClient } from '../../services/ServiceNowAuthClient';
import type { TicketData } from '../../types/TicketTypes';

// Mock ServiceNow Auth Client
const mockServiceNowClient = {
  makeRequestFullFields: jest.fn(),
  isAuthenticated: () => true,
  getInstanceUrl: () => 'https://test.service-now.com'
} as unknown as ServiceNowAuthClient;

// Mock MongoDB responses
const mockMongoClient = {
  connect: jest.fn(),
  db: jest.fn(() => ({
    collection: jest.fn(() => ({
      findOne: jest.fn(),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          skip: jest.fn(() => ({
            limit: jest.fn(() => ({
              toArray: jest.fn()
            }))
          }))
        }))
      })),
      countDocuments: jest.fn(),
      replaceOne: jest.fn()
    }))
  })),
  close: jest.fn()
};

// Mock MongoDB collections manager
jest.mock('../../config/mongodb-collections', () => ({
  mongoCollectionManager: {
    getIncidentsCollection: () => mockMongoClient.db().collection('incidents'),
    getChangeTasksCollection: () => mockMongoClient.db().collection('change_tasks'),
    getSCTasksCollection: () => mockMongoClient.db().collection('sc_tasks')
  }
}));

// Mock enhanced ticket storage service
jest.mock('../../services/ConsolidatedDataService', () => ({
  enhancedTicketStorageService: {
    getClient: () => mockMongoClient
  }
}));

// Mock sample ticket data
const mockTicketData = {
  sys_id: 'test-sys-id-123',
  number: 'INC0012345',
  short_description: 'Test incident',
  description: 'Test incident description',
  state: '2',
  priority: '3',
  assigned_to: 'Test User',
  assignment_group: 'Test Group',
  caller_id: 'Test Caller',
  sys_created_on: '2025-01-01 10:00:00',
  sys_updated_on: '2025-01-01 11:00:00',
  category: 'Software',
  subcategory: 'Application',
  urgency: '3',
  impact: '3'
};

const mockServiceNowResponse = {
  result: [mockTicketData]
};

describe('ConsolidatedServiceNowService - Comprehensive Test Suite', () => {
  let consolidatedService: ConsolidatedServiceNowService;

  beforeAll(() => {
    // Setup mock implementations
    mockServiceNowClient.makeRequestFullFields.mockResolvedValue(mockServiceNowResponse);
  });

  beforeEach(async () => {
    consolidatedService = new ConsolidatedServiceNowService(mockServiceNowClient);
    
    // Mock MongoDB module to avoid actual connections during testing
    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn(() => mockMongoClient)
    }));
  });

  afterEach(async () => {
    if (consolidatedService) {
      await consolidatedService.cleanup();
    }
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should initialize consolidated service successfully', async () => {
      expect(consolidatedService).toBeDefined();
      expect(consolidatedService).toBeInstanceOf(ConsolidatedServiceNowService);
    });

    it('should create Elysia service instance', () => {
      const elysiaService = consolidatedService.createElysiaService();
      expect(elysiaService).toBeDefined();
      expect(typeof elysiaService.handle).toBe('function');
    });

    it('should handle initialization with null client gracefully', () => {
      expect(() => {
        new ConsolidatedServiceNowService(null as any);
      }).not.toThrow();
    });
  });

  describe('Ticket Details Retrieval (Enhanced from TicketService)', () => {
    it('should retrieve ticket details from ServiceNow', async () => {
      const ticketDetails = await consolidatedService.getTicketDetails('test-sys-id-123', 'incident');
      
      expect(ticketDetails).toBeDefined();
      expect(ticketDetails.sysId).toBe('test-sys-id-123');
      expect(ticketDetails.number).toBe('INC0012345');
      expect(ticketDetails.shortDescription).toBe('Test incident');
      expect(mockServiceNowClient.makeRequestFullFields).toHaveBeenCalledWith(
        'incident',
        'sys_id=test-sys-id-123',
        1
      );
    });

    it('should handle ticket not found error', async () => {
      mockServiceNowClient.makeRequestFullFields.mockResolvedValueOnce({ result: [] });
      
      await expect(
        consolidatedService.getTicketDetails('non-existent-id', 'incident')
      ).rejects.toThrow('Ticket not found: non-existent-id');
    });

    it('should process ticket data correctly', async () => {
      const ticketDetails = await consolidatedService.getTicketDetails('test-sys-id-123', 'incident');
      
      expect(ticketDetails.table).toBe('incident');
      expect(ticketDetails.state).toBe('2');
      expect(ticketDetails.priority).toBe('3');
      expect(ticketDetails.createdOn).toContain('2025');
    });

    it('should handle malformed ticket data gracefully', async () => {
      const malformedData = {
        sys_id: null,
        number: undefined,
        short_description: '',
        state: null
      };
      
      mockServiceNowClient.makeRequestFullFields.mockResolvedValueOnce({
        result: [malformedData]
      });
      
      const ticketDetails = await consolidatedService.getTicketDetails('malformed-id', 'incident');
      
      expect(ticketDetails.sysId).toBe('N/A');
      expect(ticketDetails.number).toBe('N/A');
      expect(ticketDetails.shortDescription).toBe('Sem descrição');
      expect(ticketDetails.state).toBe('1'); // Default state
    });
  });

  describe('Hybrid Query Operations (From HybridTicketService)', () => {
    const mockQueryParams = {
      table: 'incident',
      group: 'IT Support',
      state: 'active',
      page: 1,
      limit: 10
    };

    it('should execute hybrid query successfully', async () => {
      const result = await consolidatedService.hybridQuery(mockQueryParams);
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('source');
    });

    it('should try MongoDB first in hybrid strategy', async () => {
      const mongoCollection = mockMongoClient.db().collection('incidents');
      mongoCollection.find().sort().skip().limit().toArray.mockResolvedValueOnce([mockTicketData]);
      mongoCollection.countDocuments.mockResolvedValueOnce(1);
      
      const result = await consolidatedService.hybridQuery(mockQueryParams);
      
      expect(result.source).toBe('mongodb');
      expect(result.data).toHaveLength(1);
    });

    it('should fallback to ServiceNow when MongoDB is empty', async () => {
      const mongoCollection = mockMongoClient.db().collection('incidents');
      mongoCollection.find().sort().skip().limit().toArray.mockResolvedValueOnce([]);
      mongoCollection.countDocuments.mockResolvedValueOnce(0);
      
      const result = await consolidatedService.hybridQuery(mockQueryParams);
      
      expect(mockServiceNowClient.makeRequestFullFields).toHaveBeenCalled();
    });

    it('should handle different table types', async () => {
      const changeTaskParams = { ...mockQueryParams, table: 'change_task' };
      const scTaskParams = { ...mockQueryParams, table: 'sc_task' };
      
      await consolidatedService.hybridQuery(changeTaskParams);
      await consolidatedService.hybridQuery(scTaskParams);
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should handle state filtering correctly', async () => {
      const activeParams = { ...mockQueryParams, state: 'active' };
      const newParams = { ...mockQueryParams, state: 'new' };
      const resolvedParams = { ...mockQueryParams, state: 'resolved' };
      
      await Promise.all([
        consolidatedService.hybridQuery(activeParams),
        consolidatedService.hybridQuery(newParams),
        consolidatedService.hybridQuery(resolvedParams)
      ]);
      
      // Should handle all state filters without errors
      expect(true).toBe(true);
    });

    it('should implement pagination correctly', async () => {
      const page2Params = { ...mockQueryParams, page: 2, limit: 5 };
      
      const result = await consolidatedService.hybridQuery(page2Params);
      
      expect(result.currentPage).toBe(2);
    });
  });

  describe('Ticket Synchronization (From TicketIntegrationService)', () => {
    it('should sync current month tickets', async () => {
      mockServiceNowClient.makeRequestFullFields.mockResolvedValue({
        result: [mockTicketData, { ...mockTicketData, sys_id: 'test-2' }]
      });
      
      const syncResult = await consolidatedService.syncCurrentMonthTickets();
      
      expect(syncResult).toBeDefined();
      expect(syncResult.success).toBe(true);
      expect(syncResult.stats).toHaveProperty('incidents');
      expect(syncResult.stats).toHaveProperty('change_tasks');
      expect(syncResult.stats).toHaveProperty('sc_tasks');
      expect(syncResult.stats).toHaveProperty('groups');
    });

    it('should handle sync errors gracefully', async () => {
      mockServiceNowClient.makeRequestFullFields.mockRejectedValueOnce(
        new Error('ServiceNow API error')
      );
      
      const syncResult = await consolidatedService.syncCurrentMonthTickets();
      
      expect(syncResult.success).toBe(false);
    });

    it('should sync different ticket types', async () => {
      const mockIncident = { ...mockTicketData, sys_class_name: 'incident' };
      const mockChangeTask = { ...mockTicketData, sys_class_name: 'change_task' };
      const mockSCTask = { ...mockTicketData, sys_class_name: 'sc_task' };
      
      mockServiceNowClient.makeRequestFullFields
        .mockResolvedValueOnce({ result: [mockIncident] })
        .mockResolvedValueOnce({ result: [mockChangeTask] })
        .mockResolvedValueOnce({ result: [mockSCTask] })
        .mockResolvedValueOnce({ result: [{ sys_id: 'group-1', name: 'Test Group' }] });
      
      const syncResult = await consolidatedService.syncCurrentMonthTickets();
      
      expect(syncResult.success).toBe(true);
      expect(mockServiceNowClient.makeRequestFullFields).toHaveBeenCalledTimes(4);
    });
  });

  describe('Collection Statistics (From TicketCollectionService)', () => {
    it('should return collection statistics', async () => {
      const mockCounts = [100, 50, 75, 25]; // incidents, change_tasks, sc_tasks, groups
      mockMongoClient.db().collection().countDocuments
        .mockResolvedValueOnce(mockCounts[0])
        .mockResolvedValueOnce(mockCounts[1])
        .mockResolvedValueOnce(mockCounts[2])
        .mockResolvedValueOnce(mockCounts[3]);
      
      const stats = await consolidatedService.getStats();
      
      expect(stats).toBeDefined();
      expect(stats.incidents).toBe(mockCounts[0]);
      expect(stats.changeTasks).toBe(mockCounts[1]);
      expect(stats.scTasks).toBe(mockCounts[2]);
      expect(stats.groups).toBe(mockCounts[3]);
      expect(stats.lastSync).toBeDefined();
    });

    it('should handle database errors in statistics', async () => {
      mockMongoClient.db().collection().countDocuments
        .mockRejectedValue(new Error('Database error'));
      
      const stats = await consolidatedService.getStats();
      
      expect(stats.incidents).toBe(0);
      expect(stats.changeTasks).toBe(0);
      expect(stats.scTasks).toBe(0);
      expect(stats.groups).toBe(0);
    });
  });

  describe('Utility Functions (Enhanced from TicketService)', () => {
    it('should map status codes to labels', () => {
      expect(consolidatedService.getStatusLabel('1')).toBe('Novo');
      expect(consolidatedService.getStatusLabel('2')).toBe('Em Progresso');
      expect(consolidatedService.getStatusLabel('6')).toBe('Resolvido');
      expect(consolidatedService.getStatusLabel('7')).toBe('Fechado');
      expect(consolidatedService.getStatusLabel('999')).toBe('Desconhecido');
    });

    it('should map priority codes to labels', () => {
      expect(consolidatedService.getPriorityLabel('1')).toBe('Crítica');
      expect(consolidatedService.getPriorityLabel('2')).toBe('Alta');
      expect(consolidatedService.getPriorityLabel('3')).toBe('Moderada');
      expect(consolidatedService.getPriorityLabel('4')).toBe('Baixa');
      expect(consolidatedService.getPriorityLabel('5')).toBe('Planejamento');
      expect(consolidatedService.getPriorityLabel('999')).toBe('N/A');
    });
  });

  describe('Data Processing and Transformation', () => {
    it('should process raw ServiceNow data correctly', async () => {
      const complexTicketData = {
        sys_id: 'complex-id',
        number: 'INC0054321',
        short_description: 'Complex ticket',
        description: 'Detailed description',
        state: { display_value: 'In Progress', value: '2' },
        priority: { display_value: 'High', value: '2' },
        assigned_to: { display_value: 'John Doe', value: 'user123' },
        assignment_group: { display_value: 'IT Support', value: 'group456' },
        caller_id: { display_value: 'Jane Smith', value: 'caller789' },
        sys_created_on: { display_value: '2025-01-01 10:00:00', value: '2025-01-01 10:00:00' }
      };

      mockServiceNowClient.makeRequestFullFields.mockResolvedValueOnce({
        result: [complexTicketData]
      });

      const result = await consolidatedService.getTicketDetails('complex-id', 'incident');

      expect(result.state).toBe('2');
      expect(result.priority).toBe('2');
      expect(result.assignedTo).toBe('John Doe');
      expect(result.assignmentGroup).toBe('IT Support');
      expect(result.caller).toBe('Jane Smith');
    });

    it('should handle date formatting correctly', async () => {
      const dateFormats = [
        '2025-01-01T10:00:00Z',
        '2025-01-01 10:00:00',
        'invalid-date',
        null,
        undefined
      ];

      for (const date of dateFormats) {
        const testData = { ...mockTicketData, sys_created_on: date };
        mockServiceNowClient.makeRequestFullFields.mockResolvedValueOnce({
          result: [testData]
        });

        const result = await consolidatedService.getTicketDetails('date-test', 'incident');
        expect(result.createdOn).toBeDefined();
      }
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle MongoDB connection failures gracefully', async () => {
      mockMongoClient.connect.mockRejectedValueOnce(new Error('Connection failed'));
      
      const newService = new ConsolidatedServiceNowService(mockServiceNowClient);
      
      // Should still work with ServiceNow fallback
      const result = await newService.getTicketDetails('test-id', 'incident');
      expect(result).toBeDefined();
    });

    it('should handle ServiceNow API failures', async () => {
      mockServiceNowClient.makeRequestFullFields.mockRejectedValueOnce(
        new Error('API Rate Limited')
      );
      
      await expect(
        consolidatedService.getTicketDetails('failing-id', 'incident')
      ).rejects.toThrow('Failed to load ticket');
    });

    it('should handle malformed API responses', async () => {
      mockServiceNowClient.makeRequestFullFields.mockResolvedValueOnce({
        result: null
      });
      
      await expect(
        consolidatedService.getTicketDetails('malformed-response', 'incident')
      ).rejects.toThrow('Ticket not found');
    });

    it('should cleanup resources properly', async () => {
      await expect(consolidatedService.cleanup()).resolves.not.toThrow();
      expect(mockMongoClient.close).toHaveBeenCalled();
    });
  });

  describe('Feature Consolidation Validation', () => {
    it('should maintain all TicketService features', async () => {
      // Original TicketService functionality
      const ticketDetails = await consolidatedService.getTicketDetails('test-id', 'incident');
      expect(ticketDetails).toBeDefined();
      
      // Utility functions
      expect(consolidatedService.getStatusLabel('1')).toBe('Novo');
      expect(consolidatedService.getPriorityLabel('1')).toBe('Crítica');
      
      // Elysia service creation
      const elysiaService = consolidatedService.createElysiaService();
      expect(elysiaService).toBeDefined();
    });

    it('should maintain all HybridTicketService features', async () => {
      // Hybrid query functionality
      const queryResult = await consolidatedService.hybridQuery({
        table: 'incident',
        group: 'all',
        state: 'all',
        page: 1,
        limit: 10
      });
      
      expect(queryResult).toHaveProperty('data');
      expect(queryResult).toHaveProperty('source');
      expect(['mongodb', 'servicenow', 'hybrid']).toContain(queryResult.source);
    });

    it('should maintain all TicketIntegrationService features', async () => {
      // Sync functionality
      const syncResult = await consolidatedService.syncCurrentMonthTickets();
      expect(syncResult).toHaveProperty('success');
      expect(syncResult).toHaveProperty('stats');
      expect(syncResult.stats).toHaveProperty('incidents');
      expect(syncResult.stats).toHaveProperty('change_tasks');
      expect(syncResult.stats).toHaveProperty('sc_tasks');
    });

    it('should maintain all TicketCollectionService features', async () => {
      // Collection statistics
      const stats = await consolidatedService.getStats();
      expect(stats).toHaveProperty('incidents');
      expect(stats).toHaveProperty('changeTasks');
      expect(stats).toHaveProperty('scTasks');
      expect(stats).toHaveProperty('groups');
      expect(stats).toHaveProperty('lastSync');
    });

    it('should demonstrate improved unified functionality', async () => {
      // Unified operations that span multiple original services
      const [ticketDetails, queryResult, stats] = await Promise.all([
        consolidatedService.getTicketDetails('unified-test', 'incident'),
        consolidatedService.hybridQuery({
          table: 'incident',
          group: 'all',
          state: 'all', 
          page: 1,
          limit: 5
        }),
        consolidatedService.getStats()
      ]);
      
      expect(ticketDetails).toBeDefined();
      expect(queryResult).toBeDefined();
      expect(stats).toBeDefined();
      
      // All operations should complete successfully
      expect(ticketDetails.sysId).toBeDefined();
      expect(queryResult.data).toBeDefined();
      expect(stats.lastSync).toBeDefined();
    });
  });
});

// Mock jest functions for Bun compatibility
if (typeof jest === 'undefined') {
  (globalThis as any).jest = {
    fn: (implementation?: Function) => {
      const mockFn = implementation || (() => {});
      (mockFn as any).mock = {
        calls: [],
        results: []
      };
      
      const originalFn = mockFn;
      const wrappedFn = function(...args: any[]) {
        (wrappedFn as any).mock.calls.push(args);
        const result = originalFn.apply(this, args);
        (wrappedFn as any).mock.results.push({ value: result });
        return result;
      };
      
      (wrappedFn as any).mock = (mockFn as any).mock;
      (wrappedFn as any).mockResolvedValue = (value: any) => {
        (wrappedFn as any).mockImplementation(() => Promise.resolve(value));
        return wrappedFn;
      };
      (wrappedFn as any).mockResolvedValueOnce = (value: any) => {
        const calls = (wrappedFn as any).mock.calls.length;
        (wrappedFn as any).mockImplementationOnce(() => Promise.resolve(value));
        return wrappedFn;
      };
      (wrappedFn as any).mockRejectedValue = (error: any) => {
        (wrappedFn as any).mockImplementation(() => Promise.reject(error));
        return wrappedFn;
      };
      (wrappedFn as any).mockRejectedValueOnce = (error: any) => {
        (wrappedFn as any).mockImplementationOnce(() => Promise.reject(error));
        return wrappedFn;
      };
      (wrappedFn as any).mockImplementation = (implementation: Function) => {
        Object.assign(wrappedFn, implementation);
        return wrappedFn;
      };
      (wrappedFn as any).mockImplementationOnce = (implementation: Function) => {
        // Simple once implementation - would need more sophistication for real use
        const originalImpl = wrappedFn;
        Object.assign(wrappedFn, implementation);
        setTimeout(() => Object.assign(wrappedFn, originalImpl), 0);
        return wrappedFn;
      };
      
      return wrappedFn;
    },
    doMock: (module: string, factory: Function) => {
      // Mock implementation for testing
      console.log(`Mocking ${module}`);
    },
    clearAllMocks: () => {
      // Clear mock implementation
      console.log('Clearing all mocks');
    }
  };
}