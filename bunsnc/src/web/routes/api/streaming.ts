/**
 * Streaming API Routes - Controle Redis Streams e SSE
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { streamHandler } from "../../services/streaming/StreamHandler";
import { serviceNowStreams } from "../../config/redis-streams";
import { logger } from "../../utils/Logger";

export const streamingApiRoutes = new Elysia({ prefix: "/api/streaming" })
  .get("/health", async () => {
    try {
      const healthStatus = await streamHandler.getHealthStatus();

      return {
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          ...healthStatus,
        },
      };
    } catch (error: unknown) {
      logger.error("[StreamingAPI] Health check failed:", error);
      return {
        success: false,
        error: "Health check failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .get("/stats", async () => {
    try {
      const [handlerStats, streamStats] = await Promise.all([
        streamHandler.getStats(),
        serviceNowStreams.getStreamStats(),
      ]);

      return {
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          handler: handlerStats,
          stream: streamStats,
        },
      };
    } catch (error: unknown) {
      logger.error("[StreamingAPI] Failed to get stats:", error);
      return {
        success: false,
        error: "Failed to get streaming stats",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .post("/start", async () => {
    try {
      await streamHandler.start();

      return {
        success: true,
        message: "Stream processing started successfully",
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      logger.error("[StreamingAPI] Failed to start stream processing:", error);
      return {
        success: false,
        error: "Failed to start stream processing",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .post("/stop", async () => {
    try {
      await streamHandler.stop();

      return {
        success: true,
        message: "Stream processing stopped successfully",
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      logger.error("[StreamingAPI] Failed to stop stream processing:", error);
      return {
        success: false,
        error: "Failed to stop stream processing",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .post(
    "/test",
    async ({ body }) => {
      const { ticketType, action, sysId, number } = body;

      try {
        const testChange = {
          type: ticketType,
          action: action,
          sys_id: sysId,
          number: number,
          state: "3",
          assignment_group: "Test Group",
          short_description: "Test streaming event",
          timestamp: new Date().toISOString(),
          data: { test: true },
        };

        const messageId = await serviceNowStreams.publishChange(testChange);

        return {
          success: true,
          message: "Test event published successfully",
          data: {
            messageId,
            change: testChange,
          },
        };
      } catch (error: unknown) {
        logger.error("[StreamingAPI] Failed to publish test event:", error);
        return {
          success: false,
          error: "Failed to publish test event",
          details: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      body: t.Object({
        ticketType: t.String(),
        action: t.String(),
        sysId: t.String(),
        number: t.String(),
      }),
    },
  )

  .get("/consumers", async () => {
    try {
      const streamStats = await serviceNowStreams.getStreamStats();

      return {
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          registeredConsumers: streamStats.registeredConsumers || [],
          consumerGroups: streamStats.groups || [],
          streamLength: streamStats.length || 0,
        },
      };
    } catch (error: unknown) {
      logger.error("[StreamingAPI] Failed to get consumer info:", error);
      return {
        success: false,
        error: "Failed to get consumer information",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .delete("/messages/:messageId", async ({ params }) => {
    try {
      const redis = (serviceNowStreams as any).redis;
      const result = await redis.xdel(
        "servicenow:changes",
        params.messageId,
      );

      return {
        success: result === 1,
        message: result === 1 ? "Message deleted" : "Message not found",
        deletedCount: result,
      };
    } catch (error: unknown) {
      logger.error("[StreamingAPI] Failed to delete message:", error);
      return {
        success: false,
        error: "Failed to delete message",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .get("/messages/recent", async ({ query }) => {
    const count = parseInt(query.count || "10");

    try {
      const redis = (serviceNowStreams as any).redis;
      const messages = await redis.xrevrange(
        "servicenow:changes",
        "+",
        "-",
        "COUNT",
        count,
      );

      const formattedMessages = messages.map(([id, fields]: [string, string[]]) => {
        const data: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }

        return {
          id,
          timestamp: new Date(parseInt(id.split("-")[0])).toISOString(),
          ...data,
          data: data.data ? JSON.parse(data.data) : {},
        };
      });

      return {
        success: true,
        data: {
          messages: formattedMessages,
          count: formattedMessages.length,
          streamName: "servicenow:changes",
        },
      };
    } catch (error: unknown) {
      logger.error("[StreamingAPI] Failed to get recent messages:", error);
      return {
        success: false,
        error: "Failed to get recent messages",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  });
