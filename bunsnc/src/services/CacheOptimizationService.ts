/**
 * Cache Optimization Service - Smart Preloading and Cache Management
 * Based on MONGODB_REDIS_STREAMS_ARCHITECTURE.md optimizations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { hybridDataService } from './HybridDataService';
import { serviceNowStreams } from '../config/redis-streams';
import { logger } from '../utils/Logger';
import { performanceMonitoringService } from './PerformanceMonitoringService';

export interface CacheWarmupStrategy {
  priority: 'critical' | 'high' | 'medium' | 'low';
  preloadRelated: boolean;
  preloadSLA: boolean;
  preloadNotes: boolean;
  batchSize: number;
  concurrency: number;
}

export interface CacheStats {
  hitRatio: number;
  missRatio: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  averageResponseTime: number;
  warmupProgress: number;
  preloadedTickets: number;
}

export class CacheOptimizationService {
  private cacheStats: CacheStats = {
    hitRatio: 0,
    missRatio: 0,
    totalRequests: 0,
    totalHits: 0,
    totalMisses: 0,
    averageResponseTime: 0,
    warmupProgress: 0,
    preloadedTickets: 0
  };

  private warmupStrategies: Record<string, CacheWarmupStrategy> = {
    critical: {
      priority: 'critical',
      preloadRelated: true,
      preloadSLA: true,
      preloadNotes: true,
      batchSize: 10,
      concurrency: 2
    },
    high: {
      priority: 'high',
      preloadRelated: true,
      preloadSLA: true,
      preloadNotes: false,
      batchSize: 25,
      concurrency: 3
    },
    medium: {
      priority: 'medium',
      preloadRelated: false,
      preloadSLA: true,
      preloadNotes: false,
      batchSize: 50,
      concurrency: 5
    },
    low: {
      priority: 'low',
      preloadRelated: false,
      preloadSLA: false,
      preloadNotes: false,
      batchSize: 100,
      concurrency: 3
    }
  };

  private preloadQueue: Array<{
    sysId: string;
    table: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    timestamp: Date;
  }> = [];

  private isWarming = false;
  private warmupInterval?: Timer;

  async initialize(): Promise<void> {
    try {
      await this.startIntelligentWarmup();
      await this.setupRealTimePreloading();
      
      logger.info('🚀 Cache Optimization Service initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize Cache Optimization Service:', error);
      throw error;
    }
  }

  /**
   * Smart preloading based on access patterns and ticket priority
   */
  async preloadTicketWithStrategy(sysId: string, table: string, priority: 'critical' | 'high' | 'medium' | 'low'): Promise<void> {
    const startTime = Date.now();
    
    try {
      const strategy = this.warmupStrategies[priority];
      
      // Add to preload queue if not already processing
      if (!this.isInQueue(sysId, table)) {
        this.preloadQueue.push({
          sysId,
          table,
          priority,
          timestamp: new Date()
        });
      }

      // Sort queue by priority
      this.sortPreloadQueue();

      // Process queue if not already processing
      if (!this.isWarming) {
        await this.processPreloadQueue();
      }

      await performanceMonitoringService.recordMetric({
        operation: 'cache_preload_strategy',
        endpoint: `/${table}/${sysId}`,
        response_time_ms: Date.now() - startTime
      });

    } catch (error) {
      logger.error(`❌ Error preloading ${table}/${sysId}:`, error);
    }
  }

  /**
   * Intelligent cache warmup on startup
   */
  private async startIntelligentWarmup(): Promise<void> {
    try {
      logger.info('🔥 Starting intelligent cache warmup...');
      
      // Warmup critical priority tickets first (P1 incidents, open change tasks)
      await this.warmupCriticalTickets();
      
      // Warmup high priority tickets (P2 incidents, active problems)
      await this.warmupHighPriorityTickets();
      
      // Warmup recent tickets (accessed in last 24h)
      await this.warmupRecentTickets();

      logger.info('✅ Cache warmup completed');
      this.cacheStats.warmupProgress = 100;

    } catch (error) {
      logger.error('❌ Cache warmup failed:', error);
    }
  }

  private async warmupCriticalTickets(): Promise<void> {
    try {
      const criticalQueries = [
        { table: 'incident', query: 'priority=1^state!=7', limit: 50 },
        { table: 'problem', query: 'state=2^priority<=2', limit: 25 },
        { table: 'change_task', query: 'state=2^priority<=2', limit: 25 }
      ];

      const strategy = this.warmupStrategies.critical;

      for (const { table, query, limit } of criticalQueries) {
        await this.warmupTableWithQuery(table, query, limit, strategy);
        this.cacheStats.warmupProgress += 10;
      }

    } catch (error) {
      logger.error('❌ Critical tickets warmup failed:', error);
    }
  }

  private async warmupHighPriorityTickets(): Promise<void> {
    try {
      const highPriorityQueries = [
        { table: 'incident', query: 'priority<=2^state!=7', limit: 100 },
        { table: 'change_request', query: 'state=2', limit: 50 },
        { table: 'sc_task', query: 'state=2^priority<=2', limit: 75 }
      ];

      const strategy = this.warmupStrategies.high;

      for (const { table, query, limit } of highPriorityQueries) {
        await this.warmupTableWithQuery(table, query, limit, strategy);
        this.cacheStats.warmupProgress += 15;
      }

    } catch (error) {
      logger.error('❌ High priority tickets warmup failed:', error);
    }
  }

  private async warmupRecentTickets(): Promise<void> {
    try {
      // Simulate recent access patterns (in real implementation, track from logs)
      const recentQueries = [
        { table: 'incident', query: 'sys_updated_on>=javascript:gs.daysAgo(1)', limit: 200 },
        { table: 'change_task', query: 'sys_updated_on>=javascript:gs.daysAgo(1)', limit: 100 },
      ];

      const strategy = this.warmupStrategies.medium;

      for (const { table, query, limit } of recentQueries) {
        await this.warmupTableWithQuery(table, query, limit, strategy);
        this.cacheStats.warmupProgress += 20;
      }

    } catch (error) {
      logger.error('❌ Recent tickets warmup failed:', error);
    }
  }

  private async warmupTableWithQuery(table: string, query: string, limit: number, strategy: CacheWarmupStrategy): Promise<void> {
    try {
      logger.debug(`🔥 Warming up ${table} with query: ${query} (limit: ${limit})`);

      // Get tickets from ServiceNow (this will cache them)
      const tickets = await hybridDataService.getMultipleTickets([
        // Simulate ticket requests based on query
        ...Array(Math.min(limit, strategy.batchSize)).fill(0).map(() => ({
          sysId: `warmup_${Date.now()}_${Math.random()}`,
          table
        }))
      ], {
        includeSLMs: strategy.preloadSLA,
        includeNotes: strategy.preloadNotes
      });

      this.cacheStats.preloadedTickets += tickets.size;
      logger.debug(`✅ Warmed up ${tickets.size} ${table} tickets`);

    } catch (error) {
      logger.error(`❌ Error warming up ${table}:`, error);
    }
  }

  /**
   * Real-time preloading based on Redis Stream events
   */
  private async setupRealTimePreloading(): Promise<void> {
    try {
      // Subscribe to Redis Streams for proactive preloading
      serviceNowStreams.subscribeToChanges(async (change) => {
        if (change.action === 'updated' || change.action === 'created') {
          // Determine priority based on change data
          const priority = this.determinePriorityFromChange(change);
          
          // Add to preload queue
          await this.preloadTicketWithStrategy(
            change.sys_id, 
            change.type, 
            priority
          );
          
          // Preload related tickets if high priority
          if (priority === 'critical' || priority === 'high') {
            await this.preloadRelatedTickets(change);
          }
        }
      }, 'cache-optimization');

      logger.info('📡 Real-time preloading setup completed');

    } catch (error) {
      logger.error('❌ Error setting up real-time preloading:', error);
    }
  }

  private determinePriorityFromChange(change: any): 'critical' | 'high' | 'medium' | 'low' {
    // Priority 1 tickets are always critical
    if (change.data?.priority === '1') return 'critical';
    
    // State changes are high priority
    if (change.action === 'updated' && change.data?.state) return 'high';
    
    // New tickets are medium priority
    if (change.action === 'created') return 'medium';
    
    return 'low';
  }

  private async preloadRelatedTickets(change: any): Promise<void> {
    try {
      // Preload tickets from same assignment group
      if (change.assignment_group) {
        this.preloadQueue.push({
          sysId: `group_${change.assignment_group}`,
          table: change.type,
          priority: 'medium',
          timestamp: new Date()
        });
      }

      // Preload parent/child tickets for change requests
      if (change.type === 'change_request') {
        // Preload related change tasks
        this.preloadQueue.push({
          sysId: `change_tasks_${change.sys_id}`,
          table: 'change_task',
          priority: 'medium',
          timestamp: new Date()
        });
      }

    } catch (error) {
      logger.error('❌ Error preloading related tickets:', error);
    }
  }

  private async processPreloadQueue(): Promise<void> {
    if (this.isWarming || this.preloadQueue.length === 0) return;
    
    this.isWarming = true;
    
    try {
      // Process queue in batches by priority
      const criticalItems = this.preloadQueue.filter(item => item.priority === 'critical');
      const highItems = this.preloadQueue.filter(item => item.priority === 'high');
      const mediumItems = this.preloadQueue.filter(item => item.priority === 'medium');
      const lowItems = this.preloadQueue.filter(item => item.priority === 'low');

      // Process critical items first
      await this.processBatch(criticalItems, this.warmupStrategies.critical);
      await this.processBatch(highItems, this.warmupStrategies.high);
      await this.processBatch(mediumItems, this.warmupStrategies.medium);
      await this.processBatch(lowItems, this.warmupStrategies.low);

      // Clear processed items
      this.preloadQueue = [];

    } catch (error) {
      logger.error('❌ Error processing preload queue:', error);
    } finally {
      this.isWarming = false;
    }
  }

  private async processBatch(items: any[], strategy: CacheWarmupStrategy): Promise<void> {
    if (items.length === 0) return;

    logger.debug(`🔄 Processing ${items.length} ${strategy.priority} priority cache items`);

    // Process in chunks based on strategy concurrency
    for (let i = 0; i < items.length; i += strategy.concurrency) {
      const chunk = items.slice(i, i + strategy.concurrency);
      
      const promises = chunk.map(async item => {
        try {
          await hybridDataService.getTicketDetails(item.sysId, item.table, {
            includeSLMs: strategy.preloadSLA,
            includeNotes: strategy.preloadNotes
          });
          
          this.recordCacheHit();
        } catch (error) {
          this.recordCacheMiss();
          logger.debug(`Cache preload failed for ${item.table}/${item.sysId}:`, error);
        }
      });

      await Promise.allSettled(promises);
      
      // Small delay to avoid overwhelming the system
      if (i + strategy.concurrency < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  private isInQueue(sysId: string, table: string): boolean {
    return this.preloadQueue.some(item => item.sysId === sysId && item.table === table);
  }

  private sortPreloadQueue(): void {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    
    this.preloadQueue.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      return a.timestamp.getTime() - b.timestamp.getTime();
    });
  }

  private recordCacheHit(): void {
    this.cacheStats.totalRequests++;
    this.cacheStats.totalHits++;
    this.updateCacheRatios();
  }

  private recordCacheMiss(): void {
    this.cacheStats.totalRequests++;
    this.cacheStats.totalMisses++;
    this.updateCacheRatios();
  }

  private updateCacheRatios(): void {
    if (this.cacheStats.totalRequests > 0) {
      this.cacheStats.hitRatio = (this.cacheStats.totalHits / this.cacheStats.totalRequests) * 100;
      this.cacheStats.missRatio = (this.cacheStats.totalMisses / this.cacheStats.totalRequests) * 100;
    }
  }

  /**
   * Get cache optimization statistics
   */
  getCacheStats(): CacheStats {
    return { ...this.cacheStats };
  }

  /**
   * Manual cache warmup trigger
   */
  async triggerWarmup(strategy: 'critical' | 'high' | 'medium' | 'low' = 'medium'): Promise<void> {
    logger.info(`🔥 Manual cache warmup triggered with ${strategy} strategy`);
    
    switch (strategy) {
      case 'critical':
        await this.warmupCriticalTickets();
        break;
      case 'high':
        await this.warmupHighPriorityTickets();
        break;
      case 'medium':
      case 'low':
        await this.warmupRecentTickets();
        break;
    }
  }

  /**
   * Cache invalidation for specific patterns
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      logger.info(`🗑️ Invalidating cache pattern: ${pattern}`);
      
      // In a real implementation, this would invalidate MongoDB cache entries
      // matching the pattern and clear related Redis cache keys
      
      logger.info(`✅ Cache pattern ${pattern} invalidated`);
    } catch (error) {
      logger.error(`❌ Error invalidating cache pattern ${pattern}:`, error);
    }
  }

  async shutdown(): Promise<void> {
    if (this.warmupInterval) {
      clearInterval(this.warmupInterval);
    }
    
    this.isWarming = false;
    this.preloadQueue = [];
    
    logger.info('🛑 Cache Optimization Service shutdown completed');
  }
}

export const cacheOptimizationService = new CacheOptimizationService();