/**
 * Streaming Metrics SSE Route - Real-time Performance Metrics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.5.17: Refactored to use ElysiaJS Delegation Pattern
 * Root cause: Direct yield sse() in route caused "_res.headers.set" TypeError
 * Solution: Use yield* delegation to UnifiedStreamingService.createStream()
 * Reference: https://elysiajs.com/essential/handler.html#server-sent-events-sse
 * Working Pattern: src/routes/SSERoutes.ts:30-40 (yield* delegation)
 *
 * Key Learning:
 * - Routes use function*() with yield* to delegate
 * - Services implement generators with yield sse()
 * - Direct yield sse() in routes causes context initialization errors
 */

import { Elysia } from "elysia";
import { logger } from "../../../utils/Logger";
import { StreamHandlers } from "../../../services/streaming/StreamHandlers";

/**
 * SSE Metrics Route using ElysiaJS Delegation Pattern
 * Delegates to UnifiedStreamingService for "dashboard-metrics" stream type
 *
 * Benefits of Delegation Pattern:
 * - ElysiaJS manages SSE context correctly
 * - No "_res.headers.set" errors
 * - Centralized stream management
 * - Consistent with other SSE endpoints (SSERoutes.ts)
 */
// FIX v5.5.17: Bun v1.2.21 limitation - cannot use yield* with async generators
// Solution: Call StreamHandlers.createStream directly (no delegation)
const streamHandlers = new StreamHandlers();

export const streamingMetricsRoutes = new Elysia()
  .get("/api/streaming/metrics", async function* ({ query }) {
    const clientId = `dashboard-metrics-${Date.now()}`;
    const intervalSeconds = parseInt(query.interval as string) || 5;

    logger.info(
      `📡 SSE metrics connection established for Dashboard v2.0 (client: ${clientId}, interval: ${intervalSeconds}s)`,
    );

    try {
      // Direct call to StreamHandlers (no yield* delegation - Bun limitation)
      for await (const event of streamHandlers.createStream(clientId, "dashboard-metrics", {
        intervalSeconds,
      })) {
        yield event;
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
