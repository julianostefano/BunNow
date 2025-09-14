/**
 * Comprehensive Unit Tests for ConsolidatedDataService
 * Tests transparent data sourcing, caching strategies, and fallback scenarios
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { ConsolidatedDataService, SmartDataStrategy, TicketData, HybridDataOptions } from '../services/ConsolidatedDataService';
import { ServiceNowAuthClient } from '../services/ServiceNowAuthClient';
import { ConsolidatedDataService } from '../services/ConsolidatedDataService';
import { ServiceNowStreams } from '../config/redis-streams';

// Mock implementations
const mockMongoService = {
  findIncidentBySysId: mock(),
  findChangeTaskBySysId: mock(),
  findSCTaskBySysId: mock(),
  saveIncident: mock(),
  saveChangeTask: mock(),
  saveSCTask: mock(),
  deleteTicket: mock(),
  getCollectionStats: mock(),
  healthCheck: mock()
} as unknown as ConsolidatedDataService;

const mockServiceNowService = {
  makeRequestFullFields: mock(),
  getSLADataForTask: mock(),
  getHealthStatus: mock()
} as unknown as ServiceNowAuthClient;

const mockRedisStreams = {
  publishChange: mock(),
  healthCheck: mock()
} as unknown as ServiceNowStreams;

describe('SmartDataStrategy', () => {
  let strategy: SmartDataStrategy;

  beforeEach(() => {
    strategy = new SmartDataStrategy();
  });

  describe('getTTL', () => {
    it('should return 1 hour for closed tickets (state 6,7)', () => {
      const ticket: TicketData = {
        sys_id: 'test-123',
        number: 'INC0001',
        table: 'incident',
        state: '6',
        priority: '3',
        sys_created_on: '2025-01-01T10:00:00',
        sys_updated_on: '2025-01-01T10:00:00'
      };

      expect(strategy.getTTL(ticket)).toBe(3600000); // 1 hour
    });

    it('should return 1 minute for critical tickets (priority 1)', () => {
      const ticket: TicketData = {
        sys_id: 'test-123',
        number: 'INC0001',
        table: 'incident',
        state: '2',
        priority: '1',
        sys_created_on: '2025-01-01T10:00:00',
        sys_updated_on: '2025-01-01T10:00:00'
      };

      expect(strategy.getTTL(ticket)).toBe(60000); // 1 minute
    });

    it('should return 2 minutes for high priority tickets (priority 2)', () => {
      const ticket: TicketData = {
        sys_id: 'test-123',
        number: 'INC0001',
        table: 'incident',
        state: '2',
        priority: '2',
        sys_created_on: '2025-01-01T10:00:00',
        sys_updated_on: '2025-01-01T10:00:00'
      };

      expect(strategy.getTTL(ticket)).toBe(120000); // 2 minutes
    });

    it('should return 5 minutes for standard tickets', () => {
      const ticket: TicketData = {
        sys_id: 'test-123',
        number: 'INC0001',
        table: 'incident',
        state: '2',
        priority: '3',
        sys_created_on: '2025-01-01T10:00:00',
        sys_updated_on: '2025-01-01T10:00:00'
      };

      expect(strategy.getTTL(ticket)).toBe(300000); // 5 minutes
    });
  });

  describe('shouldRefresh', () => {
    it('should return true for stale data beyond TTL', () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
      
      const ticket: TicketData = {
        sys_id: 'test-123',
        number: 'INC0001',
        table: 'incident',
        state: '2',
        priority: '3', // 5-minute TTL
        sys_created_on: oldTime,
        sys_updated_on: oldTime
      };

      expect(strategy.shouldRefresh(ticket)).toBe(true);
    });

    it('should return false for fresh data within TTL', () => {
      const recentTime = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 minutes ago
      
      const ticket: TicketData = {
        sys_id: 'test-123',
        number: 'INC0001',
        table: 'incident',
        state: '2',
        priority: '3', // 5-minute TTL
        sys_created_on: recentTime,
        sys_updated_on: recentTime
      };

      expect(strategy.shouldRefresh(ticket)).toBe(false);
    });
  });

  describe('getRefreshPriority', () => {
    it('should return high priority for critical tickets', () => {
      const ticket: TicketData = {
        sys_id: 'test-123',
        number: 'INC0001',
        table: 'incident',
        state: '2',
        priority: '1',
        sys_created_on: '2025-01-01T10:00:00',
        sys_updated_on: '2025-01-01T10:00:00'
      };

      expect(strategy.getRefreshPriority(ticket)).toBe('high');
    });

    it('should return low priority for closed tickets', () => {
      const ticket: TicketData = {
        sys_id: 'test-123',
        number: 'INC0001',
        table: 'incident',
        state: '6',
        priority: '3',
        sys_created_on: '2025-01-01T10:00:00',
        sys_updated_on: '2025-01-01T10:00:00'
      };

      expect(strategy.getRefreshPriority(ticket)).toBe('low');
    });
  });
});

describe('ConsolidatedDataService', () => {
  let hybridService: ConsolidatedDataService;
  let mockStrategy: SmartDataStrategy;

  beforeEach(() => {
    // Reset all mocks
    mockMongoService.findIncidentBySysId = mock(() => null);
    mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve(null));
    mockRedisStreams.publishChange = mock(() => Promise.resolve('test-message-id'));
    
    mockStrategy = new SmartDataStrategy();
    spyOn(mockStrategy, 'shouldRefresh').mockReturnValue(false);
    
    hybridService = new ConsolidatedDataService(
      mockMongoService,
      mockServiceNowService,
      mockRedisStreams,
      mockStrategy
    );
  });

  afterEach(() => {
    // Clean up mocks
    mock.restore();
  });

  describe('getTicketDetails', () => {
    const mockTicketData = {
      sys_id: 'test-123',
      number: 'INC0001',
      state: '2',
      priority: '3',
      short_description: 'Test incident',
      sys_created_on: '2025-01-01T10:00:00',
      sys_updated_on: '2025-01-01T10:00:00'
    };

    const mockMongoDocument = {
      data: {
        incident: mockTicketData,
        slms: [],
        sync_timestamp: '2025-01-01T10:00:00',
        collection_version: '2.0.0'
      }
    };

    it('should return fresh data from MongoDB cache when available and fresh', async () => {
      // Setup: MongoDB has fresh data
      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(mockMongoDocument));
      spyOn(mockStrategy, 'shouldRefresh').mockReturnValue(false);

      const result = await hybridService.getTicketDetails('test-123', 'incident');

      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe('test-123');
      expect(result?.table).toBe('incident');
      expect(mockMongoService.findIncidentBySysId).toHaveBeenCalledWith('test-123');
      expect(mockServiceNowService.makeRequestFullFields).not.toHaveBeenCalled();
    });

    it('should fetch from ServiceNow when MongoDB data is stale', async () => {
      // Setup: MongoDB has stale data, ServiceNow has fresh data
      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(mockMongoDocument));
      spyOn(mockStrategy, 'shouldRefresh').mockReturnValue(true);
      
      mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve({
        result: [mockTicketData]
      }));
      mockMongoService.saveIncident = mock(() => Promise.resolve());

      const result = await hybridService.getTicketDetails('test-123', 'incident');

      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe('test-123');
      expect(mockServiceNowService.makeRequestFullFields).toHaveBeenCalledWith('incident', 'sys_id=test-123', 1);
      expect(mockMongoService.saveIncident).toHaveBeenCalled();
      expect(mockRedisStreams.publishChange).toHaveBeenCalled();
    });

    it('should fetch from ServiceNow when data not in MongoDB', async () => {
      // Setup: No MongoDB data, ServiceNow has data
      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve({
        result: [mockTicketData]
      }));
      mockMongoService.saveIncident = mock(() => Promise.resolve());

      const result = await hybridService.getTicketDetails('test-123', 'incident');

      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe('test-123');
      expect(mockServiceNowService.makeRequestFullFields).toHaveBeenCalledWith('incident', 'sys_id=test-123', 1);
      expect(mockMongoService.saveIncident).toHaveBeenCalled();
    });

    it('should use stale MongoDB data as fallback when ServiceNow fails', async () => {
      // Setup: MongoDB has stale data, ServiceNow fails
      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(mockMongoDocument));
      spyOn(mockStrategy, 'shouldRefresh').mockReturnValue(true);
      
      mockServiceNowService.makeRequestFullFields = mock(() => Promise.reject(new Error('ServiceNow unavailable')));

      const result = await hybridService.getTicketDetails('test-123', 'incident');

      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe('test-123');
      expect(mockServiceNowService.makeRequestFullFields).toHaveBeenCalled();
      expect(mockMongoService.saveIncident).not.toHaveBeenCalled();
    });

    it('should return null when neither MongoDB nor ServiceNow have data', async () => {
      // Setup: No data anywhere
      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve({ result: [] }));

      const result = await hybridService.getTicketDetails('test-123', 'incident');

      expect(result).toBeNull();
    });

    it('should force ServiceNow fetch when forceServiceNow option is set', async () => {
      // Setup
      mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve({
        result: [mockTicketData]
      }));
      mockMongoService.saveIncident = mock(() => Promise.resolve());

      const options: HybridDataOptions = { forceServiceNow: true };
      const result = await hybridService.getTicketDetails('test-123', 'incident', options);

      expect(result).not.toBeNull();
      expect(mockServiceNowService.makeRequestFullFields).toHaveBeenCalledWith('incident', 'sys_id=test-123', 1);
      expect(mockMongoService.findIncidentBySysId).not.toHaveBeenCalled();
    });

    it('should force MongoDB fetch when forceMongo option is set', async () => {
      // Setup
      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(mockMongoDocument));

      const options: HybridDataOptions = { forceMongo: true };
      const result = await hybridService.getTicketDetails('test-123', 'incident', options);

      expect(result).not.toBeNull();
      expect(mockMongoService.findIncidentBySysId).toHaveBeenCalledWith('test-123');
      expect(mockServiceNowService.makeRequestFullFields).not.toHaveBeenCalled();
    });

    it('should include SLMs when includeSLMs option is set', async () => {
      // Setup
      const mockSLAData = {
        task_slas: [
          {
            sys_id: 'sla-123',
            sla: { display_value: 'Resolution Time' },
            has_breached: { display_value: 'false' }
          }
        ]
      };

      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve({
        result: [mockTicketData]
      }));
      mockServiceNowService.getSLADataForTask = mock(() => Promise.resolve(mockSLAData));
      mockMongoService.saveIncident = mock(() => Promise.resolve());

      const options: HybridDataOptions = { includeSLMs: true };
      const result = await hybridService.getTicketDetails('test-123', 'incident', options);

      expect(result).not.toBeNull();
      expect(result?.slms).toEqual(mockSLAData.task_slas);
      expect(mockServiceNowService.getSLADataForTask).toHaveBeenCalledWith('test-123');
    });
  });

  describe('getMultipleTickets', () => {
    it('should process multiple ticket requests in batches', async () => {
      const requests = [
        { sysId: 'test-1', table: 'incident' },
        { sysId: 'test-2', table: 'incident' },
        { sysId: 'test-3', table: 'change_task' }
      ];

      // Setup mocks for each request
      mockMongoService.findIncidentBySysId = mock((sysId) => {
        if (sysId === 'test-1' || sysId === 'test-2') {
          return Promise.resolve({
            data: {
              incident: { sys_id: sysId, number: `INC${sysId}`, state: '2', priority: '3' }
            }
          });
        }
        return Promise.resolve(null);
      });

      mockMongoService.findChangeTaskBySysId = mock(() => Promise.resolve({
        data: {
          change_task: { sys_id: 'test-3', number: 'CTASK0001', state: '2', priority: '3' }
        }
      }));

      const results = await hybridService.getMultipleTickets(requests);

      expect(results.size).toBe(3);
      expect(results.get('incident:test-1')).not.toBeNull();
      expect(results.get('incident:test-2')).not.toBeNull();
      expect(results.get('change_task:test-3')).not.toBeNull();
    });
  });

  describe('isFresh', () => {
    it('should return false for null ticket', () => {
      expect(hybridService.isFresh(null)).toBe(false);
    });

    it('should delegate to data strategy', () => {
      const ticket: TicketData = {
        sys_id: 'test-123',
        number: 'INC0001',
        table: 'incident',
        state: '2',
        priority: '3',
        sys_created_on: '2025-01-01T10:00:00',
        sys_updated_on: '2025-01-01T10:00:00'
      };

      spyOn(mockStrategy, 'shouldRefresh').mockReturnValue(false);
      expect(hybridService.isFresh(ticket)).toBe(true);

      spyOn(mockStrategy, 'shouldRefresh').mockReturnValue(true);
      expect(hybridService.isFresh(ticket)).toBe(false);
    });
  });

  describe('invalidateTicket', () => {
    it('should delete ticket from MongoDB', async () => {
      mockMongoService.deleteTicket = mock(() => Promise.resolve());

      await hybridService.invalidateTicket('test-123', 'incident');

      expect(mockMongoService.deleteTicket).toHaveBeenCalledWith('incident', 'test-123');
    });

    it('should handle deletion errors gracefully', async () => {
      mockMongoService.deleteTicket = mock(() => Promise.reject(new Error('Delete failed')));

      // Should not throw
      await expect(hybridService.invalidateTicket('test-123', 'incident')).resolves.toBeUndefined();
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy when all services are healthy', async () => {
      mockMongoService.healthCheck = mock(() => Promise.resolve({ status: 'connected' }));
      mockServiceNowService.getHealthStatus = mock(() => Promise.resolve({ status: 'healthy' }));
      mockRedisStreams.healthCheck = mock(() => Promise.resolve({ status: 'healthy' }));

      const health = await hybridService.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.details.mongodb).toBe(true);
      expect(health.details.servicenow).toBe(true);
      expect(health.details.redis).toBe(true);
    });

    it('should return degraded when some services are unhealthy', async () => {
      mockMongoService.healthCheck = mock(() => Promise.resolve({ status: 'connected' }));
      mockServiceNowService.getHealthStatus = mock(() => Promise.resolve({ status: 'healthy' }));
      mockRedisStreams.healthCheck = mock(() => Promise.reject(new Error('Redis unavailable')));

      const health = await hybridService.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.details.mongodb).toBe(true);
      expect(health.details.servicenow).toBe(true);
      expect(health.details.redis).toBe(false);
    });

    it('should return unhealthy when most services are down', async () => {
      mockMongoService.healthCheck = mock(() => Promise.reject(new Error('MongoDB unavailable')));
      mockServiceNowService.getHealthStatus = mock(() => Promise.reject(new Error('ServiceNow unavailable')));
      mockRedisStreams.healthCheck = mock(() => Promise.resolve({ status: 'healthy' }));

      const health = await hybridService.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(health.details.mongodb).toBe(false);
      expect(health.details.servicenow).toBe(false);
      expect(health.details.redis).toBe(true);
    });
  });

  describe('getCacheStats', () => {
    it('should return aggregated cache statistics', async () => {
      mockMongoService.getCollectionStats = mock((collection) => {
        const stats = {
          'incident': 100,
          'change_task': 50,
          'sc_task': 25
        };
        return Promise.resolve(stats[collection] || 0);
      });

      const stats = await hybridService.getCacheStats();

      expect(stats.mongoDocuments).toBe(175);
      expect(stats.cacheHitRatio).toBeGreaterThan(0);
      expect(stats.lastSyncTimes).toBeDefined();
    });

    it('should handle statistics errors gracefully', async () => {
      mockMongoService.getCollectionStats = mock(() => Promise.reject(new Error('Stats unavailable')));

      const stats = await hybridService.getCacheStats();

      expect(stats.mongoDocuments).toBe(0);
      expect(stats.cacheHitRatio).toBe(0);
    });
  });

  describe('Table-specific operations', () => {
    it('should handle change_task table correctly', async () => {
      const mockChangeTaskData = {
        sys_id: 'ctask-123',
        number: 'CTASK0001',
        state: '3',
        priority: '2'
      };

      mockMongoService.findChangeTaskBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve({
        result: [mockChangeTaskData]
      }));
      mockMongoService.saveChangeTask = mock(() => Promise.resolve());

      const result = await hybridService.getTicketDetails('ctask-123', 'change_task');

      expect(result).not.toBeNull();
      expect(result?.table).toBe('change_task');
      expect(mockMongoService.findChangeTaskBySysId).toHaveBeenCalledWith('ctask-123');
      expect(mockMongoService.saveChangeTask).toHaveBeenCalled();
    });

    it('should handle sc_task table correctly', async () => {
      const mockSCTaskData = {
        sys_id: 'sctask-123',
        number: 'SCTASK0001',
        state: '3',
        priority: '3'
      };

      mockMongoService.findSCTaskBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve({
        result: [mockSCTaskData]
      }));
      mockMongoService.saveSCTask = mock(() => Promise.resolve());

      const result = await hybridService.getTicketDetails('sctask-123', 'sc_task');

      expect(result).not.toBeNull();
      expect(result?.table).toBe('sc_task');
      expect(mockMongoService.findSCTaskBySysId).toHaveBeenCalledWith('sctask-123');
      expect(mockMongoService.saveSCTask).toHaveBeenCalled();
    });

    it('should handle unknown table gracefully', async () => {
      const result = await hybridService.getTicketDetails('test-123', 'unknown_table');

      expect(result).toBeNull();
    });
  });
});

describe('Integration scenarios', () => {
  let hybridService: ConsolidatedDataService;

  beforeEach(() => {
    // Reset mocks
    mockMongoService.findIncidentBySysId = mock(() => null);
    mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve(null));
    mockRedisStreams.publishChange = mock(() => Promise.resolve('test-message-id'));
    
    hybridService = new ConsolidatedDataService(
      mockMongoService,
      mockServiceNowService,
      mockRedisStreams
    );
  });

  it('should provide complete transparency to user', async () => {
    // User should never know if data comes from MongoDB or ServiceNow
    const mockTicket = {
      sys_id: 'test-123',
      number: 'INC0001',
      state: '2',
      priority: '1'
    };

    // Scenario 1: Data from MongoDB (user doesn't know)
    mockMongoService.findIncidentBySysId = mock(() => Promise.resolve({
      data: { incident: mockTicket, slms: [] }
    }));

    let result = await hybridService.getTicketDetails('test-123', 'incident');
    expect(result?.sys_id).toBe('test-123');

    // Scenario 2: Data from ServiceNow (user doesn't know)
    mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(null));
    mockServiceNowService.makeRequestFullFields = mock(() => Promise.resolve({
      result: [mockTicket]
    }));
    mockMongoService.saveIncident = mock(() => Promise.resolve());

    result = await hybridService.getTicketDetails('test-123', 'incident');
    expect(result?.sys_id).toBe('test-123');
    
    // The user experience should be identical regardless of data source
  });

  it('should handle network failures gracefully with fallback', async () => {
    const staleTicket = {
      sys_id: 'test-123',
      number: 'INC0001',
      state: '2',
      priority: '1',
      sys_updated_on: new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour old
    };

    // Setup: MongoDB has stale data, ServiceNow is unavailable
    mockMongoService.findIncidentBySysId = mock(() => Promise.resolve({
      data: { incident: staleTicket, slms: [] }
    }));
    mockServiceNowService.makeRequestFullFields = mock(() => 
      Promise.reject(new Error('Network timeout'))
    );

    const result = await hybridService.getTicketDetails('test-123', 'incident');

    // Should gracefully fall back to stale data
    expect(result).not.toBeNull();
    expect(result?.sys_id).toBe('test-123');
  });
});