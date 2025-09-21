/**
 * Unified Streaming Routes for Real-time Updates
 * Consolidated SSE and Streaming functionality
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { unifiedStreamingService } from "../services/UnifiedStreamingService";
import { ServiceNowStreams } from "../config/redis-streams";

export const createSSERoutes = (redisStreams: ServiceNowStreams) => {
  // Initialize the unified service with Redis Streams
  unifiedStreamingService.initialize(redisStreams);

  return (
    new Elysia({ prefix: "/sse" })
      /**
       * SSE endpoint for ticket updates (Legacy compatibility)
       * GET /sse/ticket-updates/:sysId
       */
      .get("/ticket-updates/:sysId", ({ params: { sysId } }) => {
        console.log(`📡 SSE connection requested for ticket: ${sysId}`);
        return unifiedStreamingService.createTicketSSEConnection(sysId);
      })

      /**
       * Modern streaming endpoint for ticket updates
       * GET /sse/stream/tickets/:sysId
       */
      .get("/stream/tickets/:sysId", function* ({ params: { sysId } }) {
        const clientId = `ticket-${sysId}-${Date.now()}`;
        yield* unifiedStreamingService.createStream(
          clientId,
          "ticket-updates",
          {
            ticketSysId: sysId,
            maxHistory: 10,
          },
        );
      })

      /**
       * Dashboard statistics stream
       * GET /sse/stream/dashboard
       */
      .get("/stream/dashboard", function* ({ query }) {
        const clientId = `dashboard-${Date.now()}`;
        const intervalSeconds = parseInt(query.interval as string) || 30;
        yield* unifiedStreamingService.createStream(
          clientId,
          "dashboard-stats",
          {
            intervalSeconds,
          },
        );
      })

      /**
       * Sync progress stream
       * GET /sse/stream/sync/:operation
       */
      .get("/stream/sync/:operation", function* ({ params: { operation } }) {
        const clientId = `sync-${operation}-${Date.now()}`;
        yield* unifiedStreamingService.createStream(clientId, "sync-progress", {
          operation,
        });
      })

      /**
       * SLA monitoring stream
       * GET /sse/stream/sla
       */
      .get("/stream/sla", function* ({ query }) {
        const clientId = `sla-${Date.now()}`;
        const filters = {
          breachesOnly: query.breaches === "true",
          ticketTypes: query.types
            ? (query.types as string).split(",")
            : undefined,
        };
        yield* unifiedStreamingService.createStream(
          clientId,
          "sla-monitoring",
          {
            filters,
          },
        );
      })

      /**
       * Test progress stream
       * GET /sse/stream/test/:testType
       */
      .get("/stream/test/:testType", function* ({ params: { testType } }) {
        const clientId = `test-${testType}-${Date.now()}`;
        yield* unifiedStreamingService.createStream(clientId, "test-progress", {
          testType,
        });
      })

      /**
       * Get unified streaming statistics
       * GET /sse/stats
       */
      .get("/stats", () => {
        const stats = unifiedStreamingService.getConnectionStats();
        return {
          success: true,
          data: {
            totalConnections: stats.totalConnections,
            connectionsByType: stats.connectionsByType,
            ticketConnections: Object.fromEntries(stats.ticketConnections),
            activeConnections: stats.connectionDetails,
            timestamp: new Date().toISOString(),
          },
        };
      })

      /**
       * Health check for unified streaming service
       * GET /sse/health
       */
      .get("/health", () => {
        const stats = unifiedStreamingService.getConnectionStats();
        return {
          success: true,
          service: "Unified Streaming Service",
          status: "healthy",
          connections: stats.totalConnections,
          timestamp: new Date().toISOString(),
        };
      })
  );
};
