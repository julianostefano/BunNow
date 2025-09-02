# Testing Guide

**Author**: Juliano Stefano <jsdealencar@ayesa.com> [2025]

## Table of Contents

1. [Testing Overview](#testing-overview)
2. [Test Environment Setup](#test-environment-setup)
3. [Unit Testing](#unit-testing)
4. [Integration Testing](#integration-testing)
5. [Performance Testing](#performance-testing)
6. [Mock Testing](#mock-testing)
7. [End-to-End Testing](#end-to-end-testing)
8. [Test Data Management](#test-data-management)
9. [Continuous Integration](#continuous-integration)
10. [Best Practices](#best-practices)

## Testing Overview

BunSNC provides comprehensive testing capabilities to ensure reliable ServiceNow integrations. The testing framework includes:

- **Unit Tests**: Test individual components and utilities
- **Integration Tests**: Test API interactions with ServiceNow
- **Performance Tests**: Validate performance under load
- **Mock Tests**: Test without external dependencies
- **E2E Tests**: Full workflow testing

### Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── utils/              # Utility function tests
│   ├── core/               # Core component tests
│   └── mocks/              # Mock implementations
├── integration/            # Integration tests
│   ├── client/            # ServiceNow client tests
│   ├── apis/              # API-specific tests
│   └── scenarios/         # Real-world scenarios
├── performance/           # Performance tests
│   ├── load/             # Load testing
│   ├── stress/           # Stress testing
│   └── benchmarks/       # Benchmark tests
├── e2e/                  # End-to-end tests
└── fixtures/             # Test data and fixtures
    ├── data/            # Sample data
    └── configs/         # Test configurations
```

## Test Environment Setup

### Environment Configuration

```bash
# Test environment variables
NODE_ENV=test
SNC_TEST_INSTANCE_URL=https://dev123456.service-now.com
SNC_TEST_AUTH_TOKEN=test-token-here
SNC_TEST_USERNAME=test.user
SNC_TEST_PASSWORD=test-password

# Test database (optional)
SNC_TEST_USE_SANDBOX=true
SNC_TEST_CLEANUP_AFTER=true
```

### Test Configuration File

```typescript
// tests/config/test.config.ts
export const testConfig = {
  // ServiceNow test instance
  serviceNow: {
    instanceUrl: process.env.SNC_TEST_INSTANCE_URL || 'https://dev123456.service-now.com',
    authToken: process.env.SNC_TEST_AUTH_TOKEN,
    username: process.env.SNC_TEST_USERNAME,
    password: process.env.SNC_TEST_PASSWORD,
    timeout: 30000
  },
  
  // Test data configuration
  testData: {
    cleanupAfterTests: process.env.SNC_TEST_CLEANUP_AFTER === 'true',
    useSandbox: process.env.SNC_TEST_USE_SANDBOX === 'true',
    preserveSystemRecords: true
  },
  
  // Performance test settings
  performance: {
    warmupIterations: 10,
    measurementIterations: 100,
    concurrentUsers: 5,
    testDuration: 60000 // 1 minute
  },
  
  // Timeouts
  timeouts: {
    unit: 5000,
    integration: 30000,
    performance: 300000, // 5 minutes
    e2e: 600000 // 10 minutes
  }
};
```

### Test Setup and Teardown

```typescript
// tests/setup.ts
import { testConfig } from './config/test.config';
import { ServiceNowClient } from '../src/index';
import { TestDataManager } from './utils/TestDataManager';

export class TestSetup {
  static client: ServiceNowClient;
  static testDataManager: TestDataManager;
  
  static async beforeAll() {
    // Initialize test client
    TestSetup.client = ServiceNowClient.create(
      testConfig.serviceNow.instanceUrl,
      testConfig.serviceNow.authToken,
      {
        enableCaching: false, // Disable caching for tests
        enablePerformanceMonitoring: true,
        timeout: testConfig.serviceNow.timeout
      }
    );
    
    // Initialize test data manager
    TestSetup.testDataManager = new TestDataManager(TestSetup.client);
    
    // Verify connection
    await TestSetup.verifyConnection();
    
    console.log('✅ Test environment setup completed');
  }
  
  static async afterAll() {
    // Cleanup test data
    if (testConfig.testData.cleanupAfterTests) {
      await TestSetup.testDataManager.cleanupAll();
    }
    
    // Close connections
    if (TestSetup.client) {
      await TestSetup.client.disconnect();
    }
    
    console.log('✅ Test environment cleanup completed');
  }
  
  static async beforeEach() {
    // Clear cache before each test
    if (TestSetup.client) {
      TestSetup.client.clearCache();
    }
  }
  
  static async afterEach() {
    // Cleanup test records created during test
    await TestSetup.testDataManager.cleanupSession();
  }
  
  private static async verifyConnection() {
    try {
      await TestSetup.client.table('sys_user').query({ limit: 1 });
      console.log('✅ ServiceNow connection verified');
    } catch (error) {
      console.error('❌ ServiceNow connection failed:', error.message);
      throw error;
    }
  }
}
```

## Unit Testing

### Utility Function Tests

```typescript
// tests/unit/utils/Cache.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { Cache } from '../../../src/utils/Cache';

describe('Cache', () => {
  let cache: Cache;
  
  beforeEach(() => {
    cache = new Cache({
      maxSize: 100,
      evictionPolicy: 'LRU',
      ttl: 60000
    });
  });
  
  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });
    
    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });
    
    it('should handle null and undefined values', () => {
      cache.set('null-key', null);
      cache.set('undefined-key', undefined);
      
      expect(cache.get('null-key')).toBe(null);
      expect(cache.get('undefined-key')).toBe(undefined);
    });
  });
  
  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new Cache({ ttl: 100 });
      
      shortTtlCache.set('temp-key', 'temp-value');
      expect(shortTtlCache.get('temp-key')).toBe('temp-value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(shortTtlCache.get('temp-key')).toBeUndefined();
    });
    
    it('should allow custom TTL per entry', async () => {
      cache.set('short-lived', 'value', 100);
      cache.set('long-lived', 'value', 5000);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cache.get('short-lived')).toBeUndefined();
      expect(cache.get('long-lived')).toBe('value');
    });
  });
  
  describe('Eviction Policies', () => {
    it('should evict LRU entries when cache is full', () => {
      const smallCache = new Cache({ maxSize: 3, evictionPolicy: 'LRU' });
      
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      
      // Access key1 to make it more recently used
      smallCache.get('key1');
      
      // Add key4, should evict key2 (least recently used)
      smallCache.set('key4', 'value4');
      
      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBeUndefined();
      expect(smallCache.get('key3')).toBe('value3');
      expect(smallCache.get('key4')).toBe('value4');
    });
    
    it('should evict LFU entries when using LFU policy', () => {
      const smallCache = new Cache({ maxSize: 3, evictionPolicy: 'LFU' });
      
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      
      // Access key1 multiple times
      smallCache.get('key1');
      smallCache.get('key1');
      smallCache.get('key1');
      
      // Access key3 once
      smallCache.get('key3');
      
      // Add key4, should evict key2 (least frequently used)
      smallCache.set('key4', 'value4');
      
      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBeUndefined();
      expect(smallCache.get('key3')).toBe('value3');
      expect(smallCache.get('key4')).toBe('value4');
    });
  });
  
  describe('Statistics', () => {
    it('should track hit/miss statistics', () => {
      cache.set('existing', 'value');
      
      cache.get('existing'); // Hit
      cache.get('nonexistent'); // Miss
      cache.get('existing'); // Hit
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(2/3);
    });
    
    it('should track cache size', () => {
      expect(cache.getStats().size).toBe(0);
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      expect(cache.getStats().size).toBe(2);
    });
  });
});
```

### Logger Tests

```typescript
// tests/unit/utils/Logger.test.ts
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { Logger } from '../../../src/utils/Logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: any;
  
  beforeEach(() => {
    logger = new Logger({
      level: 'debug',
      enableStructuredLogging: true,
      enableTimestamps: true
    });
    
    consoleSpy = {
      log: spyOn(console, 'log'),
      warn: spyOn(console, 'warn'),
      error: spyOn(console, 'error')
    };
  });
  
  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });
  
  describe('Log Levels', () => {
    it('should log debug messages when level is debug', () => {
      logger.debug('Debug message');
      expect(consoleSpy.log).toHaveBeenCalled();
    });
    
    it('should not log debug messages when level is info', () => {
      const infoLogger = new Logger({ level: 'info' });
      infoLogger.debug('Debug message');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
    
    it('should always log error messages regardless of level', () => {
      const errorLogger = new Logger({ level: 'error' });
      errorLogger.error('Error message');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
  
  describe('Structured Logging', () => {
    it('should format structured logs as JSON', () => {
      logger.info('Test message', { userId: '123', action: 'login' });
      
      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('"message":"Test message"');
      expect(logCall).toContain('"userId":"123"');
      expect(logCall).toContain('"action":"login"');
    });
    
    it('should include timestamps when enabled', () => {
      logger.info('Timestamped message');
      
      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('"timestamp":');
    });
    
    it('should include log level in structured logs', () => {
      logger.warn('Warning message');
      
      const logCall = consoleSpy.warn.mock.calls[0][0];
      expect(logCall).toContain('"level":"warn"');
    });
  });
  
  describe('Error Logging', () => {
    it('should log error objects with stack traces', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      
      const logCall = consoleSpy.error.mock.calls[0][0];
      expect(logCall).toContain('"message":"Error occurred"');
      expect(logCall).toContain('"error":');
      expect(logCall).toContain('"stack":');
    });
    
    it('should handle non-Error objects', () => {
      logger.error('Error with object', { code: 500, details: 'Server error' });
      
      const logCall = consoleSpy.error.mock.calls[0][0];
      expect(logCall).toContain('"code":500');
      expect(logCall).toContain('"details":"Server error"');
    });
  });
});
```

### Performance Monitor Tests

```typescript
// tests/unit/utils/PerformanceMonitor.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { PerformanceMonitor } from '../../../src/utils/PerformanceMonitor';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;
  
  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });
  
  describe('Timer Operations', () => {
    it('should start and end timers', () => {
      const timerName = 'test-operation';
      
      monitor.startTimer(timerName, 'TestCategory');
      
      // Simulate work
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait for 10ms
      }
      
      const duration = monitor.endTimer(timerName);
      
      expect(duration).toBeGreaterThanOrEqual(10);
      expect(duration).toBeLessThan(100); // Should complete quickly
    });
    
    it('should throw error when ending non-existent timer', () => {
      expect(() => {
        monitor.endTimer('non-existent-timer');
      }).toThrow();
    });
    
    it('should allow nested timers', () => {
      monitor.startTimer('outer', 'Test');
      monitor.startTimer('inner', 'Test');
      
      const innerDuration = monitor.endTimer('inner');
      const outerDuration = monitor.endTimer('outer');
      
      expect(outerDuration).toBeGreaterThanOrEqual(innerDuration);
    });
  });
  
  describe('Metrics Recording', () => {
    it('should record custom metrics', () => {
      monitor.recordMetric({
        name: 'custom_metric',
        value: 42,
        unit: 'count',
        timestamp: Date.now()
      });
      
      const report = monitor.getReport(1);
      expect(report.metrics.detailed).toHaveLength(1);
      expect(report.metrics.detailed[0].name).toBe('custom_metric');
      expect(report.metrics.detailed[0].value).toBe(42);
    });
    
    it('should aggregate metrics by category', () => {
      monitor.recordMetric({
        name: 'db_query_time',
        value: 100,
        unit: 'ms',
        category: 'database',
        timestamp: Date.now()
      });
      
      monitor.recordMetric({
        name: 'api_response_time',
        value: 200,
        unit: 'ms',
        category: 'api',
        timestamp: Date.now()
      });
      
      const report = monitor.getReport(1);
      expect(report.categories.database).toBeDefined();
      expect(report.categories.api).toBeDefined();
    });
  });
  
  describe('Performance Reports', () => {
    it('should generate summary statistics', () => {
      const baseTime = Date.now();
      
      // Record multiple metrics
      for (let i = 0; i < 10; i++) {
        monitor.recordMetric({
          name: 'response_time',
          value: 100 + i * 10,
          unit: 'ms',
          timestamp: baseTime + i * 1000
        });
      }
      
      const report = monitor.getReport(1);
      
      expect(report.metrics.summary).toBeDefined();
      expect(report.metrics.summary.totalOperations).toBe(10);
      expect(report.metrics.summary.averageResponseTime).toBeCloseTo(145, 1);
    });
    
    it('should filter metrics by time range', () => {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      
      // Record old metric
      monitor.recordMetric({
        name: 'old_metric',
        value: 100,
        unit: 'ms',
        timestamp: oneHourAgo
      });
      
      // Record recent metric
      monitor.recordMetric({
        name: 'recent_metric',
        value: 200,
        unit: 'ms',
        timestamp: now
      });
      
      const report = monitor.getReport(30); // Last 30 minutes
      const metricNames = report.metrics.detailed.map(m => m.name);
      
      expect(metricNames).toContain('recent_metric');
      expect(metricNames).not.toContain('old_metric');
    });
  });
});
```

## Integration Testing

### ServiceNow Client Integration Tests

```typescript
// tests/integration/ServiceNowClient.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { TestSetup } from '../setup';

describe('ServiceNowClient Integration', () => {
  beforeAll(async () => {
    await TestSetup.beforeAll();
  });
  
  afterAll(async () => {
    await TestSetup.afterAll();
  });
  
  beforeEach(async () => {
    await TestSetup.beforeEach();
  });
  
  afterEach(async () => {
    await TestSetup.afterEach();
  });
  
  describe('Authentication', () => {
    it('should authenticate successfully with valid token', async () => {
      const result = await TestSetup.client.table('sys_user').query({ limit: 1 });
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });
    
    it('should handle authentication errors gracefully', async () => {
      const invalidClient = ServiceNowClient.create(
        TestSetup.client.instanceUrl,
        'invalid-token'
      );
      
      await expect(invalidClient.table('sys_user').query({ limit: 1 }))
        .rejects
        .toThrow('Authentication');
    });
  });
  
  describe('Table Operations', () => {
    describe('Query Operations', () => {
      it('should query records successfully', async () => {
        const incidents = await TestSetup.client.table('incident').query({
          limit: 5,
          fields: ['number', 'short_description', 'state']
        });
        
        expect(incidents).toBeInstanceOf(Array);
        expect(incidents.length).toBeLessThanOrEqual(5);
        
        if (incidents.length > 0) {
          expect(incidents[0]).toHaveProperty('number');
          expect(incidents[0]).toHaveProperty('short_description');
          expect(incidents[0]).toHaveProperty('state');
        }
      });
      
      it('should handle query with encoded query string', async () => {
        const activeUsers = await TestSetup.client.table('sys_user').query({
          query: 'active=true',
          limit: 10,
          fields: ['sys_id', 'user_name', 'active']
        });
        
        expect(activeUsers).toBeInstanceOf(Array);
        activeUsers.forEach(user => {
          expect(user.active).toBe('true');
        });
      });
      
      it('should handle empty result sets', async () => {
        const results = await TestSetup.client.table('incident').query({
          query: 'number=NONEXISTENT123456',
          limit: 10
        });
        
        expect(results).toBeInstanceOf(Array);
        expect(results.length).toBe(0);
      });
    });
    
    describe('CRUD Operations', () => {
      let testIncidentId: string;
      
      it('should create a new record', async () => {
        const incidentData = {
          short_description: `Test incident created by BunSNC - ${Date.now()}`,
          category: 'software',
          subcategory: 'application',
          priority: '4',
          impact: '3',
          urgency: '3'
        };
        
        const createdIncident = await TestSetup.client.table('incident').create(incidentData);
        
        expect(createdIncident).toHaveProperty('sys_id');
        expect(createdIncident.short_description).toBe(incidentData.short_description);
        expect(createdIncident.category).toBe(incidentData.category);
        
        testIncidentId = createdIncident.sys_id;
        
        // Track for cleanup
        await TestSetup.testDataManager.trackRecord('incident', testIncidentId);
      });
      
      it('should read a record by sys_id', async () => {
        if (!testIncidentId) {
          throw new Error('Test incident not created');
        }
        
        const incident = await TestSetup.client.table('incident').get(testIncidentId);
        
        expect(incident).toBeDefined();
        expect(incident.sys_id).toBe(testIncidentId);
        expect(incident).toHaveProperty('number');
        expect(incident).toHaveProperty('short_description');
      });
      
      it('should update a record', async () => {
        if (!testIncidentId) {
          throw new Error('Test incident not created');
        }
        
        const updateData = {
          priority: '2',
          work_notes: 'Updated by BunSNC integration test'
        };
        
        const updatedIncident = await TestSetup.client.table('incident').update(
          testIncidentId,
          updateData
        );
        
        expect(updatedIncident.sys_id).toBe(testIncidentId);
        expect(updatedIncident.priority).toBe('2');
      });
      
      it('should delete a record', async () => {
        if (!testIncidentId) {
          throw new Error('Test incident not created');
        }
        
        const success = await TestSetup.client.table('incident').delete(testIncidentId);
        expect(success).toBe(true);
        
        // Verify deletion
        await expect(TestSetup.client.table('incident').get(testIncidentId))
          .rejects
          .toThrow();
        
        // Remove from cleanup tracking
        await TestSetup.testDataManager.untrackRecord('incident', testIncidentId);
      });
    });
  });
  
  describe('GlideRecord Operations', () => {
    it('should perform GlideRecord query pattern', async () => {
      const gr = TestSetup.client.GlideRecord('sys_user');
      gr.addQuery('active', true);
      gr.setLimit(5);
      gr.orderBy('user_name');
      
      await gr.query();
      
      expect(gr.getRowCount()).toBeGreaterThan(0);
      expect(gr.getRowCount()).toBeLessThanOrEqual(5);
      
      const users = [];
      while (gr.next()) {
        users.push({
          sys_id: gr.getValue('sys_id'),
          user_name: gr.getValue('user_name'),
          active: gr.getValue('active')
        });
      }
      
      expect(users.length).toBeGreaterThan(0);
      expect(users.length).toBeLessThanOrEqual(5);
      
      // Verify ordering
      for (let i = 1; i < users.length; i++) {
        expect(users[i].user_name >= users[i-1].user_name).toBe(true);
      }
    });
    
    it('should handle GlideRecord insert and update', async () => {
      const gr = TestSetup.client.GlideRecord('incident');
      
      // Insert
      gr.setValue('short_description', `GlideRecord test incident - ${Date.now()}`);
      gr.setValue('category', 'software');
      gr.setValue('priority', '4');
      
      const sysId = await gr.insert();
      expect(sysId).toBeDefined();
      
      // Track for cleanup
      await TestSetup.testDataManager.trackRecord('incident', sysId);
      
      // Update
      const updateGr = TestSetup.client.GlideRecord('incident');
      if (await updateGr.get(sysId)) {
        updateGr.setValue('priority', '3');
        updateGr.setValue('work_notes', 'Updated via GlideRecord');
        
        await updateGr.update();
        
        // Verify update
        const verifyGr = TestSetup.client.GlideRecord('incident');
        if (await verifyGr.get(sysId)) {
          expect(verifyGr.getValue('priority')).toBe('3');
        }
      }
    });
  });
});
```

### Batch Operations Integration Tests

```typescript
// tests/integration/BatchAPI.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { TestSetup } from '../setup';

describe('BatchAPI Integration', () => {
  beforeAll(async () => {
    await TestSetup.beforeAll();
  });
  
  afterAll(async () => {
    await TestSetup.afterAll();
  });
  
  describe('Batch Creation', () => {
    it('should create multiple records in batch', async () => {
      const incidentData = Array.from({ length: 5 }, (_, i) => ({
        short_description: `Batch test incident ${i + 1} - ${Date.now()}`,
        category: 'software',
        priority: '4'
      }));
      
      const results = await TestSetup.client.table('incident').createMultiple(incidentData);
      
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result).toHaveProperty('sys_id');
        expect(result.short_description).toBe(incidentData[index].short_description);
      });
      
      // Track for cleanup
      for (const result of results) {
        await TestSetup.testDataManager.trackRecord('incident', result.sys_id);
      }
    });
    
    it('should handle batch creation with partial failures', async () => {
      const mixedData = [
        {
          short_description: `Valid incident - ${Date.now()}`,
          category: 'software',
          priority: '4'
        },
        {
          short_description: `Invalid incident - ${Date.now()}`,
          category: 'INVALID_CATEGORY_THAT_DOES_NOT_EXIST',
          priority: 'INVALID_PRIORITY'
        }
      ];
      
      // This should handle partial failures gracefully
      const results = await TestSetup.client.table('incident').createMultiple(mixedData);
      
      // Should have at least one successful creation
      expect(results.length).toBeGreaterThan(0);
      
      // Track successful creations for cleanup
      for (const result of results) {
        if (result.sys_id) {
          await TestSetup.testDataManager.trackRecord('incident', result.sys_id);
        }
      }
    });
  });
  
  describe('Batch Updates', () => {
    it('should update multiple records in batch', async () => {
      // First create some test records
      const testRecords = await TestSetup.client.table('incident').createMultiple([
        { short_description: 'Batch update test 1', category: 'software', priority: '4' },
        { short_description: 'Batch update test 2', category: 'software', priority: '4' },
        { short_description: 'Batch update test 3', category: 'software', priority: '4' }
      ]);
      
      // Track for cleanup
      for (const record of testRecords) {
        await TestSetup.testDataManager.trackRecord('incident', record.sys_id);
      }
      
      // Prepare update data
      const updates = testRecords.map(record => ({
        sys_id: record.sys_id,
        data: { priority: '2', work_notes: 'Batch updated' }
      }));
      
      // Perform batch update
      const results = await TestSetup.client.table('incident').updateMultiple(updates);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.priority).toBe('2');
      });
    });
  });
  
  describe('Advanced Batch Operations', () => {
    it('should handle large batch operations efficiently', async () => {
      const batchSize = 50;
      const testData = Array.from({ length: batchSize }, (_, i) => ({
        short_description: `Large batch test ${i + 1} - ${Date.now()}`,
        category: 'software',
        priority: '4'
      }));
      
      const startTime = Date.now();
      const results = await TestSetup.client.table('incident').createMultiple(testData);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(batchSize);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      
      console.log(`Large batch operation completed in ${duration}ms`);
      
      // Track for cleanup
      for (const result of results) {
        await TestSetup.testDataManager.trackRecord('incident', result.sys_id);
      }
    });
  });
});
```

## Performance Testing

### Load Testing Implementation

```typescript
// tests/performance/LoadTest.performance.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { TestSetup } from '../setup';
import { testConfig } from '../config/test.config';

describe('Load Performance Tests', () => {
  beforeAll(async () => {
    await TestSetup.beforeAll();
  });
  
  afterAll(async () => {
    await TestSetup.afterAll();
  });
  
  describe('Query Performance Under Load', () => {
    it('should handle concurrent queries efficiently', async () => {
      const concurrentQueries = 10;
      const queriesPerConnection = 5;
      
      const startTime = Date.now();
      
      const promises = Array.from({ length: concurrentQueries }, async () => {
        const queryPromises = Array.from({ length: queriesPerConnection }, () =>
          TestSetup.client.table('sys_user').query({
            query: 'active=true',
            limit: 10,
            fields: ['sys_id', 'user_name', 'active']
          })
        );
        
        return await Promise.all(queryPromises);
      });
      
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      const totalQueries = concurrentQueries * queriesPerConnection;
      
      expect(results).toHaveLength(concurrentQueries);
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      
      const averageQueryTime = duration / totalQueries;
      console.log(`Concurrent queries: ${totalQueries} in ${duration}ms (avg: ${averageQueryTime.toFixed(2)}ms per query)`);
      
      // Performance assertion
      expect(averageQueryTime).toBeLessThan(1000); // Each query should average under 1 second
    });
    
    it('should maintain performance with large result sets', async () => {
      const startTime = Date.now();
      
      const largeResults = await TestSetup.client.table('sys_journal_field').query({
        limit: 1000,
        fields: ['sys_id', 'element', 'value', 'sys_created_on']
      });
      
      const duration = Date.now() - startTime;
      
      expect(largeResults).toBeInstanceOf(Array);
      console.log(`Large query: ${largeResults.length} records in ${duration}ms`);
      
      // Performance assertions
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      const recordsPerSecond = largeResults.length / (duration / 1000);
      expect(recordsPerSecond).toBeGreaterThan(100); // Should process at least 100 records/sec
    });
  });
  
  describe('Batch Performance Under Load', () => {
    it('should handle concurrent batch operations', async () => {
      const batchCount = 5;
      const recordsPerBatch = 20;
      
      const createBatchData = (batchIndex: number) =>
        Array.from({ length: recordsPerBatch }, (_, i) => ({
          short_description: `Load test batch ${batchIndex} record ${i + 1} - ${Date.now()}`,
          category: 'software',
          priority: '4'
        }));
      
      const startTime = Date.now();
      
      const batchPromises = Array.from({ length: batchCount }, async (_, batchIndex) => {
        const batchData = createBatchData(batchIndex);
        return await TestSetup.client.table('incident').createMultiple(batchData);
      });
      
      const results = await Promise.all(batchPromises);
      const duration = Date.now() - startTime;
      const totalRecords = batchCount * recordsPerBatch;
      
      expect(results).toHaveLength(batchCount);
      
      let successfulCreations = 0;
      results.forEach(batchResult => {
        successfulCreations += batchResult.length;
      });
      
      console.log(`Concurrent batches: ${totalRecords} records in ${duration}ms`);
      
      // Track all created records for cleanup
      for (const batchResult of results) {
        for (const record of batchResult) {
          await TestSetup.testDataManager.trackRecord('incident', record.sys_id);
        }
      }
      
      // Performance assertions
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      expect(successfulCreations).toBe(totalRecords);
      
      const recordsPerSecond = totalRecords / (duration / 1000);
      expect(recordsPerSecond).toBeGreaterThan(10); // Should process at least 10 records/sec in batch mode
    });
  });
  
  describe('Memory Performance', () => {
    it('should handle large datasets without memory leaks', async () => {
      const initialMemory = process.memoryUsage();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const baselineMemory = process.memoryUsage();
      
      // Process multiple large queries
      for (let i = 0; i < 5; i++) {
        const results = await TestSetup.client.table('sys_journal_field').query({
          limit: 500,
          fields: ['sys_id', 'element', 'value']
        });
        
        // Process results to simulate real work
        results.forEach(record => {
          const processed = {
            ...record,
            processed: true,
            timestamp: Date.now()
          };
          // Simulate some work with the data
          JSON.stringify(processed);
        });
        
        // Clear results to allow GC
        results.length = 0;
        
        console.log(`Iteration ${i + 1}: Memory usage ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - baselineMemory.heapUsed;
      
      console.log(`Memory growth: ${Math.round(memoryGrowth / 1024 / 1024)}MB`);
      
      // Memory growth should be reasonable (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
```

## Mock Testing

### Mock ServiceNow Client

```typescript
// tests/mocks/MockServiceNowClient.ts
export class MockServiceNowClient {
  private mockData: Map<string, any[]> = new Map();
  private callLog: MockCall[] = [];
  
  constructor() {
    this.setupDefaultMockData();
  }
  
  private setupDefaultMockData() {
    // Mock incident data
    this.mockData.set('incident', [
      {
        sys_id: 'incident1',
        number: 'INC0000001',
        short_description: 'Mock incident 1',
        state: '1',
        priority: '2',
        category: 'software'
      },
      {
        sys_id: 'incident2',
        number: 'INC0000002',
        short_description: 'Mock incident 2',
        state: '2',
        priority: '1',
        category: 'hardware'
      }
    ]);
    
    // Mock user data
    this.mockData.set('sys_user', [
      {
        sys_id: 'user1',
        user_name: 'admin',
        first_name: 'System',
        last_name: 'Administrator',
        active: 'true'
      },
      {
        sys_id: 'user2',
        user_name: 'test.user',
        first_name: 'Test',
        last_name: 'User',
        active: 'true'
      }
    ]);
  }
  
  table(tableName: string) {
    return {
      query: async (params: any = {}) => {
        this.logCall('query', tableName, params);
        
        let data = this.mockData.get(tableName) || [];
        
        // Apply query filtering
        if (params.query) {
          data = this.applyQueryFilter(data, params.query);
        }
        
        // Apply field selection
        if (params.fields) {
          data = data.map(record => {
            const filtered: any = {};
            params.fields.forEach((field: string) => {
              if (record[field] !== undefined) {
                filtered[field] = record[field];
              }
            });
            return filtered;
          });
        }
        
        // Apply limit
        if (params.limit) {
          data = data.slice(0, params.limit);
        }
        
        // Apply offset
        if (params.offset) {
          data = data.slice(params.offset);
        }
        
        return data;
      },
      
      get: async (sysId: string) => {
        this.logCall('get', tableName, { sysId });
        
        const data = this.mockData.get(tableName) || [];
        const record = data.find(r => r.sys_id === sysId);
        
        if (!record) {
          throw new Error(`Record not found: ${sysId}`);
        }
        
        return record;
      },
      
      create: async (data: any) => {
        this.logCall('create', tableName, data);
        
        const newRecord = {
          sys_id: `mock_${tableName}_${Date.now()}`,
          ...data,
          sys_created_on: new Date().toISOString(),
          sys_updated_on: new Date().toISOString()
        };
        
        if (tableName === 'incident' && !newRecord.number) {
          newRecord.number = `INC${String(Date.now()).slice(-7)}`;
        }
        
        const tableData = this.mockData.get(tableName) || [];
        tableData.push(newRecord);
        this.mockData.set(tableName, tableData);
        
        return newRecord;
      },
      
      update: async (sysId: string, data: any) => {
        this.logCall('update', tableName, { sysId, data });
        
        const tableData = this.mockData.get(tableName) || [];
        const recordIndex = tableData.findIndex(r => r.sys_id === sysId);
        
        if (recordIndex === -1) {
          throw new Error(`Record not found: ${sysId}`);
        }
        
        const updatedRecord = {
          ...tableData[recordIndex],
          ...data,
          sys_updated_on: new Date().toISOString()
        };
        
        tableData[recordIndex] = updatedRecord;
        this.mockData.set(tableName, tableData);
        
        return updatedRecord;
      },
      
      delete: async (sysId: string) => {
        this.logCall('delete', tableName, { sysId });
        
        const tableData = this.mockData.get(tableName) || [];
        const recordIndex = tableData.findIndex(r => r.sys_id === sysId);
        
        if (recordIndex === -1) {
          throw new Error(`Record not found: ${sysId}`);
        }
        
        tableData.splice(recordIndex, 1);
        this.mockData.set(tableName, tableData);
        
        return true;
      },
      
      createMultiple: async (records: any[]) => {
        this.logCall('createMultiple', tableName, { count: records.length });
        
        const results = [];
        for (const record of records) {
          const created = await this.table(tableName).create(record);
          results.push(created);
        }
        
        return results;
      },
      
      updateMultiple: async (updates: Array<{ sys_id: string; data: any }>) => {
        this.logCall('updateMultiple', tableName, { count: updates.length });
        
        const results = [];
        for (const update of updates) {
          const updated = await this.table(tableName).update(update.sys_id, update.data);
          results.push(updated);
        }
        
        return results;
      }
    };
  }
  
  GlideRecord(tableName: string) {
    return new MockGlideRecord(this, tableName);
  }
  
  private applyQueryFilter(data: any[], queryString: string): any[] {
    // Simple query parsing for common cases
    const conditions = queryString.split('^');
    
    return data.filter(record => {
      return conditions.every(condition => {
        const [field, operator, value] = this.parseCondition(condition);
        
        switch (operator) {
          case '=':
            return String(record[field]) === value;
          case '!=':
            return String(record[field]) !== value;
          case '>':
            return Number(record[field]) > Number(value);
          case '<':
            return Number(record[field]) < Number(value);
          default:
            return true;
        }
      });
    });
  }
  
  private parseCondition(condition: string): [string, string, string] {
    if (condition.includes('!=')) {
      const [field, value] = condition.split('!=');
      return [field, '!=', value];
    }
    if (condition.includes('>=')) {
      const [field, value] = condition.split('>=');
      return [field, '>=', value];
    }
    if (condition.includes('<=')) {
      const [field, value] = condition.split('<=');
      return [field, '<=', value];
    }
    if (condition.includes('>')) {
      const [field, value] = condition.split('>');
      return [field, '>', value];
    }
    if (condition.includes('<')) {
      const [field, value] = condition.split('<');
      return [field, '<', value];
    }
    if (condition.includes('=')) {
      const [field, value] = condition.split('=');
      return [field, '=', value];
    }
    
    return ['', '=', ''];
  }
  
  private logCall(operation: string, table: string, params: any) {
    this.callLog.push({
      timestamp: Date.now(),
      operation,
      table,
      params
    });
  }
  
  // Mock utility methods
  addMockData(tableName: string, records: any[]) {
    this.mockData.set(tableName, records);
  }
  
  getCallLog(): MockCall[] {
    return [...this.callLog];
  }
  
  clearCallLog() {
    this.callLog = [];
  }
  
  getLastCall(): MockCall | undefined {
    return this.callLog[this.callLog.length - 1];
  }
  
  getCallsForTable(tableName: string): MockCall[] {
    return this.callLog.filter(call => call.table === tableName);
  }
}

class MockGlideRecord {
  private client: MockServiceNowClient;
  private tableName: string;
  private conditions: string[] = [];
  private orderFields: string[] = [];
  private limitValue?: number;
  private results: any[] = [];
  private currentIndex = -1;
  private currentRecord: any = null;
  
  constructor(client: MockServiceNowClient, tableName: string) {
    this.client = client;
    this.tableName = tableName;
  }
  
  addQuery(field: string, operator?: string, value?: any) {
    if (operator && value !== undefined) {
      this.conditions.push(`${field}${operator}${value}`);
    } else {
      this.conditions.push(`${field}=${operator || ''}`);
    }
  }
  
  addOrQuery(field: string, operator?: string, value?: any) {
    // Simplified OR query handling
    this.addQuery(field, operator, value);
  }
  
  orderBy(field: string) {
    this.orderFields.push(field);
  }
  
  orderByDesc(field: string) {
    this.orderFields.push(`${field} DESC`);
  }
  
  setLimit(limit: number) {
    this.limitValue = limit;
  }
  
  async query() {
    const queryString = this.conditions.join('^');
    const tableApi = this.client.table(this.tableName);
    
    this.results = await tableApi.query({
      query: queryString,
      limit: this.limitValue
    });
    
    // Apply ordering (simplified)
    this.orderFields.forEach(orderField => {
      const [field, direction] = orderField.split(' ');
      this.results.sort((a, b) => {
        const aVal = String(a[field] || '');
        const bVal = String(b[field] || '');
        
        const comparison = aVal.localeCompare(bVal);
        return direction === 'DESC' ? -comparison : comparison;
      });
    });
    
    this.currentIndex = -1;
    this.currentRecord = null;
  }
  
  next(): boolean {
    this.currentIndex++;
    if (this.currentIndex < this.results.length) {
      this.currentRecord = this.results[this.currentIndex];
      return true;
    }
    this.currentRecord = null;
    return false;
  }
  
  hasNext(): boolean {
    return this.currentIndex + 1 < this.results.length;
  }
  
  getValue(field: string): any {
    return this.currentRecord?.[field];
  }
  
  getDisplayValue(field: string): any {
    // For mock, just return the same as getValue
    return this.getValue(field);
  }
  
  setValue(field: string, value: any) {
    if (!this.currentRecord) {
      this.currentRecord = {};
    }
    this.currentRecord[field] = value;
  }
  
  async get(sysId: string): Promise<boolean> {
    try {
      const tableApi = this.client.table(this.tableName);
      this.currentRecord = await tableApi.get(sysId);
      return true;
    } catch (error) {
      this.currentRecord = null;
      return false;
    }
  }
  
  async insert(): Promise<string> {
    if (!this.currentRecord) {
      throw new Error('No data to insert');
    }
    
    const tableApi = this.client.table(this.tableName);
    const created = await tableApi.create(this.currentRecord);
    this.currentRecord = created;
    
    return created.sys_id;
  }
  
  async update() {
    if (!this.currentRecord?.sys_id) {
      throw new Error('No record to update');
    }
    
    const tableApi = this.client.table(this.tableName);
    const updated = await tableApi.update(this.currentRecord.sys_id, this.currentRecord);
    this.currentRecord = updated;
  }
  
  async deleteRecord() {
    if (!this.currentRecord?.sys_id) {
      throw new Error('No record to delete');
    }
    
    const tableApi = this.client.table(this.tableName);
    await tableApi.delete(this.currentRecord.sys_id);
    this.currentRecord = null;
  }
  
  getRowCount(): number {
    return this.results.length;
  }
}

interface MockCall {
  timestamp: number;
  operation: string;
  table: string;
  params: any;
}
```

### Using Mocks in Tests

```typescript
// tests/unit/mocks/ServiceNowClient.mock.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { MockServiceNowClient } from '../../mocks/MockServiceNowClient';

describe('ServiceNow Client with Mocks', () => {
  let mockClient: MockServiceNowClient;
  
  beforeEach(() => {
    mockClient = new MockServiceNowClient();
    mockClient.clearCallLog();
  });
  
  describe('Query Operations', () => {
    it('should return mocked incident data', async () => {
      const incidents = await mockClient.table('incident').query({
        limit: 5,
        fields: ['number', 'short_description']
      });
      
      expect(incidents).toHaveLength(2);
      expect(incidents[0]).toHaveProperty('number');
      expect(incidents[0]).toHaveProperty('short_description');
      expect(incidents[0]).not.toHaveProperty('state'); // Filtered out
    });
    
    it('should apply query filters', async () => {
      const highPriorityIncidents = await mockClient.table('incident').query({
        query: 'priority=1'
      });
      
      expect(highPriorityIncidents).toHaveLength(1);
      expect(highPriorityIncidents[0].priority).toBe('1');
    });
    
    it('should track API calls', async () => {
      await mockClient.table('incident').query({ limit: 10 });
      await mockClient.table('sys_user').query({ query: 'active=true' });
      
      const callLog = mockClient.getCallLog();
      expect(callLog).toHaveLength(2);
      
      expect(callLog[0].operation).toBe('query');
      expect(callLog[0].table).toBe('incident');
      expect(callLog[1].operation).toBe('query');
      expect(callLog[1].table).toBe('sys_user');
    });
  });
  
  describe('CRUD Operations', () => {
    it('should create new records', async () => {
      const newIncident = await mockClient.table('incident').create({
        short_description: 'Test incident',
        category: 'software'
      });
      
      expect(newIncident).toHaveProperty('sys_id');
      expect(newIncident).toHaveProperty('number');
      expect(newIncident.short_description).toBe('Test incident');
      expect(newIncident.category).toBe('software');
    });
    
    it('should update existing records', async () => {
      const created = await mockClient.table('incident').create({
        short_description: 'Test incident',
        priority: '4'
      });
      
      const updated = await mockClient.table('incident').update(created.sys_id, {
        priority: '1',
        state: '2'
      });
      
      expect(updated.sys_id).toBe(created.sys_id);
      expect(updated.priority).toBe('1');
      expect(updated.state).toBe('2');
    });
    
    it('should delete records', async () => {
      const created = await mockClient.table('incident').create({
        short_description: 'Test incident to delete'
      });
      
      const success = await mockClient.table('incident').delete(created.sys_id);
      expect(success).toBe(true);
      
      // Should not be able to get deleted record
      await expect(mockClient.table('incident').get(created.sys_id))
        .rejects
        .toThrow('Record not found');
    });
  });
  
  describe('GlideRecord Mock', () => {
    it('should support GlideRecord pattern', async () => {
      const gr = mockClient.GlideRecord('incident');
      gr.addQuery('state', '1');
      gr.setLimit(1);
      
      await gr.query();
      
      expect(gr.getRowCount()).toBeGreaterThan(0);
      
      if (gr.next()) {
        expect(gr.getValue('state')).toBe('1');
        expect(gr.getValue('sys_id')).toBeDefined();
      }
    });
    
    it('should support GlideRecord insert/update', async () => {
      const gr = mockClient.GlideRecord('incident');
      
      gr.setValue('short_description', 'GlideRecord test');
      gr.setValue('category', 'software');
      
      const sysId = await gr.insert();
      expect(sysId).toBeDefined();
      
      // Update
      const updateGr = mockClient.GlideRecord('incident');
      if (await updateGr.get(sysId)) {
        updateGr.setValue('priority', '2');
        await updateGr.update();
        
        expect(updateGr.getValue('priority')).toBe('2');
      }
    });
  });
  
  describe('Mock Customization', () => {
    it('should allow custom mock data', () => {
      const customData = [
        {
          sys_id: 'custom1',
          name: 'Custom Record 1',
          value: 100
        },
        {
          sys_id: 'custom2',
          name: 'Custom Record 2',
          value: 200
        }
      ];
      
      mockClient.addMockData('custom_table', customData);
      
      const results = await mockClient.table('custom_table').query();
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Custom Record 1');
    });
    
    it('should provide call history utilities', async () => {
      await mockClient.table('incident').query();
      await mockClient.table('incident').create({ short_description: 'Test' });
      await mockClient.table('sys_user').query();
      
      const incidentCalls = mockClient.getCallsForTable('incident');
      expect(incidentCalls).toHaveLength(2);
      
      const lastCall = mockClient.getLastCall();
      expect(lastCall?.table).toBe('sys_user');
      expect(lastCall?.operation).toBe('query');
    });
  });
});
```

This comprehensive testing guide provides the foundation for reliable testing of ServiceNow integrations using BunSNC. Regular testing ensures code quality and prevents regressions in production environments.