/**
 * Cache Performance Tests - Benchmarking cache operations and policies
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Cache } from '../../utils/Cache';
import { performanceMonitor } from '../../utils/PerformanceMonitor';

describe('Cache Performance Tests', () => {
  let startTime: number;

  beforeEach(() => {
    performanceMonitor.clearMetrics();
    startTime = performance.now();
  });

  afterEach(() => {
    const endTime = performance.now();
    const testDuration = endTime - startTime;
    console.log(`Cache test completed in ${testDuration.toFixed(2)}ms`);
  });

  describe('Basic Operations Performance', () => {
    test('should handle high-frequency set operations', async () => {
      const cache = new Cache({ maxSize: 10000 });
      const operations = 5000;
      
      const timer = 'cache_set_performance';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      for (let i = 0; i < operations; i++) {
        cache.set(`key_${i}`, { data: `value_${i}`, index: i });
      }

      const duration = performanceMonitor.endTimer(timer);
      const opsPerSecond = (operations / duration) * 1000;

      expect(opsPerSecond).toBeGreaterThan(10000); // Should handle 10k+ ops/sec
      console.log(`Set Performance: ${opsPerSecond.toFixed(0)} ops/sec`);

      cache.destroy();
    });

    test('should handle high-frequency get operations', async () => {
      const cache = new Cache({ maxSize: 10000 });
      const operations = 1000;
      
      // Pre-populate cache
      for (let i = 0; i < operations; i++) {
        cache.set(`key_${i}`, { data: `value_${i}`, index: i });
      }

      const timer = 'cache_get_performance';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      let hits = 0;
      for (let i = 0; i < operations * 5; i++) { // 5x more reads than writes
        const key = `key_${i % operations}`;
        const value = cache.get(key);
        if (value) hits++;
      }

      const duration = performanceMonitor.endTimer(timer);
      const opsPerSecond = ((operations * 5) / duration) * 1000;

      expect(hits).toBe(operations * 5); // All should be hits
      expect(opsPerSecond).toBeGreaterThan(50000); // Should handle 50k+ reads/sec
      console.log(`Get Performance: ${opsPerSecond.toFixed(0)} ops/sec`);

      cache.destroy();
    });

    test('should handle mixed read/write workload', async () => {
      const cache = new Cache({ maxSize: 5000 });
      const operations = 2000;
      
      const timer = 'cache_mixed_performance';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      let hits = 0;
      let misses = 0;

      for (let i = 0; i < operations; i++) {
        // 70% reads, 30% writes
        if (Math.random() < 0.7) {
          const key = `key_${Math.floor(Math.random() * operations)}`;
          const value = cache.get(key);
          if (value) hits++;
          else misses++;
        } else {
          cache.set(`key_${i}`, { data: `mixed_value_${i}`, timestamp: Date.now() });
        }
      }

      const duration = performanceMonitor.endTimer(timer);
      const opsPerSecond = (operations / duration) * 1000;

      console.log(`Mixed Workload: ${opsPerSecond.toFixed(0)} ops/sec (${hits} hits, ${misses} misses)`);
      expect(opsPerSecond).toBeGreaterThan(5000);

      cache.destroy();
    });
  });

  describe('Eviction Policy Performance', () => {
    test('should compare LRU vs LFU vs FIFO performance', async () => {
      const policies = ['LRU', 'LFU', 'FIFO'] as const;
      const results: Array<{ policy: string; duration: number; opsPerSecond: number }> = [];
      
      for (const policy of policies) {
        const cache = new Cache({ 
          maxSize: 1000, 
          evictionPolicy: policy 
        });

        const timer = `${policy.toLowerCase()}_eviction_performance`;
        performanceMonitor.startTimer(timer, 'CachePerformanceTest');

        // Generate workload that will trigger evictions
        for (let i = 0; i < 2000; i++) {
          cache.set(`${policy}_key_${i}`, { policy, data: i, large: 'x'.repeat(100) });
          
          // Simulate access patterns
          if (policy === 'LRU' && i % 10 === 0) {
            cache.get(`${policy}_key_${i - 5}`); // Recent access
          } else if (policy === 'LFU' && i % 5 === 0) {
            cache.get(`${policy}_key_${Math.floor(i / 2)}`); // Frequent access
          }
        }

        const duration = performanceMonitor.endTimer(timer);
        const opsPerSecond = (2000 / duration) * 1000;
        
        results.push({ policy, duration, opsPerSecond });
        
        expect(cache.size()).toBeLessThanOrEqual(1000);
        cache.destroy();
      }

      console.log('Eviction Policy Performance:');
      results.forEach(result => {
        console.log(`  ${result.policy}: ${result.opsPerSecond.toFixed(0)} ops/sec`);
      });

      // All policies should handle reasonable throughput
      results.forEach(result => {
        expect(result.opsPerSecond).toBeGreaterThan(1000);
      });
    });

    test('should measure eviction overhead', async () => {
      const cache = new Cache({ 
        maxSize: 100,
        evictionPolicy: 'LRU'
      });

      // Fill cache to capacity
      for (let i = 0; i < 100; i++) {
        cache.set(`initial_${i}`, { data: i });
      }

      const timer = 'eviction_overhead_test';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      // Trigger evictions
      for (let i = 0; i < 200; i++) {
        cache.set(`eviction_${i}`, { data: i, timestamp: Date.now() });
      }

      const duration = performanceMonitor.endTimer(timer);
      const opsPerSecond = (200 / duration) * 1000;

      console.log(`Eviction Overhead: ${opsPerSecond.toFixed(0)} ops/sec with constant eviction`);
      expect(opsPerSecond).toBeGreaterThan(500); // Should handle evictions efficiently

      cache.destroy();
    });
  });

  describe('Memory Performance', () => {
    test('should handle large values efficiently', async () => {
      const cache = new Cache({ 
        maxSize: 1000,
        maxMemory: 50 * 1024 * 1024 // 50MB limit
      });

      const initialMemory = process.memoryUsage().heapUsed;
      
      const timer = 'large_values_performance';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      // Store increasingly large values
      for (let i = 0; i < 100; i++) {
        const largeData = {
          id: i,
          data: 'x'.repeat(1000 * (i + 1)), // Increasing size
          array: new Array(100).fill(i),
          nested: { level1: { level2: { data: i } } }
        };
        
        cache.set(`large_${i}`, largeData);
      }

      const duration = performanceMonitor.endTimer(timer);
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Large Values: ${(100 / duration * 1000).toFixed(0)} ops/sec`);
      console.log(`Memory Usage: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Should not exceed 100MB

      cache.destroy();
    });

    test('should handle memory pressure gracefully', async () => {
      const cache = new Cache({ 
        maxSize: 5000,
        maxMemory: 10 * 1024 * 1024 // 10MB limit
      });

      const timer = 'memory_pressure_test';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      let successful = 0;
      let evictions = 0;

      for (let i = 0; i < 1000; i++) {
        const sizeBefore = cache.size();
        
        cache.set(`pressure_${i}`, {
          data: 'x'.repeat(10000), // 10KB each
          id: i,
          metadata: { created: Date.now(), index: i }
        });
        
        const sizeAfter = cache.size();
        
        if (sizeAfter > sizeBefore) {
          successful++;
        } else {
          evictions++;
        }
      }

      const duration = performanceMonitor.endTimer(timer);
      const stats = cache.getStats();

      console.log(`Memory Pressure: ${(1000 / duration * 1000).toFixed(0)} ops/sec`);
      console.log(`Successful: ${successful}, Evictions: ${evictions}`);
      console.log(`Cache Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);

      expect(stats.evictions).toBeGreaterThan(0); // Should have triggered evictions
      expect(duration).toBeLessThan(2000); // Should handle memory pressure efficiently

      cache.destroy();
    });
  });

  describe('Concurrent Access Performance', () => {
    test('should handle concurrent reads efficiently', async () => {
      const cache = new Cache({ maxSize: 1000 });
      
      // Pre-populate
      for (let i = 0; i < 500; i++) {
        cache.set(`concurrent_${i}`, { data: i, timestamp: Date.now() });
      }

      const timer = 'concurrent_reads_test';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      // Simulate concurrent reads
      const promises = Array.from({ length: 10 }, async (_, threadId) => {
        let hits = 0;
        for (let i = 0; i < 100; i++) {
          const key = `concurrent_${Math.floor(Math.random() * 500)}`;
          const value = cache.get(key);
          if (value) hits++;
        }
        return hits;
      });

      const results = await Promise.all(promises);
      const duration = performanceMonitor.endTimer(timer);

      const totalReads = results.reduce((sum, hits) => sum + 100, 0);
      const totalHits = results.reduce((sum, hits) => sum + hits, 0);
      const opsPerSecond = (totalReads / duration) * 1000;

      console.log(`Concurrent Reads: ${opsPerSecond.toFixed(0)} ops/sec`);
      console.log(`Hit Rate: ${(totalHits / totalReads * 100).toFixed(1)}%`);

      expect(opsPerSecond).toBeGreaterThan(10000); // Should handle concurrent access well

      cache.destroy();
    });

    test('should handle mixed concurrent operations', async () => {
      const cache = new Cache({ maxSize: 2000 });

      const timer = 'concurrent_mixed_test';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      // Simulate multiple concurrent workloads
      const promises = [
        // Heavy reader
        (async () => {
          for (let i = 0; i < 500; i++) {
            cache.get(`mixed_${Math.floor(Math.random() * 1000)}`);
          }
        })(),
        
        // Writer
        (async () => {
          for (let i = 0; i < 200; i++) {
            cache.set(`writer_${i}`, { writer: true, data: i });
          }
        })(),
        
        // Mixed workload
        (async () => {
          for (let i = 0; i < 300; i++) {
            if (Math.random() < 0.7) {
              cache.get(`mixed_${Math.floor(Math.random() * 500)}`);
            } else {
              cache.set(`mixed_${i}`, { mixed: true, value: i });
            }
          }
        })()
      ];

      await Promise.all(promises);
      const duration = performanceMonitor.endTimer(timer);

      const stats = cache.getStats();
      console.log(`Mixed Concurrent: ${(1000 / duration * 1000).toFixed(0)} ops/sec`);
      console.log(`Final Cache Size: ${stats.size}`);
      console.log(`Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);

      expect(duration).toBeLessThan(1000); // Should handle mixed concurrent load efficiently

      cache.destroy();
    });
  });

  describe('ServiceNow Specific Performance', () => {
    test('should handle ServiceNow record caching efficiently', async () => {
      const cache = new Cache({ maxSize: 1000 });

      const timer = 'servicenow_caching_test';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      // Simulate ServiceNow record operations
      for (let i = 0; i < 500; i++) {
        const record = {
          sys_id: `record_${i}`,
          number: `INC${String(i).padStart(7, '0')}`,
          state: String((i % 7) + 1),
          priority: String((i % 5) + 1),
          short_description: `Test incident ${i}`,
          sys_created_on: new Date().toISOString(),
          sys_updated_on: new Date().toISOString()
        };

        // Cache record
        cache.cacheRecord('incident', record.sys_id, record);
        
        // Cache query results occasionally
        if (i % 50 === 0) {
          cache.cacheQuery('incident', `state=${record.state}`, [record]);
        }
      }

      // Simulate typical access patterns
      let recordHits = 0;
      let queryHits = 0;

      for (let i = 0; i < 200; i++) {
        const recordResult = cache.getCachedRecord('incident', `record_${Math.floor(Math.random() * 500)}`);
        if (recordResult) recordHits++;

        if (i % 10 === 0) {
          const state = String((Math.floor(Math.random() * 7)) + 1);
          const queryResult = cache.getCachedQuery('incident', `state=${state}`);
          if (queryResult) queryHits++;
        }
      }

      const duration = performanceMonitor.endTimer(timer);
      const opsPerSecond = (700 / duration) * 1000; // 500 stores + 200 retrievals

      console.log(`ServiceNow Caching: ${opsPerSecond.toFixed(0)} ops/sec`);
      console.log(`Record Hit Rate: ${(recordHits / 200 * 100).toFixed(1)}%`);
      console.log(`Query Hit Rate: ${(queryHits / 20 * 100).toFixed(1)}%`);

      expect(opsPerSecond).toBeGreaterThan(2000); // Should handle ServiceNow patterns efficiently

      cache.destroy();
    });

    test('should handle attachment caching performance', async () => {
      const cache = new Cache({ 
        maxSize: 200,
        maxMemory: 20 * 1024 * 1024 // 20MB for attachments
      });

      const timer = 'attachment_caching_test';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      // Simulate attachment caching
      for (let i = 0; i < 100; i++) {
        const attachmentContent = Buffer.alloc(10000, `attachment_${i}`); // 10KB each
        cache.cacheAttachment(`attachment_${i}`, attachmentContent);
      }

      // Simulate attachment retrieval patterns
      let hits = 0;
      for (let i = 0; i < 200; i++) {
        const attachmentId = `attachment_${Math.floor(Math.random() * 100)}`;
        const cached = cache.getCachedAttachment(attachmentId);
        if (cached) hits++;
      }

      const duration = performanceMonitor.endTimer(timer);
      const opsPerSecond = (300 / duration) * 1000; // 100 stores + 200 retrievals

      console.log(`Attachment Caching: ${opsPerSecond.toFixed(0)} ops/sec`);
      console.log(`Attachment Hit Rate: ${(hits / 200 * 100).toFixed(1)}%`);

      expect(opsPerSecond).toBeGreaterThan(1000); // Should handle large binary data efficiently

      cache.destroy();
    });
  });

  describe('Cache Cleanup Performance', () => {
    test('should handle TTL cleanup efficiently', async () => {
      const cache = new Cache({ 
        cleanupInterval: 100, // 100ms cleanup interval
        defaultTTL: 200 // 200ms TTL
      });

      const timer = 'ttl_cleanup_test';
      performanceMonitor.startTimer(timer, 'CachePerformanceTest');

      // Add entries with various TTLs
      for (let i = 0; i < 300; i++) {
        const ttl = 50 + (i % 5) * 50; // 50ms to 250ms TTL
        cache.set(`ttl_${i}`, { data: i }, ttl);
      }

      // Wait for some entries to expire and cleanup to run
      await new Promise(resolve => setTimeout(resolve, 300));

      const duration = performanceMonitor.endTimer(timer);
      const remainingSize = cache.size();

      console.log(`TTL Cleanup: ${duration.toFixed(2)}ms total time`);
      console.log(`Remaining entries: ${remainingSize}/300`);

      expect(remainingSize).toBeLessThan(300); // Some should have expired
      expect(duration).toBeLessThan(500); // Cleanup should be fast

      cache.destroy();
    });
  });
});