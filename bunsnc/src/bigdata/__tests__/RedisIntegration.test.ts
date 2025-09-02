/**
 * Comprehensive Tests for Redis/KeyDB Integration with Elysia.js
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { RedisStreamManager } from '../redis/RedisStreamManager';
import { RedisCache } from '../redis/RedisCache';
import { RedisPubSub } from '../redis/RedisPubSub';
import { ServiceNowRedisIntegration } from '../redis/index';

// Mock Redis client for testing
class MockRedisClient {
  private data = new Map<string, any>();
  private streams = new Map<string, any[]>();
  private subscriptions = new Map<string, Function[]>();

  async get(key: string) {
    return this.data.get(key) || null;
  }

  async set(key: string, value: any, options?: any) {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string) {
    return this.data.delete(key) ? 1 : 0;
  }

  async exists(key: string) {
    return this.data.has(key) ? 1 : 0;
  }

  async ttl(key: string) {
    return -1; // No expiration for mock
  }

  async xadd(streamKey: string, id: string, ...fields: any[]) {
    if (!this.streams.has(streamKey)) {
      this.streams.set(streamKey, []);
    }
    const entry = { id: id === '*' ? Date.now().toString() : id, fields };
    this.streams.get(streamKey)!.push(entry);
    return entry.id;
  }

  async xread(options: any, ...streams: any[]) {
    const results = [];
    for (let i = 0; i < streams.length; i += 2) {
      const streamKey = streams[i];
      const streamEntries = this.streams.get(streamKey) || [];
      if (streamEntries.length > 0) {
        results.push([streamKey, streamEntries.slice(-1)]);
      }
    }
    return results.length > 0 ? results : null;
  }

  async xgroup(command: string, ...args: any[]) {
    return 'OK';
  }

  async xreadgroup(...args: any[]) {
    // Simplified mock implementation
    return [];
  }

  async publish(channel: string, message: string) {
    const callbacks = this.subscriptions.get(channel) || [];
    callbacks.forEach(callback => callback(message, channel));
    return callbacks.length;
  }

  async subscribe(channel: string, callback: Function) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, []);
    }
    this.subscriptions.get(channel)!.push(callback);
  }

  async unsubscribe(channel: string) {
    this.subscriptions.delete(channel);
  }

  async quit() {
    this.data.clear();
    this.streams.clear();
    this.subscriptions.clear();
  }
}

// Test data
const sampleServiceNowData = {
  incident: {
    sys_id: 'inc_test_001',
    number: 'INC0000001',
    short_description: 'Test incident for Redis integration',
    priority: '3',
    state: '1',
    caller_id: 'test_user',
    assignment_group: 'IT Support',
    sys_created_on: new Date().toISOString(),
    sys_updated_on: new Date().toISOString()
  },
  problem: {
    sys_id: 'prb_test_001',
    number: 'PRB0000001',
    short_description: 'Test problem for Redis integration',
    priority: '2',
    state: '2',
    root_cause: 'Network configuration issue'
  }
};

describe('RedisStreamManager with Elysia Integration', () => {
  let streamManager: RedisStreamManager;
  let mockClient: MockRedisClient;
  let app: Elysia;

  beforeEach(() => {
    mockClient = new MockRedisClient();
    streamManager = new RedisStreamManager({
      host: 'localhost',
      port: 6379,
      maxRetries: 3,
      retryDelayMs: 1000,
      enableHealthChecks: true,
      streamConfig: {
        maxLength: 10000,
        compressionEnabled: true,
        persistToStorage: true,
        batchSize: 100
      }
    });

    // Override the client with our mock
    (streamManager as any).client = mockClient;

    // Create Elysia app for API testing
    app = new Elysia()
      .post('/stream/incident', async ({ body }) => {
        const messageId = await streamManager.addMessage(
          'servicenow:incidents',
          body as any,
          '*'
        );
        return { success: true, messageId };
      })
      .get('/stream/incident/consume', async () => {
        const consumer = await streamManager.startConsumer({
          streamKey: 'servicenow:incidents',
          consumerGroup: 'test_processors',
          consumerId: 'test_consumer',
          batchSize: 10,
          blockTimeMs: 1000
        });
        
        return { success: true, consumerId: 'test_consumer' };
      });
  });

  afterEach(async () => {
    await streamManager.disconnect();
    await mockClient.quit();
  });

  it('should add ServiceNow incident to Redis stream via Elysia endpoint', async () => {
    const response = await app.handle(new Request('http://localhost/stream/incident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleServiceNowData.incident)
    }));

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  });

  it('should handle high-throughput streaming with backpressure', async () => {
    const batchSize = 1000;
    const messages = Array.from({ length: batchSize }, (_, i) => ({
      ...sampleServiceNowData.incident,
      sys_id: `inc_batch_${i}`,
      number: `INC${String(i).padStart(7, '0')}`,
      short_description: `Batch test incident ${i}`
    }));

    const startTime = Date.now();
    const promises = messages.map(async (message, index) => {
      return streamManager.addMessage(
        'servicenow:incidents:batch',
        message,
        `${Date.now()}-${index}`
      );
    });

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    expect(results.length).toBe(batchSize);
    expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    
    // All messages should have unique IDs
    const uniqueIds = new Set(results);
    expect(uniqueIds.size).toBe(batchSize);
  });

  it('should support consumer groups with load balancing', async () => {
    // Add test messages
    const messageIds = await Promise.all([
      streamManager.addMessage('servicenow:load_balance', { type: 'incident', id: 1 }),
      streamManager.addMessage('servicenow:load_balance', { type: 'incident', id: 2 }),
      streamManager.addMessage('servicenow:load_balance', { type: 'incident', id: 3 })
    ]);

    expect(messageIds.length).toBe(3);

    // Create multiple consumers
    const consumer1 = await streamManager.startConsumer({
      streamKey: 'servicenow:load_balance',
      consumerGroup: 'load_balance_group',
      consumerId: 'consumer_1',
      batchSize: 2,
      blockTimeMs: 100
    });

    const consumer2 = await streamManager.startConsumer({
      streamKey: 'servicenow:load_balance',
      consumerGroup: 'load_balance_group',
      consumerId: 'consumer_2',
      batchSize: 2,
      blockTimeMs: 100
    });

    expect(consumer1).toBeDefined();
    expect(consumer2).toBeDefined();
  });

  it('should handle stream monitoring and health checks', async () => {
    const streamKey = 'servicenow:monitoring_test';
    
    // Add some test data
    await Promise.all([
      streamManager.addMessage(streamKey, { test: 1 }),
      streamManager.addMessage(streamKey, { test: 2 }),
      streamManager.addMessage(streamKey, { test: 3 })
    ]);

    const info = await streamManager.getStreamInfo(streamKey);
    expect(info.length).toBeGreaterThan(0);
    expect(info.firstEntry).toBeDefined();
    expect(info.lastEntry).toBeDefined();

    const stats = streamManager.getStreamStats();
    expect(stats.totalStreams).toBeGreaterThan(0);
    expect(stats.totalMessages).toBeGreaterThan(0);
  });

  it('should support dead letter queue for failed processing', async () => {
    const consumer = await streamManager.startConsumer({
      streamKey: 'servicenow:dlq_test',
      consumerGroup: 'dlq_group',
      consumerId: 'dlq_consumer',
      batchSize: 5,
      blockTimeMs: 100,
      enableDeadLetterQueue: true,
      maxRetries: 2
    });

    // Simulate processing failure
    consumer.on('message', (message) => {
      throw new Error('Simulated processing error');
    });

    await streamManager.addMessage('servicenow:dlq_test', { 
      test: 'dlq_message',
      shouldFail: true 
    });

    // Allow time for processing and retries
    await new Promise(resolve => setTimeout(resolve, 1000));

    const dlqStats = await streamManager.getDeadLetterQueueStats('dlq_group');
    expect(dlqStats).toBeDefined();
  });
});

describe('RedisCache with Elysia Performance', () => {
  let cache: RedisCache;
  let mockClient: MockRedisClient;
  let app: Elysia;

  beforeEach(() => {
    mockClient = new MockRedisClient();
    cache = new RedisCache({
      host: 'localhost',
      port: 6379,
      defaultTTL: 3600,
      maxMemoryPolicy: 'allkeys-lru',
      enableCompression: true,
      compressionThreshold: 1024,
      enableMetrics: true,
      serializationFormat: 'json'
    });

    // Override client with mock
    (cache as any).client = mockClient;

    // Create Elysia app with caching middleware
    app = new Elysia()
      .derive(async () => ({
        cache: cache
      }))
      .get('/cached/incident/:id', async ({ params, cache }) => {
        const cacheKey = `incident:${params.id}`;
        
        // Try to get from cache first
        const cached = await cache.get(cacheKey);
        if (cached) {
          return { data: cached, fromCache: true };
        }

        // Simulate database lookup
        const incident = {
          ...sampleServiceNowData.incident,
          sys_id: params.id,
          retrieved_at: new Date().toISOString()
        };

        // Cache the result
        await cache.set(cacheKey, incident, 300); // 5 minutes TTL
        
        return { data: incident, fromCache: false };
      })
      .post('/cache/invalidate/:pattern', async ({ params, cache }) => {
        const count = await cache.deleteByPattern(params.pattern);
        return { invalidated: count };
      })
      .get('/cache/stats', async ({ cache }) => {
        const stats = cache.getStats();
        return stats;
      });
  });

  afterEach(async () => {
    await cache.disconnect();
    await mockClient.quit();
  });

  it('should cache ServiceNow incident data efficiently', async () => {
    const incidentId = 'test_incident_001';
    
    // First request - should fetch from "database"
    const response1 = await app.handle(new Request(`http://localhost/cached/incident/${incidentId}`));
    const result1 = await response1.json();
    
    expect(result1.fromCache).toBe(false);
    expect(result1.data.sys_id).toBe(incidentId);

    // Second request - should come from cache
    const response2 = await app.handle(new Request(`http://localhost/cached/incident/${incidentId}`));
    const result2 = await response2.json();
    
    expect(result2.fromCache).toBe(true);
    expect(result2.data.sys_id).toBe(incidentId);
  });

  it('should handle cache warming for frequently accessed data', async () => {
    const warmupData = Array.from({ length: 100 }, (_, i) => ({
      key: `incident:warm_${i}`,
      data: {
        ...sampleServiceNowData.incident,
        sys_id: `warm_${i}`,
        priority: String((i % 4) + 1)
      }
    }));

    const startTime = Date.now();
    await cache.warmup(warmupData.map(item => ({
      key: item.key,
      data: item.data,
      ttl: 3600
    })));
    const warmupTime = Date.now() - startTime;

    expect(warmupTime).toBeLessThan(5000); // Should complete within 5 seconds

    // Verify data is cached
    const retrievalStartTime = Date.now();
    const retrievalPromises = warmupData.map(item => cache.get(item.key));
    const retrievedData = await Promise.all(retrievalPromises);
    const retrievalTime = Date.now() - retrievalStartTime;

    expect(retrievedData.length).toBe(100);
    expect(retrievalTime).toBeLessThan(1000); // Should retrieve within 1 second
    expect(retrievedData.every(data => data !== null)).toBe(true);
  });

  it('should support pattern-based cache invalidation', async () => {
    // Cache some test data
    await Promise.all([
      cache.set('incident:001', { type: 'incident', id: '001' }),
      cache.set('incident:002', { type: 'incident', id: '002' }),
      cache.set('problem:001', { type: 'problem', id: '001' }),
      cache.set('change:001', { type: 'change', id: '001' })
    ]);

    // Invalidate only incident cache entries
    const response = await app.handle(new Request('http://localhost/cache/invalidate/incident:*', {
      method: 'POST'
    }));
    
    const result = await response.json();
    expect(result.invalidated).toBeGreaterThanOrEqual(2);

    // Verify incident entries are gone but others remain
    const incidentCheck = await cache.get('incident:001');
    const problemCheck = await cache.get('problem:001');
    
    expect(incidentCheck).toBeNull();
    expect(problemCheck).toBeDefined();
  });

  it('should provide comprehensive caching statistics', async () => {
    // Perform some cache operations
    await cache.set('test:stats:1', 'data1');
    await cache.set('test:stats:2', 'data2');
    await cache.get('test:stats:1'); // Hit
    await cache.get('test:stats:3'); // Miss

    const response = await app.handle(new Request('http://localhost/cache/stats'));
    const stats = await response.json();

    expect(stats.totalOperations).toBeGreaterThan(0);
    expect(stats.hitRate).toBeDefined();
    expect(stats.missRate).toBeDefined();
    expect(stats.evictionCount).toBeDefined();
  });

  it('should handle cache compression for large ServiceNow objects', async () => {
    const largeIncident = {
      ...sampleServiceNowData.incident,
      work_notes: 'A'.repeat(2000), // Large string to trigger compression
      description: 'B'.repeat(2000),
      comments: Array.from({ length: 100 }, (_, i) => ({
        comment: `Comment ${i} with substantial content`,
        timestamp: new Date().toISOString(),
        author: `user_${i}`
      }))
    };

    const cacheKey = 'large_incident:001';
    
    await cache.set(cacheKey, largeIncident, 3600);
    const retrieved = await cache.get(cacheKey);

    expect(retrieved).toEqual(largeIncident);
    
    const stats = cache.getStats();
    expect(stats.compressionRatio).toBeDefined();
    if (stats.compressionRatio > 0) {
      expect(stats.compressionRatio).toBeLessThan(1); // Should achieve some compression
    }
  });
});

describe('RedisPubSub with Elysia WebSocket Integration', () => {
  let pubsub: RedisPubSub;
  let mockClient: MockRedisClient;
  let app: Elysia;

  beforeEach(() => {
    mockClient = new MockRedisClient();
    pubsub = new RedisPubSub({
      host: 'localhost',
      port: 6379,
      enablePatternSubscriptions: true,
      enableMessageHistory: true,
      maxHistorySize: 1000,
      enableMessageCompression: true,
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        maxBackoffMs: 5000
      }
    });

    // Override client with mock
    (pubsub as any).client = mockClient;

    // Create Elysia app with WebSocket support for real-time notifications
    app = new Elysia()
      .ws('/realtime/servicenow', {
        message: async (ws, message) => {
          const data = JSON.parse(message.toString());
          
          if (data.action === 'subscribe') {
            await pubsub.subscribe(data.channel, (message, channel) => {
              ws.send(JSON.stringify({
                type: 'notification',
                channel,
                data: JSON.parse(message)
              }));
            });
            
            ws.send(JSON.stringify({
              type: 'subscribed',
              channel: data.channel
            }));
          }
        }
      })
      .post('/publish/incident', async ({ body }) => {
        const published = await pubsub.publish(
          'servicenow:incidents',
          JSON.stringify(body)
        );
        return { published, subscribers: published };
      })
      .post('/publish/notification/:type', async ({ params, body }) => {
        const channel = `servicenow:notifications:${params.type}`;
        const published = await pubsub.publish(
          channel,
          JSON.stringify({
            type: params.type,
            data: body,
            timestamp: new Date().toISOString()
          })
        );
        return { channel, published, subscribers: published };
      });
  });

  afterEach(async () => {
    await pubsub.disconnect();
    await mockClient.quit();
  });

  it('should publish ServiceNow incident updates via Elysia endpoint', async () => {
    const incidentUpdate = {
      sys_id: 'inc_update_001',
      state: '2', // Changed to In Progress
      updated_by: 'test_user',
      update_timestamp: new Date().toISOString()
    };

    const response = await app.handle(new Request('http://localhost/publish/incident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incidentUpdate)
    }));

    const result = await response.json();
    expect(result.published).toBeGreaterThanOrEqual(0);
  });

  it('should support pattern-based subscriptions for ServiceNow tables', async () => {
    const callback = jest.fn();
    
    // Subscribe to all ServiceNow incident notifications
    await pubsub.subscribeToPattern('servicenow:incidents:*', callback);

    // Publish to specific incident
    await pubsub.publish('servicenow:incidents:critical', JSON.stringify({
      priority: '1',
      message: 'Critical incident detected'
    }));

    await pubsub.publish('servicenow:incidents:high', JSON.stringify({
      priority: '2', 
      message: 'High priority incident detected'
    }));

    // Allow time for message processing
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should maintain message history for late subscribers', async () => {
    // Publish some historical messages
    const historicalMessages = [
      { type: 'incident_created', id: 'inc_001' },
      { type: 'incident_updated', id: 'inc_001' },
      { type: 'incident_resolved', id: 'inc_001' }
    ];

    for (const message of historicalMessages) {
      await pubsub.publish('servicenow:history_test', JSON.stringify(message));
    }

    // Subscribe and request history
    const receivedMessages: any[] = [];
    await pubsub.subscribeWithHistory(
      'servicenow:history_test',
      (message) => {
        receivedMessages.push(JSON.parse(message));
      },
      { maxHistoryMessages: 10 }
    );

    // Allow time for history delivery
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(receivedMessages.length).toBeGreaterThanOrEqual(3);
    expect(receivedMessages[0].type).toBe('incident_created');
  });

  it('should handle high-throughput real-time notifications', async () => {
    const notificationCount = 1000;
    const receivedNotifications: any[] = [];
    
    // Set up subscriber
    await pubsub.subscribe('servicenow:high_throughput', (message) => {
      receivedNotifications.push(JSON.parse(message));
    });

    // Publish notifications rapidly
    const startTime = Date.now();
    const publishPromises = Array.from({ length: notificationCount }, (_, i) => 
      pubsub.publish('servicenow:high_throughput', JSON.stringify({
        id: i,
        message: `High throughput test notification ${i}`,
        timestamp: Date.now()
      }))
    );

    await Promise.all(publishPromises);
    const publishDuration = Date.now() - startTime;

    // Allow time for message processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(publishDuration).toBeLessThan(5000); // Should publish within 5 seconds
    expect(receivedNotifications.length).toBeGreaterThan(notificationCount * 0.9); // At least 90% delivery
  });

  it('should support different notification types via parameterized endpoints', async () => {
    const notificationTypes = ['critical', 'warning', 'info'];
    
    const publishPromises = notificationTypes.map(type => 
      app.handle(new Request(`http://localhost/publish/notification/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${type.toUpperCase()} notification test`,
          severity: type
        })
      }))
    );

    const responses = await Promise.all(publishPromises);
    const results = await Promise.all(responses.map(r => r.json()));

    results.forEach((result, index) => {
      expect(result.channel).toBe(`servicenow:notifications:${notificationTypes[index]}`);
      expect(result.published).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('ServiceNowRedisIntegration End-to-End with Elysia', () => {
  let integration: ServiceNowRedisIntegration;
  let mockClients: { [key: string]: MockRedisClient };
  let app: Elysia;

  beforeEach(() => {
    mockClients = {
      stream: new MockRedisClient(),
      cache: new MockRedisClient(), 
      pubsub: new MockRedisClient()
    };

    integration = new ServiceNowRedisIntegration({
      stream: {
        host: 'localhost',
        port: 6379,
        streamConfig: {
          maxLength: 10000,
          batchSize: 100
        }
      },
      cache: {
        host: 'localhost',
        port: 6379,
        defaultTTL: 3600
      },
      pubsub: {
        host: 'localhost',
        port: 6379,
        enablePatternSubscriptions: true
      }
    });

    // Override clients with mocks
    (integration as any).streamManager.client = mockClients.stream;
    (integration as any).cache.client = mockClients.cache;
    (integration as any).pubsub.client = mockClients.pubsub;

    // Create comprehensive Elysia app
    app = new Elysia()
      .derive(async () => ({ integration }))
      .group('/servicenow', (app) => 
        app
          .post('/incident', async ({ body, integration }) => {
            const result = await integration.processIncidentUpdate(body as any);
            return result;
          })
          .get('/incident/:id', async ({ params, integration }) => {
            const incident = await integration.getCachedIncident(params.id);
            return incident;
          })
          .post('/bulk/incidents', async ({ body, integration }) => {
            const incidents = body as any[];
            const results = await integration.processBulkIncidents(incidents);
            return results;
          })
          .get('/stats', async ({ integration }) => {
            const stats = await integration.getComprehensiveStats();
            return stats;
          })
      );
  });

  afterEach(async () => {
    await integration.shutdown();
    Object.values(mockClients).forEach(client => client.quit());
  });

  it('should process incident update through complete pipeline', async () => {
    const incidentUpdate = {
      ...sampleServiceNowData.incident,
      state: '2',
      assignment_group: 'Database Team',
      work_notes: 'Updated to in-progress status'
    };

    const response = await app.handle(new Request('http://localhost/servicenow/incident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incidentUpdate)
    }));

    const result = await response.json();
    
    expect(result.success).toBe(true);
    expect(result.streamMessageId).toBeDefined();
    expect(result.cached).toBe(true);
    expect(result.notificationsSent).toBeGreaterThan(0);
  });

  it('should handle bulk incident processing with proper error handling', async () => {
    const bulkIncidents = Array.from({ length: 50 }, (_, i) => ({
      ...sampleServiceNowData.incident,
      sys_id: `bulk_inc_${i}`,
      number: `INC${String(i).padStart(7, '0')}`,
      priority: String((i % 4) + 1),
      state: String((i % 6) + 1)
    }));

    // Add some invalid records to test error handling
    bulkIncidents.push({ sys_id: 'invalid', priority: 'invalid' } as any);

    const response = await app.handle(new Request('http://localhost/servicenow/bulk/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bulkIncidents)
    }));

    const result = await response.json();

    expect(result.totalProcessed).toBe(51);
    expect(result.successful).toBe(50);
    expect(result.failed).toBe(1);
    expect(result.errors.length).toBe(1);
  });

  it('should provide comprehensive system statistics', async () => {
    // Generate some activity
    await Promise.all([
      integration.processIncidentUpdate(sampleServiceNowData.incident),
      integration.processProblemUpdate(sampleServiceNowData.problem),
      integration.getCachedIncident('test_001')
    ]);

    const response = await app.handle(new Request('http://localhost/servicenow/stats'));
    const stats = await response.json();

    expect(stats.stream).toBeDefined();
    expect(stats.stream.totalStreams).toBeGreaterThan(0);
    expect(stats.cache).toBeDefined();
    expect(stats.cache.totalOperations).toBeGreaterThan(0);
    expect(stats.pubsub).toBeDefined();
    expect(stats.system).toBeDefined();
    expect(stats.system.uptimeSeconds).toBeGreaterThan(0);
  });

  it('should handle service degradation gracefully', async () => {
    // Simulate Redis connection issues
    jest.spyOn(mockClients.stream, 'xadd').mockRejectedValue(new Error('Connection timeout'));
    jest.spyOn(mockClients.cache, 'set').mockRejectedValue(new Error('Memory full'));

    const incidentUpdate = sampleServiceNowData.incident;

    const response = await app.handle(new Request('http://localhost/servicenow/incident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incidentUpdate)
    }));

    const result = await response.json();

    // Should still succeed partially
    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should support real-time monitoring and alerting', async () => {
    let alertCount = 0;
    
    // Set up monitoring callback
    integration.on('alert', (alert) => {
      alertCount++;
      expect(alert.type).toBeDefined();
      expect(alert.severity).toBeDefined();
      expect(alert.message).toBeDefined();
    });

    // Trigger conditions that should generate alerts
    const highVolumeData = Array.from({ length: 1000 }, (_, i) => ({
      ...sampleServiceNowData.incident,
      sys_id: `alert_test_${i}`
    }));

    await integration.processBulkIncidents(highVolumeData);

    // Allow time for alert processing
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(alertCount).toBeGreaterThan(0);
  });
});

// Performance and Load Testing
describe('Redis Integration Performance Tests', () => {
  let integration: ServiceNowRedisIntegration;
  let mockClients: { [key: string]: MockRedisClient };

  beforeEach(() => {
    mockClients = {
      stream: new MockRedisClient(),
      cache: new MockRedisClient(),
      pubsub: new MockRedisClient()
    };

    integration = new ServiceNowRedisIntegration({
      stream: { 
        host: 'localhost', 
        port: 6379,
        streamConfig: { maxLength: 100000, batchSize: 1000 }
      },
      cache: { 
        host: 'localhost', 
        port: 6379,
        defaultTTL: 3600,
        enableCompression: true
      },
      pubsub: { 
        host: 'localhost', 
        port: 6379,
        enablePatternSubscriptions: true
      }
    });

    Object.entries(mockClients).forEach(([key, client]) => {
      (integration as any)[key === 'stream' ? 'streamManager' : key].client = client;
    });
  });

  afterEach(async () => {
    await integration.shutdown();
  });

  it('should handle high-throughput incident processing', async () => {
    const throughputTest = 10000;
    const incidents = Array.from({ length: throughputTest }, (_, i) => ({
      ...sampleServiceNowData.incident,
      sys_id: `perf_test_${i}`,
      number: `INC${String(i).padStart(7, '0')}`,
      priority: String((i % 4) + 1)
    }));

    const startTime = Date.now();
    const result = await integration.processBulkIncidents(incidents);
    const duration = Date.now() - startTime;

    expect(result.successful).toBe(throughputTest);
    expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    
    const throughputPerSecond = throughputTest / (duration / 1000);
    expect(throughputPerSecond).toBeGreaterThan(100); // At least 100 incidents/second
  }, 60000);

  it('should maintain consistent performance under sustained load', async () => {
    const batches = 10;
    const batchSize = 1000;
    const durations: number[] = [];

    for (let batch = 0; batch < batches; batch++) {
      const incidents = Array.from({ length: batchSize }, (_, i) => ({
        ...sampleServiceNowData.incident,
        sys_id: `sustained_${batch}_${i}`,
        batch_number: batch
      }));

      const startTime = Date.now();
      await integration.processBulkIncidents(incidents);
      const duration = Date.now() - startTime;
      
      durations.push(duration);
    }

    // Performance should not degrade significantly
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const variationCoeff = Math.max(...durations) / Math.min(...durations);

    expect(avgDuration).toBeLessThan(10000); // Average under 10 seconds
    expect(variationCoeff).toBeLessThan(3); // No more than 3x variation
  }, 120000);

  it('should handle memory efficiently during large operations', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Process large dataset
    const largeDataset = Array.from({ length: 50000 }, (_, i) => ({
      ...sampleServiceNowData.incident,
      sys_id: `memory_test_${i}`,
      large_field: 'x'.repeat(1000), // 1KB per record
      work_notes: Array.from({ length: 10 }, (_, j) => `Note ${j}: ${'y'.repeat(100)}`).join('\n')
    }));

    await integration.processBulkIncidents(largeDataset);

    const peakMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (peakMemory - initialMemory) / 1024 / 1024; // MB

    expect(memoryIncrease).toBeLessThan(500); // Should not exceed 500MB increase

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryLeakage = (finalMemory - initialMemory) / 1024 / 1024; // MB
    
    expect(memoryLeakage).toBeLessThan(100); // Should not leak more than 100MB
  }, 180000);
});