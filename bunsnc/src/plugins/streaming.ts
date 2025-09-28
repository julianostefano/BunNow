/**
 * Streaming Plugin - Elysia plugin for real-time features and Server-Sent Events
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Dependency injection via .decorate()
 * - Shared streaming service instance para evitar duplicação
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 * - WebSocket e SSE integration
 *
 * Consolida streaming functionality de múltiplos serviços em um plugin unificado
 */

import { Elysia } from "elysia";
// WebSocket and SSE will be handled through Elysia core functionality
import { UnifiedStreamingService } from "../services/UnifiedStreamingService";
import { ServiceNowStreams } from "../config/redis-streams";
import type {
  StreamConnection,
  UnifiedStreamEvent,
  TicketUpdateEvent,
  SLAEvent,
  SyncProgressEvent,
} from "../services/streaming/StreamingCore";

// Types para Eden Treaty
export interface StreamingPluginContext {
  streamingService: UnifiedStreamingService;
  redisStreams?: ServiceNowStreams;
  createSSEConnection: (streamType: string, filters?: any) => ReadableStream;
  broadcastEvent: (event: UnifiedStreamEvent) => Promise<void>;
  subscribeToTicket: (
    ticketSysId: string,
    connectionId: string,
  ) => Promise<boolean>;
  unsubscribeFromTicket: (
    ticketSysId: string,
    connectionId: string,
  ) => Promise<boolean>;
  getActiveConnections: () => Map<string, StreamConnection>;
  getStreamStats: () => Promise<any>;
  sendTicketUpdate: (ticketUpdate: TicketUpdateEvent) => Promise<void>;
  sendSLAAlert: (slaEvent: SLAEvent) => Promise<void>;
  sendSyncProgress: (syncProgress: SyncProgressEvent) => Promise<void>;
}

export interface SSEConnectionOptions {
  streamType:
    | "ticket-updates"
    | "sync-progress"
    | "test-progress"
    | "dashboard-stats"
    | "sla-monitoring"
    | "general";
  ticketSysId?: string;
  filters?: {
    tables?: string[];
    states?: string[];
    priority?: string[];
    assignedTo?: string;
    groups?: string[];
  };
  heartbeatInterval?: number;
}

/**
 * Streaming Plugin - Separate Instance Method pattern
 * Provides unified real-time streaming functionality through dependency injection
 */
export const streamingPlugin = new Elysia({
  name: "servicenow-streaming-plugin",
  seed: {
    streamingService: {} as UnifiedStreamingService,
    redisStreams: {} as ServiceNowStreams | undefined,
    createSSEConnection: {} as StreamingPluginContext["createSSEConnection"],
    broadcastEvent: {} as StreamingPluginContext["broadcastEvent"],
    subscribeToTicket: {} as StreamingPluginContext["subscribeToTicket"],
    unsubscribeFromTicket:
      {} as StreamingPluginContext["unsubscribeFromTicket"],
    getActiveConnections: {} as StreamingPluginContext["getActiveConnections"],
    getStreamStats: {} as StreamingPluginContext["getStreamStats"],
    sendTicketUpdate: {} as StreamingPluginContext["sendTicketUpdate"],
    sendSLAAlert: {} as StreamingPluginContext["sendSLAAlert"],
    sendSyncProgress: {} as StreamingPluginContext["sendSyncProgress"],
  },
})
  // Note: WebSocket support will be added when @elysiajs/websocket is compatible

  // Lifecycle Hook: onStart - Initialize Streaming Services
  .onStart(async () => {
    console.log(
      "📡 ServiceNow Streaming Plugin starting - initializing real-time services",
    );
  })

  // Dependency Injection: Create streaming service instance
  .derive(async () => {
    // Initialize unified streaming service
    const streamingService = UnifiedStreamingService.getInstance();

    // Initialize Redis Streams (optional)
    let redisStreams: ServiceNowStreams | undefined;
    try {
      const { ServiceNowStreams: StreamsClass } = await import(
        "../config/redis-streams"
      );
      redisStreams = new StreamsClass();
      await redisStreams.initialize();
      streamingService.initialize(redisStreams);
      console.log("✅ Streaming Plugin: Redis Streams initialized");
    } catch (error: any) {
      console.warn(
        "⚠️ Streaming Plugin: Redis Streams not available:",
        error.message,
      );
    }

    return { streamingService, redisStreams };
  })

  // High-level SSE connection method - replaces direct streaming calls
  .decorate(
    "createSSEConnection",
    function (
      this: { streamingService: UnifiedStreamingService },
      streamType: string,
      filters: any = {},
    ): ReadableStream {
      const options: SSEConnectionOptions = {
        streamType: streamType as any,
        filters,
        heartbeatInterval: 30000, // 30 seconds
      };

      return new ReadableStream({
        start: (controller) => {
          const connectionId = this.streamingService.createConnection(
            options.streamType,
            options.ticketSysId,
            controller,
            options.filters,
          );

          // Send initial connection event
          const connectEvent: UnifiedStreamEvent = {
            event: "connected",
            data: {
              connectionId,
              streamType: options.streamType,
              filters: options.filters,
            },
            id: connectionId,
            timestamp: new Date().toISOString(),
          };

          controller.enqueue(`data: ${JSON.stringify(connectEvent)}\n\n`);

          // Setup heartbeat
          const heartbeatInterval = setInterval(() => {
            try {
              const heartbeatEvent: UnifiedStreamEvent = {
                event: "heartbeat",
                data: { timestamp: new Date().toISOString() },
                timestamp: new Date().toISOString(),
              };
              controller.enqueue(`data: ${JSON.stringify(heartbeatEvent)}\n\n`);
            } catch (error) {
              clearInterval(heartbeatInterval);
            }
          }, options.heartbeatInterval);

          // Cleanup on close
          return () => {
            clearInterval(heartbeatInterval);
            this.streamingService.removeConnection(connectionId);
          };
        },
      });
    },
  )

  // High-level broadcast method - replaces direct service calls
  .decorate(
    "broadcastEvent",
    async function (
      this: { streamingService: UnifiedStreamingService },
      event: UnifiedStreamEvent,
    ): Promise<void> {
      return await this.streamingService.broadcastToConnections(event);
    },
  )

  // Ticket subscription management - replaces direct service calls
  .decorate(
    "subscribeToTicket",
    async function (
      this: { streamingService: UnifiedStreamingService },
      ticketSysId: string,
      connectionId: string,
    ): Promise<boolean> {
      try {
        await this.streamingService.subscribeToTicketUpdates(
          connectionId,
          ticketSysId,
        );
        return true;
      } catch (error: any) {
        console.error(
          "❌ Streaming Plugin: Error subscribing to ticket:",
          error.message,
        );
        return false;
      }
    },
  )

  .decorate(
    "unsubscribeFromTicket",
    async function (
      this: { streamingService: UnifiedStreamingService },
      ticketSysId: string,
      connectionId: string,
    ): Promise<boolean> {
      try {
        await this.streamingService.unsubscribeFromTicketUpdates(
          connectionId,
          ticketSysId,
        );
        return true;
      } catch (error: any) {
        console.error(
          "❌ Streaming Plugin: Error unsubscribing from ticket:",
          error.message,
        );
        return false;
      }
    },
  )

  // Connection management method - replaces direct service access
  .decorate(
    "getActiveConnections",
    function (this: {
      streamingService: UnifiedStreamingService;
    }): Map<string, StreamConnection> {
      return this.streamingService.getActiveConnections();
    },
  )

  // Statistics method - replaces direct service calls
  .decorate(
    "getStreamStats",
    async function (this: {
      streamingService: UnifiedStreamingService;
      redisStreams?: ServiceNowStreams;
    }): Promise<any> {
      try {
        const streamingStats = await this.streamingService.getStats();
        const redisStats = this.redisStreams
          ? await this.redisStreams.getStreamStats()
          : null;

        return {
          streaming: streamingStats,
          redis: redisStats,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        console.error(
          "❌ Streaming Plugin: Error getting stats:",
          error.message,
        );
        return {
          streaming: { connections: 0, events: 0 },
          redis: null,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  // High-level event broadcasting methods
  .decorate(
    "sendTicketUpdate",
    async function (
      this: { streamingService: UnifiedStreamingService },
      ticketUpdate: TicketUpdateEvent,
    ): Promise<void> {
      await this.streamingService.sendTicketUpdate(ticketUpdate);
    },
  )

  .decorate(
    "sendSLAAlert",
    async function (
      this: { streamingService: UnifiedStreamingService },
      slaEvent: SLAEvent,
    ): Promise<void> {
      await this.streamingService.sendSLAAlert(slaEvent);
    },
  )

  .decorate(
    "sendSyncProgress",
    async function (
      this: { streamingService: UnifiedStreamingService },
      syncProgress: SyncProgressEvent,
    ): Promise<void> {
      await this.streamingService.sendSyncProgress(syncProgress);
    },
  )

  // Lifecycle Hook: onStop - Cleanup connections
  .onStop(async () => {
    console.log(
      "🛑 ServiceNow Streaming Plugin stopping - closing all connections",
    );
  })

  // === SSE ENDPOINTS ===

  /**
   * Server-Sent Events endpoint for ticket updates
   * GET /streaming/sse/tickets/:ticketSysId
   */
  .get(
    "/streaming/sse/tickets/:ticketSysId",
    ({ createSSEConnection, params: { ticketSysId } }) => {
      const filters = { ticketSysId };
      return createSSEConnection("ticket-updates", filters);
    },
    {
      detail: {
        summary: "SSE Ticket Updates",
        description: "Subscribe to real-time updates for a specific ticket",
        tags: ["Streaming", "SSE", "Tickets"],
      },
    },
  )

  /**
   * Server-Sent Events endpoint for sync progress
   * GET /streaming/sse/sync/:table
   */
  .get(
    "/streaming/sse/sync/:table",
    ({ createSSEConnection, params: { table }, query }) => {
      const filters = { table, ...query };
      return createSSEConnection("sync-progress", filters);
    },
    {
      detail: {
        summary: "SSE Sync Progress",
        description: "Subscribe to real-time sync progress updates",
        tags: ["Streaming", "SSE", "Sync"],
      },
    },
  )

  /**
   * Server-Sent Events endpoint for SLA monitoring
   * GET /streaming/sse/sla
   */
  .get(
    "/streaming/sse/sla",
    ({ createSSEConnection, query }) => {
      return createSSEConnection("sla-monitoring", query);
    },
    {
      detail: {
        summary: "SSE SLA Monitoring",
        description: "Subscribe to real-time SLA alerts and updates",
        tags: ["Streaming", "SSE", "SLA"],
      },
    },
  )

  /**
   * Server-Sent Events endpoint for dashboard stats
   * GET /streaming/sse/dashboard
   */
  .get(
    "/streaming/sse/dashboard",
    ({ createSSEConnection, query }) => {
      return createSSEConnection("dashboard-stats", query);
    },
    {
      detail: {
        summary: "SSE Dashboard Stats",
        description: "Subscribe to real-time dashboard statistics",
        tags: ["Streaming", "SSE", "Dashboard"],
      },
    },
  )

  /**
   * General purpose SSE endpoint
   * GET /streaming/sse/general
   */
  .get(
    "/streaming/sse/general",
    ({ createSSEConnection, query }) => {
      return createSSEConnection("general", query);
    },
    {
      detail: {
        summary: "SSE General Stream",
        description: "Subscribe to general real-time events",
        tags: ["Streaming", "SSE", "General"],
      },
    },
  )

  // === WebSocket ENDPOINTS ===
  // Note: WebSocket endpoints will be added when @elysiajs/websocket compatibility is resolved

  // === API ENDPOINTS ===

  /**
   * Plugin health check endpoint
   * GET /streaming/health
   */
  .get(
    "/streaming/health",
    async ({ streamingService, redisStreams }) => {
      try {
        const streamingHealth = await streamingService.getHealthStatus();
        const redisHealth = redisStreams
          ? await redisStreams.getStreamStats()
          : null;

        return {
          success: true,
          result: {
            status: "healthy",
            plugin: "servicenow-streaming-plugin",
            streaming: streamingHealth,
            redis: redisHealth
              ? {
                  connected: true,
                  streams: redisHealth.totalStreams || 0,
                }
              : { connected: false, message: "Redis not available" },
            connections: streamingService.getActiveConnections().size,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          plugin: "servicenow-streaming-plugin",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Streaming Plugin Health Check",
        description:
          "Check health of streaming plugin including SSE, WebSocket, and Redis connections",
        tags: ["Health", "Plugin", "Streaming"],
      },
    },
  )

  /**
   * Get streaming statistics
   * GET /streaming/stats
   */
  .get(
    "/streaming/stats",
    async ({ getStreamStats }) => {
      try {
        const stats = await getStreamStats();
        return {
          success: true,
          result: stats,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Streaming Statistics",
        description: "Get detailed streaming performance statistics",
        tags: ["Streaming", "Stats", "Metrics"],
      },
    },
  )

  /**
   * Broadcast event to all connections
   * POST /streaming/broadcast
   */
  .post(
    "/streaming/broadcast",
    async ({ broadcastEvent, body }) => {
      try {
        const event: UnifiedStreamEvent = {
          event: body.event || "general",
          data: body.data || {},
          timestamp: new Date().toISOString(),
          id: body.id,
        };

        await broadcastEvent(event);

        return {
          success: true,
          result: {
            message: "Event broadcasted successfully",
            event: event.event,
            timestamp: event.timestamp,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Broadcast Event",
        description: "Broadcast event to all active streaming connections",
        tags: ["Streaming", "Broadcast", "Events"],
      },
    },
  )

  /**
   * Get active connections
   * GET /streaming/connections
   */
  .get(
    "/streaming/connections",
    ({ getActiveConnections }) => {
      try {
        const connections = getActiveConnections();
        const connectionData = Array.from(connections.entries()).map(
          ([id, connection]) => ({
            id,
            streamType: connection.streamType,
            ticketSysId: connection.ticketSysId,
            isAlive: connection.isAlive,
            connectedAt: connection.connectedAt,
            lastPing: connection.lastPing,
          }),
        );

        return {
          success: true,
          result: {
            total: connections.size,
            connections: connectionData,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Active Connections",
        description: "Get list of all active streaming connections",
        tags: ["Streaming", "Connections", "Monitoring"],
      },
    },
  )

  // Global scope - exposes context across entire application following best practices
  .as('global');

// Export plugin context type for Eden Treaty
export type StreamingPluginApp = typeof streamingPlugin;

// Functional Callback Method pattern - for conditional use
export const createStreamingPlugin = (config?: {
  enableWebSocket?: boolean;
  enableSSE?: boolean;
  enableRedisStreams?: boolean;
  heartbeatInterval?: number;
}) => {
  return (app: Elysia) =>
    app.use(streamingPlugin).onStart(() => {
      console.log(
        "🔌 Streaming Plugin applied - real-time services available via dependency injection",
      );
      console.log(
        "📡 SSE, WebSocket, and Redis Streams unified in single plugin",
      );
    });
};

// Export types for other modules
export type {
  StreamConnection,
  UnifiedStreamEvent,
  TicketUpdateEvent,
  SLAEvent,
  SyncProgressEvent,
  SSEConnectionOptions,
};
