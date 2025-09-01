/**
 * Cache Tests - Comprehensive test suite for caching system
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Cache, CacheConfig } from '../../utils/Cache';
import type { ServiceNowRecord } from '../../types/servicenow';

describe('Cache', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache();
    cache.clear();
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Basic Cache Operations', () => {
    test('should set and get values', () => {
      const key = 'test-key';
      const value = { id: '123', name: 'test' };
      
      const result = cache.set(key, value);
      expect(result).toBe(true);
      
      const retrieved = cache.get(key);
      expect(retrieved).toEqual(value);
    });

    test('should return null for non-existent keys', () => {
      const result = cache.get('non-existent-key');
      expect(result).toBeNull();
    });

    test('should check if key exists', () => {
      cache.set('existing-key', 'value');
      
      expect(cache.has('existing-key')).toBe(true);
      expect(cache.has('non-existent-key')).toBe(false);
    });

    test('should delete keys', () => {
      cache.set('delete-key', 'value');
      expect(cache.has('delete-key')).toBe(true);
      
      const deleted = cache.delete('delete-key');
      expect(deleted).toBe(true);
      expect(cache.has('delete-key')).toBe(false);
    });

    test('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      expect(cache.size()).toBe(3);
      
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('TTL (Time To Live)', () => {
    test('should expire entries after TTL', async () => {
      const shortTTL = 50; // 50ms
      cache.set('expire-key', 'value', shortTTL);
      
      // Should exist immediately
      expect(cache.get('expire-key')).toBe('value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should be expired
      expect(cache.get('expire-key')).toBeNull();
      expect(cache.has('expire-key')).toBe(false);
    });

    test('should use default TTL when not specified', () => {
      cache.set('default-ttl-key', 'value');
      
      // Should exist (default TTL is 5 minutes)
      expect(cache.get('default-ttl-key')).toBe('value');
    });

    test('should update access time on get', () => {
      cache.set('access-key', 'value');
      
      const initialAccess = cache.get('access-key');
      expect(initialAccess).toBe('value');
      
      // Get again to update access time
      const secondAccess = cache.get('access-key');
      expect(secondAccess).toBe('value');
    });
  });

  describe('Size Management', () => {
    test('should calculate entry sizes correctly', () => {
      // String
      cache.set('string-key', 'hello');
      
      // Number
      cache.set('number-key', 12345);
      
      // Boolean
      cache.set('boolean-key', true);
      
      // Object
      cache.set('object-key', { name: 'test', value: 123 });
      
      // Buffer
      const buffer = Buffer.from('test buffer');
      cache.set('buffer-key', buffer);
      
      expect(cache.size()).toBe(5);
    });

    test('should track memory usage', () => {
      cache.set('memory-key', { data: 'x'.repeat(1000) });
      
      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Eviction Policies', () => {
    test('should evict with LRU policy', () => {
      const lruCache = new Cache({
        maxSize: 3,
        evictionPolicy: 'LRU'
      });
      
      lruCache.set('key1', 'value1');
      lruCache.set('key2', 'value2');
      lruCache.set('key3', 'value3');
      
      // Access key1 to make it most recently used
      lruCache.get('key1');
      
      // Add key4, should evict key2 (least recently used)
      lruCache.set('key4', 'value4');
      
      expect(lruCache.has('key1')).toBe(true); // Most recently used
      expect(lruCache.has('key2')).toBe(false); // Should be evicted
      expect(lruCache.has('key3')).toBe(true);
      expect(lruCache.has('key4')).toBe(true);
      
      lruCache.destroy();
    });

    test('should evict with LFU policy', () => {
      const lfuCache = new Cache({
        maxSize: 3,
        evictionPolicy: 'LFU'
      });
      
      lfuCache.set('key1', 'value1');
      lfuCache.set('key2', 'value2');
      lfuCache.set('key3', 'value3');
      
      // Access key1 multiple times to increase frequency
      lfuCache.get('key1');
      lfuCache.get('key1');
      lfuCache.get('key1');
      
      // Access key3 once
      lfuCache.get('key3');
      
      // Add key4, should evict key2 (least frequently used)
      lfuCache.set('key4', 'value4');
      
      expect(lfuCache.has('key1')).toBe(true); // Most frequently used
      expect(lfuCache.has('key2')).toBe(false); // Should be evicted
      expect(lfuCache.has('key3')).toBe(true);
      expect(lfuCache.has('key4')).toBe(true);
      
      lfuCache.destroy();
    });

    test('should evict with FIFO policy', () => {
      const fifoCache = new Cache({
        maxSize: 3,
        evictionPolicy: 'FIFO'
      });
      
      fifoCache.set('key1', 'value1');
      fifoCache.set('key2', 'value2');
      fifoCache.set('key3', 'value3');
      
      // Add key4, should evict key1 (first in)
      fifoCache.set('key4', 'value4');
      
      expect(fifoCache.has('key1')).toBe(false); // Should be evicted
      expect(fifoCache.has('key2')).toBe(true);
      expect(fifoCache.has('key3')).toBe(true);
      expect(fifoCache.has('key4')).toBe(true);
      
      fifoCache.destroy();
    });
  });

  describe('ServiceNow Specific Caching', () => {
    test('should cache and retrieve records', () => {
      const record: ServiceNowRecord = {
        sys_id: '12345',
        name: 'Test Record',
        state: 'Active'
      };
      
      cache.cacheRecord('incident', '12345', record);
      
      const retrieved = cache.getCachedRecord('incident', '12345');
      expect(retrieved).toEqual(record);
    });

    test('should cache and retrieve query results', () => {
      const results: ServiceNowRecord[] = [
        { sys_id: '1', name: 'Record 1' },
        { sys_id: '2', name: 'Record 2' }
      ];
      
      const query = 'state=Active';
      cache.cacheQuery('incident', query, results);
      
      const retrieved = cache.getCachedQuery('incident', query);
      expect(retrieved).toEqual(results);
    });

    test('should cache attachments', () => {
      const content = Buffer.from('test file content');
      const sysId = 'attachment123';
      
      cache.cacheAttachment(sysId, content);
      
      const retrieved = cache.getCachedAttachment(sysId);
      expect(retrieved).toEqual(content);
    });

    test('should invalidate specific record', () => {
      const record: ServiceNowRecord = {
        sys_id: '12345',
        name: 'Test Record'
      };
      
      cache.cacheRecord('incident', '12345', record);
      cache.cacheQuery('incident', 'state=Active', [record]);
      
      expect(cache.getCachedRecord('incident', '12345')).toEqual(record);
      
      cache.invalidateRecord('incident', '12345');
      
      expect(cache.getCachedRecord('incident', '12345')).toBeNull();
    });

    test('should invalidate entire table', () => {
      const record1: ServiceNowRecord = { sys_id: '1', name: 'Record 1' };
      const record2: ServiceNowRecord = { sys_id: '2', name: 'Record 2' };
      
      cache.cacheRecord('incident', '1', record1);
      cache.cacheRecord('incident', '2', record2);
      cache.cacheRecord('problem', '3', { sys_id: '3', name: 'Problem 1' });
      cache.cacheQuery('incident', 'state=Active', [record1, record2]);
      
      cache.invalidateTable('incident');
      
      expect(cache.getCachedRecord('incident', '1')).toBeNull();
      expect(cache.getCachedRecord('incident', '2')).toBeNull();
      expect(cache.getCachedRecord('problem', '3')).toBeTruthy(); // Should not be affected
      expect(cache.getCachedQuery('incident', 'state=Active')).toBeNull();
    });

    test('should hash query strings consistently', () => {
      const query1 = 'state=Active^priority=1';
      const query2 = 'state=Active^priority=1';
      const query3 = 'state=Active^priority=2';
      
      const results1 = [{ sys_id: '1', name: 'Record 1' }];
      const results2 = [{ sys_id: '2', name: 'Record 2' }];
      
      cache.cacheQuery('incident', query1, results1);
      cache.cacheQuery('incident', query3, results2);
      
      // Same query should return same results
      expect(cache.getCachedQuery('incident', query2)).toEqual(results1);
      
      // Different query should return different results
      expect(cache.getCachedQuery('incident', query3)).toEqual(results2);
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should track cache statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // Generate hits and misses
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('non-existent'); // miss
      cache.get('key2'); // hit
      cache.get('another-miss'); // miss
      
      const stats = cache.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.totalHits).toBe(3);
      expect(stats.totalMisses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(0.6);
      expect(stats.missRate).toBeCloseTo(0.4);
    });

    test('should track evictions', () => {
      const smallCache = new Cache({ maxSize: 2 });
      
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3'); // Should trigger eviction
      
      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
      
      smallCache.destroy();
    });

    test('should provide keys and values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      const keys = cache.keys();
      const values = cache.values();
      
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys).toHaveLength(3);
      
      expect(values).toContain('value1');
      expect(values).toContain('value2');
      expect(values).toContain('value3');
      expect(values).toHaveLength(3);
    });
  });

  describe('Cleanup and Memory Management', () => {
    test('should cleanup expired entries automatically', async () => {
      const cleanupCache = new Cache({
        cleanupInterval: 100, // 100ms cleanup interval
        defaultTTL: 50 // 50ms TTL
      });
      
      cleanupCache.set('expire1', 'value1');
      cleanupCache.set('expire2', 'value2');
      
      expect(cleanupCache.size()).toBe(2);
      
      // Wait for expiration and cleanup
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(cleanupCache.size()).toBe(0);
      
      cleanupCache.destroy();
    });

    test('should handle memory pressure', () => {
      const memoryCache = new Cache({
        maxMemory: 1024, // 1KB limit
        maxSize: 1000
      });
      
      // Add large entries until memory limit is reached
      for (let i = 0; i < 10; i++) {
        const largeValue = 'x'.repeat(200); // ~200 bytes each
        memoryCache.set(`large-key-${i}`, largeValue);
      }
      
      // Should have triggered eviction due to memory pressure
      const stats = memoryCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
      
      memoryCache.destroy();
    });

    test('should destroy cache cleanly', () => {
      cache.set('cleanup-key1', 'value1');
      cache.set('cleanup-key2', 'value2');
      
      expect(cache.size()).toBe(2);
      
      cache.destroy();
      
      expect(cache.size()).toBe(0);
    });
  });

  describe('Configuration Options', () => {
    test('should apply custom configuration', () => {
      const config: Partial<CacheConfig> = {
        maxSize: 100,
        defaultTTL: 60000,
        evictionPolicy: 'LFU',
        compressionEnabled: true,
        maxMemory: 50 * 1024 * 1024
      };
      
      const customCache = new Cache(config);
      
      const stats = customCache.getStats();
      expect(stats.maxSize).toBe(100);
      
      customCache.destroy();
    });

    test('should use default configuration when not provided', () => {
      const defaultCache = new Cache();
      
      const stats = defaultCache.getStats();
      expect(stats.maxSize).toBe(10000); // Default max size
      
      defaultCache.destroy();
    });
  });

  describe('Error Handling', () => {
    test('should handle setting null values gracefully', () => {
      expect(() => {
        cache.set('null-key', null);
      }).not.toThrow();
      
      const retrieved = cache.get('null-key');
      expect(retrieved).toBeNull();
    });

    test('should handle undefined values gracefully', () => {
      expect(() => {
        cache.set('undefined-key', undefined);
      }).not.toThrow();
      
      const retrieved = cache.get('undefined-key');
      expect(retrieved).toBeUndefined();
    });

    test('should handle circular references in objects', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      expect(() => {
        cache.set('circular-key', circular);
      }).not.toThrow();
      
      const retrieved = cache.get('circular-key');
      expect(retrieved).toBeTruthy();
    });

    test('should handle very large objects gracefully', () => {
      const largeObject = {
        data: 'x'.repeat(1000000) // 1MB string
      };
      
      expect(() => {
        cache.set('large-key', largeObject);
      }).not.toThrow();
    });
  });
});