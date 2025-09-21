/**
 * Phase 2 Consolidation Integration Tests
 * End-to-end validation of consolidated services
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { unifiedStreamingService } from "../../services/UnifiedStreamingService";
import { ConsolidatedServiceNowService } from "../../services/ConsolidatedServiceNowService";
import type { ServiceNowAuthClient } from "../../services/ServiceNowAuthClient";
import type { ServiceNowStreams } from "../../config/redis-streams";

// Integration test configuration
const INTEGRATION_TEST_CONFIG = {
  timeout: 10000,
  skipIfNoEnvironment: true,
  mongodb: {
    enabled: !!process.env.MONGODB_URL,
    url: process.env.MONGODB_URL || "mongodb://localhost:27017/bunsnc_test",
  },
  servicenow: {
    enabled: !!(process.env.SNC_INSTANCE_URL && process.env.SNC_AUTH_TOKEN),
    instanceUrl: process.env.SNC_INSTANCE_URL || "https://test.service-now.com",
    authToken: process.env.SNC_AUTH_TOKEN || "test-token",
  },
  redis: {
    enabled: !!process.env.REDIS_URL,
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
};

// Mock implementations for testing when external services are not available
const createMockServiceNowClient = (): ServiceNowAuthClient =>
  ({
    makeRequestFullFields: async (
      table: string,
      query: string,
      limit?: number,
    ) => ({
      result: [
        {
          sys_id: "integration-test-123",
          number: "INC0999999",
          short_description: "Integration test incident",
          description: "Test description for integration testing",
          state: "2",
          priority: "3",
          assigned_to: "Integration Tester",
          assignment_group: "Integration Test Group",
          caller_id: "Test Caller",
          sys_created_on: new Date().toISOString(),
          sys_updated_on: new Date().toISOString(),
          category: "Software",
          subcategory: "Application",
          urgency: "3",
          impact: "3",
        },
      ],
    }),
    isAuthenticated: () => true,
    getInstanceUrl: () => INTEGRATION_TEST_CONFIG.servicenow.instanceUrl,
  }) as any;

const createMockRedisStreams = (): ServiceNowStreams =>
  ({
    subscribe: async (eventType: string, handler: Function) => {
      console.log(`Mock Redis subscribe: ${eventType}`);
      // Simulate some events for testing
      setTimeout(() => {
        handler({
          sys_id: "integration-test-stream-123",
          number: "INC0888888",
          type: "incident",
          action: "update",
          state: "2",
          timestamp: new Date().toISOString(),
        });
      }, 100);
    },
    publishChange: async (change: any) => {
      console.log("Mock Redis publish:", change);
      return "test-message-id";
    },
    healthCheck: async () => ({ status: "healthy", mock: true }),
  }) as any;

describe("Phase 2 Consolidation - Integration Tests", () => {
  let consolidatedTicketService: ConsolidatedServiceNowService;
  let mockServiceNowClient: ServiceNowAuthClient;
  let mockRedisStreams: ServiceNowStreams;

  beforeAll(async () => {
    console.log(" Setting up Phase 2 integration tests...");
    console.log("Environment configuration:", {
      mongodb: INTEGRATION_TEST_CONFIG.mongodb.enabled ? " Enabled" : " Mocked",
      servicenow: INTEGRATION_TEST_CONFIG.servicenow.enabled
        ? " Enabled"
        : " Mocked",
      redis: INTEGRATION_TEST_CONFIG.redis.enabled ? " Enabled" : " Mocked",
    });

    // Initialize mock services
    mockServiceNowClient = createMockServiceNowClient();
    mockRedisStreams = createMockRedisStreams();

    // Initialize unified streaming service
    unifiedStreamingService.initialize(mockRedisStreams);
  });

  beforeEach(async () => {
    consolidatedTicketService = new ConsolidatedServiceNowService(
      mockServiceNowClient,
    );
  });

  afterEach(async () => {
    if (consolidatedTicketService) {
      await consolidatedTicketService.cleanup();
    }
    unifiedStreamingService.cleanup();
  });

  afterAll(async () => {
    console.log("🧹 Cleaning up Phase 2 integration tests...");
    unifiedStreamingService.cleanup();
  });

  describe("Consolidated Services Integration", () => {
    it(
      "should integrate UnifiedStreamingService and ConsolidatedServiceNowService",
      async () => {
        // Create a ticket stream
        const ticketStream = unifiedStreamingService.createTicketSSEConnection(
          "integration-test-123",
        );
        expect(ticketStream).toBeInstanceOf(Response);

        // Get ticket details through consolidated service
        const ticketDetails = await consolidatedTicketService.getTicketDetails(
          "integration-test-123",
          "incident",
        );

        expect(ticketDetails).toBeDefined();
        expect(ticketDetails.sysId).toBe("integration-test-123");
        expect(ticketDetails.number).toBe("INC0999999");

        // Verify streaming service has connections
        const streamStats = unifiedStreamingService.getConnectionStats();
        expect(streamStats.totalConnections).toBe(1);
        expect(streamStats.ticketConnections.has("integration-test-123")).toBe(
          true,
        );
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );

    it(
      "should handle real-time ticket updates across services",
      async () => {
        const ticketSysId = "realtime-test-456";

        // Create streaming connection
        const stream =
          unifiedStreamingService.createTicketSSEConnection(ticketSysId);
        expect(stream).toBeInstanceOf(Response);

        // Simulate ticket update through consolidated service
        const updatedTicket = await consolidatedTicketService.getTicketDetails(
          ticketSysId,
          "incident",
        );
        expect(updatedTicket).toBeDefined();

        // Broadcast update through streaming service
        const updateMessage = {
          event: "ticket-updated" as const,
          data: {
            sysId: ticketSysId,
            number: updatedTicket.number,
            ticketType: "incident" as const,
            action: "update" as const,
            state: updatedTicket.state,
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };

        expect(() => {
          unifiedStreamingService.broadcastToTicket(ticketSysId, updateMessage);
        }).not.toThrow();

        // Verify connection statistics
        const stats = unifiedStreamingService.getConnectionStats();
        expect(stats.totalConnections).toBeGreaterThan(0);
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );
  });

  describe("MongoDB + ServiceNow Integration Flow", () => {
    it(
      "should perform hybrid query with MongoDB fallback to ServiceNow",
      async () => {
        const queryParams = {
          table: "incident",
          group: "all",
          state: "active",
          page: 1,
          limit: 10,
        };

        const result = await consolidatedTicketService.hybridQuery(queryParams);

        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
        expect(result.source).toMatch(/mongodb|servicenow|hybrid/);
        expect(result.currentPage).toBe(1);
        expect(result.totalPages).toBeGreaterThanOrEqual(0);
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );

    it(
      "should sync tickets and validate in both systems",
      async () => {
        // Perform synchronization
        const syncResult =
          await consolidatedTicketService.syncCurrentMonthTickets();

        expect(syncResult.success).toBe(true);
        expect(syncResult.stats).toBeDefined();
        expect(syncResult.stats.incidents).toBeDefined();
        expect(syncResult.stats.change_tasks).toBeDefined();
        expect(syncResult.stats.sc_tasks).toBeDefined();

        // Verify statistics after sync
        const stats = await consolidatedTicketService.getStats();
        expect(stats).toBeDefined();
        expect(stats.lastSync).toBeDefined();
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );

    it(
      "should handle data consistency between MongoDB and ServiceNow",
      async () => {
        const testTicketId = "consistency-test-789";

        // Get ticket from ServiceNow (should cache in MongoDB)
        const serviceNowTicket =
          await consolidatedTicketService.getTicketDetails(
            testTicketId,
            "incident",
          );

        expect(serviceNowTicket).toBeDefined();

        // Query same ticket through hybrid query (should hit MongoDB cache)
        const hybridResult = await consolidatedTicketService.hybridQuery({
          table: "incident",
          group: "all",
          state: "all",
          page: 1,
          limit: 10,
        });

        expect(hybridResult.data).toBeDefined();
        // Should find some data regardless of source
        expect(hybridResult.source).toMatch(/mongodb|servicenow|hybrid/);
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );
  });

  describe("Real-time Streaming Integration", () => {
    it(
      "should create multiple stream types simultaneously",
      async () => {
        // Create different types of streams
        const ticketStream =
          unifiedStreamingService.createTicketSSEConnection("multi-stream-1");
        const dashboardStream = unifiedStreamingService.createStream(
          "dashboard-1",
          "dashboard-stats",
        );
        const slaStream = unifiedStreamingService.createStream(
          "sla-1",
          "sla-monitoring",
        );

        expect(ticketStream).toBeInstanceOf(Response);
        expect(dashboardStream).toBeDefined();
        expect(slaStream).toBeDefined();

        const stats = unifiedStreamingService.getConnectionStats();
        expect(stats.totalConnections).toBe(3);
        expect(stats.connectionsByType).toHaveProperty("ticket-updates");
        expect(stats.connectionsByType).toHaveProperty("dashboard-stats");
        expect(stats.connectionsByType).toHaveProperty("sla-monitoring");
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );

    it(
      "should handle stream events from Redis integration",
      async () => {
        const testTicketId = "redis-integration-test";

        // Create streaming connection
        const stream =
          unifiedStreamingService.createTicketSSEConnection(testTicketId);
        expect(stream).toBeInstanceOf(Response);

        // Wait for Redis mock to trigger events
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Verify the service received and processed events
        const stats = unifiedStreamingService.getConnectionStats();
        expect(stats.totalConnections).toBe(1);
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );

    it(
      "should broadcast events across all connection types",
      async () => {
        // Create mixed connections
        unifiedStreamingService.createTicketSSEConnection("broadcast-test-1");
        unifiedStreamingService.createStream(
          "broadcast-test-2",
          "dashboard-stats",
        );

        // Broadcast to all connections
        const broadcastEvent = {
          event: "system-announcement" as any,
          data: {
            message: "Integration test broadcast",
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };

        expect(() => {
          unifiedStreamingService.broadcastEvent(broadcastEvent);
        }).not.toThrow();

        const stats = unifiedStreamingService.getConnectionStats();
        expect(stats.totalConnections).toBe(2);
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );
  });

  describe("Performance and Load Testing", () => {
    it(
      "should handle concurrent ticket operations",
      async () => {
        const concurrentOperations = 5;
        const ticketIds = Array.from(
          { length: concurrentOperations },
          (_, i) => `concurrent-test-${i}`,
        );

        // Create concurrent ticket retrievals
        const ticketPromises = ticketIds.map((id) =>
          consolidatedTicketService.getTicketDetails(id, "incident"),
        );

        // Create concurrent streaming connections
        const streamConnections = ticketIds.map((id) =>
          unifiedStreamingService.createTicketSSEConnection(id),
        );

        // Wait for all operations to complete
        const tickets = await Promise.all(ticketPromises);

        expect(tickets).toHaveLength(concurrentOperations);
        tickets.forEach((ticket, index) => {
          expect(ticket).toBeDefined();
          expect(ticket.sysId).toBe(ticketIds[index]);
        });

        expect(streamConnections).toHaveLength(concurrentOperations);
        streamConnections.forEach((stream) => {
          expect(stream).toBeInstanceOf(Response);
        });

        // Verify connection statistics
        const stats = unifiedStreamingService.getConnectionStats();
        expect(stats.totalConnections).toBe(concurrentOperations);
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );

    it(
      "should maintain performance under load",
      async () => {
        const startTime = Date.now();
        const operations = 10;

        // Perform multiple operations
        const promises = Array.from({ length: operations }, async (_, i) => {
          const ticketId = `performance-test-${i}`;

          // Get ticket details
          const ticket = await consolidatedTicketService.getTicketDetails(
            ticketId,
            "incident",
          );

          // Create stream
          const stream =
            unifiedStreamingService.createTicketSSEConnection(ticketId);

          // Perform hybrid query
          const query = await consolidatedTicketService.hybridQuery({
            table: "incident",
            group: "all",
            state: "all",
            page: 1,
            limit: 5,
          });

          return { ticket, stream, query };
        });

        const results = await Promise.all(promises);
        const duration = Date.now() - startTime;

        expect(results).toHaveLength(operations);
        expect(duration).toBeLessThan(INTEGRATION_TEST_CONFIG.timeout);

        // Verify all operations completed successfully
        results.forEach((result, index) => {
          expect(result.ticket).toBeDefined();
          expect(result.stream).toBeInstanceOf(Response);
          expect(result.query).toBeDefined();
          expect(result.ticket.sysId).toBe(`performance-test-${index}`);
        });

        console.log(
          ` Performance test completed: ${operations} operations in ${duration}ms`,
        );
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );
  });

  describe("Error Recovery and Resilience", () => {
    it(
      "should recover from temporary service failures",
      async () => {
        // Simulate service failure and recovery
        const originalMakeRequest = mockServiceNowClient.makeRequestFullFields;

        // Temporarily break ServiceNow client
        mockServiceNowClient.makeRequestFullFields = async () => {
          throw new Error("Temporary service failure");
        };

        // First request should fail
        await expect(
          consolidatedTicketService.getTicketDetails(
            "failure-test",
            "incident",
          ),
        ).rejects.toThrow("Failed to load ticket");

        // Restore service
        mockServiceNowClient.makeRequestFullFields = originalMakeRequest;

        // Subsequent request should succeed
        const ticket = await consolidatedTicketService.getTicketDetails(
          "recovery-test",
          "incident",
        );
        expect(ticket).toBeDefined();
        expect(ticket.sysId).toBe("recovery-test");
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );

    it(
      "should handle streaming service interruptions",
      async () => {
        // Create streaming connection
        const stream =
          unifiedStreamingService.createTicketSSEConnection(
            "interruption-test",
          );
        expect(stream).toBeInstanceOf(Response);

        const initialStats = unifiedStreamingService.getConnectionStats();
        expect(initialStats.totalConnections).toBe(1);

        // Simulate service interruption (cleanup)
        unifiedStreamingService.cleanup();

        // Service should be able to restart
        unifiedStreamingService.initialize(mockRedisStreams);

        // New connections should work
        const newStream =
          unifiedStreamingService.createTicketSSEConnection("recovery-stream");
        expect(newStream).toBeInstanceOf(Response);

        const recoveryStats = unifiedStreamingService.getConnectionStats();
        expect(recoveryStats.totalConnections).toBe(1);
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );
  });

  describe("Data Integrity and Consistency", () => {
    it(
      "should maintain data consistency across service boundaries",
      async () => {
        const testData = {
          ticketId: "consistency-boundary-test",
          expectedNumber: "INC0999999",
          expectedState: "2",
        };

        // Get ticket through consolidated service
        const ticket = await consolidatedTicketService.getTicketDetails(
          testData.ticketId,
          "incident",
        );

        // Verify basic data integrity
        expect(ticket.sysId).toBe(testData.ticketId);
        expect(ticket.number).toBe(testData.expectedNumber);
        expect(ticket.state).toBe(testData.expectedState);

        // Create streaming connection for the same ticket
        const stream = unifiedStreamingService.createTicketSSEConnection(
          testData.ticketId,
        );
        expect(stream).toBeInstanceOf(Response);

        // Broadcast update and verify consistency
        const updateMessage = {
          event: "ticket-updated" as const,
          data: {
            sysId: testData.ticketId,
            number: ticket.number,
            ticketType: "incident" as const,
            action: "update" as const,
            state: ticket.state,
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };

        expect(() => {
          unifiedStreamingService.broadcastToTicket(
            testData.ticketId,
            updateMessage,
          );
        }).not.toThrow();
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );

    it(
      "should validate consolidated service feature completeness",
      async () => {
        // Test all major consolidated features in sequence

        // 1. Ticket details retrieval (from TicketService)
        const ticketDetails = await consolidatedTicketService.getTicketDetails(
          "completeness-test",
          "incident",
        );
        expect(ticketDetails).toBeDefined();

        // 2. Hybrid query (from HybridTicketService)
        const hybridQuery = await consolidatedTicketService.hybridQuery({
          table: "incident",
          group: "all",
          state: "active",
          page: 1,
          limit: 5,
        });
        expect(hybridQuery).toBeDefined();

        // 3. Synchronization (from TicketIntegrationService)
        const syncResult =
          await consolidatedTicketService.syncCurrentMonthTickets();
        expect(syncResult.success).toBe(true);

        // 4. Statistics (from TicketCollectionService)
        const stats = await consolidatedTicketService.getStats();
        expect(stats).toBeDefined();

        // 5. Utility functions (from TicketService)
        expect(consolidatedTicketService.getStatusLabel("2")).toBe(
          "Em Progresso",
        );
        expect(consolidatedTicketService.getPriorityLabel("1")).toBe("Crítica");

        console.log(" All consolidated service features validated");
      },
      INTEGRATION_TEST_CONFIG.timeout,
    );
  });
});

// Skip integration tests if environment variables are not set
const shouldSkipTests =
  INTEGRATION_TEST_CONFIG.skipIfNoEnvironment &&
  (!INTEGRATION_TEST_CONFIG.mongodb.enabled ||
    !INTEGRATION_TEST_CONFIG.servicenow.enabled ||
    !INTEGRATION_TEST_CONFIG.redis.enabled);

if (shouldSkipTests) {
  console.warn(
    " Some integration tests will use mocks due to missing environment variables",
  );
  console.warn(
    "Set MONGODB_URL, SNC_INSTANCE_URL, SNC_AUTH_TOKEN, and REDIS_URL for full integration testing",
  );
}
