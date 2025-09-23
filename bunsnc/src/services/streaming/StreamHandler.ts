/**
 * Stream Handler - Processa eventos Redis Streams para sync real-time
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  serviceNowStreams,
  ServiceNowChange,
} from "../../config/redis-streams";
import { ticketSearchService } from "../TicketSearchService";
import { sseManager } from "../../notifications/SSEManager";
import { logger } from "../../utils/Logger";
import { ErrorHandler } from "../../utils/ErrorHandler";

export interface StreamHandlerConfig {
  enableNotifications: boolean;
  enableMongoDB: boolean;
  enableSSE: boolean;
  debugMode: boolean;
}

export class StreamHandler {
  private config: StreamHandlerConfig;
  private isRunning = false;
  private processedCount = 0;
  private errorCount = 0;

  constructor(config: Partial<StreamHandlerConfig> = {}) {
    this.config = {
      enableNotifications: true,
      enableMongoDB: true,
      enableSSE: true,
      debugMode: false,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    try {
      logger.info("🚀 [StreamHandler] Initializing stream processing...");

      serviceNowStreams.registerConsumer(
        ["incident", "change_task", "sc_task"],
        this.handleTicketChange.bind(this),
      );

      serviceNowStreams.subscribe(
        "ticket-updates",
        this.handleSSENotification.bind(this),
      );

      this.isRunning = true;
      logger.info("✅ [StreamHandler] Stream processing initialized");
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("StreamHandler.initialize", error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.isRunning) {
      await this.initialize();
    }

    logger.info("🎯 [StreamHandler] Starting stream consumer...");

    try {
      await serviceNowStreams.startConsumer();
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("StreamHandler.start", error);
      this.isRunning = false;
      throw error;
    }
  }

  private async handleTicketChange(change: ServiceNowChange): Promise<void> {
    try {
      this.processedCount++;

      if (this.config.debugMode) {
        logger.debug(
          `🔄 [StreamHandler] Processing: ${change.type}:${change.action} - ${change.number}`,
        );
      }

      if (this.config.enableMongoDB) {
        await this.updateMongoDB(change);
      }

      if (this.config.enableNotifications) {
        await this.sendNotifications(change);
      }

      logger.info(
        `✅ [StreamHandler] Processed ${change.type}:${change.action} - ${change.number}`,
      );
    } catch (error: unknown) {
      this.errorCount++;
      ErrorHandler.logUnknownError(
        `StreamHandler.handleTicketChange:${change.type}`,
        error,
      );
    }
  }

  private async handleSSENotification(change: ServiceNowChange): Promise<void> {
    try {
      if (!this.config.enableSSE) {
        return;
      }

      const notification = {
        type: "ticket_update",
        data: {
          ticketType: change.type,
          action: change.action,
          number: change.number,
          state: change.state,
          assignmentGroup: change.assignment_group,
          description: change.short_description,
          timestamp: change.timestamp,
        },
      };

      sseManager.broadcast("ticket-updates", notification);

      if (this.config.debugMode) {
        logger.debug(
          `📡 [StreamHandler] SSE notification sent: ${change.number}`,
        );
      }
    } catch (error: unknown) {
      ErrorHandler.logUnknownError(
        "StreamHandler.handleSSENotification",
        error,
      );
    }
  }

  private async updateMongoDB(change: ServiceNowChange): Promise<void> {
    try {
      const collection = this.getCollectionName(change.type);
      if (!collection) {
        logger.warn(`⚠️ [StreamHandler] Unknown ticket type: ${change.type}`);
        return;
      }

      const updateData = {
        $set: {
          "raw_data.state": change.state,
          "raw_data.assignment_group": change.assignment_group,
          "raw_data.short_description": change.short_description,
          last_updated: new Date(),
          sync_status: "synced",
          stream_processed: true,
        },
        $inc: {
          sync_count: 1,
        },
        $push: {
          change_history: {
            action: change.action,
            timestamp: change.timestamp,
            state: change.state,
            processed_at: new Date(),
          },
        },
      };

      const filter = { "raw_data.sys_id": change.sys_id };

      const result = await ticketSearchService.updateTicket(
        collection,
        filter,
        updateData,
      );

      if (result && result.modifiedCount > 0) {
        logger.debug(
          `📝 [StreamHandler] MongoDB updated: ${change.number} in ${collection}`,
        );
      } else {
        logger.warn(
          `⚠️ [StreamHandler] No document updated for ${change.number}`,
        );
      }
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("StreamHandler.updateMongoDB", error);
    }
  }

  private async sendNotifications(change: ServiceNowChange): Promise<void> {
    try {
      const notificationData = {
        id: `${change.type}_${change.sys_id}_${Date.now()}`,
        type: this.getNotificationType(change),
        title: this.getNotificationTitle(change),
        message: this.getNotificationMessage(change),
        data: {
          ticketType: change.type,
          ticketNumber: change.number,
          sysId: change.sys_id,
          state: change.state,
          action: change.action,
        },
        timestamp: new Date().toISOString(),
        priority: this.getNotificationPriority(change),
      };

      sseManager.broadcast("notifications", notificationData);

      if (this.config.debugMode) {
        logger.debug(
          `🔔 [StreamHandler] Notification sent: ${notificationData.title}`,
        );
      }
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("StreamHandler.sendNotifications", error);
    }
  }

  private getCollectionName(ticketType: string): string | null {
    const mapping: Record<string, string> = {
      incident: "incidents_complete",
      change_task: "change_tasks_complete",
      ctask: "change_tasks_complete",
      sc_task: "sc_tasks_complete",
      sctask: "sc_tasks_complete",
    };

    return mapping[ticketType] || null;
  }

  private getNotificationType(change: ServiceNowChange): string {
    switch (change.action) {
      case "created":
        return "ticket_created";
      case "updated":
        return "ticket_updated";
      case "resolved":
        return "ticket_resolved";
      case "completed":
        return "ticket_completed";
      default:
        return "ticket_changed";
    }
  }

  private getNotificationTitle(change: ServiceNowChange): string {
    const typeLabels = {
      incident: "Incident",
      change_task: "Change Task",
      sc_task: "Service Catalog Task",
    };

    const actionLabels = {
      created: "Created",
      updated: "Updated",
      resolved: "Resolved",
      completed: "Completed",
    };

    const typeLabel = typeLabels[change.type] || change.type;
    const actionLabel = actionLabels[change.action] || change.action;

    return `${typeLabel} ${actionLabel}: ${change.number}`;
  }

  private getNotificationMessage(change: ServiceNowChange): string {
    const messages = {
      created: `New ${change.type} ${change.number} has been created`,
      updated: `${change.type} ${change.number} has been updated`,
      resolved: `${change.type} ${change.number} has been resolved`,
      completed: `${change.type} ${change.number} has been completed`,
    };

    const baseMessage =
      messages[change.action] || `${change.type} ${change.number} has changed`;

    if (change.assignment_group) {
      return `${baseMessage} (assigned to ${change.assignment_group})`;
    }

    return baseMessage;
  }

  private getNotificationPriority(
    change: ServiceNowChange,
  ): "low" | "medium" | "high" | "critical" {
    if (change.action === "created") {
      return "medium";
    }

    if (change.action === "resolved" || change.action === "completed") {
      return "low";
    }

    if (change.type === "incident") {
      return "high";
    }

    return "medium";
  }

  async stop(): Promise<void> {
    try {
      logger.info("🛑 [StreamHandler] Stopping stream processing...");
      this.isRunning = false;
      await serviceNowStreams.close();
      logger.info("✅ [StreamHandler] Stream processing stopped");
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("StreamHandler.stop", error);
    }
  }

  getStats(): {
    isRunning: boolean;
    processedCount: number;
    errorCount: number;
    successRate: number;
  } {
    const successRate =
      this.processedCount > 0
        ? ((this.processedCount - this.errorCount) / this.processedCount) * 100
        : 0;

    return {
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    redisConnection: boolean;
    streamStats: any;
    processingStats: any;
  }> {
    try {
      const redisHealth = await serviceNowStreams.healthCheck();
      const streamStats = await serviceNowStreams.getStreamStats();
      const processingStats = this.getStats();

      return {
        healthy: this.isRunning && redisHealth.status === "healthy",
        redisConnection: redisHealth.status === "healthy",
        streamStats,
        processingStats,
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("StreamHandler.getHealthStatus", error);
      return {
        healthy: false,
        redisConnection: false,
        streamStats: null,
        processingStats: this.getStats(),
      };
    }
  }
}

export const streamHandler = new StreamHandler();
