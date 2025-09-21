/**
 * Stream Handlers - Specialized handlers for different stream types
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { sse } from "elysia";
import {
  StreamingCore,
  StreamConnection,
  UnifiedStreamEvent,
  TicketUpdateEvent,
} from "./StreamingCore";

export class StreamHandlers extends StreamingCore {
  /**
   * Create Elysia generator-based stream (Modern streaming)
   */
  *createStream(
    clientId: string,
    streamType: StreamConnection["streamType"],
    options?: {
      filters?: any;
      maxHistory?: number;
      ticketSysId?: string;
      intervalSeconds?: number;
    },
  ) {
    console.log(`📡 Creating ${streamType} stream for client: ${clientId}`);

    const connection: StreamConnection = {
      id: clientId,
      ticketSysId: options?.ticketSysId,
      isAlive: true,
      lastPing: Date.now(),
      streamType,
      filters: options?.filters || {},
      connectedAt: new Date(),
    };

    this.addConnection(connection);

    try {
      // Send welcome message
      yield sse({
        event: "connected",
        data: {
          clientId,
          streamType,
          connectedAt: new Date().toISOString(),
          filters: options?.filters,
        },
      });

      // Send recent events if requested
      if (options?.maxHistory && options.maxHistory > 0) {
        const history = this.getEventHistory([streamType], options.maxHistory);
        for (const event of history) {
          yield sse(event);
        }
      }

      // Handle different stream types
      yield* this.handleStreamType(clientId, streamType, options);
    } finally {
      this.removeConnection(clientId);
      console.log(`📡 Stream closed for client: ${clientId}`);
    }
  }

  /**
   * Create SSE connection for ticket updates (Legacy SSE compatibility)
   */
  createTicketSSEConnection(ticketSysId: string): Response {
    const connectionId = `ticket-${ticketSysId}-${Date.now()}`;
    console.log(
      `📡 Creating SSE connection for ticket ${ticketSysId}: ${connectionId}`,
    );

    let connectionRef: StreamConnection;

    const stream = new ReadableStream({
      start: (controller) => {
        connectionRef = {
          id: connectionId,
          ticketSysId,
          controller,
          isAlive: true,
          lastPing: Date.now(),
          streamType: "ticket-updates",
          connectedAt: new Date(),
        };

        this.addConnection(connectionRef);

        // Send initial connection message
        this.sendSSEMessage(connectionRef, {
          event: "connected",
          data: { message: "Connected to ticket updates", ticketSysId },
          timestamp: new Date().toISOString(),
        });

        console.log(` SSE connection established: ${connectionId}`);
      },

      cancel: () => {
        console.log(`🔌 SSE connection closed: ${connectionId}`);
        this.removeConnection(connectionId);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    });
  }

  /**
   * Handle specific stream type logic
   */
  private *handleStreamType(
    clientId: string,
    streamType: StreamConnection["streamType"],
    options?: any,
  ) {
    switch (streamType) {
      case "ticket-updates":
        yield* this.handleTicketUpdatesStream(clientId, options?.filters);
        break;
      case "sync-progress":
        yield* this.handleSyncProgressStream(clientId, options?.operation);
        break;
      case "dashboard-stats":
        yield* this.handleDashboardStatsStream(
          clientId,
          options?.intervalSeconds || 30,
        );
        break;
      case "sla-monitoring":
        yield* this.handleSLAMonitoringStream(clientId, options?.filters);
        break;
      case "test-progress":
        yield* this.handleTestProgressStream(clientId, options?.testType);
        break;
      default:
        yield* this.handleGenericStream(clientId);
    }
  }

  /**
   * Generic stream handler
   */
  private async *handleGenericStream(clientId: string) {
    while (this.isConnectionAlive(clientId)) {
      await new Promise((resolve) => setTimeout(resolve, 30000));

      if (this.isConnectionAlive(clientId)) {
        yield sse({
          event: "heartbeat",
          data: { timestamp: new Date().toISOString() },
        });
        this.updateConnectionPing(clientId);
      }
    }
  }

  /**
   * Ticket updates stream handler
   */
  private async *handleTicketUpdatesStream(clientId: string, filters?: any) {
    // Wait for real-time events from Redis or periodic updates
    while (this.isConnectionAlive(clientId)) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      if (!this.isConnectionAlive(clientId)) break;

      // This would be replaced by real Redis stream events
      // For now, keep connection alive with periodic heartbeat
      yield sse({
        event: "heartbeat",
        data: {
          timestamp: new Date().toISOString(),
          activeFilters: filters,
        },
      });

      this.updateConnectionPing(clientId);
    }
  }

  /**
   * Sync progress stream handler
   */
  private async *handleSyncProgressStream(
    clientId: string,
    operation: string = "sync-tickets",
  ) {
    const stages = [
      "Initializing connection to ServiceNow",
      "Fetching incident records",
      "Processing incidents",
      "Fetching change_task records",
      "Processing change tasks",
      "Fetching sc_task records",
      "Processing service catalog tasks",
      "Updating database indexes",
      "Finalizing sync operation",
    ];

    for (let i = 0; i < stages.length; i++) {
      if (!this.isConnectionAlive(clientId)) break;

      const progress = Math.round(((i + 1) / stages.length) * 100);

      yield sse({
        event: "sync-progress",
        data: {
          operation,
          currentStep: stages[i],
          progress,
          totalItems: stages.length,
          processedItems: i + 1,
          itemsPerSecond: 0.5,
          estimatedTimeRemaining: (stages.length - i - 1) * 2,
          errors: 0,
          timestamp: new Date().toISOString(),
        },
        id: `sync-${i + 1}`,
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));
      this.updateConnectionPing(clientId);
    }

    if (this.isConnectionAlive(clientId)) {
      yield sse({
        event: "sync-complete",
        data: {
          operation,
          message: "Sync completed successfully",
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Dashboard stats stream handler
   */
  private async *handleDashboardStatsStream(
    clientId: string,
    intervalSeconds: number,
  ) {
    while (this.isConnectionAlive(clientId)) {
      const stats = {
        totalTickets: Math.floor(Math.random() * 1000) + 500,
        activeTickets: Math.floor(Math.random() * 300) + 200,
        resolvedToday: Math.floor(Math.random() * 50) + 10,
        averageResolutionTime: Math.round((Math.random() * 24 + 2) * 10) / 10,
        ticketsByType: {
          incidents: Math.floor(Math.random() * 200) + 100,
          changeTasks: Math.floor(Math.random() * 100) + 50,
          serviceCatalogTasks: Math.floor(Math.random() * 150) + 75,
        },
        criticalTickets: Math.floor(Math.random() * 25) + 5,
        slaStats: {
          totalActiveSLAs: Math.floor(Math.random() * 200) + 300,
          breachedSLAs: Math.floor(Math.random() * 25) + 10,
          slaWarnings: Math.floor(Math.random() * 40) + 20,
          avgCompletionPercentage:
            Math.round((Math.random() * 20 + 75) * 10) / 10,
        },
        lastUpdate: new Date().toISOString(),
      };

      yield sse({
        event: "dashboard-stats",
        data: stats,
        id: `stats-${Date.now()}`,
      });

      await new Promise((resolve) =>
        setTimeout(resolve, intervalSeconds * 1000),
      );
      this.updateConnectionPing(clientId);
    }
  }

  /**
   * SLA monitoring stream handler
   */
  private async *handleSLAMonitoringStream(clientId: string, filters?: any) {
    let counter = 0;
    while (this.isConnectionAlive(clientId)) {
      await new Promise((resolve) => setTimeout(resolve, 8000));

      if (!this.isConnectionAlive(clientId)) break;

      counter++;
      const eventTypes = ["sla-breach", "sla-warning", "sla-updated"];
      const eventType = eventTypes[counter % eventTypes.length] as any;
      const businessPercentage =
        eventType === "sla-breach"
          ? 110 + Math.random() * 20
          : eventType === "sla-warning"
            ? 85 + Math.random() * 10
            : Math.random() * 100;

      if (filters?.breachesOnly && eventType !== "sla-breach") {
        continue;
      }

      yield sse({
        event: eventType,
        data: {
          ticketSysId: `sys_${Math.random().toString(36).substring(7)}`,
          ticketNumber: `INC${String(counter).padStart(7, "0")}`,
          slaName: "Resolution Time - Incident",
          slaType: "incident" as const,
          businessPercentage: Math.round(businessPercentage * 10) / 10,
          hasBreached: eventType === "sla-breach",
          stage: eventType === "sla-breach" ? "breached" : "active",
          remainingTime:
            eventType !== "sla-breach"
              ? `${Math.floor(Math.random() * 24)}h ${Math.floor(Math.random() * 60)}m`
              : undefined,
          breachTime:
            eventType === "sla-breach" ? new Date().toISOString() : undefined,
          severity: eventType === "sla-breach" ? "critical" : ("medium" as any),
          assignmentGroup: "IT Support Level 2",
          timestamp: new Date().toISOString(),
        },
        id: `sla-${counter}`,
      });

      this.updateConnectionPing(clientId);
    }
  }

  /**
   * Test progress stream handler
   */
  private async *handleTestProgressStream(
    clientId: string,
    testType: string = "endpoint-test",
  ) {
    const tables = ["incident", "change_task", "sc_task", "sys_user_group"];

    for (let i = 0; i < tables.length; i++) {
      if (!this.isConnectionAlive(clientId)) break;

      const table = tables[i];
      const progress = Math.round(((i + 1) / tables.length) * 100);

      yield sse({
        event: "test-progress",
        data: {
          operation: testType,
          currentStep: `Testing ${table}`,
          progress,
          totalItems: tables.length,
          processedItems: i + 1,
          itemsPerSecond: 0.5,
          estimatedTimeRemaining: (tables.length - i - 1) * 2,
          errors: 0,
          timestamp: new Date().toISOString(),
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));
      this.updateConnectionPing(clientId);
    }

    if (this.isConnectionAlive(clientId)) {
      yield sse({
        event: "test-complete",
        data: {
          operation: testType,
          message: "All tests completed successfully",
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Broadcast message to all connections monitoring a specific ticket
   */
  broadcastToTicket(ticketSysId: string, message: UnifiedStreamEvent): void {
    const connections = this.getConnectionsByType("ticket-updates").filter(
      (conn) => conn.ticketSysId === ticketSysId && conn.isAlive,
    );

    if (connections.length === 0) {
      console.log(`📭 No active connections for ticket ${ticketSysId}`);
      return;
    }

    console.log(
      `📢 Broadcasting to ${connections.length} connections for ticket ${ticketSysId}`,
    );

    connections.forEach((connection) => {
      this.sendSSEMessage(connection, message);
    });
  }

  /**
   * Broadcast event to all matching connections
   */
  broadcastEvent(
    event: UnifiedStreamEvent,
    filters?: { streamTypes?: string[] },
  ): void {
    this.addToEventHistory(event.event, event);

    const targetConnections = Array.from(this.connections.values()).filter(
      (conn) => {
        if (!conn.isAlive) return false;
        if (
          filters?.streamTypes &&
          !filters.streamTypes.includes(conn.streamType)
        )
          return false;
        return true;
      },
    );

    console.log(
      `📢 Broadcasting ${event.event} to ${targetConnections.length} clients`,
    );

    targetConnections.forEach((connection) => {
      if (connection.controller) {
        this.sendSSEMessage(connection, event);
      }
    });
  }
}
