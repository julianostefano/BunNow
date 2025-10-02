/**
 * Streaming Metrics SSE Route - Real-time Performance Metrics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.5.16: Created to resolve HTTP 500 infinite loop
 * Dashboard v2.0 floating panel needs SSE endpoint for real-time metrics
 */

import { Elysia } from "elysia";
import { systemService } from "../../../services/SystemService";
import { logger } from "../../../utils/Logger";

/**
 * SSE Metrics Route
 * Provides real-time performance metrics via Server-Sent Events
 * Similar to /events/performance from ModalRoutes.ts:443-509
 */
export const streamingMetricsRoutes = new Elysia()
  .get("/api/streaming/metrics", async ({ set }) => {
    try {
      logger.info("📡 SSE metrics connection established for Dashboard v2.0");

      // Set SSE headers
      set.headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      };

      let isConnected = true;

      const stream = new ReadableStream({
        start(controller) {
          // Send initial connection message
          const initialMessage = `data: ${JSON.stringify({
            type: "metrics-connected",
            message: "Dashboard v2.0 metrics stream connected",
            timestamp: new Date().toISOString(),
          })}\n\n`;

          controller.enqueue(new TextEncoder().encode(initialMessage));

          // Update metrics every 5 seconds
          const intervalId = setInterval(async () => {
            if (!isConnected) {
              clearInterval(intervalId);
              return;
            }

            try {
              // Get performance stats from SystemService
              const stats = await systemService.getPerformanceStats(1);
              const memoryUsage = systemService.getMemoryUsage();

              const message = `data: ${JSON.stringify({
                type: "metrics-update",
                stats: stats,
                memory: memoryUsage,
                timestamp: new Date().toISOString(),
              })}\n\n`;

              controller.enqueue(new TextEncoder().encode(message));

              logger.debug("📊 Metrics update sent to Dashboard v2.0");
            } catch (error: unknown) {
              logger.error(
                "❌ Metrics SSE error:",
                error instanceof Error ? error : new Error(String(error))
              );

              // Send error event
              const errorMessage = `data: ${JSON.stringify({
                type: "error",
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: new Date().toISOString(),
              })}\n\n`;

              controller.enqueue(new TextEncoder().encode(errorMessage));
            }
          }, 5000); // Update every 5 seconds (same as ModalRoutes)

          // Cleanup on disconnect
          const cleanup = () => {
            isConnected = false;
            clearInterval(intervalId);
            logger.info("📡 SSE metrics connection closed for Dashboard v2.0");
          };

          // Handle client disconnect
          controller.enqueue = new Proxy(controller.enqueue, {
            apply(target, thisArg, args) {
              try {
                return Reflect.apply(target, thisArg, args);
              } catch (error) {
                cleanup();
                throw error;
              }
            },
          });
        },

        cancel() {
          isConnected = false;
          logger.info("📡 SSE metrics stream cancelled by client");
        },
      });

      return new Response(stream, {
        headers: set.headers as Record<string, string>
      });
    } catch (error: unknown) {
      logger.error(
        "❌ Error setting up SSE metrics stream:",
        error instanceof Error ? error : new Error(String(error))
      );
      set.status = 500;
      return {
        error: "Failed to establish SSE metrics connection",
        details: error instanceof Error ? error.message : String(error)
      };
    }
  });
