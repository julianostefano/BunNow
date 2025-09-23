/**
 * High-Performance Streaming Data Processor with Backpressure Handling
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { Transform, Readable, Writable, pipeline } from "stream";
import { Worker } from "worker_threads";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";

export interface StreamProcessorConfig {
  name: string;
  batchSize: number;
  maxConcurrency: number;
  bufferSize: number;
  backpressureThreshold: number;
  backpressureStrategy: "drop" | "buffer" | "throttle" | "circuit_breaker";
  timeoutMs: number;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    alertThresholds: {
      bufferUtilization: number;
      processingLatency: number;
      errorRate: number;
      throughput: number;
    };
  };
}

export interface ProcessorMetrics {
  timestamp: number;
  recordsProcessed: number;
  recordsDropped: number;
  recordsBuffered: number;
  recordsErrored: number;
  avgProcessingTimeMs: number;
  bufferUtilization: number;
  throughputPerSecond: number;
  errorRate: number;
  backpressureEvents: number;
  memoryUsageMB: number;
  cpuUtilization: number;
}

export interface BackpressureState {
  isActive: boolean;
  threshold: number;
  currentLoad: number;
  strategy: string;
  activeSince?: number;
  mitigationActions: string[];
}

export type ProcessingFunction<T, R> = (batch: T[]) => Promise<R[]>;
export type FilterFunction<T> = (record: T) => boolean;
export type TransformFunction<T, R> = (record: T) => R | Promise<R>;

export class StreamProcessor<T = any, R = any> extends EventEmitter {
  private config: StreamProcessorConfig;
  private buffer: T[] = [];
  private isProcessing: boolean = false;
  private isPaused: boolean = false;
  private circuitBreakerOpen: boolean = false;
  private consecutiveErrors: number = 0;
  private lastProcessingTime: number = 0;
  private metricsHistory: ProcessorMetrics[] = [];
  private backpressureState: BackpressureState = {
    isActive: false,
    threshold: 0,
    currentLoad: 0,
    strategy: "buffer",
    mitigationActions: [],
  };

  // Processing components
  private workers: Worker[] = [];
  private processingQueue: Array<{
    batch: T[];
    resolve: Function;
    reject: Function;
  }> = [];
  private monitoringInterval?: NodeJS.Timeout;

  // Metrics tracking
  private startTime: number = Date.now();
  private totalProcessed: number = 0;
  private totalDropped: number = 0;
  private totalErrored: number = 0;
  private processingTimes: number[] = [];

  constructor(config: StreamProcessorConfig) {
    super();
    this.config = { ...config };
    this.backpressureState.threshold = config.backpressureThreshold;
    this.backpressureState.strategy = config.backpressureStrategy;

    this.initializeWorkers();

    if (config.monitoring.enabled) {
      this.startMonitoring();
    }

    logger.info(`StreamProcessor initialized: ${config.name}`);
  }

  /**
   * Create a processing stream with backpressure handling
   */
  createProcessingStream(processingFn: ProcessingFunction<T, R>): Transform {
    const processor = this;

    return new Transform({
      objectMode: true,
      highWaterMark: this.config.bufferSize,

      async transform(chunk: T, encoding, callback) {
        try {
          // Check backpressure before processing
          if (processor.shouldApplyBackpressure()) {
            await processor.handleBackpressure(chunk);
          }

          // Add to processing buffer
          processor.buffer.push(chunk);

          // Process if buffer is full or timeout reached
          if (
            processor.buffer.length >= processor.config.batchSize ||
            Date.now() - processor.lastProcessingTime >
              processor.config.timeoutMs
          ) {
            const batch = processor.buffer.splice(
              0,
              processor.config.batchSize,
            );

            try {
              const results = await processor.processBatch(batch, processingFn);

              // Push results to next stage
              for (const result of results) {
                this.push(result);
              }

              processor.updateMetrics(batch.length, 0, results.length);
            } catch (error: unknown) {
              processor.handleProcessingError(error, batch);
              // Optionally push error records to dead letter queue
              this.emit("error", error);
            }
          }

          callback();
        } catch (error: unknown) {
          callback(error);
        }
      },

      async flush(callback) {
        // Process remaining buffer on stream end
        if (processor.buffer.length > 0) {
          try {
            const results = await processor.processBatch(
              processor.buffer,
              processingFn,
            );
            for (const result of results) {
              this.push(result);
            }
            processor.buffer = [];
          } catch (error: unknown) {
            this.emit("error", error);
          }
        }

        callback();
      },
    });
  }

  /**
   * Create a filtering stream
   */
  createFilterStream(filterFn: FilterFunction<T>): Transform {
    const processor = this;

    return new Transform({
      objectMode: true,

      transform(chunk: T, encoding, callback) {
        try {
          if (filterFn(chunk)) {
            this.push(chunk);
            processor.totalProcessed++;
          } else {
            processor.totalDropped++;
          }
          callback();
        } catch (error: unknown) {
          callback(error);
        }
      },
    });
  }

  /**
   * Create a transformation stream
   */
  createTransformStream(transformFn: TransformFunction<T, R>): Transform {
    const processor = this;

    return new Transform({
      objectMode: true,

      async transform(chunk: T, encoding, callback) {
        try {
          const result = await transformFn(chunk);
          this.push(result);
          processor.totalProcessed++;
          callback();
        } catch (error: unknown) {
          processor.totalErrored++;
          processor.handleProcessingError(error, [chunk]);
          callback(); // Continue processing
        }
      },
    });
  }

  /**
   * Create a batching stream that groups records
   */
  createBatchingStream(batchSize: number = this.config.batchSize): Transform {
    let batch: T[] = [];

    return new Transform({
      objectMode: true,

      transform(chunk: T, encoding, callback) {
        batch.push(chunk);

        if (batch.length >= batchSize) {
          this.push([...batch]);
          batch = [];
        }

        callback();
      },

      flush(callback) {
        if (batch.length > 0) {
          this.push(batch);
        }
        callback();
      },
    });
  }

  /**
   * Create a debouncing stream that throttles rapid updates
   */
  createDebouncingStream(debounceMs: number): Transform {
    const pendingRecords = new Map<
      string,
      { record: T; timer: NodeJS.Timeout }
    >();

    return new Transform({
      objectMode: true,

      transform(chunk: T, encoding, callback) {
        const key = this.getRecordKey(chunk);

        // Clear existing timer for this key
        const existing = pendingRecords.get(key);
        if (existing) {
          clearTimeout(existing.timer);
        }

        // Set new timer
        const timer = setTimeout(() => {
          this.push(chunk);
          pendingRecords.delete(key);
        }, debounceMs);

        pendingRecords.set(key, { record: chunk, timer });
        callback();
      },

      getRecordKey(record: T): string {
        // Override this method to provide custom key extraction
        return JSON.stringify(record);
      },

      flush(callback) {
        // Flush all pending records
        for (const [key, { record, timer }] of pendingRecords) {
          clearTimeout(timer);
          this.push(record);
        }
        pendingRecords.clear();
        callback();
      },
    });
  }

  /**
   * Create a rate limiting stream
   */
  createRateLimitingStream(maxRatePerSecond: number): Transform {
    let tokens = maxRatePerSecond;
    const refillInterval = setInterval(() => {
      tokens = Math.min(maxRatePerSecond, tokens + maxRatePerSecond);
    }, 1000);

    return new Transform({
      objectMode: true,

      async transform(chunk: T, encoding, callback) {
        // Wait for token availability
        while (tokens <= 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        tokens--;
        this.push(chunk);
        callback();
      },

      destroy(error, callback) {
        clearInterval(refillInterval);
        callback(error);
      },
    });
  }

  /**
   * Create a dead letter queue stream for failed records
   */
  createDeadLetterStream(maxRetries: number = 3): Transform {
    const retryTracker = new Map<string, number>();
    const processor = this;

    return new Transform({
      objectMode: true,

      async transform(
        chunk: { record: T; error: Error; attempt?: number },
        encoding,
        callback,
      ) {
        const recordKey = JSON.stringify(chunk.record);
        const currentAttempts = retryTracker.get(recordKey) || 0;

        if (currentAttempts < maxRetries) {
          // Retry with exponential backoff
          const backoffMs = Math.min(
            1000 * Math.pow(2, currentAttempts),
            processor.config.retryPolicy.maxBackoffMs,
          );

          await new Promise((resolve) => setTimeout(resolve, backoffMs));

          retryTracker.set(recordKey, currentAttempts + 1);

          // Push back for retry
          this.push({ ...chunk, attempt: currentAttempts + 1 });
        } else {
          // Send to dead letter queue
          processor.emit("dead_letter", {
            record: chunk.record,
            error: chunk.error,
            attempts: currentAttempts + 1,
            timestamp: Date.now(),
          });

          retryTracker.delete(recordKey);
        }

        callback();
      },
    });
  }

  /**
   * Process a batch of records with the given processing function
   */
  async processBatch(
    batch: T[],
    processingFn: ProcessingFunction<T, R>,
  ): Promise<R[]> {
    if (this.circuitBreakerOpen) {
      throw new Error(
        "Circuit breaker is open - processing temporarily disabled",
      );
    }

    const startTime = Date.now();
    const timerName = "stream_processing_batch";
    performanceMonitor.startTimer(timerName);

    try {
      const results = await Promise.race([
        processingFn(batch),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("Processing timeout")),
            this.config.timeoutMs,
          );
        }),
      ]);

      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);

      // Keep only recent processing times for metrics
      if (this.processingTimes.length > 100) {
        this.processingTimes = this.processingTimes.slice(-100);
      }

      this.consecutiveErrors = 0;
      this.lastProcessingTime = Date.now();

      return results;
    } catch (error: unknown) {
      this.consecutiveErrors++;

      // Open circuit breaker if too many consecutive errors
      if (this.consecutiveErrors >= 5) {
        this.circuitBreakerOpen = true;
        setTimeout(() => {
          this.circuitBreakerOpen = false;
          this.consecutiveErrors = 0;
          logger.info(`Circuit breaker reset for ${this.config.name}`);
        }, 30000); // 30 seconds

        logger.warn(`Circuit breaker opened for ${this.config.name}`);
      }

      throw error;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Check if backpressure should be applied
   */
  private shouldApplyBackpressure(): boolean {
    const bufferUtilization = this.buffer.length / this.config.bufferSize;
    const processingQueueSize = this.processingQueue.length;
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB

    this.backpressureState.currentLoad = Math.max(
      bufferUtilization,
      processingQueueSize / this.config.maxConcurrency,
      memoryUsage / 1000, // Assume 1GB threshold
    );

    return (
      this.backpressureState.currentLoad > this.backpressureState.threshold
    );
  }

  /**
   * Handle backpressure based on configured strategy
   */
  private async handleBackpressure(record: T): Promise<void> {
    if (!this.backpressureState.isActive) {
      this.backpressureState.isActive = true;
      this.backpressureState.activeSince = Date.now();

      logger.warn(
        `Backpressure activated for ${this.config.name}: ${this.backpressureState.currentLoad.toFixed(2)} > ${this.backpressureState.threshold}`,
      );
      this.emit("backpressure:activated", this.backpressureState);
    }

    switch (this.config.backpressureStrategy) {
      case "drop":
        // Drop the record
        this.totalDropped++;
        this.backpressureState.mitigationActions.push("dropped_record");
        throw new Error("Record dropped due to backpressure");

      case "buffer":
        // Wait for buffer space to become available
        while (this.buffer.length >= this.config.bufferSize) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        break;

      case "throttle":
        // Introduce delay to slow down processing
        const delay = Math.min(this.backpressureState.currentLoad * 100, 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        this.backpressureState.mitigationActions.push(`throttled_${delay}ms`);
        break;

      case "circuit_breaker":
        // Temporarily stop processing
        this.isPaused = true;
        this.backpressureState.mitigationActions.push("circuit_breaker_open");

        setTimeout(() => {
          this.isPaused = false;
          this.backpressureState.isActive = false;
          logger.info(`Circuit breaker reset for ${this.config.name}`);
        }, 5000); // 5 seconds

        while (this.isPaused) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        break;
    }
  }

  /**
   * Handle processing errors with retry logic
   */
  private handleProcessingError(error: Error, batch: T[]): void {
    this.totalErrored += batch.length;

    logger.error(`Processing error in ${this.config.name}:`, error);

    this.emit("processing:error", {
      error,
      batchSize: batch.length,
      consecutiveErrors: this.consecutiveErrors,
      timestamp: Date.now(),
    });

    // Send to dead letter queue if configured
    if (this.listenerCount("dead_letter") > 0) {
      for (const record of batch) {
        this.emit("dead_letter", {
          record,
          error,
          attempts: 1,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Update metrics tracking
   */
  private updateMetrics(
    processed: number,
    dropped: number,
    succeeded: number,
  ): void {
    this.totalProcessed += succeeded;
    this.totalDropped += dropped;

    // Reset backpressure state if load is below threshold
    if (this.backpressureState.isActive && !this.shouldApplyBackpressure()) {
      const duration = Date.now() - (this.backpressureState.activeSince || 0);

      logger.info(
        `Backpressure deactivated for ${this.config.name} after ${duration}ms`,
      );

      this.backpressureState.isActive = false;
      this.backpressureState.activeSince = undefined;
      this.backpressureState.mitigationActions = [];

      this.emit("backpressure:deactivated", { duration });
    }
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): ProcessorMetrics {
    const now = Date.now();
    const runtimeMs = now - this.startTime;
    const avgProcessingTime =
      this.processingTimes.length > 0
        ? this.processingTimes.reduce((sum, time) => sum + time, 0) /
          this.processingTimes.length
        : 0;

    const metrics: ProcessorMetrics = {
      timestamp: now,
      recordsProcessed: this.totalProcessed,
      recordsDropped: this.totalDropped,
      recordsBuffered: this.buffer.length,
      recordsErrored: this.totalErrored,
      avgProcessingTimeMs: avgProcessingTime,
      bufferUtilization: this.buffer.length / this.config.bufferSize,
      throughputPerSecond:
        runtimeMs > 0 ? (this.totalProcessed / runtimeMs) * 1000 : 0,
      errorRate:
        this.totalProcessed > 0 ? this.totalErrored / this.totalProcessed : 0,
      backpressureEvents: this.backpressureState.isActive ? 1 : 0,
      memoryUsageMB: process.memoryUsage().heapUsed / 1024 / 1024,
      cpuUtilization: (process.cpuUsage().user / 1000 / runtimeMs) * 100,
    };

    // Store metrics history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > 1000) {
      this.metricsHistory = this.metricsHistory.slice(-1000);
    }

    return metrics;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): ProcessorMetrics[] {
    return limit ? this.metricsHistory.slice(-limit) : [...this.metricsHistory];
  }

  /**
   * Start monitoring and alerting
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const metrics = this.getCurrentMetrics();

      this.emit("metrics:update", metrics);

      // Check alert thresholds
      const thresholds = this.config.monitoring.alertThresholds;

      if (metrics.bufferUtilization > thresholds.bufferUtilization) {
        this.emit("alert:buffer_utilization", {
          current: metrics.bufferUtilization,
          threshold: thresholds.bufferUtilization,
          severity: "warning",
        });
      }

      if (metrics.avgProcessingTimeMs > thresholds.processingLatency) {
        this.emit("alert:processing_latency", {
          current: metrics.avgProcessingTimeMs,
          threshold: thresholds.processingLatency,
          severity: "warning",
        });
      }

      if (metrics.errorRate > thresholds.errorRate) {
        this.emit("alert:error_rate", {
          current: metrics.errorRate,
          threshold: thresholds.errorRate,
          severity: "critical",
        });
      }

      if (metrics.throughputPerSecond < thresholds.throughput) {
        this.emit("alert:low_throughput", {
          current: metrics.throughputPerSecond,
          threshold: thresholds.throughput,
          severity: "warning",
        });
      }
    }, this.config.monitoring.metricsInterval);

    logger.info(`Monitoring started for ${this.config.name}`);
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info(`Monitoring stopped for ${this.config.name}`);
    }
  }

  /**
   * Initialize worker threads for parallel processing
   */
  private initializeWorkers(): void {
    // Worker thread setup would be implemented here
    // For now, we'll use the main thread
    logger.debug(
      `Workers initialized for ${this.config.name} (using main thread)`,
    );
  }

  /**
   * Shutdown processor gracefully
   */
  async shutdown(): Promise<void> {
    logger.info(`Shutting down stream processor: ${this.config.name}`);

    this.isPaused = true;
    this.stopMonitoring();

    // Process remaining buffer
    if (this.buffer.length > 0) {
      logger.info(
        `Processing remaining ${this.buffer.length} records in buffer`,
      );
      // Would process the remaining buffer here
    }

    // Terminate workers
    const workerPromises = this.workers.map((worker) => worker.terminate());
    await Promise.all(workerPromises);

    this.emit("shutdown", {
      totalProcessed: this.totalProcessed,
      totalDropped: this.totalDropped,
      totalErrored: this.totalErrored,
      finalMetrics: this.getCurrentMetrics(),
    });

    logger.info(`Stream processor shutdown complete: ${this.config.name}`);
  }

  /**
   * Get current backpressure state
   */
  getBackpressureState(): BackpressureState {
    return { ...this.backpressureState };
  }

  /**
   * Pause processing
   */
  pause(): void {
    this.isPaused = true;
    this.emit("paused");
    logger.info(`Stream processor paused: ${this.config.name}`);
  }

  /**
   * Resume processing
   */
  resume(): void {
    this.isPaused = false;
    this.emit("resumed");
    logger.info(`Stream processor resumed: ${this.config.name}`);
  }

  /**
   * Check if processor is healthy
   */
  isHealthy(): boolean {
    const metrics = this.getCurrentMetrics();
    const thresholds = this.config.monitoring.alertThresholds;

    return (
      !this.circuitBreakerOpen &&
      !this.isPaused &&
      metrics.errorRate < thresholds.errorRate &&
      metrics.bufferUtilization < 0.9 &&
      this.consecutiveErrors < 3
    );
  }
}

/**
 * Stream processor factory for common ServiceNow use cases
 */
export class ServiceNowStreamProcessorFactory {
  /**
   * Create processor for real-time incident processing
   */
  static createIncidentProcessor(
    config: Partial<StreamProcessorConfig> = {},
  ): StreamProcessor {
    const defaultConfig: StreamProcessorConfig = {
      name: "ServiceNow_Incident_Processor",
      batchSize: 100,
      maxConcurrency: 4,
      bufferSize: 1000,
      backpressureThreshold: 0.8,
      backpressureStrategy: "throttle",
      timeoutMs: 30000,
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        maxBackoffMs: 30000,
      },
      monitoring: {
        enabled: true,
        metricsInterval: 5000,
        alertThresholds: {
          bufferUtilization: 0.8,
          processingLatency: 10000,
          errorRate: 0.05,
          throughput: 50,
        },
      },
    };

    return new StreamProcessor({ ...defaultConfig, ...config });
  }

  /**
   * Create processor for high-volume data export
   */
  static createExportProcessor(
    config: Partial<StreamProcessorConfig> = {},
  ): StreamProcessor {
    const defaultConfig: StreamProcessorConfig = {
      name: "ServiceNow_Export_Processor",
      batchSize: 1000,
      maxConcurrency: 8,
      bufferSize: 10000,
      backpressureThreshold: 0.9,
      backpressureStrategy: "buffer",
      timeoutMs: 120000,
      retryPolicy: {
        maxRetries: 5,
        backoffMultiplier: 1.5,
        maxBackoffMs: 60000,
      },
      monitoring: {
        enabled: true,
        metricsInterval: 10000,
        alertThresholds: {
          bufferUtilization: 0.9,
          processingLatency: 30000,
          errorRate: 0.01,
          throughput: 1000,
        },
      },
    };

    return new StreamProcessor({ ...defaultConfig, ...config });
  }

  /**
   * Create processor for real-time notifications
   */
  static createNotificationProcessor(
    config: Partial<StreamProcessorConfig> = {},
  ): StreamProcessor {
    const defaultConfig: StreamProcessorConfig = {
      name: "ServiceNow_Notification_Processor",
      batchSize: 50,
      maxConcurrency: 2,
      bufferSize: 500,
      backpressureThreshold: 0.7,
      backpressureStrategy: "circuit_breaker",
      timeoutMs: 5000,
      retryPolicy: {
        maxRetries: 2,
        backoffMultiplier: 2,
        maxBackoffMs: 5000,
      },
      monitoring: {
        enabled: true,
        metricsInterval: 2000,
        alertThresholds: {
          bufferUtilization: 0.7,
          processingLatency: 3000,
          errorRate: 0.1,
          throughput: 100,
        },
      },
    };

    return new StreamProcessor({ ...defaultConfig, ...config });
  }
}

// Utility functions for stream processing
export class StreamUtils {
  /**
   * Create a pipeline from multiple stream processors
   */
  static createPipeline<T>(...streams: Transform[]): Promise<void> {
    return new Promise((resolve, reject) => {
      pipeline(...streams, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Create a fan-out stream that duplicates records to multiple destinations
   */
  static createFanOut<T>(destinations: Writable[]): Transform {
    return new Transform({
      objectMode: true,

      transform(chunk: T, encoding, callback) {
        // Send to all destinations
        for (const dest of destinations) {
          dest.write(chunk);
        }

        // Also pass through to next stage
        this.push(chunk);
        callback();
      },
    });
  }

  /**
   * Create a merge stream that combines multiple sources
   */
  static createMerge<T>(sources: Readable[]): Transform {
    const mergeStream = new Transform({
      objectMode: true,

      transform(chunk: T, encoding, callback) {
        this.push(chunk);
        callback();
      },
    });

    // Pipe all sources to merge stream
    for (const source of sources) {
      source.pipe(mergeStream, { end: false });
    }

    return mergeStream;
  }

  /**
   * Create a conditional routing stream
   */
  static createRouter<T>(
    conditions: Array<{ predicate: (record: T) => boolean; stream: Writable }>,
  ): Transform {
    return new Transform({
      objectMode: true,

      transform(chunk: T, encoding, callback) {
        let routed = false;

        for (const { predicate, stream } of conditions) {
          if (predicate(chunk)) {
            stream.write(chunk);
            routed = true;
            break;
          }
        }

        if (!routed) {
          // Default: pass through if no conditions match
          this.push(chunk);
        }

        callback();
      },
    });
  }
}
