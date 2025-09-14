/**
 * Simplified Tests for ConsolidatedDataService - Following Development Guidelines
 * Keep tests simple, focused, and maintainable
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ConsolidatedDataService, SmartDataStrategy } from '../services/ConsolidatedDataService';

// Simple mock objects following dev guidelines
const mockMongo = {
  findIncidentBySysId: mock(() => Promise.resolve(null)),
  saveIncident: mock(() => Promise.resolve()),
  deleteTicket: mock(() => Promise.resolve()),
  healthCheck: mock(() => Promise.resolve({ status: 'connected' })),
  getCollectionStats: mock(() => Promise.resolve(100))
} as any;

const mockServiceNow = {
  makeRequestFullFields: mock(() => Promise.resolve({ result: [] })),
  getHealthStatus: mock(() => Promise.resolve({ status: 'healthy' }))
} as any;

const mockRedis = {
  publishChange: mock(() => Promise.resolve('msg-id')),
  healthCheck: mock(() => Promise.resolve({ status: 'healthy' }))
} as any;

describe('ConsolidatedDataService - Simple Tests', () => {
  let service: ConsolidatedDataService;

  beforeEach(() => {
    // Reset mocks
    mockMongo.findIncidentBySysId = mock(() => Promise.resolve(null));
    mockServiceNow.makeRequestFullFields = mock(() => Promise.resolve({ result: [] }));
    
    service = new ConsolidatedDataService(mockMongo, mockServiceNow, mockRedis);
  });

  describe('Basic Operations', () => {
    it('should return null when no data exists', async () => {
      const result = await service.getTicketDetails('test-123', 'incident');
      expect(result).toBeNull();
    });

    it('should fetch data from ServiceNow when MongoDB is empty', async () => {
      const mockTicket = { sys_id: 'test-123', number: 'INC001', state: '2', priority: '3' };
      mockServiceNow.makeRequestFullFields = mock(() => Promise.resolve({
        result: [mockTicket]
      }));

      const result = await service.getTicketDetails('test-123', 'incident');
      
      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe('test-123');
    });

    it('should use MongoDB data when available', async () => {
      const mockDoc = {
        data: {
          incident: { sys_id: 'test-123', number: 'INC001', state: '2', priority: '3' },
          slms: []
        }
      };
      mockMongo.findIncidentBySysId = mock(() => Promise.resolve(mockDoc));

      const result = await service.getTicketDetails('test-123', 'incident');
      
      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe('test-123');
    });
  });

  describe('Health Check', () => {
    it('should report healthy when all services work', async () => {
      const health = await service.getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.details.mongodb).toBe(true);
      expect(health.details.servicenow).toBe(true);
      expect(health.details.redis).toBe(true);
    });
  });

  describe('Cache Operations', () => {
    it('should invalidate ticket cache', async () => {
      await service.invalidateTicket('test-123', 'incident');
      
      expect(mockMongo.deleteTicket).toHaveBeenCalledWith('incident', 'test-123');
    });

    it('should get cache stats', async () => {
      const stats = await service.getCacheStats();
      
      expect(stats.mongoDocuments).toBeGreaterThan(0);
      expect(stats.cacheHitRatio).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('SmartDataStrategy - Simple Tests', () => {
  let strategy: SmartDataStrategy;

  beforeEach(() => {
    strategy = new SmartDataStrategy();
  });

  it('should return correct TTL for critical tickets', () => {
    const ticket = {
      sys_id: 'test-123',
      number: 'INC001',
      table: 'incident',
      state: '2',
      priority: '1', // Critical
      sys_created_on: '2025-01-01T10:00:00',
      sys_updated_on: '2025-01-01T10:00:00'
    };

    expect(strategy.getTTL(ticket)).toBe(60000); // 1 minute
  });

  it('should return correct TTL for closed tickets', () => {
    const ticket = {
      sys_id: 'test-123',
      number: 'INC001',
      table: 'incident',
      state: '6', // Closed
      priority: '3',
      sys_created_on: '2025-01-01T10:00:00',
      sys_updated_on: '2025-01-01T10:00:00'
    };

    expect(strategy.getTTL(ticket)).toBe(3600000); // 1 hour
  });

  it('should determine refresh priority correctly', () => {
    const criticalTicket = {
      sys_id: 'test-123',
      number: 'INC001',
      table: 'incident',
      state: '2',
      priority: '1',
      sys_created_on: '2025-01-01T10:00:00',
      sys_updated_on: '2025-01-01T10:00:00'
    };

    expect(strategy.getRefreshPriority(criticalTicket)).toBe('high');
  });
});