/**
 * Comprehensive Tests for UnifiedStreamingService
 * Testing all consolidation features from Phase 2
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { unifiedStreamingService, UnifiedStreamingService } from '../../services/UnifiedStreamingService';
import type { ServiceNowStreams, ServiceNowChange } from '../../config/redis-streams';

// Mock Redis Streams
const mockRedisStreams = {
  subscribe: jest.fn((eventType: string, handler: any) => {
    console.log(`Mock Redis subscribe: ${eventType}`);
    return Promise.resolve();
  }),
  publishChange: jest.fn((change: any) => {
    console.log(`Mock Redis publish:`, change);
    return Promise.resolve('test-message-id');
  }),
  healthCheck: () => Promise.resolve({ status: 'healthy' })
} as any;

// Mock ServiceNow change event
const mockServiceNowChange: ServiceNowChange = {
  sys_id: 'test-sys-id-123',
  number: 'INC0012345',
  type: 'incident' as any,
  action: 'update' as any,
  state: '2',
  timestamp: new Date().toISOString()
};

describe('UnifiedStreamingService - Comprehensive Test Suite', () => {
  let testService: UnifiedStreamingService;

  beforeAll(() => {
    // Initialize service for testing
    testService = UnifiedStreamingService.getInstance();
  });

  beforeEach(() => {
    testService.initialize(mockRedisStreams);
  });

  afterEach(() => {
    testService.cleanup();
  });

  afterAll(() => {
    testService.cleanup();
  });

  describe('Service Initialization', () => {
    it('should initialize as singleton', () => {
      const instance1 = UnifiedStreamingService.getInstance();
      const instance2 = UnifiedStreamingService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should initialize with Redis Streams', () => {
      expect(() => testService.initialize(mockRedisStreams)).not.toThrow();
      expect(mockRedisStreams.subscribe).toHaveBeenCalledWith('ticket-updates', expect.any(Function));
    });

    it('should handle Redis initialization failure gracefully', () => {
      const failingRedis = {
        ...mockRedisStreams,
        subscribe: () => Promise.reject(new Error('Redis connection failed'))
      } as any;

      expect(() => testService.initialize(failingRedis)).not.toThrow();
    });
  });

  describe('SSE Connection Management (Legacy Compatibility)', () => {
    it('should create SSE connection for ticket updates', () => {
      const ticketSysId = 'test-ticket-456';
      const response = testService.createTicketSSEConnection(ticketSysId);
      
      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should handle multiple SSE connections', () => {
      const ticket1 = testService.createTicketSSEConnection('ticket-1');
      const ticket2 = testService.createTicketSSEConnection('ticket-2');
      
      expect(ticket1).toBeInstanceOf(Response);
      expect(ticket2).toBeInstanceOf(Response);
      
      const stats = testService.getConnectionStats();
      expect(stats.totalConnections).toBe(2);
    });

    it('should broadcast to specific ticket connections', () => {
      const ticketSysId = 'broadcast-test-ticket';
      testService.createTicketSSEConnection(ticketSysId);
      
      const message = {
        event: 'ticket-updated' as const,
        data: {
          sysId: ticketSysId,
          number: 'INC0098765',
          ticketType: 'incident' as const,
          action: 'update' as const,
          state: '3',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      expect(() => {
        testService.broadcastToTicket(ticketSysId, message);
      }).not.toThrow();
    });
  });

  describe('Modern Streaming API (Generator-based)', () => {
    it('should create generator-based streams', async () => {
      const clientId = 'test-client-gen-001';
      const streamGenerator = testService.createStream(clientId, 'ticket-updates', {
        ticketSysId: 'test-ticket-gen',
        maxHistory: 5
      });

      expect(streamGenerator).toBeDefined();
      expect(typeof streamGenerator.next).toBe('function');
      
      // Test first iteration (should be connection message)
      const firstResult = await streamGenerator.next();
      expect(firstResult.done).toBe(false);
      expect(firstResult.value).toBeDefined();
    });

    it('should handle dashboard stats streaming', async () => {
      const clientId = 'dashboard-client-001';
      const streamGenerator = testService.createStream(clientId, 'dashboard-stats', {
        intervalSeconds: 1
      });

      const firstResult = await streamGenerator.next();
      expect(firstResult.done).toBe(false);
    });

    it('should handle sync progress streaming', async () => {
      const clientId = 'sync-client-001';
      const streamGenerator = testService.createStream(clientId, 'sync-progress', {
        operation: 'test-sync'
      });

      const firstResult = await streamGenerator.next();
      expect(firstResult.done).toBe(false);
    });

    it('should handle SLA monitoring streaming', async () => {
      const clientId = 'sla-client-001';
      const streamGenerator = testService.createStream(clientId, 'sla-monitoring', {
        filters: { breachesOnly: true }
      });

      const firstResult = await streamGenerator.next();
      expect(firstResult.done).toBe(false);
    });

    it('should handle test progress streaming', async () => {
      const clientId = 'test-client-001';
      const streamGenerator = testService.createStream(clientId, 'test-progress', {
        testType: 'endpoint-test'
      });

      const firstResult = await streamGenerator.next();
      expect(firstResult.done).toBe(false);
    });
  });

  describe('Event Broadcasting System', () => {
    it('should broadcast events to all matching connections', () => {
      // Create multiple connections
      testService.createTicketSSEConnection('ticket-1');
      testService.createTicketSSEConnection('ticket-2');
      
      const event = {
        event: 'ticket-updated' as const,
        data: {
          sysId: 'broadcast-to-all',
          number: 'INC0055555',
          ticketType: 'incident' as const,
          action: 'update' as const,
          state: '2',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      expect(() => {
        testService.broadcastEvent(event, { streamTypes: ['ticket-updates'] });
      }).not.toThrow();
    });

    it('should filter broadcasts by stream type', () => {
      const stats = testService.getConnectionStats();
      const initialConnections = stats.totalConnections;

      const event = {
        event: 'dashboard-stats' as const,
        data: {
          totalTickets: 100,
          activeTickets: 50,
          recentUpdates: 10
        },
        timestamp: new Date().toISOString()
      };

      expect(() => {
        testService.broadcastEvent(event, { streamTypes: ['dashboard-stats'] });
      }).not.toThrow();
    });
  });

  describe('Connection Statistics and Management', () => {
    it('should provide comprehensive connection statistics', () => {
      testService.createTicketSSEConnection('stats-ticket-1');
      testService.createTicketSSEConnection('stats-ticket-2');
      
      const stats = testService.getConnectionStats();
      
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('connectionsByType');
      expect(stats).toHaveProperty('ticketConnections');
      expect(stats).toHaveProperty('connectionDetails');
      
      expect(stats.totalConnections).toBe(2);
      expect(stats.connectionsByType).toHaveProperty('ticket-updates');
      expect(stats.connectionDetails).toBeInstanceOf(Array);
      expect(stats.connectionDetails.length).toBe(2);
    });

    it('should track connections by ticket ID', () => {
      const ticketId = 'tracking-test-ticket';
      testService.createTicketSSEConnection(ticketId);
      
      const stats = testService.getConnectionStats();
      expect(stats.ticketConnections.has(ticketId)).toBe(true);
      expect(stats.ticketConnections.get(ticketId)).toBe(1);
    });

    it('should provide detailed connection information', () => {
      testService.createTicketSSEConnection('detailed-ticket');
      
      const stats = testService.getConnectionStats();
      const details = stats.connectionDetails[0];
      
      expect(details).toHaveProperty('id');
      expect(details).toHaveProperty('streamType');
      expect(details).toHaveProperty('connectedAt');
      expect(details).toHaveProperty('connectedDuration');
      expect(details).toHaveProperty('isAlive');
      expect(details.isAlive).toBe(true);
    });
  });

  describe('Redis Stream Integration', () => {
    it('should subscribe to Redis ticket updates', () => {
      testService.initialize(mockRedisStreams);
      expect(mockRedisStreams.subscribe).toHaveBeenCalledWith(
        'ticket-updates', 
        expect.any(Function)
      );
    });

    it('should handle Redis stream events', () => {
      testService.createTicketSSEConnection(mockServiceNowChange.sys_id);
      
      // Simulate receiving a Redis stream event
      const subscribeCall = mockRedisStreams.subscribe.mock.calls[0];
      const handler = subscribeCall[1];
      
      expect(() => {
        handler(mockServiceNowChange);
      }).not.toThrow();
    });

    it('should extract changed fields from ServiceNow events', () => {
      const updateEvent = {
        ...mockServiceNowChange,
        action: 'updated' as any
      };

      const resolveEvent = {
        ...mockServiceNowChange,
        action: 'resolved' as any
      };

      testService.createTicketSSEConnection(updateEvent.sys_id);
      
      const subscribeCall = mockRedisStreams.subscribe.mock.calls[0];
      const handler = subscribeCall[1];
      
      expect(() => {
        handler(updateEvent);
        handler(resolveEvent);
      }).not.toThrow();
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle connection cleanup gracefully', () => {
      testService.createTicketSSEConnection('cleanup-test');
      
      expect(() => {
        testService.cleanup();
      }).not.toThrow();
      
      const stats = testService.getConnectionStats();
      expect(stats.totalConnections).toBe(0);
    });

    it('should handle malformed stream messages', () => {
      testService.createTicketSSEConnection('error-test-ticket');
      
      const malformedEvent = {
        sys_id: null,
        number: undefined,
        action: 'invalid'
      } as any;

      const subscribeCall = mockRedisStreams.subscribe.mock.calls[0];
      const handler = subscribeCall[1];
      
      expect(() => {
        handler(malformedEvent);
      }).not.toThrow();
    });

    it('should handle broadcast to non-existent tickets', () => {
      const message = {
        event: 'ticket-updated' as const,
        data: {
          sysId: 'non-existent-ticket',
          number: 'INC9999999',
          ticketType: 'incident' as const,
          action: 'update' as const,
          state: '1',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      expect(() => {
        testService.broadcastToTicket('non-existent-ticket', message);
      }).not.toThrow();
    });

    it('should maintain service state after errors', () => {
      // Create connection
      testService.createTicketSSEConnection('resilience-test');
      
      // Trigger error scenario
      try {
        const malformedEvent = { invalid: 'data' } as any;
        const subscribeCall = mockRedisStreams.subscribe.mock.calls[0];
        const handler = subscribeCall[1];
        handler(malformedEvent);
      } catch (error) {
        // Expected to not throw, but if it does, service should still work
      }
      
      // Service should still be functional
      const stats = testService.getConnectionStats();
      expect(stats.totalConnections).toBe(1);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle high connection volumes', () => {
      const connectionCount = 100;
      
      for (let i = 0; i < connectionCount; i++) {
        testService.createTicketSSEConnection(`perf-test-${i}`);
      }
      
      const stats = testService.getConnectionStats();
      expect(stats.totalConnections).toBe(connectionCount);
    });

    it('should clean up stale connections', async () => {
      testService.createTicketSSEConnection('stale-test');
      
      // Simulate stale connection cleanup (normally handled by ping interval)
      const stats = testService.getConnectionStats();
      expect(stats.totalConnections).toBeGreaterThan(0);
      
      // Cleanup should work without errors
      testService.cleanup();
      const cleanStats = testService.getConnectionStats();
      expect(cleanStats.totalConnections).toBe(0);
    });
  });

  describe('Feature Consolidation Validation', () => {
    it('should maintain all SSEService legacy features', () => {
      // Legacy SSE connection creation
      const response = testService.createTicketSSEConnection('legacy-test');
      expect(response).toBeInstanceOf(Response);
      
      // Legacy stats format
      const stats = testService.getConnectionStats();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('ticketConnections');
      
      // Legacy broadcast functionality
      const message = {
        event: 'ticket-updated' as const,
        data: { sysId: 'legacy-test', timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString()
      };
      
      expect(() => {
        testService.broadcastToTicket('legacy-test', message);
      }).not.toThrow();
    });

    it('should maintain all StreamingService modern features', () => {
      // Modern generator-based streaming
      const stream = testService.createStream('modern-test', 'ticket-updates');
      expect(stream).toBeDefined();
      expect(typeof stream.next).toBe('function');
      
      // Connection statistics with type breakdown
      const stats = testService.getConnectionStats();
      expect(stats).toHaveProperty('connectionsByType');
      expect(stats).toHaveProperty('connectionDetails');
      
      // Event history and filtering
      expect(() => {
        testService.broadcastEvent({
          event: 'test-event' as any,
          data: { test: true },
          timestamp: new Date().toISOString()
        });
      }).not.toThrow();
    });

    it('should demonstrate improved unified functionality', () => {
      // Create both legacy and modern connections
      testService.createTicketSSEConnection('unified-legacy');
      const modernStream = testService.createStream('unified-modern', 'dashboard-stats');
      
      const stats = testService.getConnectionStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.connectionsByType).toHaveProperty('ticket-updates');
      expect(stats.connectionsByType).toHaveProperty('dashboard-stats');
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
      return wrappedFn;
    }
  };
}