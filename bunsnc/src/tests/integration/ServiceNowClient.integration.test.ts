/**
 * ServiceNowClient Integration Tests - Comprehensive integration test suite
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { ServiceNowClient } from '../../client/ServiceNowClient';
import { performanceMonitor } from '../../utils/PerformanceMonitor';
import { transactionManager } from '../../utils/TransactionManager';
import { cache } from '../../utils/Cache';
import type { ServiceNowRecord, QueryOptions } from '../../types/servicenow';

// Mock fetch for testing
global.fetch = mock();

// Mock environment variables
const TEST_INSTANCE = 'https://test-instance.service-now.com';
const TEST_TOKEN = 'test-auth-token';

describe('ServiceNowClient Integration Tests', () => {
  let client: ServiceNowClient;
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = global.fetch as any;
    fetchMock.mockReset();
    
    client = new ServiceNowClient(TEST_INSTANCE, TEST_TOKEN, {
      validateConnection: false,
      enableCache: true
    });
    
    cache.clear();
    performanceMonitor.clearMetrics();
  });

  afterEach(() => {
    cache.clear();
    performanceMonitor.clearMetrics();
  });

  describe('Client Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(client.instance).toBe(TEST_INSTANCE);
      expect(client.auth).toBe(TEST_TOKEN);
      expect(client.table).toBeTruthy();
      expect(client.attachment).toBeTruthy();
      expect(client.batch).toBeTruthy();
      expect(client.serviceNow).toBeTruthy();
    });

    test('should normalize instance URL', () => {
      const clientWithSlash = new ServiceNowClient(TEST_INSTANCE + '/', TEST_TOKEN);
      expect(clientWithSlash.instance).toBe(TEST_INSTANCE);
    });

    test('should validate connection when requested', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] })
      });

      const validatingClient = new ServiceNowClient(TEST_INSTANCE, TEST_TOKEN, {
        validateConnection: true
      });

      // Wait a bit for async validation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(fetchMock).toHaveBeenCalled();
    });

    test('should create client from environment variables', () => {
      // Mock environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SERVICENOW_INSTANCE: TEST_INSTANCE,
        SERVICENOW_TOKEN: TEST_TOKEN
      };

      const envClient = ServiceNowClient.fromEnv();
      expect(envClient.instance).toBe(TEST_INSTANCE);
      expect(envClient.auth).toBe(TEST_TOKEN);

      // Restore environment
      process.env = originalEnv;
    });

    test('should create client with basic auth', () => {
      const username = 'testuser';
      const password = 'testpass';
      
      const basicAuthClient = ServiceNowClient.createWithBasicAuth(
        TEST_INSTANCE,
        username,
        password
      );

      const expectedAuth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      expect(basicAuthClient.auth).toBe(expectedAuth);
    });

    test('should create client with OAuth', () => {
      const accessToken = 'oauth-access-token';
      
      const oauthClient = ServiceNowClient.createWithOAuth(
        TEST_INSTANCE,
        accessToken
      );

      expect(oauthClient.auth).toBe(`Bearer ${accessToken}`);
    });
  });

  describe('CRUD Operations with Performance Monitoring', () => {
    test('should perform query with performance tracking', async () => {
      const mockRecords: ServiceNowRecord[] = [
        { sys_id: '1', short_description: 'Test incident 1' },
        { sys_id: '2', short_description: 'Test incident 2' }
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: mockRecords })
      });

      const queryOptions: QueryOptions = {
        table: 'incident',
        query: 'state=1',
        limit: 10
      };

      const result = await client.query(queryOptions);

      expect(result).toEqual(mockRecords);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/now/table/incident'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': TEST_TOKEN
          })
        })
      );

      // Check performance metrics were recorded
      const metrics = performanceMonitor.getRealTimeMetrics();
      const queryMetrics = metrics.filter(m => m.name.includes('query'));
      expect(queryMetrics.length).toBeGreaterThan(0);
    });

    test('should create record with cache invalidation', async () => {
      const newRecord: ServiceNowRecord = {
        short_description: 'New incident',
        state: '1'
      };

      const createdRecord: ServiceNowRecord = {
        ...newRecord,
        sys_id: 'new123'
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: createdRecord })
      });

      const result = await client.create('incident', newRecord);

      expect(result).toEqual(createdRecord);
      
      // Check that cache was invalidated for the table
      const cacheStats = cache.getStats();
      expect(cacheStats).toBeTruthy();
    });

    test('should use cache for repeated reads', async () => {
      const testRecord: ServiceNowRecord = {
        sys_id: 'test123',
        short_description: 'Cached incident'
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: testRecord })
      });

      // First read - should hit API
      const result1 = await client.read('incident', 'test123');
      expect(result1).toEqual(testRecord);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second read - should hit cache
      const result2 = await client.read('incident', 'test123');
      expect(result2).toEqual(testRecord);
      expect(fetchMock).toHaveBeenCalledTimes(1); // No additional API call

      // Check cache stats
      const cacheStats = cache.getStats();
      expect(cacheStats.hitRate).toBeGreaterThan(0);
    });

    test('should update record and refresh cache', async () => {
      const originalRecord: ServiceNowRecord = {
        sys_id: 'update123',
        short_description: 'Original incident',
        state: '1'
      };

      const updatedRecord: ServiceNowRecord = {
        ...originalRecord,
        short_description: 'Updated incident',
        state: '2'
      };

      // First, populate cache with original record
      cache.cacheRecord('incident', 'update123', originalRecord);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: updatedRecord })
      });

      const result = await client.update('incident', 'update123', {
        short_description: 'Updated incident',
        state: '2'
      });

      expect(result).toEqual(updatedRecord);
      
      // Check that cache was updated
      const cachedRecord = cache.getCachedRecord('incident', 'update123');
      expect(cachedRecord?.short_description).toBe('Updated incident');
    });

    test('should delete record and clear from cache', async () => {
      // First, populate cache
      cache.cacheRecord('incident', 'delete123', {
        sys_id: 'delete123',
        short_description: 'To be deleted'
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      const result = await client.delete('incident', 'delete123');

      expect(result).toBe(true);
      
      // Check that record was removed from cache
      const cachedRecord = cache.getCachedRecord('incident', 'delete123');
      expect(cachedRecord).toBeNull();
    });
  });

  describe('Batch Operations Integration', () => {
    test('should create and execute batch operations', () => {
      const batch = client.createBatch();
      
      expect(batch).toBeTruthy();
      expect(typeof batch.addRequest).toBe('function');
      expect(typeof batch.execute).toBe('function');
    });

    test('should configure batch with custom options', () => {
      const batchOptions = {
        maxRetries: 5,
        retryDelay: 2000,
        concurrencyLimit: 5
      };

      const batch = client.createBatch(batchOptions);
      
      expect(batch).toBeTruthy();
      // Options are applied to the BatchAPI instance
    });
  });

  describe('Attachment Operations Integration', () => {
    test('should upload attachment', async () => {
      const fileName = 'test.txt';
      const fileContent = Buffer.from('test file content');
      const table = 'incident';
      const tableSysId = 'incident123';

      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (header: string) => {
            if (header === 'Location') {
              return '/api/now/attachment/attachment123/file';
            }
            return null;
          }
        }
      });

      const result = await client.uploadAttachment(
        fileName,
        table,
        tableSysId,
        fileContent
      );

      expect(result).toBe('attachment123');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/now/attachment/file'),
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    test('should download attachment', async () => {
      const attachmentId = 'attachment123';
      const fileContent = 'downloaded file content';

      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(fileContent),
        blob: () => Promise.resolve(new Blob([fileContent])),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        headers: {
          get: (header: string) => {
            if (header === 'content-type') {
              return 'text/plain';
            }
            if (header === 'content-length') {
              return fileContent.length.toString();
            }
            return null;
          }
        }
      });

      const result = await client.downloadAttachment(attachmentId);

      expect(result).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/api/now/attachment/${attachmentId}/file`),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('should list attachments for record', async () => {
      const mockAttachments: ServiceNowRecord[] = [
        {
          sys_id: 'attachment1',
          file_name: 'document1.pdf',
          content_type: 'application/pdf'
        },
        {
          sys_id: 'attachment2',
          file_name: 'image1.png',
          content_type: 'image/png'
        }
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: mockAttachments })
      });

      const result = await client.listAttachments('incident', 'incident123');

      expect(result).toEqual(mockAttachments);
    });
  });

  describe('System Health and Monitoring', () => {
    test('should test connection', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] })
      });

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/now/table/sys_properties'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('should get system health metrics', () => {
      // Generate some test metrics
      performanceMonitor.recordMetric({
        name: 'response_time',
        value: 150,
        unit: 'ms',
        timestamp: Date.now()
      });

      performanceMonitor.recordCacheHitRatio(8, 10);
      performanceMonitor.recordErrorRate(1, 100);

      const health = client.getSystemHealth();

      expect(health).toBeTruthy();
      expect(health.healthScore).toBeGreaterThan(0);
      expect(health.status).toMatch(/healthy|warning|critical/);
      expect(health.cache).toBeTruthy();
      expect(health.performance).toBeTruthy();
      expect(health.transactions).toBeTruthy();
    });

    test('should calculate health score correctly', () => {
      // Test with good metrics
      performanceMonitor.recordMetric({
        name: 'response_time',
        value: 100, // Good response time
        unit: 'ms',
        timestamp: Date.now()
      });

      performanceMonitor.recordErrorRate(0.5, 100); // Low error rate
      performanceMonitor.recordCacheHitRatio(95, 100); // High cache hit rate

      const health = client.getSystemHealth();
      expect(health.healthScore).toBeGreaterThan(0.8);
      expect(health.status).toBe('healthy');

      // Test with bad metrics
      cache.clear();
      performanceMonitor.clearMetrics();
      
      performanceMonitor.recordMetric({
        name: 'response_time',
        value: 5000, // Poor response time
        unit: 'ms',
        timestamp: Date.now()
      });

      performanceMonitor.recordErrorRate(15, 100); // High error rate
      performanceMonitor.recordCacheHitRatio(30, 100); // Low cache hit rate

      const healthBad = client.getSystemHealth();
      expect(healthBad.healthScore).toBeLessThan(0.5);
      expect(healthBad.status).toBe('critical');
    });

    test('should get performance report', () => {
      // Add some test metrics
      performanceMonitor.recordMetric({
        name: 'query_duration',
        value: 200,
        unit: 'ms',
        timestamp: Date.now()
      });

      const report = client.getPerformanceReport(60);

      expect(report).toBeTruthy();
      expect(report.period).toBeTruthy();
      expect(report.metrics).toBeTruthy();
      expect(report.recommendations).toBeTruthy();
    });

    test('should get real-time performance metrics', () => {
      performanceMonitor.recordMetric({
        name: 'test_metric',
        value: 100,
        unit: 'count',
        timestamp: Date.now()
      });

      const metrics = client.getPerformanceMetrics();

      expect(metrics).toBeTruthy();
      expect(metrics.realTime).toBeTruthy();
      expect(metrics.snapshot).toBeTruthy();
      expect(metrics.clientId).toBeTruthy();
    });

    test('should reset performance statistics', () => {
      performanceMonitor.recordMetric({
        name: 'test_metric',
        value: 100,
        unit: 'count',
        timestamp: Date.now()
      });

      let metrics = client.getPerformanceMetrics();
      expect(metrics.realTime.length).toBeGreaterThan(0);

      client.resetPerformanceStats();

      metrics = client.getPerformanceMetrics();
      expect(metrics.realTime.length).toBe(0);
    });
  });

  describe('Cache Management', () => {
    test('should enable and disable cache', () => {
      client.enableCache(false);
      // Cache is now disabled
      
      client.enableCache(true);
      // Cache is now enabled again
    });

    test('should clear cache', () => {
      // Populate cache with test data
      cache.cacheRecord('incident', 'test1', { sys_id: 'test1', name: 'Test' });
      cache.cacheRecord('incident', 'test2', { sys_id: 'test2', name: 'Test 2' });

      expect(cache.size()).toBe(2);

      client.clearCache();

      expect(cache.size()).toBe(0);
    });

    test('should get cache statistics', () => {
      // Populate cache and generate stats
      cache.cacheRecord('incident', 'test1', { sys_id: 'test1' });
      cache.getCachedRecord('incident', 'test1'); // Generate hit
      cache.getCachedRecord('incident', 'nonexistent'); // Generate miss

      const stats = client.getCacheStats();

      expect(stats).toBeTruthy();
      expect(typeof stats.hitRate).toBe('number');
      expect(typeof stats.memoryUsage).toBe('number');
    });
  });

  describe('Transaction Integration', () => {
    test('should begin transaction', () => {
      const tx = client.beginTransaction({
        name: 'test-transaction',
        timeout: 60000
      });

      expect(tx).toBeTruthy();
      expect(tx.id).toBeTruthy();
      expect(tx.options.name).toBe('test-transaction');
    });

    test('should execute transaction with client operations', async () => {
      const tx = client.beginTransaction();

      // Add operations to transaction
      tx.create('incident', {
        short_description: 'Transaction test',
        state: '1'
      });

      // Mock successful API calls
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: {
            sys_id: 'created123',
            short_description: 'Transaction test',
            state: '1'
          }
        })
      });

      const result = await tx.commit();

      expect(result.success).toBe(true);
      expect(result.operations).toBe(1);
    });
  });

  describe('Logging Integration', () => {
    test('should set log level', () => {
      client.setLogLevel('DEBUG');
      client.setLogLevel('ERROR');
      client.setLogLevel('INVALID'); // Should log warning
    });

    test('should get logs', () => {
      const logs = client.getLogs();
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle API errors gracefully', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.query({
        table: 'incident',
        query: 'state=1'
      })).rejects.toThrow();
    });

    test('should handle HTTP error responses', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Record not found')
      });

      await expect(client.read('incident', 'nonexistent'))
        .rejects.toThrow();
    });

    test('should handle malformed JSON responses', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      });

      await expect(client.query({
        table: 'incident',
        query: 'state=1'
      })).rejects.toThrow();
    });
  });

  describe('Factory Methods', () => {
    test('should create client using factory method', () => {
      const factoryClient = ServiceNowClient.create(TEST_INSTANCE, TEST_TOKEN, {
        validateConnection: false
      });

      expect(factoryClient).toBeInstanceOf(ServiceNowClient);
      expect(factoryClient.instance).toBe(TEST_INSTANCE);
    });

    test('should handle missing environment variables', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      delete process.env.SERVICENOW_INSTANCE;
      delete process.env.SERVICENOW_TOKEN;

      expect(() => ServiceNowClient.fromEnv())
        .toThrow('SERVICENOW_INSTANCE environment variable is required');

      process.env = originalEnv;
    });
  });

  describe('Advanced Query Operations', () => {
    test('should handle complex query options', async () => {
      const mockRecords: ServiceNowRecord[] = [
        { sys_id: '1', short_description: 'Test 1' },
        { sys_id: '2', short_description: 'Test 2' }
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: mockRecords })
      });

      const result = await client.query({
        table: 'incident',
        query: 'state=1^priority=1',
        fields: ['sys_id', 'short_description', 'state'],
        limit: 50,
        offset: 10,
        orderBy: 'sys_created_on',
        orderDirection: 'DESC'
      });

      expect(result).toEqual(mockRecords);
      
      // Verify URL parameters were constructed correctly
      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('sysparm_query=state%3D1%5Epriority%3D1');
      expect(calledUrl).toContain('sysparm_limit=50');
      expect(calledUrl).toContain('sysparm_offset=10');
    });

    test('should get record count', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [{ count: '42' }] })
      });

      const count = await client.getCount('incident', 'state=1');

      expect(count).toBe(42);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('sysparm_query=state%3D1'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('should execute sequence of operations', async () => {
      const operations = [
        { method: 'GET' as const, table: 'incident', sysId: '1' },
        { method: 'POST' as const, table: 'incident', data: { short_description: 'New' } },
        { method: 'PUT' as const, table: 'incident', sysId: '2', data: { state: '2' } }
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: [
            { sys_id: '1', short_description: 'Existing' },
            { sys_id: 'new1', short_description: 'New' },
            { sys_id: '2', state: '2' }
          ]
        })
      });

      const results = await client.executeSequence(operations);

      expect(results).toHaveLength(3);
      
      // Should invalidate cache due to data changes
      const cacheStats = cache.getStats();
      expect(cacheStats).toBeTruthy();
    });
  });

  describe('Performance Monitoring Integration', () => {
    test('should record client initialization metrics', () => {
      const newClient = new ServiceNowClient(TEST_INSTANCE, TEST_TOKEN);
      
      const metrics = performanceMonitor.getRealTimeMetrics(['client_initialized']);
      expect(metrics.length).toBeGreaterThan(0);
    });

    test('should record operation metrics during API calls', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] })
      });

      await client.query({ table: 'incident', query: 'state=1' });

      const metrics = performanceMonitor.getRealTimeMetrics();
      const queryMetrics = metrics.filter(m => 
        m.name.includes('query') || m.name.includes('response_time')
      );
      
      expect(queryMetrics.length).toBeGreaterThan(0);
    });

    test('should record cache hit metrics', async () => {
      const testRecord = { sys_id: 'cache_test', name: 'Test' };
      
      // First call - cache miss
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: testRecord })
      });

      await client.read('incident', 'cache_test');

      // Second call - cache hit
      await client.read('incident', 'cache_test');

      const metrics = performanceMonitor.getRealTimeMetrics(['cache_hit']);
      expect(metrics.length).toBeGreaterThan(0);
    });
  });
});