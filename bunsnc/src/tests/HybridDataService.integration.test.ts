/**
 * Integration Tests for ConsolidatedDataService - Real-world Scenarios
 * Tests complex integration patterns and user transparency
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  ConsolidatedDataService,
  HybridDataOptions,
} from "../services/ConsolidatedDataService";
import { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import { ConsolidatedDataService } from "../services/ConsolidatedDataService";
import { ServiceNowStreams } from "../config/redis-streams";

// Mock implementations for integration testing
const mockMongoService = {
  findIncidentBySysId: mock(),
  findChangeTaskBySysId: mock(),
  findSCTaskBySysId: mock(),
  saveIncident: mock(),
  saveChangeTask: mock(),
  saveSCTask: mock(),
  deleteTicket: mock(),
  getCollectionStats: mock(),
  healthCheck: mock(),
} as unknown as ConsolidatedDataService;

const mockServiceNowService = {
  makeRequestFullFields: mock(),
  getSLADataForTask: mock(),
  getHealthStatus: mock(),
} as unknown as ServiceNowAuthClient;

const mockRedisStreams = {
  publishChange: mock(),
  healthCheck: mock(),
} as unknown as ServiceNowStreams;

describe("ConsolidatedDataService - Integration Scenarios", () => {
  let hybridService: ConsolidatedDataService;

  beforeEach(() => {
    mockMongoService.findIncidentBySysId = mock(() => null);
    mockServiceNowService.makeRequestFullFields = mock(() =>
      Promise.resolve(null),
    );
    mockRedisStreams.publishChange = mock(() =>
      Promise.resolve("test-message-id"),
    );

    hybridService = new ConsolidatedDataService(
      mockMongoService,
      mockServiceNowService,
      mockRedisStreams,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  describe("Complete Transparency", () => {
    it("should provide identical user experience regardless of data source", async () => {
      const mockTicket = {
        sys_id: "test-123",
        number: "INC0001",
        state: "2",
        priority: "1",
      };

      // Scenario 1: Data from MongoDB (user doesn't know)
      mockMongoService.findIncidentBySysId = mock(() =>
        Promise.resolve({
          data: { incident: mockTicket, slms: [] },
        }),
      );

      let result = await hybridService.getTicketDetails("test-123", "incident");
      expect(result?.sys_id).toBe("test-123");
      expect(result?.table).toBe("incident");

      // Reset mocks for second scenario
      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.resolve({
          result: [mockTicket],
        }),
      );
      mockMongoService.saveIncident = mock(() => Promise.resolve());

      // Scenario 2: Data from ServiceNow (user doesn't know)
      result = await hybridService.getTicketDetails("test-123", "incident");
      expect(result?.sys_id).toBe("test-123");
      expect(result?.table).toBe("incident");

      // The user experience should be identical regardless of data source
    });

    it("should handle network failures gracefully with fallback", async () => {
      const staleTicket = {
        sys_id: "test-123",
        number: "INC0001",
        state: "2",
        priority: "1",
        sys_updated_on: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour old
      };

      // Setup: MongoDB has stale data, ServiceNow is unavailable
      mockMongoService.findIncidentBySysId = mock(() =>
        Promise.resolve({
          data: { incident: staleTicket, slms: [] },
        }),
      );
      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.reject(new Error("Network timeout")),
      );

      const result = await hybridService.getTicketDetails(
        "test-123",
        "incident",
      );

      // Should gracefully fall back to stale data
      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe("test-123");
    });
  });

  describe("Multiple Ticket Operations", () => {
    it("should process multiple ticket requests efficiently", async () => {
      const requests = [
        { sysId: "test-1", table: "incident" },
        { sysId: "test-2", table: "incident" },
        { sysId: "test-3", table: "change_task" },
      ];

      // Setup mocks for each request
      mockMongoService.findIncidentBySysId = mock((sysId) => {
        if (sysId === "test-1" || sysId === "test-2") {
          return Promise.resolve({
            data: {
              incident: {
                sys_id: sysId,
                number: `INC${sysId}`,
                state: "2",
                priority: "3",
                sys_created_on: "2025-01-01T10:00:00",
                sys_updated_on: "2025-01-01T10:00:00",
              },
              slms: [],
            },
          });
        }
        return Promise.resolve(null);
      });

      mockMongoService.findChangeTaskBySysId = mock(() =>
        Promise.resolve({
          data: {
            change_task: {
              sys_id: "test-3",
              number: "CTASK0001",
              state: "2",
              priority: "3",
              sys_created_on: "2025-01-01T10:00:00",
              sys_updated_on: "2025-01-01T10:00:00",
            },
            slms: [],
          },
        }),
      );

      const results = await hybridService.getMultipleTickets(requests);

      expect(results.size).toBe(3);
      expect(results.get("incident:test-1")).not.toBeNull();
      expect(results.get("incident:test-2")).not.toBeNull();
      expect(results.get("change_task:test-3")).not.toBeNull();
    });

    it("should handle mixed success and failure scenarios", async () => {
      const requests = [
        { sysId: "valid-123", table: "incident" },
        { sysId: "invalid-456", table: "incident" },
        { sysId: "valid-789", table: "sc_task" },
      ];

      // Mock responses: first succeeds, second fails, third succeeds
      mockMongoService.findIncidentBySysId = mock((sysId) => {
        if (sysId === "valid-123") {
          return Promise.resolve({
            data: {
              incident: {
                sys_id: sysId,
                number: "INC0001",
                state: "2",
                priority: "3",
                sys_created_on: "2025-01-01T10:00:00",
                sys_updated_on: "2025-01-01T10:00:00",
              },
              slms: [],
            },
          });
        }
        return Promise.resolve(null);
      });

      mockServiceNowService.makeRequestFullFields = mock((table, query) => {
        if (query.includes("invalid-456")) {
          return Promise.resolve({ result: [] }); // No data found
        }
        return Promise.reject(new Error("ServiceNow error"));
      });

      mockMongoService.findSCTaskBySysId = mock(() =>
        Promise.resolve({
          data: {
            sc_task: {
              sys_id: "valid-789",
              number: "SCTASK0001",
              state: "2",
              priority: "3",
              sys_created_on: "2025-01-01T10:00:00",
              sys_updated_on: "2025-01-01T10:00:00",
            },
            slms: [],
          },
        }),
      );

      const results = await hybridService.getMultipleTickets(requests);

      expect(results.get("incident:valid-123")).not.toBeNull();
      expect(results.get("incident:invalid-456")).toBeNull();
      expect(results.get("sc_task:valid-789")).not.toBeNull();
    });
  });

  describe("Advanced Options", () => {
    it("should force ServiceNow fetch when requested", async () => {
      const mockTicket = {
        sys_id: "test-123",
        number: "INC0001",
        state: "2",
        priority: "3",
      };

      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.resolve({
          result: [mockTicket],
        }),
      );
      mockMongoService.saveIncident = mock(() => Promise.resolve());

      const options: HybridDataOptions = { forceServiceNow: true };
      const result = await hybridService.getTicketDetails(
        "test-123",
        "incident",
        options,
      );

      expect(result).not.toBeNull();
      expect(mockServiceNowService.makeRequestFullFields).toHaveBeenCalledWith(
        "incident",
        "sys_id=test-123",
        1,
      );
      expect(mockMongoService.findIncidentBySysId).not.toHaveBeenCalled();
    });

    it("should include SLMs when requested", async () => {
      const mockTicket = {
        sys_id: "test-123",
        number: "INC0001",
        state: "2",
        priority: "3",
      };

      const mockSLAData = {
        task_slas: [
          {
            sys_id: "sla-123",
            sla: { display_value: "Resolution Time" },
            has_breached: { display_value: "false" },
          },
        ],
      };

      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.resolve({
          result: [mockTicket],
        }),
      );
      mockServiceNowService.getSLADataForTask = mock(() =>
        Promise.resolve(mockSLAData),
      );
      mockMongoService.saveIncident = mock(() => Promise.resolve());

      const options: HybridDataOptions = { includeSLMs: true };
      const result = await hybridService.getTicketDetails(
        "test-123",
        "incident",
        options,
      );

      expect(result).not.toBeNull();
      expect(result?.slms).toEqual(mockSLAData.task_slas);
      expect(mockServiceNowService.getSLADataForTask).toHaveBeenCalledWith(
        "test-123",
      );
    });
  });

  describe("Health and Statistics", () => {
    it("should report healthy status when all services are operational", async () => {
      mockMongoService.healthCheck = mock(() =>
        Promise.resolve({ status: "connected" }),
      );
      mockServiceNowService.getHealthStatus = mock(() =>
        Promise.resolve({ status: "healthy" }),
      );
      mockRedisStreams.healthCheck = mock(() =>
        Promise.resolve({ status: "healthy" }),
      );

      const health = await hybridService.getHealthStatus();

      expect(health.status).toBe("healthy");
      expect(health.details.mongodb).toBe(true);
      expect(health.details.servicenow).toBe(true);
      expect(health.details.redis).toBe(true);
    });

    it("should report degraded status when some services are down", async () => {
      mockMongoService.healthCheck = mock(() =>
        Promise.resolve({ status: "connected" }),
      );
      mockServiceNowService.getHealthStatus = mock(() =>
        Promise.resolve({ status: "healthy" }),
      );
      mockRedisStreams.healthCheck = mock(() =>
        Promise.reject(new Error("Redis unavailable")),
      );

      const health = await hybridService.getHealthStatus();

      expect(health.status).toBe("degraded");
      expect(health.details.mongodb).toBe(true);
      expect(health.details.servicenow).toBe(true);
      expect(health.details.redis).toBe(false);
    });

    it("should return cache statistics", async () => {
      mockMongoService.getCollectionStats = mock((collection) => {
        const stats = {
          incident: 100,
          change_task: 50,
          sc_task: 25,
        };
        return Promise.resolve(stats[collection] || 0);
      });

      const stats = await hybridService.getCacheStats();

      expect(stats.mongoDocuments).toBe(175);
      expect(stats.cacheHitRatio).toBeGreaterThan(0);
      expect(stats.lastSyncTimes).toBeDefined();
    });
  });

  describe("Table-specific Operations", () => {
    it("should handle change_task table correctly", async () => {
      const mockChangeTaskData = {
        sys_id: "ctask-123",
        number: "CTASK0001",
        state: "3",
        priority: "2",
      };

      mockMongoService.findChangeTaskBySysId = mock(() =>
        Promise.resolve(null),
      );
      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.resolve({
          result: [mockChangeTaskData],
        }),
      );
      mockMongoService.saveChangeTask = mock(() => Promise.resolve());

      const result = await hybridService.getTicketDetails(
        "ctask-123",
        "change_task",
      );

      expect(result).not.toBeNull();
      expect(result?.table).toBe("change_task");
      expect(mockMongoService.findChangeTaskBySysId).toHaveBeenCalledWith(
        "ctask-123",
      );
      expect(mockMongoService.saveChangeTask).toHaveBeenCalled();
    });

    it("should handle sc_task table correctly", async () => {
      const mockSCTaskData = {
        sys_id: "sctask-123",
        number: "SCTASK0001",
        state: "3",
        priority: "3",
      };

      mockMongoService.findSCTaskBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.resolve({
          result: [mockSCTaskData],
        }),
      );
      mockMongoService.saveSCTask = mock(() => Promise.resolve());

      const result = await hybridService.getTicketDetails(
        "sctask-123",
        "sc_task",
      );

      expect(result).not.toBeNull();
      expect(result?.table).toBe("sc_task");
      expect(mockMongoService.findSCTaskBySysId).toHaveBeenCalledWith(
        "sctask-123",
      );
      expect(mockMongoService.saveSCTask).toHaveBeenCalled();
    });

    it("should handle unknown table gracefully", async () => {
      const result = await hybridService.getTicketDetails(
        "test-123",
        "unknown_table",
      );

      expect(result).toBeNull();
    });
  });
});
