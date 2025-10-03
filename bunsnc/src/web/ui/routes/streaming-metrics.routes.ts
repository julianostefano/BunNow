/**
 * Streaming Metrics SSE Route - Real-time Performance Metrics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.5.18: Correct SSE Pattern per ElysiaJS Documentation
 * Root cause: Used async function* when ElysiaJS requires function* (sync generator)
 * Solution: Use function* with yield* delegation (await works in sync generators)
 * Reference: https://elysiajs.com/essential/handler.html#server-sent-events-sse
 * Reference: docs/ELYSIA_BEST_PRACTICES.md:346-386
 *
 * Key Learning:
 * - ElysiaJS requires function*() (sync generator), NOT async function*()
 * - await IS ALLOWED inside function*() (JavaScript feature)
 * - Use yield* delegation to service generators
 * - Services must also use function*(), not async function*()
 */

import { Elysia, sse } from "elysia";
import { logger } from "../../../utils/Logger";
import { SystemService } from "../../../services/SystemService";

/**
 * SSE Metrics Route - Workaround for Bun v1.2.x Limitation
 *
 * FIX v5.5.18: Bun Runtime Limitation Workaround
 * Root cause: Bun v1.2.x does NOT support await in sync generators (function*)
 * Solution: Use async function* with inline implementation (no yield* delegation)
 * Reference: ELYSIA_BEST_PRACTICES.md:404 - "Evitar yield* delegation quando usando await"
 *
 * Note: ElysiaJS documentation shows function* but Bun runtime requires async function*
 * when using await. Inline implementation avoids yield* delegation issues.
 */
export const streamingMetricsRoutes = new Elysia()
  .get("/api/streaming/metrics", async function* ({ query }) {
    const clientId = `dashboard-metrics-${Date.now()}`;
    const intervalSeconds = parseInt(query.interval as string) || 5;

    logger.info(
      `📡 SSE metrics connection established for Dashboard v2.0 (client: ${clientId}, interval: ${intervalSeconds}s)`,
    );

    try {
      // ✅ Inline implementation (NO yield* delegation)
      const systemService = SystemService.getInstance();

      // Send initial connection message
      yield sse({
        event: "connected",
        data: {
          clientId,
          streamType: "dashboard-metrics",
          connectedAt: new Date().toISOString(),
          intervalSeconds,
        },
      });

      // Streaming loop with await support
      let isActive = true;
      while (isActive) {
        try {
          const stats = await systemService.getPerformanceStats(1);
          const memoryUsage = systemService.getMemoryUsage();

          yield sse({
            event: "metrics",
            data: {
              type: "metrics-update",
              stats: stats,
              memory: memoryUsage,
              timestamp: new Date().toISOString(),
            },
            id: `metrics-${Date.now()}`,
          });

          await new Promise((resolve) =>
            setTimeout(resolve, intervalSeconds * 1000),
          );
        } catch (error: unknown) {
          logger.error(
            "Error fetching dashboard metrics:",
            error instanceof Error ? error.message : String(error),
          );

          yield sse({
            event: "error",
            data: {
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
              timestamp: new Date().toISOString(),
            },
            id: `error-${Date.now()}`,
          });

          await new Promise((resolve) =>
            setTimeout(resolve, intervalSeconds * 1000),
          );
        }
      }
    } finally {
      logger.info(
        `📡 SSE metrics connection closed for Dashboard v2.0 (client: ${clientId})`,
      );
    }
  })

  .get("/api/streaming/metrics/test", () => {
    return {
      status: "ok",
      message: "SSE metrics endpoint is available",
      endpoint: "/api/streaming/metrics",
      pattern: "ElysiaJS Delegation Pattern (yield* unifiedStreamingService)",
      streamType: "dashboard-metrics",
      timestamp: new Date().toISOString(),
    };
  });
