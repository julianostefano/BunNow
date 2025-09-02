/**
 * Memory-based Notification Queue - Fallback Implementation
 * In-memory queue for development and testing when Redis is not available
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from 'events';
import {
  Notification,
  NotificationQueueItem,
  NotificationChannel,
  NotificationPriority,
  NotificationType
} from './NotificationTypes';

export interface MemoryQueueOptions {
  maxSize: number;
  retryDelays: number[];
  maxRetries: number;
  cleanupInterval: number;
  processingInterval: number;
  rateLimits: {
    perMinute: number;
    perHour: number;
    burstSize: number;
  };
}

export class MemoryQueue extends EventEmitter {
  private options: MemoryQueueOptions;
  private isRunning: boolean = false;
  private processingTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  
  // In-memory storage
  private queues: Map<NotificationPriority, NotificationQueueItem[]> = new Map();
  private processing: NotificationQueueItem[] = [];
  private failed: NotificationQueueItem[] = [];
  private stats: Map<string, any> = new Map();
  private rateLimitCounters: Map<string, { minute: number; hour: number; burst: number; resetTime: number }> = new Map();

  constructor(options: MemoryQueueOptions) {
    super();
    this.options = options;
    this.initializeQueues();
  }

  private initializeQueues(): void {
    for (const priority of Object.values(NotificationPriority)) {
      this.queues.set(priority, []);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Memory queue is already running');
    }

    this.isRunning = true;

    // Start processing loop
    this.processingTimer = setInterval(
      () => this.processQueue(),
      this.options.processingInterval
    );

    // Start cleanup loop
    this.cleanupTimer = setInterval(
      () => this.cleanupExpired(),
      this.options.cleanupInterval
    );

    console.log('📦 Memory notification queue started');
    this.emit('started');
  }

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

    console.log('📦 Memory notification queue stopped');
    this.emit('stopped');
  }

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
      maxRetries: this.options.maxRetries,
      scheduledAt: new Date(),
      attempts: []
    };

    // Check rate limits
    const rateLimitKey = this.getRateLimitKey(notification.source);
    if (!(await this.checkRateLimit(rateLimitKey))) {
      throw new Error(`Rate limit exceeded for source: ${notification.source}`);
    }

    // Check total queue size
    const totalSize = Array.from(this.queues.values())
      .reduce((sum, queue) => sum + queue.length, 0);
    
    if (totalSize >= this.options.maxSize) {
      throw new Error(`Queue size limit exceeded: ${totalSize}`);
    }

    // Add to appropriate priority queue
    const queue = this.queues.get(priority) || [];
    
    if (priority === NotificationPriority.CRITICAL || priority === NotificationPriority.HIGH) {
      // Add to front for high priority
      queue.unshift(queueItem);
    } else {
      // Add to back for normal priority
      queue.push(queueItem);
    }

    this.queues.set(priority, queue);

    // Update statistics
    this.updateStats('enqueued', notification.type);

    console.log(`📨 Memory queue: Notification queued: ${queueItem.id} (${notification.type})`);
    this.emit('enqueued', queueItem);

    return queueItem.id;
  }

  private async processQueue(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Process in priority order
      for (const priority of [
        NotificationPriority.CRITICAL, 
        NotificationPriority.HIGH, 
        NotificationPriority.MEDIUM, 
        NotificationPriority.LOW
      ]) {
        await this.processQueueBatch(priority);
      }
    } catch (error) {
      console.error('Error processing memory notification queue:', error);
      this.emit('error', error);
    }
  }

  private async processQueueBatch(priority: NotificationPriority): Promise<void> {
    const queue = this.queues.get(priority) || [];
    const batchSize = 10;

    for (let i = 0; i < Math.min(batchSize, queue.length); i++) {
      const queueItem = queue.shift();
      if (!queueItem) break;

      try {
        // Move to processing
        this.processing.push(queueItem);
        
        await this.processNotification(queueItem);
        
        // Remove from processing
        const processingIndex = this.processing.findIndex(item => item.id === queueItem.id);
        if (processingIndex >= 0) {
          this.processing.splice(processingIndex, 1);
        }
      } catch (error) {
        console.error('Error processing notification item:', error);
      }
    }
  }

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
      // Move to failed
      this.failed.push(queueItem);
      this.updateStats('failed', queueItem.notification.type);
      this.emit('failed', queueItem);
    } else {
      // All channels delivered successfully
      this.updateStats('delivered', queueItem.notification.type);
      this.emit('completed', { queueItem, duration });
    }
  }

  private async scheduleRetry(queueItem: NotificationQueueItem): Promise<void> {
    queueItem.retryCount++;
    
    // Calculate delay using exponential backoff
    const delayIndex = Math.min(queueItem.retryCount - 1, this.options.retryDelays.length - 1);
    const delay = this.options.retryDelays[delayIndex];
    
    // Schedule for retry
    queueItem.scheduledAt = new Date(Date.now() + delay);
    
    // Add back to appropriate priority queue after delay
    setTimeout(() => {
      const priority = queueItem.notification.priority;
      const queue = this.queues.get(priority) || [];
      queue.push(queueItem);
      this.queues.set(priority, queue);
    }, delay);
    
    console.log(`📨 Memory queue: Notification ${queueItem.id} scheduled for retry #${queueItem.retryCount} in ${delay}ms`);
    this.emit('retry_scheduled', { queueItem, delay });
  }

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

  private async checkRateLimit(rateLimitKey: string): Promise<boolean> {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);

    let counter = this.rateLimitCounters.get(rateLimitKey);
    if (!counter || counter.resetTime < now) {
      counter = {
        minute: 0,
        hour: 0,
        burst: 0,
        resetTime: now + 60000 // Reset every minute
      };
    }

    // Check limits
    if (counter.minute >= this.options.rateLimits.perMinute ||
        counter.hour >= this.options.rateLimits.perHour ||
        counter.burst >= this.options.rateLimits.burstSize) {
      return false;
    }

    // Increment counters
    counter.minute++;
    counter.hour++;
    counter.burst++;
    
    // Reset burst counter every 10 seconds
    if (now - counter.resetTime > 10000) {
      counter.burst = 1;
      counter.resetTime = now + 10000;
    }

    this.rateLimitCounters.set(rateLimitKey, counter);
    return true;
  }

  private cleanupExpired(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const now = Date.now();
        const expiredTime = now - (24 * 60 * 60 * 1000); // 24 hours ago

        // Clean up failed queue
        this.failed = this.failed.filter(item => 
          item.scheduledAt.getTime() >= expiredTime
        );

        // Clean up old rate limit counters
        for (const [key, counter] of this.rateLimitCounters.entries()) {
          if (counter.resetTime < now - 3600000) { // 1 hour old
            this.rateLimitCounters.delete(key);
          }
        }

        console.log('📦 Memory queue cleanup completed');
        resolve();
      } catch (error) {
        console.error('Error during memory queue cleanup:', error);
        resolve();
      }
    });
  }

  async getStats(): Promise<any> {
    return {
      queues: {
        critical: this.queues.get(NotificationPriority.CRITICAL)?.length || 0,
        high: this.queues.get(NotificationPriority.HIGH)?.length || 0,
        medium: this.queues.get(NotificationPriority.MEDIUM)?.length || 0,
        low: this.queues.get(NotificationPriority.LOW)?.length || 0,
        processing: this.processing.length,
        failed: this.failed.length,
      },
      stats: Object.fromEntries(this.stats.entries()),
      isRunning: this.isRunning
    };
  }

  private getRateLimitKey(source: string): string {
    return source.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private updateStats(event: string, type: NotificationType): void {
    const totalKey = `total:${event}`;
    const typeKey = `type:${type}:${event}`;
    
    this.stats.set(totalKey, (this.stats.get(totalKey) || 0) + 1);
    this.stats.set(typeKey, (this.stats.get(typeKey) || 0) + 1);
    this.stats.set('lastUpdated', Date.now());
  }
}