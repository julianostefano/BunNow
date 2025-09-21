/**
 * Redis/KeyDB Stream Manager for Real-time Event Processing
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import Redis, { Redis as RedisClient, Cluster as RedisCluster } from "ioredis";
import { EventEmitter } from "events";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";

export interface RedisStreamOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  enableOfflineQueue?: boolean;
  cluster?: {
    nodes: Array<{ host: string; port: number }>;
    options?: any;
  };
  enableReadyCheck?: boolean;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
}

export interface StreamMessage {
  id: string;
  timestamp: number;
  data: Record<string, string>;
}

export interface ConsumerGroupOptions {
  groupName: string;
  consumerName: string;
  streamKey: string;
  startId?: string;
  batchSize?: number;
  blockTime?: number;
  idleTime?: number;
  autoAck?: boolean;
  maxRetries?: number;
  deadLetterStream?: string;
}

export interface StreamStats {
  streamKey: string;
  length: number;
  firstEntry?: StreamMessage;
  lastEntry?: StreamMessage;
  groups: Array<{
    name: string;
    consumers: number;
    pending: number;
    lastDeliveredId: string;
  }>;
  messagesPerSecond: number;
  totalMessages: number;
}

export class RedisStreamManager extends EventEmitter {
  private redis: RedisClient | RedisCluster;
  private consumers: Map<string, RedisConsumer> = new Map();
  private isConnected: boolean = false;
  private reconnectTimer?: NodeJS.Timeout;
  private stats: Map<string, StreamStats> = new Map();
  private metricsTimer?: NodeJS.Timeout;

  constructor(options: RedisStreamOptions = {}) {
    super();

    // Setup Redis connection
    if (options.cluster) {
      this.redis = new Redis.Cluster(options.cluster.nodes, {
        ...options.cluster.options,
        enableReadyCheck: options.enableReadyCheck ?? true,
        maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
        retryDelayOnFailover: options.retryDelayOnFailover ?? 100,
      });
    } else {
      this.redis = new Redis({
        host: options.host || "localhost",
        port: options.port || 6379,
        password: options.password,
        db: options.db || 0,
        keyPrefix: options.keyPrefix,
        maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
        retryDelayOnFailover: options.retryDelayOnFailover ?? 100,
        connectTimeout: options.connectTimeout || 10000,
        commandTimeout: options.commandTimeout || 5000,
        enableOfflineQueue: options.enableOfflineQueue ?? true,
        lazyConnect: options.lazyConnect ?? false,
      });
    }

    this.setupEventHandlers();
    this.startMetricsCollection();

    logger.info("RedisStreamManager initialized");
  }

  /**
   * Add message to Redis Stream
   */
  async addMessage(
    streamKey: string,
    data: Record<string, any>,
    messageId: string = "*",
    maxLength?: number,
  ): Promise<string> {
    const timerName = "redis_stream_add";
    let timerStarted = false;

    try {
      // Start timer only if performance monitoring is enabled
      performanceMonitor.startTimer(timerName);
      timerStarted = true;
      // Convert data to string values (Redis requirement)
      const stringData: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        stringData[key] =
          typeof value === "string" ? value : JSON.stringify(value);
      }

      // Add timestamp
      stringData._timestamp = Date.now().toString();

      let result: string;

      if (maxLength) {
        // Use MAXLEN to limit stream size
        result = await this.redis.xadd(
          streamKey,
          "MAXLEN",
          "~",
          maxLength,
          messageId,
          ...this.flattenObject(stringData),
        );
      } else {
        result = await this.redis.xadd(
          streamKey,
          messageId,
          ...this.flattenObject(stringData),
        );
      }

      logger.debug(`Added message ${result} to stream ${streamKey}`);
      this.emit("message:added", { streamKey, messageId: result, data });

      return result;
    } catch (error) {
      logger.error(`Error adding message to stream ${streamKey}:`, error);
      throw error;
    } finally {
      // Only end timer if it was successfully started
      if (timerStarted) {
        performanceMonitor.endTimer(timerName);
      }
    }
  }

  /**
   * Read messages from stream (without consumer groups)
   */
  async readMessages(
    streamKey: string,
    startId: string = "0-0",
    count?: number,
    blockTime?: number,
  ): Promise<StreamMessage[]> {
    const timerName = "redis_stream_read";
    performanceMonitor.startTimer(timerName);

    try {
      let result: any;

      if (blockTime !== undefined) {
        // Blocking read
        result = await this.redis.xread(
          "BLOCK",
          blockTime,
          "STREAMS",
          streamKey,
          startId,
        );
      } else {
        // Non-blocking read
        const args = ["STREAMS", streamKey, startId];
        if (count) {
          args.unshift("COUNT", count.toString());
        }
        result = await this.redis.xread(...args);
      }

      if (!result || result.length === 0) {
        return [];
      }

      const messages: StreamMessage[] = [];

      for (const [stream, streamMessages] of result) {
        for (const [id, fields] of streamMessages) {
          const data = this.parseFieldsArray(fields);
          messages.push({
            id,
            timestamp: parseInt(data._timestamp || "0"),
            data,
          });
        }
      }

      return messages;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Create consumer group for stream
   */
  async createConsumerGroup(
    streamKey: string,
    groupName: string,
    startId: string = "0",
  ): Promise<void> {
    try {
      await this.redis.xgroup(
        "CREATE",
        streamKey,
        groupName,
        startId,
        "MKSTREAM",
      );
      logger.info(
        `Created consumer group ${groupName} for stream ${streamKey}`,
      );
    } catch (error) {
      // Group might already exist
      if (!(error as Error).message.includes("BUSYGROUP")) {
        logger.error(`Error creating consumer group ${groupName}:`, error);
        throw error;
      }
    }
  }

  /**
   * Start consumer for processing stream messages
   */
  async startConsumer(options: ConsumerGroupOptions): Promise<RedisConsumer> {
    const consumer = new RedisConsumer(this.redis, options);
    this.consumers.set(
      `${options.groupName}:${options.consumerName}`,
      consumer,
    );

    // Ensure consumer group exists
    await this.createConsumerGroup(options.streamKey, options.groupName);

    // Start the consumer
    await consumer.start();

    logger.info(
      `Started consumer ${options.consumerName} in group ${options.groupName}`,
    );
    this.emit("consumer:started", options);

    return consumer;
  }

  /**
   * Stop specific consumer
   */
  async stopConsumer(groupName: string, consumerName: string): Promise<void> {
    const consumerKey = `${groupName}:${consumerName}`;
    const consumer = this.consumers.get(consumerKey);

    if (consumer) {
      await consumer.stop();
      this.consumers.delete(consumerKey);

      logger.info(`Stopped consumer ${consumerName} in group ${groupName}`);
      this.emit("consumer:stopped", { groupName, consumerName });
    }
  }

  /**
   * Get stream information and statistics
   */
  async getStreamInfo(streamKey: string): Promise<StreamStats> {
    const timerName = "redis_stream_info";
    performanceMonitor.startTimer(timerName);

    try {
      // Get basic stream info
      const info = await this.redis.xinfo("STREAM", streamKey);
      const groups = await this.redis.xinfo("GROUPS", streamKey);

      const streamInfo: StreamStats = {
        streamKey,
        length: info[1] as number,
        groups: groups.map((group: any) => ({
          name: group[1],
          consumers: group[3],
          pending: group[5],
          lastDeliveredId: group[7],
        })),
        messagesPerSecond: 0,
        totalMessages: info[1] as number,
      };

      // Get first and last entries if stream is not empty
      if (streamInfo.length > 0) {
        const firstEntry = await this.redis.xrange(
          streamKey,
          "-",
          "+",
          "COUNT",
          1,
        );
        const lastEntry = await this.redis.xrevrange(
          streamKey,
          "+",
          "-",
          "COUNT",
          1,
        );

        if (firstEntry.length > 0) {
          const [id, fields] = firstEntry[0];
          streamInfo.firstEntry = {
            id,
            timestamp: parseInt(
              this.parseFieldsArray(fields)._timestamp || "0",
            ),
            data: this.parseFieldsArray(fields),
          };
        }

        if (lastEntry.length > 0) {
          const [id, fields] = lastEntry[0];
          streamInfo.lastEntry = {
            id,
            timestamp: parseInt(
              this.parseFieldsArray(fields)._timestamp || "0",
            ),
            data: this.parseFieldsArray(fields),
          };
        }
      }

      // Calculate messages per second (rough estimate)
      if (streamInfo.firstEntry && streamInfo.lastEntry) {
        const timeDiff =
          (streamInfo.lastEntry.timestamp - streamInfo.firstEntry.timestamp) /
          1000;
        streamInfo.messagesPerSecond =
          timeDiff > 0 ? streamInfo.totalMessages / timeDiff : 0;
      }

      this.stats.set(streamKey, streamInfo);
      return streamInfo;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Trim stream to keep only recent messages
   */
  async trimStream(
    streamKey: string,
    maxLength: number,
    approximate: boolean = true,
  ): Promise<number> {
    const command = approximate ? "MAXLEN" : "MAXLEN";
    const args = approximate ? [command, "~", maxLength] : [command, maxLength];

    const trimmed = await this.redis.xtrim(streamKey, ...args);

    logger.info(`Trimmed ${trimmed} messages from stream ${streamKey}`);
    return trimmed as number;
  }

  /**
   * Delete entire stream
   */
  async deleteStream(streamKey: string): Promise<boolean> {
    const result = await this.redis.del(streamKey);

    if (result > 0) {
      logger.info(`Deleted stream ${streamKey}`);
      this.stats.delete(streamKey);
      return true;
    }

    return false;
  }

  /**
   * Get pending messages for consumer group
   */
  async getPendingMessages(
    streamKey: string,
    groupName: string,
    consumerName?: string,
  ): Promise<
    Array<{
      id: string;
      consumer: string;
      elapsedTime: number;
      deliveryCount: number;
    }>
  > {
    const args = [streamKey, groupName];
    if (consumerName) {
      args.push(consumerName);
    }

    const pending = await this.redis.xpending(
      streamKey,
      groupName,
      "-",
      "+",
      100,
    );

    return pending.map((item: any) => ({
      id: item[0],
      consumer: item[1],
      elapsedTime: item[2],
      deliveryCount: item[3],
    }));
  }

  /**
   * Acknowledge message processing
   */
  async ackMessage(
    streamKey: string,
    groupName: string,
    messageId: string,
  ): Promise<number> {
    return (await this.redis.xack(streamKey, groupName, messageId)) as number;
  }

  /**
   * Claim pending messages from idle consumers
   */
  async claimMessages(
    streamKey: string,
    groupName: string,
    consumerName: string,
    minIdleTime: number,
    messageIds: string[],
  ): Promise<StreamMessage[]> {
    const result = await this.redis.xclaim(
      streamKey,
      groupName,
      consumerName,
      minIdleTime,
      ...messageIds,
    );

    const messages: StreamMessage[] = [];

    for (let i = 0; i < result.length; i += 2) {
      const id = result[i];
      const fields = result[i + 1];

      if (fields) {
        const data = this.parseFieldsArray(fields);
        messages.push({
          id,
          timestamp: parseInt(data._timestamp || "0"),
          data,
        });
      }
    }

    return messages;
  }

  /**
   * Get all active consumers
   */
  getActiveConsumers(): string[] {
    return Array.from(this.consumers.keys());
  }

  /**
   * Get Redis connection health status
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    latency: number;
    memory: any;
    keyspace: any;
  }> {
    try {
      const startTime = Date.now();
      const pong = await this.redis.ping();
      const latency = Date.now() - startTime;

      const info = await this.redis.info("memory");
      const keyspace = await this.redis.info("keyspace");

      return {
        connected: pong === "PONG",
        latency,
        memory: this.parseInfoString(info),
        keyspace: this.parseInfoString(keyspace),
      };
    } catch (error) {
      return {
        connected: false,
        latency: -1,
        memory: null,
        keyspace: null,
      };
    }
  }

  /**
   * Close all connections and cleanup
   */
  async disconnect(): Promise<void> {
    // Stop all consumers
    for (const [key, consumer] of this.consumers) {
      await consumer.stop();
    }
    this.consumers.clear();

    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    // Close Redis connection
    this.redis.disconnect();
    this.isConnected = false;

    logger.info("RedisStreamManager disconnected");
  }

  private setupEventHandlers(): void {
    this.redis.on("connect", () => {
      this.isConnected = true;
      logger.info("Redis connected");
      this.emit("connected");
    });

    this.redis.on("ready", () => {
      logger.info("Redis ready");
      this.emit("ready");
    });

    this.redis.on("error", (error) => {
      logger.error("Redis error:", error);
      this.emit("error", error);
    });

    this.redis.on("close", () => {
      this.isConnected = false;
      logger.warn("Redis connection closed");
      this.emit("disconnected");
    });

    this.redis.on("reconnecting", () => {
      logger.info("Redis reconnecting...");
      this.emit("reconnecting");
    });
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(async () => {
      // Update metrics for tracked streams
      for (const streamKey of this.stats.keys()) {
        try {
          await this.getStreamInfo(streamKey);
        } catch (error) {
          logger.debug(
            `Failed to update metrics for stream ${streamKey}:`,
            error,
          );
        }
      }
    }, 30000); // Update every 30 seconds
  }

  private flattenObject(obj: Record<string, string>): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      result.push(key, value);
    }
    return result;
  }

  private parseFieldsArray(fields: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      result[fields[i]] = fields[i + 1];
    }
    return result;
  }

  private parseInfoString(info: string): any {
    const result: any = {};
    const lines = info.split("\r\n");

    for (const line of lines) {
      if (line.includes(":")) {
        const [key, value] = line.split(":");
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    }

    return result;
  }
}

/**
 * Redis Stream Consumer class
 */
export class RedisConsumer extends EventEmitter {
  private redis: RedisClient | RedisCluster;
  private options: Required<ConsumerGroupOptions>;
  private isRunning: boolean = false;
  private processingPromise?: Promise<void>;
  private messageHandler?: (message: StreamMessage) => Promise<void>;
  private errorHandler?: (
    error: Error,
    message: StreamMessage,
  ) => Promise<boolean>;

  constructor(
    redis: RedisClient | RedisCluster,
    options: ConsumerGroupOptions,
  ) {
    super();

    this.redis = redis;
    this.options = {
      groupName: options.groupName,
      consumerName: options.consumerName,
      streamKey: options.streamKey,
      startId: options.startId || ">",
      batchSize: options.batchSize || 10,
      blockTime: options.blockTime || 5000,
      idleTime: options.idleTime || 30000,
      autoAck: options.autoAck ?? true,
      maxRetries: options.maxRetries || 3,
      deadLetterStream: options.deadLetterStream,
    };

    logger.info(
      `RedisConsumer created: ${this.options.consumerName} in group ${this.options.groupName}`,
    );
  }

  /**
   * Set message handler
   */
  onMessage(handler: (message: StreamMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Set error handler
   */
  onError(
    handler: (error: Error, message: StreamMessage) => Promise<boolean>,
  ): void {
    this.errorHandler = handler;
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Consumer is already running");
    }

    this.isRunning = true;
    this.processingPromise = this.processMessages();

    logger.info(`Consumer ${this.options.consumerName} started`);
    this.emit("started");
  }

  /**
   * Stop consuming messages
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.processingPromise) {
      await this.processingPromise;
    }

    logger.info(`Consumer ${this.options.consumerName} stopped`);
    this.emit("stopped");
  }

  private async processMessages(): Promise<void> {
    while (this.isRunning) {
      try {
        // Read messages from stream
        const result = await this.redis.xreadgroup(
          "GROUP",
          this.options.groupName,
          this.options.consumerName,
          "COUNT",
          this.options.batchSize,
          "BLOCK",
          this.options.blockTime,
          "STREAMS",
          this.options.streamKey,
          this.options.startId,
        );

        if (!result || result.length === 0) {
          continue;
        }

        // Process messages
        for (const [stream, messages] of result) {
          for (const [id, fields] of messages) {
            const message: StreamMessage = {
              id,
              timestamp: Date.now(),
              data: this.parseFieldsArray(fields),
            };

            await this.processMessage(message);
          }
        }

        // Check for pending messages from idle consumers
        await this.claimIdleMessages();
      } catch (error) {
        logger.error(`Consumer ${this.options.consumerName} error:`, error);
        this.emit("error", error);

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async processMessage(message: StreamMessage): Promise<void> {
    let retryCount = 0;

    while (retryCount <= this.options.maxRetries) {
      try {
        if (this.messageHandler) {
          await this.messageHandler(message);
        }

        // Auto-acknowledge if enabled
        if (this.options.autoAck) {
          await this.redis.xack(
            this.options.streamKey,
            this.options.groupName,
            message.id,
          );
        }

        this.emit("message:processed", message);
        return;
      } catch (error) {
        retryCount++;

        if (this.errorHandler) {
          const shouldRetry = await this.errorHandler(error, message);
          if (!shouldRetry) {
            break;
          }
        }

        if (retryCount > this.options.maxRetries) {
          // Send to dead letter stream if configured
          if (this.options.deadLetterStream) {
            await this.sendToDeadLetter(message, error);
          }

          // Acknowledge to remove from pending
          if (this.options.autoAck) {
            await this.redis.xack(
              this.options.streamKey,
              this.options.groupName,
              message.id,
            );
          }

          this.emit("message:failed", { message, error });
          break;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }
  }

  private async claimIdleMessages(): Promise<void> {
    try {
      const pending = await this.redis.xpending(
        this.options.streamKey,
        this.options.groupName,
        "-",
        "+",
        10,
      );

      for (const item of pending) {
        const [messageId, consumerName, idleTime] = item;

        if (idleTime > this.options.idleTime) {
          // Claim the message
          const claimed = await this.redis.xclaim(
            this.options.streamKey,
            this.options.groupName,
            this.options.consumerName,
            this.options.idleTime,
            messageId,
          );

          if (claimed && claimed.length > 0) {
            logger.info(
              `Claimed idle message ${messageId} from ${consumerName}`,
            );

            // Process the claimed message
            const [id, fields] = claimed;
            const message: StreamMessage = {
              id,
              timestamp: Date.now(),
              data: this.parseFieldsArray(fields),
            };

            await this.processMessage(message);
          }
        }
      }
    } catch (error) {
      logger.debug("Error claiming idle messages:", error);
    }
  }

  private async sendToDeadLetter(
    message: StreamMessage,
    error: any,
  ): Promise<void> {
    if (!this.options.deadLetterStream) return;

    try {
      const deadLetterData = {
        ...message.data,
        _original_stream: this.options.streamKey,
        _original_id: message.id,
        _error: (error as Error).message,
        _failed_at: Date.now().toString(),
        _consumer: this.options.consumerName,
        _group: this.options.groupName,
      };

      await this.redis.xadd(
        this.options.deadLetterStream,
        "*",
        ...this.flattenObject(deadLetterData),
      );

      logger.info(`Sent message ${message.id} to dead letter stream`);
    } catch (dlError) {
      logger.error("Error sending message to dead letter stream:", dlError);
    }
  }

  private parseFieldsArray(fields: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      result[fields[i]] = fields[i + 1];
    }
    return result;
  }

  private flattenObject(obj: Record<string, string>): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      result.push(key, value);
    }
    return result;
  }
}
