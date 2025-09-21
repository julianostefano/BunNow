/**
 * Server-Sent Events (SSE) Stream - Real-time Updates
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";

interface EventMessage {
  id?: string;
  event?: string;
  data: any;
  retry?: number;
}

class SSEManager {
  private clients: Set<ReadableStreamDefaultController> = new Set();
  private eventId: number = 0;

  addClient(controller: ReadableStreamDefaultController) {
    this.clients.add(controller);
    console.log(`SSE Client connected. Total: ${this.clients.size}`);

    // Send welcome message
    this.sendToClient(controller, {
      event: "connected",
      data: {
        message: "Connected to real-time updates",
        timestamp: new Date().toISOString(),
        clientId: Date.now(),
      },
    });
  }

  removeClient(controller: ReadableStreamDefaultController) {
    this.clients.delete(controller);
    console.log(`SSE Client disconnected. Total: ${this.clients.size}`);
  }

  broadcast(message: EventMessage) {
    const disconnectedClients: ReadableStreamDefaultController[] = [];

    for (const client of this.clients) {
      try {
        this.sendToClient(client, message);
      } catch (error) {
        console.error("Failed to send to client:", error);
        disconnectedClients.push(client);
      }
    }

    // Remove disconnected clients
    disconnectedClients.forEach((client) => this.removeClient(client));
  }

  private sendToClient(
    controller: ReadableStreamDefaultController,
    message: EventMessage,
  ) {
    const id = message.id || String(++this.eventId);
    const event = message.event || "message";
    const data =
      typeof message.data === "string"
        ? message.data
        : JSON.stringify(message.data);
    const retry = message.retry || 5000;

    const sseMessage = [
      `id: ${id}`,
      `event: ${event}`,
      `data: ${data}`,
      `retry: ${retry}`,
      "", // Empty line to end the message
      "",
    ].join("\n");

    controller.enqueue(new TextEncoder().encode(sseMessage));
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

const sseManager = new SSEManager();

// Simulate real-time data updates
setInterval(() => {
  // Simulate incident count updates
  const incidentCount = Math.floor(Math.random() * 50) + 10;
  sseManager.broadcast({
    event: "incident-count",
    data: {
      count: incidentCount,
      timestamp: new Date().toISOString(),
    },
  });

  // Simulate problem count updates
  const problemCount = Math.floor(Math.random() * 20) + 5;
  sseManager.broadcast({
    event: "problem-count",
    data: {
      count: problemCount,
      timestamp: new Date().toISOString(),
    },
  });

  // Simulate change count updates
  const changeCount = Math.floor(Math.random() * 30) + 8;
  sseManager.broadcast({
    event: "change-count",
    data: {
      count: changeCount,
      timestamp: new Date().toISOString(),
    },
  });

  // Simulate processing status
  const statuses = ["Processing", "Idle", "Syncing", "Complete"];
  const status = statuses[Math.floor(Math.random() * statuses.length)];
  sseManager.broadcast({
    event: "processing-status",
    data: {
      status,
      timestamp: new Date().toISOString(),
    },
  });
}, 30000); // Update every 30 seconds

// Simulate critical alerts
setInterval(() => {
  if (Math.random() < 0.3) {
    // 30% chance of critical alert
    sseManager.broadcast({
      event: "alert-critical",
      data: {
        type: "critical",
        title: "Critical Incident Detected",
        message: `New P1 incident INC${String(Math.floor(Math.random() * 9999999)).padStart(7, "0")} requires immediate attention`,
        timestamp: new Date().toISOString(),
      },
    });
  }
}, 120000); // Check every 2 minutes

export default new Elysia({ prefix: "/events" })
  // SSE Stream endpoint
  .get("/stream", ({ set }) => {
    set.headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    };

    const stream = new ReadableStream({
      start(controller) {
        // Add client to SSE manager
        sseManager.addClient(controller);

        // Send initial data
        setTimeout(() => {
          sseManager.broadcast({
            event: "initial-data",
            data: {
              incident_count: Math.floor(Math.random() * 50) + 10,
              problem_count: Math.floor(Math.random() * 20) + 5,
              change_count: Math.floor(Math.random() * 30) + 8,
              processing_status: "Active",
              timestamp: new Date().toISOString(),
            },
          });
        }, 100);
      },

      cancel() {
        // Client disconnected
        console.log("SSE Stream cancelled");
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
  })

  // Manual trigger endpoints for testing
  .post("/trigger/incident-update", ({ body }) => {
    const { count } = body as { count: number };
    sseManager.broadcast({
      event: "incident-count",
      data: {
        count: count || Math.floor(Math.random() * 50) + 10,
        timestamp: new Date().toISOString(),
        source: "manual",
      },
    });

    return {
      success: true,
      message: "Incident count update broadcasted",
      clients: sseManager.getClientCount(),
    };
  })

  .post("/trigger/alert", ({ body }) => {
    const {
      type = "info",
      title,
      message,
    } = body as {
      type?: string;
      title: string;
      message: string;
    };

    sseManager.broadcast({
      event: "alert-" + type,
      data: {
        type,
        title,
        message,
        timestamp: new Date().toISOString(),
        source: "manual",
      },
    });

    return {
      success: true,
      message: "Alert broadcasted",
      clients: sseManager.getClientCount(),
    };
  })

  .post("/trigger/processing-update", ({ body }) => {
    const { status, progress } = body as {
      status: string;
      progress?: number;
    };

    sseManager.broadcast({
      event: "processing-status",
      data: {
        status,
        progress: progress || Math.floor(Math.random() * 100),
        timestamp: new Date().toISOString(),
        source: "manual",
      },
    });

    return {
      success: true,
      message: "Processing status update broadcasted",
      clients: sseManager.getClientCount(),
    };
  })

  // SSE status endpoint
  .get("/status", () => {
    return {
      connected_clients: sseManager.getClientCount(),
      status: "active",
      timestamp: new Date().toISOString(),
    };
  })

  // WebSocket endpoint for bidirectional communication
  .ws("/websocket", {
    message(ws, message) {
      console.log("WebSocket message received:", message);

      try {
        const data = JSON.parse(message as string);

        switch (data.type) {
          case "ping":
            ws.send(
              JSON.stringify({
                type: "pong",
                timestamp: new Date().toISOString(),
              }),
            );
            break;

          case "subscribe":
            ws.send(
              JSON.stringify({
                type: "subscribed",
                events: data.events || [
                  "incident-count",
                  "problem-count",
                  "change-count",
                ],
                timestamp: new Date().toISOString(),
              }),
            );
            break;

          case "request-data":
            ws.send(
              JSON.stringify({
                type: "data",
                incident_count: Math.floor(Math.random() * 50) + 10,
                problem_count: Math.floor(Math.random() * 20) + 5,
                change_count: Math.floor(Math.random() * 30) + 8,
                timestamp: new Date().toISOString(),
              }),
            );
            break;

          default:
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Unknown message type",
                timestamp: new Date().toISOString(),
              }),
            );
        }
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid JSON message",
            timestamp: new Date().toISOString(),
          }),
        );
      }
    },

    open(ws) {
      console.log("WebSocket connection opened");
      ws.send(
        JSON.stringify({
          type: "connected",
          message: "WebSocket connection established",
          timestamp: new Date().toISOString(),
        }),
      );
    },

    close(ws) {
      console.log("WebSocket connection closed");
    },
  })

  .get("/health", () => ({
    status: "healthy",
    service: "sse-stream",
    clients: sseManager.getClientCount(),
  }));

// Export SSE manager for use in other parts of the application
export { sseManager };
