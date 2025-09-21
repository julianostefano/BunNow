/**
 * Redis Pub/Sub Manager for Real-time Messaging and Events
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import Redis, { Redis as RedisClient, Cluster as RedisCluster } from "ioredis";
import { EventEmitter } from "events";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";

export interface PubSubMessage {
  channel: string;
  pattern?: string;
  data: any;
  timestamp: number;
  messageId: string;
}

export interface PubSubOptions {
  enablePatternSubscription?: boolean;
  enableMessageHistory?: boolean;
  historySize?: number;
  enableMetrics?: boolean;
  messageTimeout?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export interface ChannelMetrics {
  channel: string;
  messagesSent: number;
  messagesReceived: number;
  subscriberCount: number;
  lastActivity: number;
  errorCount: number;
}

export interface PubSubMetrics {
  totalChannels: number;
  totalSubscribers: number;
  messagesPublished: number;
  messagesReceived: number;
  activeConnections: number;
  errorRate: number;
  averageLatency: number;
  channelMetrics: Map<string, ChannelMetrics>;
}

export class RedisPubSub extends EventEmitter {
  private publisher: RedisClient | RedisCluster;
  private subscriber: RedisClient | RedisCluster;
  private options: Required<PubSubOptions>;
  private subscriptions: Map<string, Set<(message: PubSubMessage) => void>> =
    new Map();
  private patternSubscriptions: Map<
    string,
    Set<(message: PubSubMessage) => void>
  > = new Map();
  private messageHistory: Map<string, PubSubMessage[]> = new Map();
  private metrics: PubSubMetrics;
  private isConnected: boolean = false;
  private reconnectCount: number = 0;
  private metricsTimer?: NodeJS.Timeout;

  constructor(
    publisher: RedisClient | RedisCluster,
    subscriber?: RedisClient | RedisCluster,
    options: PubSubOptions = {},
  ) {
    super();

    this.publisher = publisher;
    this.subscriber = subscriber || publisher.duplicate();

    this.options = {
      enablePatternSubscription: options.enablePatternSubscription ?? true,
      enableMessageHistory: options.enableMessageHistory ?? true,
      historySize: options.historySize || 1000,
      enableMetrics: options.enableMetrics ?? true,
      messageTimeout: options.messageTimeout || 30000,
      reconnectDelay: options.reconnectDelay || 1000,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
    };

    this.metrics = {
      totalChannels: 0,
      totalSubscribers: 0,
      messagesPublished: 0,
      messagesReceived: 0,
      activeConnections: 0,
      errorRate: 0,
      averageLatency: 0,
      channelMetrics: new Map(),
    };

    this.setupEventHandlers();

    if (this.options.enableMetrics) {
      this.startMetricsCollection();
    }

    logger.info("RedisPubSub initialized");
  }

  /**
   * Publish message to channel
   */
  async publish(
    channel: string,
    data: any,
    options: {
      persistent?: boolean;
      ttl?: number;
      messageId?: string;
    } = {},
  ): Promise<boolean> {
    const timer = performanceMonitor.startTimer("redis_pubsub_publish");

    try {
      const message: PubSubMessage = {
        channel,
        data,
        timestamp: Date.now(),
        messageId: options.messageId || this.generateMessageId(),
      };

      // Serialize message
      const serialized = JSON.stringify(message);

      // Publish to Redis
      const subscriberCount = await this.publisher.publish(channel, serialized);

      // Store in history if enabled
      if (this.options.enableMessageHistory) {
        this.addToHistory(channel, message);
      }

      // Update metrics
      this.updateChannelMetrics(channel, "sent");
      this.metrics.messagesPublished++;

      logger.debug(
        `Published message to channel ${channel}, reached ${subscriberCount} subscribers`,
      );
      this.emit("message:published", { channel, message, subscriberCount });

      return subscriberCount > 0;
    } catch (error) {
      logger.error(`Error publishing to channel ${channel}:`, error);
      this.updateChannelMetrics(channel, "error");
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Publish message to multiple channels
   */
  async publishToMultiple(
    channels: string[],
    data: any,
  ): Promise<Map<string, number>> {
    const timer = performanceMonitor.startTimer(
      "redis_pubsub_publish_multiple",
    );
    const results = new Map<string, number>();

    try {
      // Use pipeline for better performance
      const pipeline = this.publisher.pipeline();
      const messageId = this.generateMessageId();

      const message: PubSubMessage = {
        channel: "", // Will be set per channel
        data,
        timestamp: Date.now(),
        messageId,
      };

      for (const channel of channels) {
        const channelMessage = { ...message, channel };
        const serialized = JSON.stringify(channelMessage);
        pipeline.publish(channel, serialized);

        // Store in history
        if (this.options.enableMessageHistory) {
          this.addToHistory(channel, channelMessage);
        }
      }

      const pipelineResults = await pipeline.exec();

      pipelineResults?.forEach((result, index) => {
        const channel = channels[index];
        const subscriberCount = (result[1] as number) || 0;
        results.set(channel, subscriberCount);

        this.updateChannelMetrics(channel, "sent");
      });

      this.metrics.messagesPublished += channels.length;

      logger.info(`Published message to ${channels.length} channels`);
      this.emit("message:published:multiple", { channels, data, results });

      return results;
    } catch (error) {
      logger.error("Error publishing to multiple channels:", error);
      channels.forEach((channel) =>
        this.updateChannelMetrics(channel, "error"),
      );
      return results;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(
    channel: string,
    callback: (message: PubSubMessage) => void,
  ): Promise<boolean> {
    try {
      if (!this.subscriptions.has(channel)) {
        this.subscriptions.set(channel, new Set());
        await this.subscriber.subscribe(channel);

        this.updateChannelMetrics(channel, "subscribe");
        logger.info(`Subscribed to channel: ${channel}`);
      }

      this.subscriptions.get(channel)!.add(callback);

      this.emit("channel:subscribed", { channel });
      return true;
    } catch (error) {
      logger.error(`Error subscribing to channel ${channel}:`, error);
      return false;
    }
  }

  /**
   * Subscribe to pattern
   */
  async subscribePattern(
    pattern: string,
    callback: (message: PubSubMessage) => void,
  ): Promise<boolean> {
    if (!this.options.enablePatternSubscription) {
      throw new Error("Pattern subscription is disabled");
    }

    try {
      if (!this.patternSubscriptions.has(pattern)) {
        this.patternSubscriptions.set(pattern, new Set());
        await this.subscriber.psubscribe(pattern);

        logger.info(`Subscribed to pattern: ${pattern}`);
      }

      this.patternSubscriptions.get(pattern)!.add(callback);

      this.emit("pattern:subscribed", { pattern });
      return true;
    } catch (error) {
      logger.error(`Error subscribing to pattern ${pattern}:`, error);
      return false;
    }
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(
    channel: string,
    callback?: (message: PubSubMessage) => void,
  ): Promise<boolean> {
    try {
      const channelCallbacks = this.subscriptions.get(channel);
      if (!channelCallbacks) {
        return false;
      }

      if (callback) {
        // Remove specific callback
        channelCallbacks.delete(callback);

        if (channelCallbacks.size === 0) {
          await this.subscriber.unsubscribe(channel);
          this.subscriptions.delete(channel);
          this.updateChannelMetrics(channel, "unsubscribe");
        }
      } else {
        // Remove all callbacks for channel
        await this.subscriber.unsubscribe(channel);
        this.subscriptions.delete(channel);
        this.updateChannelMetrics(channel, "unsubscribe");
      }

      logger.info(`Unsubscribed from channel: ${channel}`);
      this.emit("channel:unsubscribed", { channel });

      return true;
    } catch (error) {
      logger.error(`Error unsubscribing from channel ${channel}:`, error);
      return false;
    }
  }

  /**
   * Unsubscribe from pattern
   */
  async unsubscribePattern(
    pattern: string,
    callback?: (message: PubSubMessage) => void,
  ): Promise<boolean> {
    try {
      const patternCallbacks = this.patternSubscriptions.get(pattern);
      if (!patternCallbacks) {
        return false;
      }

      if (callback) {
        // Remove specific callback
        patternCallbacks.delete(callback);

        if (patternCallbacks.size === 0) {
          await this.subscriber.punsubscribe(pattern);
          this.patternSubscriptions.delete(pattern);
        }
      } else {
        // Remove all callbacks for pattern
        await this.subscriber.punsubscribe(pattern);
        this.patternSubscriptions.delete(pattern);
      }

      logger.info(`Unsubscribed from pattern: ${pattern}`);
      this.emit("pattern:unsubscribed", { pattern });

      return true;
    } catch (error) {
      logger.error(`Error unsubscribing from pattern ${pattern}:`, error);
      return false;
    }
  }

  /**
   * Get message history for channel
   */
  getHistory(channel: string, limit?: number): PubSubMessage[] {
    const history = this.messageHistory.get(channel) || [];

    if (limit && limit > 0) {
      return history.slice(-limit);
    }

    return [...history];
  }

  /**
   * Clear message history for channel
   */
  clearHistory(channel: string): void {
    this.messageHistory.delete(channel);
    this.emit("history:cleared", { channel });
  }

  /**
   * Get list of active subscriptions
   */
  getActiveSubscriptions(): {
    channels: string[];
    patterns: string[];
    totalCallbacks: number;
  } {
    const channels = Array.from(this.subscriptions.keys());
    const patterns = Array.from(this.patternSubscriptions.keys());

    let totalCallbacks = 0;
    this.subscriptions.forEach(
      (callbacks) => (totalCallbacks += callbacks.size),
    );
    this.patternSubscriptions.forEach(
      (callbacks) => (totalCallbacks += callbacks.size),
    );

    return { channels, patterns, totalCallbacks };
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): PubSubMetrics {
    // Update real-time metrics
    this.metrics.totalChannels =
      this.subscriptions.size + this.patternSubscriptions.size;

    let totalSubscribers = 0;
    this.subscriptions.forEach(
      (callbacks) => (totalSubscribers += callbacks.size),
    );
    this.patternSubscriptions.forEach(
      (callbacks) => (totalSubscribers += callbacks.size),
    );
    this.metrics.totalSubscribers = totalSubscribers;

    // Calculate error rate
    const totalMessages =
      this.metrics.messagesPublished + this.metrics.messagesReceived;
    const totalErrors = Array.from(this.metrics.channelMetrics.values()).reduce(
      (sum, channel) => sum + channel.errorCount,
      0,
    );
    this.metrics.errorRate =
      totalMessages > 0 ? totalErrors / totalMessages : 0;

    return {
      ...this.metrics,
      channelMetrics: new Map(this.metrics.channelMetrics),
    };
  }

  /**
   * Get channel-specific metrics
   */
  getChannelMetrics(channel: string): ChannelMetrics | null {
    return this.metrics.channelMetrics.get(channel) || null;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalChannels: 0,
      totalSubscribers: 0,
      messagesPublished: 0,
      messagesReceived: 0,
      activeConnections: 0,
      errorRate: 0,
      averageLatency: 0,
      channelMetrics: new Map(),
    };

    this.emit("metrics:reset");
  }

  /**
   * Get connection health status
   */
  getHealthStatus(): {
    publisherConnected: boolean;
    subscriberConnected: boolean;
    activeSubscriptions: number;
    messagesPending: number;
  } {
    return {
      publisherConnected: this.publisher.status === "ready",
      subscriberConnected: this.subscriber.status === "ready",
      activeSubscriptions:
        this.subscriptions.size + this.patternSubscriptions.size,
      messagesPending: 0, // Redis Pub/Sub doesn't queue messages
    };
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect(): Promise<void> {
    // Clear metrics timer
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    // Unsubscribe from all channels and patterns
    try {
      if (this.subscriptions.size > 0) {
        await this.subscriber.unsubscribe(
          ...Array.from(this.subscriptions.keys()),
        );
      }

      if (this.patternSubscriptions.size > 0) {
        await this.subscriber.punsubscribe(
          ...Array.from(this.patternSubscriptions.keys()),
        );
      }
    } catch (error) {
      logger.warn("Error during cleanup unsubscribe:", error);
    }

    // Clear internal state
    this.subscriptions.clear();
    this.patternSubscriptions.clear();
    this.messageHistory.clear();

    this.isConnected = false;
    this.removeAllListeners();

    logger.info("RedisPubSub disconnected and cleaned up");
  }

  private setupEventHandlers(): void {
    // Publisher events
    this.publisher.on("connect", () => {
      logger.info("Redis publisher connected");
    });

    this.publisher.on("error", (error) => {
      logger.error("Redis publisher error:", error);
      this.emit("error", { type: "publisher", error });
    });

    // Subscriber events
    this.subscriber.on("connect", () => {
      this.isConnected = true;
      this.reconnectCount = 0;
      logger.info("Redis subscriber connected");
    });

    this.subscriber.on("message", (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on(
      "pmessage",
      (pattern: string, channel: string, message: string) => {
        this.handlePatternMessage(pattern, channel, message);
      },
    );

    this.subscriber.on("error", (error) => {
      logger.error("Redis subscriber error:", error);
      this.emit("error", { type: "subscriber", error });
    });

    this.subscriber.on("close", () => {
      this.isConnected = false;
      logger.warn("Redis subscriber connection closed");
      this.handleReconnection();
    });
  }

  private handleMessage(channel: string, rawMessage: string): void {
    try {
      const message: PubSubMessage = JSON.parse(rawMessage);

      // Update metrics
      this.metrics.messagesReceived++;
      this.updateChannelMetrics(channel, "received");

      // Store in history
      if (this.options.enableMessageHistory) {
        this.addToHistory(channel, message);
      }

      // Call all registered callbacks
      const callbacks = this.subscriptions.get(channel);
      if (callbacks) {
        callbacks.forEach((callback) => {
          try {
            callback(message);
          } catch (error) {
            logger.error(
              `Error in message callback for channel ${channel}:`,
              error,
            );
            this.updateChannelMetrics(channel, "error");
          }
        });
      }

      this.emit("message:received", { channel, message });
    } catch (error) {
      logger.error(`Error parsing message for channel ${channel}:`, error);
      this.updateChannelMetrics(channel, "error");
    }
  }

  private handlePatternMessage(
    pattern: string,
    channel: string,
    rawMessage: string,
  ): void {
    try {
      const message: PubSubMessage = JSON.parse(rawMessage);
      message.pattern = pattern;

      // Update metrics
      this.metrics.messagesReceived++;
      this.updateChannelMetrics(channel, "received");

      // Call all registered pattern callbacks
      const callbacks = this.patternSubscriptions.get(pattern);
      if (callbacks) {
        callbacks.forEach((callback) => {
          try {
            callback(message);
          } catch (error) {
            logger.error(
              `Error in pattern callback for pattern ${pattern}:`,
              error,
            );
            this.updateChannelMetrics(channel, "error");
          }
        });
      }

      this.emit("pattern:message:received", { pattern, channel, message });
    } catch (error) {
      logger.error(`Error parsing pattern message for ${pattern}:`, error);
      this.updateChannelMetrics(channel, "error");
    }
  }

  private handleReconnection(): void {
    if (this.reconnectCount >= this.options.maxReconnectAttempts) {
      logger.error("Max reconnection attempts reached");
      this.emit("reconnection:failed");
      return;
    }

    setTimeout(
      () => {
        this.reconnectCount++;
        logger.info(
          `Attempting reconnection ${this.reconnectCount}/${this.options.maxReconnectAttempts}`,
        );

        // Resubscribe to all channels and patterns
        this.reestablishSubscriptions();
      },
      this.options.reconnectDelay * Math.pow(2, this.reconnectCount),
    ); // Exponential backoff
  }

  private async reestablishSubscriptions(): Promise<void> {
    try {
      // Resubscribe to channels
      const channels = Array.from(this.subscriptions.keys());
      if (channels.length > 0) {
        await this.subscriber.subscribe(...channels);
        logger.info(`Resubscribed to ${channels.length} channels`);
      }

      // Resubscribe to patterns
      const patterns = Array.from(this.patternSubscriptions.keys());
      if (patterns.length > 0) {
        await this.subscriber.psubscribe(...patterns);
        logger.info(`Resubscribed to ${patterns.length} patterns`);
      }

      this.emit("reconnection:success");
    } catch (error) {
      logger.error("Error during resubscription:", error);
      this.handleReconnection(); // Try again
    }
  }

  private addToHistory(channel: string, message: PubSubMessage): void {
    if (!this.messageHistory.has(channel)) {
      this.messageHistory.set(channel, []);
    }

    const history = this.messageHistory.get(channel)!;
    history.push(message);

    // Maintain history size limit
    if (history.length > this.options.historySize) {
      history.shift();
    }
  }

  private updateChannelMetrics(
    channel: string,
    action: "sent" | "received" | "subscribe" | "unsubscribe" | "error",
  ): void {
    if (!this.metrics.channelMetrics.has(channel)) {
      this.metrics.channelMetrics.set(channel, {
        channel,
        messagesSent: 0,
        messagesReceived: 0,
        subscriberCount: 0,
        lastActivity: Date.now(),
        errorCount: 0,
      });
    }

    const metrics = this.metrics.channelMetrics.get(channel)!;
    metrics.lastActivity = Date.now();

    switch (action) {
      case "sent":
        metrics.messagesSent++;
        break;
      case "received":
        metrics.messagesReceived++;
        break;
      case "subscribe":
        metrics.subscriberCount++;
        break;
      case "unsubscribe":
        metrics.subscriberCount = Math.max(0, metrics.subscriberCount - 1);
        break;
      case "error":
        metrics.errorCount++;
        break;
    }
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.emit("metrics:updated", this.getMetrics());
    }, 30000); // Emit metrics every 30 seconds
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
