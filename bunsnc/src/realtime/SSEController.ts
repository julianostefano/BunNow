/**
 * Server-Sent Events (SSE) Controller for Real-time ServiceNow Integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import type { ServiceNowClient } from "../client/ServiceNowClient";
import { logger } from "../utils/Logger";
import { performanceMonitor } from "../utils/PerformanceMonitor";
import type { ErrorContext } from "../utils/ErrorHandler";

export interface SSEEvent {
  id: string;
  event: string;
  data: any;
  timestamp: number;
  table?: string;
  sys_id?: string;
  operation?: "insert" | "update" | "delete";
}

export interface SSESubscription {
  id: string;
  table: string;
  fields?: string[];
  query?: string;
  filters?: Record<string, any>;
  callback: (event: SSEEvent) => void;
  errorHandler?: (error: Error) => void;
  active: boolean;
  lastEventId?: string;
  retryCount: number;
  maxRetries: number;
}

export interface SSEOptions {
  pollInterval?: number; // Polling interval in ms (default: 5000)
  maxRetries?: number; // Max retry attempts (default: 3)
  timeout?: number; // Request timeout (default: 30000)
  bufferSize?: number; // Event buffer size (default: 100)
  enableCompression?: boolean; // Enable gzip compression
  heartbeatInterval?: number; // Heartbeat interval (default: 30000)
}

export class SSEController extends EventEmitter {
  private client: ServiceNowClient;
  private subscriptions: Map<string, SSESubscription> = new Map();
  private pollingTimers: Map<string, NodeJS.Timeout> = new Map();
  private eventBuffer: Map<string, SSEEvent[]> = new Map();
  private options: Required<SSEOptions>;
  private heartbeatTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private connectionId: string;

  constructor(client: ServiceNowClient, options: SSEOptions = {}) {
    super();
    this.client = client;
    this.options = {
      pollInterval: options.pollInterval || 5000,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 30000,
      bufferSize: options.bufferSize || 100,
      enableCompression: options.enableCompression ?? true,
      heartbeatInterval: options.heartbeatInterval || 30000,
    };
    this.connectionId = `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Setup heartbeat
    this.setupHeartbeat();

    logger.info(
      `SSEController initialized with connection ID: ${this.connectionId}`,
    );
  }

  /**
   * Subscribe to real-time events for a ServiceNow table
   */
  subscribe(
    table: string,
    callback: (event: SSEEvent) => void,
    options: {
      fields?: string[];
      query?: string;
      filters?: Record<string, any>;
      errorHandler?: (error: Error) => void;
    } = {},
  ): string {
    const subscriptionId = `${table}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const subscription: SSESubscription = {
      id: subscriptionId,
      table,
      fields: options.fields,
      query: options.query,
      filters: options.filters,
      callback,
      errorHandler: options.errorHandler,
      active: true,
      retryCount: 0,
      maxRetries: this.options.maxRetries,
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.eventBuffer.set(subscriptionId, []);

    // Start polling for this subscription
    this.startPolling(subscriptionId);

    logger.info(
      `Created SSE subscription ${subscriptionId} for table ${table}`,
    );
    this.emit("subscription:created", { subscriptionId, table });

    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    subscription.active = false;
    this.stopPolling(subscriptionId);
    this.subscriptions.delete(subscriptionId);
    this.eventBuffer.delete(subscriptionId);

    logger.info(`Unsubscribed from SSE subscription ${subscriptionId}`);
    this.emit("subscription:removed", { subscriptionId });

    return true;
  }

  /**
   * Start the SSE controller
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("SSEController is already running");
      return;
    }

    this.isRunning = true;

    // Start polling for all active subscriptions
    for (const subscriptionId of this.subscriptions.keys()) {
      this.startPolling(subscriptionId);
    }

    logger.info("SSEController started");
    this.emit("controller:started", { connectionId: this.connectionId });
  }

  /**
   * Stop the SSE controller
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop all polling timers
    for (const subscriptionId of this.subscriptions.keys()) {
      this.stopPolling(subscriptionId);
    }

    // Clear heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    logger.info("SSEController stopped");
    this.emit("controller:stopped", { connectionId: this.connectionId });
  }

  /**
   * Get subscription status and statistics
   */
  getSubscriptions(): Array<{
    id: string;
    table: string;
    active: boolean;
    eventCount: number;
    retryCount: number;
    lastEventId?: string;
  }> {
    return Array.from(this.subscriptions.values()).map((sub) => ({
      id: sub.id,
      table: sub.table,
      active: sub.active,
      eventCount: this.eventBuffer.get(sub.id)?.length || 0,
      retryCount: sub.retryCount,
      lastEventId: sub.lastEventId,
    }));
  }

  /**
   * Get buffered events for a subscription
   */
  getBufferedEvents(subscriptionId: string): SSEEvent[] {
    return this.eventBuffer.get(subscriptionId) || [];
  }

  /**
   * Clear event buffer for a subscription
   */
  clearBuffer(subscriptionId: string): void {
    const buffer = this.eventBuffer.get(subscriptionId);
    if (buffer) {
      buffer.length = 0;
    }
  }

  /**
   * Pause a subscription
   */
  pauseSubscription(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    subscription.active = false;
    this.stopPolling(subscriptionId);

    logger.info(`Paused SSE subscription ${subscriptionId}`);
    this.emit("subscription:paused", { subscriptionId });

    return true;
  }

  /**
   * Resume a subscription
   */
  resumeSubscription(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    subscription.active = true;
    subscription.retryCount = 0; // Reset retry count
    this.startPolling(subscriptionId);

    logger.info(`Resumed SSE subscription ${subscriptionId}`);
    this.emit("subscription:resumed", { subscriptionId });

    return true;
  }

  private startPolling(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription || !subscription.active || !this.isRunning) {
      return;
    }

    const poll = async () => {
      const timerName = `sse_poll_${subscriptionId}`;
      performanceMonitor.startTimer(timerName);

      try {
        await this.pollForEvents(subscription);
        subscription.retryCount = 0; // Reset on success
      } catch (error: unknown) {
        logger.error(
          `SSE polling error for subscription ${subscriptionId}:`,
          error,
        );

        subscription.retryCount++;

        if (subscription.retryCount >= subscription.maxRetries) {
          logger.error(
            `Max retries exceeded for subscription ${subscriptionId}, deactivating`,
          );
          subscription.active = false;
          this.emit("subscription:failed", {
            subscriptionId,
            error: error.message,
            retryCount: subscription.retryCount,
          });

          if (subscription.errorHandler) {
            subscription.errorHandler(error as Error);
          }
          return;
        }

        this.emit("subscription:error", {
          subscriptionId,
          error: error.message,
          retryCount: subscription.retryCount,
        });
      } finally {
        performanceMonitor.endTimer(timerName);
      }

      // Schedule next poll if still active
      if (subscription.active && this.isRunning) {
        const timeout = setTimeout(poll, this.options.pollInterval);
        this.pollingTimers.set(subscriptionId, timeout);
      }
    };

    // Start immediate poll
    poll();
  }

  private stopPolling(subscriptionId: string): void {
    const timer = this.pollingTimers.get(subscriptionId);
    if (timer) {
      clearTimeout(timer);
      this.pollingTimers.delete(subscriptionId);
    }
  }

  private async pollForEvents(subscription: SSESubscription): Promise<void> {
    const gr = this.client.GlideRecord(subscription.table);

    // Apply query filters
    if (subscription.query) {
      gr.addEncodedQuery(subscription.query);
    }

    // Apply field filters
    if (subscription.filters) {
      for (const [field, value] of Object.entries(subscription.filters)) {
        gr.addQuery(field, value);
      }
    }

    // Only get records modified since last poll
    if (subscription.lastEventId) {
      gr.addQuery("sys_updated_on", ">", subscription.lastEventId);
    }

    // Order by sys_updated_on to process in chronological order
    gr.orderBy("sys_updated_on");

    // Set reasonable limit to prevent overwhelming
    gr.setLimit(50);

    await gr.query();

    const events: SSEEvent[] = [];
    let latestTimestamp = subscription.lastEventId;

    while (gr.next()) {
      const event: SSEEvent = {
        id: `${subscription.table}_${gr.getValue("sys_id")}_${gr.getValue("sys_updated_on")}`,
        event: "record_updated",
        data: this.buildEventData(gr, subscription.fields),
        timestamp: Date.now(),
        table: subscription.table,
        sys_id: gr.getValue("sys_id"),
        operation: this.detectOperation(gr),
      };

      events.push(event);
      latestTimestamp = gr.getValue("sys_updated_on");
    }

    // Update last event timestamp
    if (latestTimestamp) {
      subscription.lastEventId = latestTimestamp;
    }

    // Process events
    for (const event of events) {
      this.processEvent(subscription, event);
    }
  }

  private buildEventData(gr: any, fields?: string[]): any {
    const data: any = {
      sys_id: gr.getValue("sys_id"),
      sys_updated_on: gr.getValue("sys_updated_on"),
      sys_updated_by: gr.getDisplayValue("sys_updated_by"),
    };

    if (fields) {
      for (const field of fields) {
        data[field] = gr.getValue(field);
        data[`${field}_display`] = gr.getDisplayValue(field);
      }
    } else {
      // Get all fields if none specified
      const record = gr.serialize();
      Object.assign(data, record);
    }

    return data;
  }

  private detectOperation(gr: any): "insert" | "update" | "delete" {
    // Simple heuristic - in real implementation, you might need more sophisticated logic
    const createdOn = new Date(gr.getValue("sys_created_on")).getTime();
    const updatedOn = new Date(gr.getValue("sys_updated_on")).getTime();

    // If created and updated timestamps are very close (within 1 second), it's likely an insert
    if (Math.abs(updatedOn - createdOn) < 1000) {
      return "insert";
    }

    return "update";
  }

  private processEvent(subscription: SSESubscription, event: SSEEvent): void {
    try {
      // Add to buffer
      const buffer = this.eventBuffer.get(subscription.id);
      if (buffer) {
        buffer.push(event);

        // Maintain buffer size limit
        if (buffer.length > this.options.bufferSize) {
          buffer.shift(); // Remove oldest event
        }
      }

      // Call subscription callback
      subscription.callback(event);

      // Emit global event
      this.emit("event", { subscriptionId: subscription.id, event });

      logger.debug(
        `Processed SSE event ${event.id} for subscription ${subscription.id}`,
      );
    } catch (error: unknown) {
      logger.error(`Error processing SSE event ${event.id}:`, error);

      if (subscription.errorHandler) {
        subscription.errorHandler(error as Error);
      }
    }
  }

  private setupHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isRunning) {
        this.emit("heartbeat", {
          connectionId: this.connectionId,
          timestamp: Date.now(),
          activeSubscriptions: Array.from(this.subscriptions.values()).filter(
            (sub) => sub.active,
          ).length,
        });
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Get controller statistics
   */
  getStats(): {
    connectionId: string;
    isRunning: boolean;
    totalSubscriptions: number;
    activeSubscriptions: number;
    totalEvents: number;
    uptime: number;
  } {
    const startTime = performanceMonitor.getStartTime();
    const uptime = Date.now() - startTime;

    const totalEvents = Array.from(this.eventBuffer.values()).reduce(
      (sum, buffer) => sum + buffer.length,
      0,
    );

    return {
      connectionId: this.connectionId,
      isRunning: this.isRunning,
      totalSubscriptions: this.subscriptions.size,
      activeSubscriptions: Array.from(this.subscriptions.values()).filter(
        (sub) => sub.active,
      ).length,
      totalEvents,
      uptime,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.subscriptions.clear();
    this.eventBuffer.clear();
    this.pollingTimers.clear();

    logger.info(`SSEController ${this.connectionId} destroyed`);
  }
}

/**
 * SSE Event Stream class for easier consumption
 */
export class SSEEventStream extends EventEmitter {
  private controller: SSEController;
  private subscriptionId?: string;

  constructor(
    client: ServiceNowClient,
    table: string,
    options: {
      fields?: string[];
      query?: string;
      filters?: Record<string, any>;
      sseOptions?: SSEOptions;
    } = {},
  ) {
    super();

    this.controller = new SSEController(client, options.sseOptions);

    // Subscribe to table events
    this.subscriptionId = this.controller.subscribe(
      table,
      (event: SSEEvent) => this.emit("data", event),
      {
        fields: options.fields,
        query: options.query,
        filters: options.filters,
        errorHandler: (error: Error) => this.emit("error", error),
      },
    );

    // Forward controller events
    this.controller.on("controller:started", () => this.emit("connected"));
    this.controller.on("controller:stopped", () => this.emit("disconnected"));
    this.controller.on("heartbeat", (data) => this.emit("heartbeat", data));

    // Start the controller
    this.controller.start();
  }

  /**
   * Close the event stream
   */
  close(): void {
    if (this.subscriptionId) {
      this.controller.unsubscribe(this.subscriptionId);
    }
    this.controller.destroy();
    this.removeAllListeners();
  }

  /**
   * Get stream statistics
   */
  getStats() {
    return this.controller.getStats();
  }

  /**
   * Pause the stream
   */
  pause(): void {
    if (this.subscriptionId) {
      this.controller.pauseSubscription(this.subscriptionId);
    }
  }

  /**
   * Resume the stream
   */
  resume(): void {
    if (this.subscriptionId) {
      this.controller.resumeSubscription(this.subscriptionId);
    }
  }
}
