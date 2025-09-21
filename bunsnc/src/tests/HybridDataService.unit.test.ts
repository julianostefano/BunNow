/**
 * Unit Tests for ConsolidatedDataService - Core Functionality
 * Tests transparent data sourcing and caching strategies
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import {
  ConsolidatedDataService,
  SmartDataStrategy,
  TicketData,
} from "../services/ConsolidatedDataService";
import { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import { ConsolidatedDataService } from "../services/ConsolidatedDataService";
import { ServiceNowStreams } from "../config/redis-streams";

// Mock implementations
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

describe("SmartDataStrategy", () => {
  let strategy: SmartDataStrategy;

  beforeEach(() => {
    strategy = new SmartDataStrategy();
  });

  describe("getTTL", () => {
    it("should return 1 hour for closed tickets (state 6,7)", () => {
      const ticket: TicketData = {
        sys_id: "test-123",
        number: "INC0001",
        table: "incident",
        state: "6",
        priority: "3",
        sys_created_on: "2025-01-01T10:00:00",
        sys_updated_on: "2025-01-01T10:00:00",
      };

      expect(strategy.getTTL(ticket)).toBe(3600000); // 1 hour
    });

    it("should return 1 minute for critical tickets (priority 1)", () => {
      const ticket: TicketData = {
        sys_id: "test-123",
        number: "INC0001",
        table: "incident",
        state: "2",
        priority: "1",
        sys_created_on: "2025-01-01T10:00:00",
        sys_updated_on: "2025-01-01T10:00:00",
      };

      expect(strategy.getTTL(ticket)).toBe(60000); // 1 minute
    });

    it("should return 2 minutes for high priority tickets (priority 2)", () => {
      const ticket: TicketData = {
        sys_id: "test-123",
        number: "INC0001",
        table: "incident",
        state: "2",
        priority: "2",
        sys_created_on: "2025-01-01T10:00:00",
        sys_updated_on: "2025-01-01T10:00:00",
      };

      expect(strategy.getTTL(ticket)).toBe(120000); // 2 minutes
    });

    it("should return 5 minutes for standard tickets", () => {
      const ticket: TicketData = {
        sys_id: "test-123",
        number: "INC0001",
        table: "incident",
        state: "2",
        priority: "3",
        sys_created_on: "2025-01-01T10:00:00",
        sys_updated_on: "2025-01-01T10:00:00",
      };

      expect(strategy.getTTL(ticket)).toBe(300000); // 5 minutes
    });
  });

  describe("shouldRefresh", () => {
    it("should return true for stale data beyond TTL", () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago

      const ticket: TicketData = {
        sys_id: "test-123",
        number: "INC0001",
        table: "incident",
        state: "2",
        priority: "3", // 5-minute TTL
        sys_created_on: oldTime,
        sys_updated_on: oldTime,
      };

      expect(strategy.shouldRefresh(ticket)).toBe(true);
    });

    it("should return false for fresh data within TTL", () => {
      const recentTime = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 minutes ago

      const ticket: TicketData = {
        sys_id: "test-123",
        number: "INC0001",
        table: "incident",
        state: "2",
        priority: "3", // 5-minute TTL
        sys_created_on: recentTime,
        sys_updated_on: recentTime,
      };

      expect(strategy.shouldRefresh(ticket)).toBe(false);
    });
  });

  describe("getRefreshPriority", () => {
    it("should return high priority for critical tickets", () => {
      const ticket: TicketData = {
        sys_id: "test-123",
        number: "INC0001",
        table: "incident",
        state: "2",
        priority: "1",
        sys_created_on: "2025-01-01T10:00:00",
        sys_updated_on: "2025-01-01T10:00:00",
      };

      expect(strategy.getRefreshPriority(ticket)).toBe("high");
    });

    it("should return low priority for closed tickets", () => {
      const ticket: TicketData = {
        sys_id: "test-123",
        number: "INC0001",
        table: "incident",
        state: "6",
        priority: "3",
        sys_created_on: "2025-01-01T10:00:00",
        sys_updated_on: "2025-01-01T10:00:00",
      };

      expect(strategy.getRefreshPriority(ticket)).toBe("low");
    });
  });
});

describe("ConsolidatedDataService - Core Functions", () => {
  let hybridService: ConsolidatedDataService;
  let mockStrategy: SmartDataStrategy;

  beforeEach(() => {
    // Reset all mocks
    mockMongoService.findIncidentBySysId = mock(() => null);
    mockServiceNowService.makeRequestFullFields = mock(() =>
      Promise.resolve(null),
    );
    mockRedisStreams.publishChange = mock(() =>
      Promise.resolve("test-message-id"),
    );

    mockStrategy = new SmartDataStrategy();
    spyOn(mockStrategy, "shouldRefresh").mockReturnValue(false);

    hybridService = new ConsolidatedDataService(
      mockMongoService,
      mockServiceNowService,
      mockRedisStreams,
      mockStrategy,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  const mockTicketData = {
    sys_id: "test-123",
    number: "INC0001",
    state: "2",
    priority: "3",
    short_description: "Test incident",
    sys_created_on: "2025-01-01T10:00:00",
    sys_updated_on: "2025-01-01T10:00:00",
  };

  const mockMongoDocument = {
    data: {
      incident: mockTicketData,
      slms: [],
      sync_timestamp: "2025-01-01T10:00:00",
      collection_version: "2.0.0",
    },
  };

  describe("Transparent Data Access", () => {
    it("should return fresh data from MongoDB cache when available and fresh", async () => {
      mockMongoService.findIncidentBySysId = mock(() =>
        Promise.resolve(mockMongoDocument),
      );
      spyOn(mockStrategy, "shouldRefresh").mockReturnValue(false);

      const result = await hybridService.getTicketDetails(
        "test-123",
        "incident",
      );

      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe("test-123");
      expect(result?.table).toBe("incident");
      expect(mockMongoService.findIncidentBySysId).toHaveBeenCalledWith(
        "test-123",
      );
      expect(
        mockServiceNowService.makeRequestFullFields,
      ).not.toHaveBeenCalled();
    });

    it("should fetch from ServiceNow when MongoDB data is stale", async () => {
      mockMongoService.findIncidentBySysId = mock(() =>
        Promise.resolve(mockMongoDocument),
      );
      spyOn(mockStrategy, "shouldRefresh").mockReturnValue(true);

      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.resolve({
          result: [mockTicketData],
        }),
      );
      mockMongoService.saveIncident = mock(() => Promise.resolve());

      const result = await hybridService.getTicketDetails(
        "test-123",
        "incident",
      );

      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe("test-123");
      expect(mockServiceNowService.makeRequestFullFields).toHaveBeenCalledWith(
        "incident",
        "sys_id=test-123",
        1,
      );
      expect(mockMongoService.saveIncident).toHaveBeenCalled();
      expect(mockRedisStreams.publishChange).toHaveBeenCalled();
    });

    it("should fetch from ServiceNow when data not in MongoDB", async () => {
      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.resolve({
          result: [mockTicketData],
        }),
      );
      mockMongoService.saveIncident = mock(() => Promise.resolve());

      const result = await hybridService.getTicketDetails(
        "test-123",
        "incident",
      );

      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe("test-123");
      expect(mockServiceNowService.makeRequestFullFields).toHaveBeenCalledWith(
        "incident",
        "sys_id=test-123",
        1,
      );
      expect(mockMongoService.saveIncident).toHaveBeenCalled();
    });
  });

  describe("Fallback Mechanisms", () => {
    it("should use stale MongoDB data as fallback when ServiceNow fails", async () => {
      const staleTicketData = {
        ...mockTicketData,
        sys_updated_on: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes old
      };

      const staleDocument = {
        data: {
          incident: staleTicketData,
          slms: [],
          sync_timestamp: "2025-01-01T10:00:00",
          collection_version: "2.0.0",
        },
      };

      mockMongoService.findIncidentBySysId = mock(() =>
        Promise.resolve(staleDocument),
      );
      spyOn(mockStrategy, "shouldRefresh").mockReturnValue(true);

      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.reject(new Error("ServiceNow unavailable")),
      );

      const result = await hybridService.getTicketDetails(
        "test-123",
        "incident",
      );

      expect(result).not.toBeNull();
      expect(result?.sys_id).toBe("test-123");
      expect(mockServiceNowService.makeRequestFullFields).toHaveBeenCalled();
      expect(mockMongoService.saveIncident).not.toHaveBeenCalled();
    });

    it("should return null when neither MongoDB nor ServiceNow have data", async () => {
      mockMongoService.findIncidentBySysId = mock(() => Promise.resolve(null));
      mockServiceNowService.makeRequestFullFields = mock(() =>
        Promise.resolve({ result: [] }),
      );

      const result = await hybridService.getTicketDetails(
        "test-123",
        "incident",
      );

      expect(result).toBeNull();
    });
  });

  describe("Cache Management", () => {
    it("should invalidate ticket from MongoDB", async () => {
      mockMongoService.deleteTicket = mock(() => Promise.resolve());

      await hybridService.invalidateTicket("test-123", "incident");

      expect(mockMongoService.deleteTicket).toHaveBeenCalledWith(
        "incident",
        "test-123",
      );
    });

    it("should handle deletion errors gracefully", async () => {
      mockMongoService.deleteTicket = mock(() =>
        Promise.reject(new Error("Delete failed")),
      );

      // Should not throw error, just log it
      const result = hybridService.invalidateTicket("test-123", "incident");
      await expect(result).resolves.toBeUndefined();
    });
  });
});
