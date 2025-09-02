/**
 * Notification Queue - Redis-based Message Queue
 * Handles queuing, retry logic, and delivery of notifications
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import {
  Notification,
  NotificationQueueItem,
  NotificationChannel,
  NotificationPriority,
  NotificationType
} from './NotificationTypes';

export interface NotificationQueueOptions {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  queue: {
    maxSize: number;
    retryDelays: number[]; // in milliseconds
    maxRetries: number;
    cleanupInterval: number; // in milliseconds
    processingInterval: number; // in milliseconds
  };
  rateLimits: {
    perMinute: number;
    perHour: number;
    burstSize: number;
  };
}

export class NotificationQueue extends EventEmitter {
  private redis: Redis;
  private options: NotificationQueueOptions;
  private isRunning: boolean = false;
  private processingTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private rateLimitCounters: Map<string, { minute: number; hour: number; burst: number }> = new Map();

  // Redis keys
  private readonly QUEUE_KEY = 'notifications:queue';
  private readonly PROCESSING_KEY = 'notifications:processing';
  private readonly FAILED_KEY = 'notifications:failed';
  private readonly STATS_KEY = 'notifications:stats';
  private readonly RATE_LIMIT_KEY = 'notifications:ratelimit';

  constructor(options: NotificationQueueOptions) {
    super();
    this.options = options;
    this.redis = new Redis({
      host: options.redis.host,
      port: options.redis.port,
      password: options.redis.password,
      db: options.redis.db || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.redis.on('error', (error) => {
      console.error('Notification Queue Redis Error:', error);
      this.emit('error', error);
    });

    this.redis.on('connect', () => {
      console.log('Notification Queue Redis Connected');
      this.emit('connected');
    });

    this.redis.on('ready', () => {
      console.log('Notification Queue Redis Ready');
      this.emit('ready');
    });
  }

  /**
   * Start the notification queue processor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Notification queue is already running');
    }

    try {
      await this.redis.ping();
      this.isRunning = true;

      // Start processing loop
      this.processingTimer = setInterval(
        () => this.processQueue(),
        this.options.queue.processingInterval
      );

      // Start cleanup loop
      this.cleanupTimer = setInterval(
        () => this.cleanupExpired(),
        this.options.queue.cleanupInterval
      );

      console.log('Notification queue started');
      this.emit('started');
    } catch (error) {
      console.error('Failed to start notification queue:', error);
      throw error;
    }
  }

  /**
   * Stop the notification queue processor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    await this.redis.quit();
    console.log('Notification queue stopped');
    this.emit('stopped');
  }

  /**
   * Add a notification to the queue
   */
  async enqueue(
    notification: Notification,
    channels: NotificationChannel[] = [NotificationChannel.WEBSOCKET],
    priority: NotificationPriority = notification.priority
  ): Promise<string> {
    const queueItem: NotificationQueueItem = {
      id: crypto.randomUUID(),
      notification,
      channels,
      retryCount: 0,
      maxRetries: this.options.queue.maxRetries,
      scheduledAt: new Date(),
      attempts: []
    };

    // Check rate limits
    const rateLimitKey = this.getRateLimitKey(notification.source);
    if (!(await this.checkRateLimit(rateLimitKey))) {
      throw new Error(`Rate limit exceeded for source: ${notification.source}`);
    }

    // Check queue size
    const queueSize = await this.redis.llen(this.QUEUE_KEY);
    if (queueSize >= this.options.queue.maxSize) {
      throw new Error(`Queue size limit exceeded: ${queueSize}`);
    }

    // Add to appropriate queue based on priority
    const queueKey = this.getQueueKey(priority);
    const itemData = JSON.stringify(queueItem);

    if (priority === NotificationPriority.CRITICAL || priority === NotificationPriority.HIGH) {
      // Add to front of queue for high priority
      await this.redis.lpush(queueKey, itemData);
    } else {
      // Add to back of queue for normal priority
      await this.redis.rpush(queueKey, itemData);
    }

    // Update statistics
    await this.updateStats('enqueued', notification.type);

    console.log(`Notification queued: ${queueItem.id} (${notification.type})`);
    this.emit('enqueued', queueItem);

    return queueItem.id;
  }

  /**
   * Process notifications from the queue
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Process critical and high priority first
      for (const priority of [NotificationPriority.CRITICAL, NotificationPriority.HIGH, NotificationPriority.MEDIUM, NotificationPriority.LOW]) {
        const queueKey = this.getQueueKey(priority);
        await this.processQueueBatch(queueKey);
      }
    } catch (error) {
      console.error('Error processing notification queue:', error);
      this.emit('error', error);
    }
  }

  /**
   * Process a batch of notifications from a specific queue
   */
  private async processQueueBatch(queueKey: string): Promise<void> {
    const batchSize = 10; // Process 10 notifications at a time

    for (let i = 0; i < batchSize; i++) {
      // Move item from queue to processing
      const itemData = await this.redis.brpoplpush(queueKey, this.PROCESSING_KEY, 1);
      if (!itemData) break; // No more items

      try {
        const queueItem: NotificationQueueItem = JSON.parse(itemData);
        await this.processNotification(queueItem);

        // Remove from processing queue
        await this.redis.lrem(this.PROCESSING_KEY, 1, itemData);
      } catch (error) {
        console.error('Error processing notification item:', error);
        // Item remains in processing queue for retry
      }
    }
  }

  /**
   * Process a single notification
   */
  private async processNotification(queueItem: NotificationQueueItem): Promise<void> {
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    for (const channel of queueItem.channels) {
      try {
        await this.deliverToChannel(queueItem.notification, channel);
        
        queueItem.attempts.push({
          timestamp: new Date(),
          channel,
          success: true
        });
        
        successCount++;
        this.emit('delivered', { notification: queueItem.notification, channel });
      } catch (error) {
        console.error(`Failed to deliver notification ${queueItem.id} to ${channel}:`, error);
        
        queueItem.attempts.push({
          timestamp: new Date(),
          channel,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        
        errorCount++;
        this.emit('delivery_failed', { notification: queueItem.notification, channel, error });
      }
    }

    const duration = Date.now() - startTime;

    if (errorCount > 0 && queueItem.retryCount < queueItem.maxRetries) {
      // Schedule retry
      await this.scheduleRetry(queueItem);
    } else if (errorCount > 0) {
      // Move to failed queue
      await this.redis.lpush(this.FAILED_KEY, JSON.stringify(queueItem));
      await this.updateStats('failed', queueItem.notification.type);
      this.emit('failed', queueItem);
    } else {
      // All channels delivered successfully
      await this.updateStats('delivered', queueItem.notification.type);
      this.emit('completed', { queueItem, duration });
    }

    // Update performance metrics
    await this.updatePerformanceMetrics(duration, errorCount > 0);
  }

  /**
   * Schedule a notification for retry
   */
  private async scheduleRetry(queueItem: NotificationQueueItem): Promise<void> {
    queueItem.retryCount++;
    
    // Calculate delay using exponential backoff
    const delayIndex = Math.min(queueItem.retryCount - 1, this.options.queue.retryDelays.length - 1);
    const delay = this.options.queue.retryDelays[delayIndex];
    
    // Schedule for retry
    queueItem.scheduledAt = new Date(Date.now() + delay);
    
    // Add back to appropriate priority queue
    const priority = queueItem.notification.priority;
    const queueKey = this.getQueueKey(priority);
    await this.redis.rpush(queueKey, JSON.stringify(queueItem));
    
    console.log(`Notification ${queueItem.id} scheduled for retry #${queueItem.retryCount} in ${delay}ms`);
    this.emit('retry_scheduled', { queueItem, delay });
  }

  /**
   * Deliver notification to specific channel
   */
  private async deliverToChannel(notification: Notification, channel: NotificationChannel): Promise<void> {
    switch (channel) {
      case NotificationChannel.WEBSOCKET:
        this.emit('websocket_deliver', notification);
        break;
      case NotificationChannel.SSE:
        this.emit('sse_deliver', notification);
        break;
      case NotificationChannel.PUSH:
        this.emit('push_deliver', notification);
        break;
      case NotificationChannel.EMAIL:
        this.emit('email_deliver', notification);
        break;
      case NotificationChannel.WEBHOOK:
        this.emit('webhook_deliver', notification);
        break;
      case NotificationChannel.DATABASE:
        this.emit('database_deliver', notification);
        break;
      default:
        throw new Error(`Unknown notification channel: ${channel}`);
    }
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(rateLimitKey: string): Promise<boolean> {
    const now = Date.now();
    const minute = Math.floor(now / 60000); // Current minute
    const hour = Math.floor(now / 3600000); // Current hour

    const pipeline = this.redis.pipeline();
    
    // Get current counts
    pipeline.hget(this.RATE_LIMIT_KEY, `${rateLimitKey}:minute:${minute}`);
    pipeline.hget(this.RATE_LIMIT_KEY, `${rateLimitKey}:hour:${hour}`);
    pipeline.hget(this.RATE_LIMIT_KEY, `${rateLimitKey}:burst`);
    
    const results = await pipeline.exec();
    
    const minuteCount = parseInt(results?.[0]?.[1] as string || '0');
    const hourCount = parseInt(results?.[1]?.[1] as string || '0');
    const burstCount = parseInt(results?.[2]?.[1] as string || '0');

    // Check limits
    if (minuteCount >= this.options.rateLimits.perMinute ||
        hourCount >= this.options.rateLimits.perHour ||
        burstCount >= this.options.rateLimits.burstSize) {
      return false;
    }

    // Increment counters
    const incrementPipeline = this.redis.pipeline();
    incrementPipeline.hincrby(this.RATE_LIMIT_KEY, `${rateLimitKey}:minute:${minute}`, 1);
    incrementPipeline.hincrby(this.RATE_LIMIT_KEY, `${rateLimitKey}:hour:${hour}`, 1);
    incrementPipeline.hincrby(this.RATE_LIMIT_KEY, `${rateLimitKey}:burst`, 1);
    
    // Set expiry for burst counter (reset every 10 seconds)
    incrementPipeline.expire(`${this.RATE_LIMIT_KEY}:${rateLimitKey}:burst`, 10);
    
    await incrementPipeline.exec();

    return true;
  }

  /**
   * Clean up expired items
   */
  private async cleanupExpired(): Promise<void> {
    try {
      const now = Date.now();
      const expiredTime = now - (24 * 60 * 60 * 1000); // 24 hours ago

      // Clean up failed queue
      const failedItems = await this.redis.lrange(this.FAILED_KEY, 0, -1);
      for (const itemData of failedItems) {
        try {
          const queueItem: NotificationQueueItem = JSON.parse(itemData);
          if (queueItem.scheduledAt.getTime() < expiredTime) {
            await this.redis.lrem(this.FAILED_KEY, 1, itemData);
            this.emit('expired', queueItem);
          }
        } catch (error) {
          // Remove malformed item
          await this.redis.lrem(this.FAILED_KEY, 1, itemData);
        }
      }

      // Clean up old rate limit counters
      const rateLimitKeys = await this.redis.hkeys(this.RATE_LIMIT_KEY);
      for (const key of rateLimitKeys) {
        if (key.includes(':minute:') || key.includes(':hour:')) {
          const parts = key.split(':');
          const timestamp = parseInt(parts[parts.length - 1]);
          const keyTime = timestamp * (key.includes(':minute:') ? 60000 : 3600000);
          
          if (keyTime < expiredTime) {
            await this.redis.hdel(this.RATE_LIMIT_KEY, key);
          }
        }
      }

      console.log('Notification queue cleanup completed');
    } catch (error) {
      console.error('Error during notification queue cleanup:', error);
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<any> {
    const pipeline = this.redis.pipeline();
    
    // Get queue sizes
    pipeline.llen(this.getQueueKey(NotificationPriority.CRITICAL));
    pipeline.llen(this.getQueueKey(NotificationPriority.HIGH));
    pipeline.llen(this.getQueueKey(NotificationPriority.MEDIUM));
    pipeline.llen(this.getQueueKey(NotificationPriority.LOW));
    pipeline.llen(this.PROCESSING_KEY);
    pipeline.llen(this.FAILED_KEY);
    
    // Get statistics
    pipeline.hgetall(this.STATS_KEY);
    
    const results = await pipeline.exec();
    
    return {
      queues: {
        critical: results?.[0]?.[1] || 0,
        high: results?.[1]?.[1] || 0,
        medium: results?.[2]?.[1] || 0,
        low: results?.[3]?.[1] || 0,
        processing: results?.[4]?.[1] || 0,
        failed: results?.[5]?.[1] || 0,
      },
      stats: results?.[6]?.[1] || {},
      isRunning: this.isRunning
    };
  }

  // Helper methods
  private getQueueKey(priority: NotificationPriority): string {
    return `${this.QUEUE_KEY}:${priority}`;
  }

  private getRateLimitKey(source: string): string {
    return source.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private async updateStats(event: string, type: NotificationType): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.hincrby(this.STATS_KEY, `total:${event}`, 1);
    pipeline.hincrby(this.STATS_KEY, `type:${type}:${event}`, 1);
    pipeline.hset(this.STATS_KEY, 'lastUpdated', Date.now());
    await pipeline.exec();
  }

  private async updatePerformanceMetrics(duration: number, hasError: boolean): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.hincrby(this.STATS_KEY, 'performance:totalRequests', 1);
    pipeline.hincrby(this.STATS_KEY, 'performance:totalDuration', duration);
    
    if (hasError) {
      pipeline.hincrby(this.STATS_KEY, 'performance:errorCount', 1);
    }
    
    await pipeline.exec();
  }
}