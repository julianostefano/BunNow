/**
 * Unified Streaming Service Simple Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { unifiedStreamingService } from "../services/UnifiedStreamingService";
import { ServiceNowStreams } from "../config/redis-streams";

// Mock Redis Streams
const mockRedisStreams = {
  subscribe: (eventType: string, handler: any) => {
    console.log(`Mock Redis subscribe: ${eventType}`);
    return Promise.resolve();
  },
  publishChange: (change: any) => {
    console.log(`Mock Redis publish:`, change);
    return Promise.resolve("test-message-id");
  },
  healthCheck: () => Promise.resolve({ status: "healthy" }),
} as any;

describe("Unified Streaming Service Simple Tests", () => {
  beforeEach(() => {
    unifiedStreamingService.initialize(mockRedisStreams);
  });

  afterEach(() => {
    unifiedStreamingService.cleanup();
  });

  it("should create unified streaming service successfully", () => {
    expect(unifiedStreamingService).toBeDefined();
  });

  it("should create SSE connection for ticket", () => {
    const ticketSysId = "test-ticket-123";
    const response =
      unifiedStreamingService.createTicketSSEConnection(ticketSysId);

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("Connection")).toBe("keep-alive");
  });

  it("should return connection stats", () => {
    const stats = unifiedStreamingService.getConnectionStats();

    expect(stats).toBeDefined();
    expect(stats.totalConnections).toBe(0);
    expect(stats.ticketConnections).toBeInstanceOf(Map);
    expect(stats.connectionsByType).toBeDefined();
  });

  it("should broadcast message to specific ticket", () => {
    const ticketSysId = "test-ticket-456";
    const message = {
      event: "ticket-updated" as const,
      data: {
        sysId: ticketSysId,
        number: "INC0012345",
        ticketType: "incident" as const,
        action: "update" as const,
        state: "2",
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    // This should not throw even with no active connections
    expect(() => {
      unifiedStreamingService.broadcastToTicket(ticketSysId, message);
    }).not.toThrow();
  });

  it("should cleanup connections properly", () => {
    expect(() => {
      unifiedStreamingService.cleanup();
    }).not.toThrow();
  });

  it("should handle multiple connection stats correctly", () => {
    // Create a couple of mock connections
    unifiedStreamingService.createTicketSSEConnection("ticket-1");
    unifiedStreamingService.createTicketSSEConnection("ticket-2");

    const stats = unifiedStreamingService.getConnectionStats();
    expect(stats.totalConnections).toBe(2);
  });
});
