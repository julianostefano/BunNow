/**
 * Cache - Intelligent caching system for BunSNC
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { logger } from "./Logger";
import type { ServiceNowRecord } from "../types/servicenow";

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  metadata?: Record<string, any>;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  evictions: number;
  memoryUsage: number;
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  maxMemory: number;
  evictionPolicy: "LRU" | "LFU" | "FIFO";
  compressionEnabled: boolean;
  persistToDisk: boolean;
  diskPath?: string;
  cleanupInterval: number;
}

export class Cache {
  private entries = new Map<string, CacheEntry>();
  private config: CacheConfig;
  private stats = {
    totalHits: 0,
    totalMisses: 0,
    evictions: 0,
  };
  private cleanupTimer?: number;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 10000,
      defaultTTL: 300000, // 5 minutes
      maxMemory: 100 * 1024 * 1024, // 100MB
      evictionPolicy: "LRU",
      compressionEnabled: false,
      persistToDisk: false,
      cleanupInterval: 60000, // 1 minute
      ...config,
    };

    this.startCleanupTimer();
    logger.debug("Cache initialized", "Cache", { config: this.config });
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    try {
      const entry: CacheEntry<T> = {
        key,
        value,
        timestamp: Date.now(),
        ttl: ttl || this.config.defaultTTL,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: this.calculateSize(value),
      };

      // Check if we need to evict entries
      if (this.shouldEvict(entry)) {
        this.evict();
      }

      this.entries.set(key, entry);

      logger.debug(`Cache set: ${key}`, "Cache", {
        size: entry.size,
        ttl: entry.ttl,
        totalEntries: this.entries.size,
      });

      return true;
    } catch (error: unknown) {
      logger.error("Cache set failed", error, "Cache", { key });
      return false;
    }
  }

  get<T>(key: string): T | null {
    const entry = this.entries.get(key);

    if (!entry) {
      this.stats.totalMisses++;
      logger.debug(`Cache miss: ${key}`, "Cache");
      return null;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      this.stats.totalMisses++;
      logger.debug(`Cache expired: ${key}`, "Cache");
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.totalHits++;

    logger.debug(`Cache hit: ${key}`, "Cache", {
      accessCount: entry.accessCount,
      age: Date.now() - entry.timestamp,
    });

    return entry.value as T;
  }

  has(key: string): boolean {
    const entry = this.entries.get(key);

    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const deleted = this.entries.delete(key);

    if (deleted) {
      logger.debug(`Cache delete: ${key}`, "Cache");
    }

    return deleted;
  }

  clear(): void {
    const size = this.entries.size;
    this.entries.clear();
    this.stats = {
      totalHits: 0,
      totalMisses: 0,
      evictions: 0,
    };

    logger.info(`Cache cleared: ${size} entries removed`, "Cache");
  }

  size(): number {
    return this.entries.size;
  }

  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  values<T>(): T[] {
    return Array.from(this.entries.values()).map((entry) => entry.value as T);
  }

  getStats(): CacheStats {
    const totalRequests = this.stats.totalHits + this.stats.totalMisses;
    const memoryUsage = Array.from(this.entries.values()).reduce(
      (sum, entry) => sum + entry.size,
      0,
    );

    return {
      size: this.entries.size,
      maxSize: this.config.maxSize,
      hitRate: totalRequests > 0 ? this.stats.totalHits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.totalMisses / totalRequests : 0,
      totalHits: this.stats.totalHits,
      totalMisses: this.stats.totalMisses,
      evictions: this.stats.evictions,
      memoryUsage,
    };
  }

  // Cache patterns for ServiceNow operations
  cacheRecord(
    table: string,
    sysId: string,
    record: ServiceNowRecord,
    ttl?: number,
  ): void {
    const key = `record:${table}:${sysId}`;
    this.set(key, record, ttl);
  }

  getCachedRecord(table: string, sysId: string): ServiceNowRecord | null {
    const key = `record:${table}:${sysId}`;
    return this.get<ServiceNowRecord>(key);
  }

  cacheQuery(
    table: string,
    query: string,
    results: ServiceNowRecord[],
    ttl?: number,
  ): void {
    const key = `query:${table}:${this.hashString(query)}`;
    this.set(key, results, ttl || 60000); // Shorter TTL for queries
  }

  getCachedQuery(table: string, query: string): ServiceNowRecord[] | null {
    const key = `query:${table}:${this.hashString(query)}`;
    return this.get<ServiceNowRecord[]>(key);
  }

  cacheAttachment(sysId: string, content: Buffer | Blob, ttl?: number): void {
    const key = `attachment:${sysId}`;
    this.set(key, content, ttl || 600000); // 10 minutes for attachments
  }

  getCachedAttachment(sysId: string): Buffer | Blob | null {
    const key = `attachment:${sysId}`;
    return this.get<Buffer | Blob>(key);
  }

  invalidateRecord(table: string, sysId: string): void {
    const key = `record:${table}:${sysId}`;
    this.delete(key);

    // Also invalidate any queries that might include this record
    this.invalidateQueriesByTable(table);
  }

  invalidateTable(table: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.entries.keys()) {
      if (
        key.startsWith(`record:${table}:`) ||
        key.startsWith(`query:${table}:`)
      ) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.delete(key));
    logger.info(
      `Invalidated ${keysToDelete.length} entries for table: ${table}`,
      "Cache",
    );
  }

  private invalidateQueriesByTable(table: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.entries.keys()) {
      if (key.startsWith(`query:${table}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.delete(key));
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private shouldEvict(newEntry: CacheEntry): boolean {
    if (this.entries.size >= this.config.maxSize) {
      return true;
    }

    const currentMemory = Array.from(this.entries.values()).reduce(
      (sum, entry) => sum + entry.size,
      0,
    );

    if (currentMemory + newEntry.size > this.config.maxMemory) {
      return true;
    }

    return false;
  }

  private evict(): void {
    if (this.entries.size === 0) {
      return;
    }

    let keyToEvict: string;

    switch (this.config.evictionPolicy) {
      case "LRU":
        keyToEvict = this.findLRUKey();
        break;
      case "LFU":
        keyToEvict = this.findLFUKey();
        break;
      case "FIFO":
        keyToEvict = this.findFIFOKey();
        break;
      default:
        keyToEvict = this.entries.keys().next().value;
    }

    this.entries.delete(keyToEvict);
    this.stats.evictions++;

    logger.debug(`Cache evicted: ${keyToEvict}`, "Cache", {
      policy: this.config.evictionPolicy,
      totalEvictions: this.stats.evictions,
    });
  }

  private findLRUKey(): string {
    let oldestTime = Date.now();
    let lruKey = "";

    for (const [key, entry] of this.entries) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    return lruKey;
  }

  private findLFUKey(): string {
    let minAccess = Infinity;
    let lfuKey = "";

    for (const [key, entry] of this.entries) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount;
        lfuKey = key;
      }
    }

    return lfuKey;
  }

  private findFIFOKey(): string {
    let oldestTime = Date.now();
    let fifoKey = "";

    for (const [key, entry] of this.entries) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        fifoKey = key;
      }
    }

    return fifoKey;
  }

  private calculateSize(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === "string") {
      return value.length * 2; // UTF-16
    }

    if (typeof value === "number") {
      return 8;
    }

    if (typeof value === "boolean") {
      return 4;
    }

    if (value instanceof Buffer) {
      return value.length;
    }

    if (value instanceof Blob) {
      return value.size;
    }

    // Approximate size for objects
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1000; // Default estimate
    }
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval) as any;
  }

  private cleanup(): void {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.entries) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.entries.delete(key));

    if (keysToDelete.length > 0) {
      logger.debug(
        `Cache cleanup: removed ${keysToDelete.length} expired entries`,
        "Cache",
      );
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
    logger.debug("Cache destroyed", "Cache");
  }
}

// Global cache instance
export const cache = new Cache();
export default cache;
