/**
 * Redis Streams Test Suite - Testing Real-time ServiceNow Change Streaming
 * Tests the Redis Streams integration for auto-sync real-time updates
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  mock,
  spyOn,
} from "bun:test";
import {
  ServiceNowStreams,
  type ServiceNowChange,
  type RedisStreamConfig,
} from "../../config/redis-streams";
import { logger } from "../../utils/Logger";

// Mock Redis client for streams testing
const mockRedisClient = {
  connect: mock(),
  ping: mock(),
  xgroup: mock(),
  xadd: mock(),
  xreadgroup: mock(),
  xpending: mock(),
  xclaim: mock(),
  xack: mock(),
  xinfo: mock(),
  quit: mock(),
  on: mock(),
  removeAllListeners: mock(),
};

// Mock Redis connection manager
const mockRedisConnectionManager = {
  connect: mock(),
  setMaxListeners: mock(),
  on: mock(),
  emit: mock(),
};

// Mock stream configuration
const mockStreamConfig: Partial<RedisStreamConfig> = {
  host: "localhost",
  port: 6379,
  password: "test",
  db: 1,
  streamKey: "test:servicenow:changes",
  consumerGroup: "test-processors",
  consumerName: "test-consumer",
  maxRetries: 3,
  retryDelayMs: 1000,
};

// Mock ServiceNow change data
const mockIncidentChange: ServiceNowChange = {
  type: "incident",
  action: "created",
  sys_id: "test-incident-123",
  number: "INC0012345",
  state: "1",
  assignment_group: "IT Support",
  short_description: "Test incident created",
  timestamp: new Date().toISOString(),
  data: {
    priority: "3",
    caller_id: "test-user",
    category: "Software",
  },
  sync_type: "incremental",
  slm_count: 0,
  notes_count: 2,
};

const mockChangeTaskChange: ServiceNowChange = {
  type: "change_task",
  action: "updated",
  sys_id: "test-ctask-456",
  number: "CTASK0012345",
  state: "2",
  assignment_group: "Change Management",
  short_description: "Test change task updated",
  timestamp: new Date().toISOString(),
  data: {
    change_request: "CHG0012345",
    planned_start_date: "2025-01-01 10:00:00",
  },
  sync_type: "incremental",
};

const mockSCTaskChange: ServiceNowChange = {
  type: "sc_task",
  action: "resolved",
  sys_id: "test-sctask-789",
  number: "SCTASK0012345",
  state: "6",
  assignment_group: "Service Catalog",
  short_description: "Test SC task resolved",
  timestamp: new Date().toISOString(),
  data: {
    request: "REQ0012345",
    requested_for: "test-requester",
  },
  sync_type: "full",
};

describe("Redis Streams - Auto-Sync Real-time Updates", () => {
  let serviceNowStreams: ServiceNowStreams;
  let consumerCallbacks: Map<
    string,
    (change: ServiceNowChange) => Promise<void>
  > = new Map();

  beforeAll(() => {
    // Mock the redis connection manager
    jest.doMock("../../utils/RedisConnection", () => ({
      redisConnectionManager: mockRedisConnectionManager,
    }));
  });

  beforeEach(async () => {
    // Setup mock responses
    mockRedisConnectionManager.connect.mockResolvedValue(mockRedisClient);
    mockRedisClient.connect.mockResolvedValue(void 0);
    mockRedisClient.ping.mockResolvedValue("PONG");
    mockRedisClient.xgroup.mockResolvedValue("OK");
    mockRedisClient.xadd.mockResolvedValue("1234567890-0");
    mockRedisClient.xack.mockResolvedValue(1);

    // Initialize ServiceNow Streams
    serviceNowStreams = new ServiceNowStreams(mockStreamConfig);

    // Mock the Redis client property
    (serviceNowStreams as any).redis = mockRedisClient;
    (serviceNowStreams as any).isConnected = true;

    // Clear consumer callbacks
    consumerCallbacks.clear();
  });

  afterEach(async () => {
    // Cleanup after each test
    try {
      if (serviceNowStreams) {
        await serviceNowStreams.close();
      }
    } catch (error) {
      // Ignore cleanup errors in tests
    }

    // Clear all mocks
    consumerCallbacks.clear();
  });

  describe("Stream Initialization", () => {
    it("should initialize Redis streams successfully", async () => {
      await expect(serviceNowStreams.initialize()).resolves.not.toThrow();

      expect(mockRedisClient.xgroup).toHaveBeenCalledWith(
        "CREATE",
        mockStreamConfig.streamKey,
        mockStreamConfig.consumerGroup,
        "$",
        "MKSTREAM",
      );
    });

    it("should handle existing consumer group gracefully", async () => {
      const busyGroupError = new Error(
        "BUSYGROUP Consumer Group name already exists",
      );
      mockRedisClient.xgroup.mockRejectedValueOnce(busyGroupError);

      await expect(serviceNowStreams.initialize()).resolves.not.toThrow();
    });

    it("should handle Redis connection failures gracefully", async () => {
      mockRedisConnectionManager.connect.mockRejectedValueOnce(
        new Error("Connection failed"),
      );

      // Should continue without Redis (graceful degradation)
      await expect(serviceNowStreams.initialize()).resolves.not.toThrow();
    });
  });

  describe("Publishing ServiceNow Changes", () => {
    it("should publish incident changes to stream", async () => {
      const messageId =
        await serviceNowStreams.publishChange(mockIncidentChange);

      expect(messageId).toBe("1234567890-0");
      expect(mockRedisClient.xadd).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        "*",
        "type",
        "incident",
        "action",
        "created",
        "sys_id",
        "test-incident-123",
        "number",
        "INC0012345",
        "state",
        "1",
        "assignment_group",
        "IT Support",
        "short_description",
        "Test incident created",
        "timestamp",
        expect.any(String),
        "data",
        expect.any(String),
      );
    });

    it("should publish change task changes to stream", async () => {
      const messageId =
        await serviceNowStreams.publishChange(mockChangeTaskChange);

      expect(messageId).toBe("1234567890-0");
      expect(mockRedisClient.xadd).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        "*",
        "type",
        "change_task",
        "action",
        "updated",
        "sys_id",
        "test-ctask-456",
        "number",
        "CTASK0012345",
        "state",
        "2",
        "assignment_group",
        "Change Management",
        "short_description",
        "Test change task updated",
        "timestamp",
        expect.any(String),
        "data",
        expect.any(String),
      );
    });

    it("should publish SC task changes to stream", async () => {
      const messageId = await serviceNowStreams.publishChange(mockSCTaskChange);

      expect(messageId).toBe("1234567890-0");
      expect(mockRedisClient.xadd).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        "*",
        "type",
        "sc_task",
        "action",
        "resolved",
        "sys_id",
        "test-sctask-789",
        "number",
        "SCTASK0012345",
        "state",
        "6",
        "assignment_group",
        "Service Catalog",
        "short_description",
        "Test SC task resolved",
        "timestamp",
        expect.any(String),
        "data",
        expect.any(String),
      );
    });

    it("should handle Redis unavailability gracefully when publishing", async () => {
      (serviceNowStreams as any).redis = null;

      const messageId =
        await serviceNowStreams.publishChange(mockIncidentChange);

      expect(messageId).toBeNull();
      // Should log warning but not throw
    });

    it("should handle publishing errors gracefully", async () => {
      mockRedisClient.xadd.mockRejectedValueOnce(new Error("Stream full"));

      const messageId =
        await serviceNowStreams.publishChange(mockIncidentChange);

      expect(messageId).toBeNull();
      // Should log error but not throw
    });
  });

  describe("Consumer Registration", () => {
    it("should register consumers for specific change types", () => {
      const incidentHandler = mock();
      const changeTaskHandler = mock();
      const allHandler = mock();

      serviceNowStreams.registerConsumer(["incident"], incidentHandler);
      serviceNowStreams.registerConsumer(["change_task"], changeTaskHandler);
      serviceNowStreams.registerConsumer(["*"], allHandler);

      // Verify consumers were registered
      const consumers = (serviceNowStreams as any).consumers;
      expect(consumers.size).toBe(3);
      expect(consumers.has("incident")).toBe(true);
      expect(consumers.has("change_task")).toBe(true);
      expect(consumers.has("*")).toBe(true);
    });

    it("should register SSE consumers for real-time updates", () => {
      const sseHandler = mock();

      serviceNowStreams.subscribe("ticket-updates", sseHandler);

      const consumers = (serviceNowStreams as any).consumers;
      expect(consumers.has("sse:ticket-updates")).toBe(true);
    });

    it("should support multiple change types per consumer", () => {
      const multiTypeHandler = mock();

      serviceNowStreams.registerConsumer(
        ["incident", "change_task", "sc_task"],
        multiTypeHandler,
      );

      const consumers = (serviceNowStreams as any).consumers;
      expect(consumers.has("incident,change_task,sc_task")).toBe(true);
    });
  });

  describe("Stream Consumption", () => {
    beforeEach(() => {
      // Mock stream reading responses
      mockRedisClient.xreadgroup.mockResolvedValue([
        [
          mockStreamConfig.streamKey,
          [
            [
              "1234567890-0",
              [
                "type",
                "incident",
                "action",
                "created",
                "sys_id",
                "test-incident-123",
                "number",
                "INC0012345",
                "state",
                "1",
                "assignment_group",
                "IT Support",
                "short_description",
                "Test incident created",
                "timestamp",
                mockIncidentChange.timestamp,
                "data",
                JSON.stringify(mockIncidentChange.data),
              ],
            ],
          ],
        ],
      ]);

      mockRedisClient.xpending.mockResolvedValue([]);
    });

    it("should consume and process incident messages", async () => {
      const incidentHandler = mock();
      serviceNowStreams.registerConsumer(["incident"], incidentHandler);

      // Mock the startConsumer method to process one batch
      const processMessageSpy = spyOn(
        serviceNowStreams as any,
        "processMessage",
      ).mockResolvedValue(void 0);

      // Simulate one iteration of the consumer loop
      const consumerPromise = (
        serviceNowStreams as any
      ).checkAndProcessMessages();
      await consumerPromise;

      expect(mockRedisClient.xreadgroup).toHaveBeenCalledWith(
        "GROUP",
        mockStreamConfig.consumerGroup,
        mockStreamConfig.consumerName,
        "COUNT",
        10,
        "BLOCK",
        1000,
        "STREAMS",
        mockStreamConfig.streamKey,
        ">",
      );

      expect(processMessageSpy).toHaveBeenCalledWith(
        "1234567890-0",
        expect.arrayContaining(["type", "incident"]),
      );
    });

    it("should acknowledge processed messages", async () => {
      const handler = mock();
      serviceNowStreams.registerConsumer(["incident"], handler);

      await (serviceNowStreams as any).processMessage("1234567890-0", [
        "type",
        "incident",
        "action",
        "created",
        "sys_id",
        "test-incident-123",
        "number",
        "INC0012345",
        "state",
        "1",
        "assignment_group",
        "IT Support",
        "short_description",
        "Test incident created",
        "timestamp",
        mockIncidentChange.timestamp,
        "data",
        JSON.stringify(mockIncidentChange.data),
      ]);

      expect(mockRedisClient.xack).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        mockStreamConfig.consumerGroup,
        "1234567890-0",
      );
    });

    it("should handle processing errors and still acknowledge", async () => {
      const failingHandler = mock().mockRejectedValue(
        new Error("Processing failed"),
      );
      serviceNowStreams.registerConsumer(["incident"], failingHandler);

      await (serviceNowStreams as any).processMessage("1234567890-0", [
        "type",
        "incident",
        "action",
        "created",
        "sys_id",
        "test-incident-123",
        "number",
        "INC0012345",
        "state",
        "1",
        "assignment_group",
        "IT Support",
        "short_description",
        "Test incident created",
        "timestamp",
        mockIncidentChange.timestamp,
        "data",
        JSON.stringify(mockIncidentChange.data),
      ]);

      // Should still acknowledge even on processing error
      expect(mockRedisClient.xack).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        mockStreamConfig.consumerGroup,
        "1234567890-0",
      );
    });
  });

  describe("Pending Message Processing", () => {
    it("should process pending messages that weren't acknowledged", async () => {
      mockRedisClient.xpending.mockResolvedValueOnce([
        ["1234567890-1", "test-consumer", 60000, 1],
      ]);

      mockRedisClient.xclaim.mockResolvedValueOnce([
        [
          "1234567890-1",
          [
            "type",
            "change_task",
            "action",
            "updated",
            "sys_id",
            "test-ctask-456",
            "number",
            "CTASK0012345",
            "state",
            "2",
          ],
        ],
      ]);

      const processMessageSpy = spyOn(
        serviceNowStreams as any,
        "processMessage",
      ).mockResolvedValue(void 0);

      await (serviceNowStreams as any).processPendingMessages();

      expect(mockRedisClient.xclaim).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        mockStreamConfig.consumerGroup,
        mockStreamConfig.consumerName,
        60000,
        "1234567890-1",
      );

      expect(processMessageSpy).toHaveBeenCalledWith(
        "1234567890-1",
        expect.arrayContaining(["type", "change_task"]),
      );
    });
  });

  describe("Stream Statistics", () => {
    it("should provide stream statistics", async () => {
      mockRedisClient.xinfo.mockImplementation((command, key) => {
        if (command === "STREAM") {
          return ["length", 100, "radix-tree-keys", 10, "radix-tree-nodes", 20];
        } else if (command === "GROUPS") {
          return [
            [
              "name",
              "test-processors",
              "consumers",
              2,
              "pending",
              5,
              "last-delivered-id",
              "1234567890-10",
            ],
          ];
        }
        return [];
      });

      const stats = await serviceNowStreams.getStreamStats();

      expect(stats).toEqual({
        stream: mockStreamConfig.streamKey,
        length: 100,
        radixTreeKeys: 10,
        radixTreeNodes: 20,
        groups: [
          {
            name: "test-processors",
            consumers: 2,
            pending: 5,
            lastDeliveredId: "1234567890-10",
          },
        ],
        connected: true,
        consumerName: mockStreamConfig.consumerName,
        registeredConsumers: expect.any(Array),
      });
    });

    it("should return disconnected status when Redis unavailable", async () => {
      (serviceNowStreams as any).isConnected = false;

      const stats = await serviceNowStreams.getStreamStats();

      expect(stats).toEqual({
        status: "disconnected",
      });
    });
  });

  describe("Health Checks", () => {
    it("should return healthy status when Redis is connected", async () => {
      mockRedisClient.ping.mockResolvedValue("PONG");

      const health = await serviceNowStreams.healthCheck();

      expect(health.status).toBe("healthy");
      expect(health.details.pingDuration).toBeDefined();
      expect(health.details.connection).toEqual({
        host: mockStreamConfig.host,
        port: mockStreamConfig.port,
        db: mockStreamConfig.db,
      });
    });

    it("should return unhealthy status when Redis is disconnected", async () => {
      (serviceNowStreams as any).isConnected = false;

      const health = await serviceNowStreams.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.details.error).toBe("Redis not connected");
    });

    it("should return unhealthy status on ping failure", async () => {
      mockRedisClient.ping.mockRejectedValueOnce(
        new Error("Connection timeout"),
      );

      const health = await serviceNowStreams.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.details.error).toBe("Connection timeout");
    });
  });

  describe("Convenience Methods", () => {
    it("should publish incident created events", async () => {
      const incident = {
        sys_id: "incident-123",
        number: "INC0012345",
        state: "1",
        assignment_group: { display_value: "IT Support" },
        short_description: "Test incident",
      };

      const messageId =
        await serviceNowStreams.publishIncidentCreated(incident);

      expect(messageId).toBe("1234567890-0");
      expect(mockRedisClient.xadd).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        "*",
        expect.stringContaining("type"),
        "incident",
        expect.stringContaining("action"),
        "created",
        expect.stringContaining("sys_id"),
        "incident-123",
      );
    });

    it("should publish incident updated events", async () => {
      const incident = {
        sys_id: "incident-123",
        number: "INC0012345",
        state: "2",
        assignment_group: { display_value: "IT Support" },
        short_description: "Updated incident",
      };

      const messageId =
        await serviceNowStreams.publishIncidentUpdated(incident);

      expect(messageId).toBe("1234567890-0");
      expect(mockRedisClient.xadd).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        "*",
        expect.stringContaining("action"),
        "updated",
      );
    });

    it("should publish incident resolved events", async () => {
      const incident = {
        sys_id: "incident-123",
        number: "INC0012345",
        state: "6",
        assignment_group: { display_value: "IT Support" },
        short_description: "Resolved incident",
      };

      const messageId =
        await serviceNowStreams.publishIncidentResolved(incident);

      expect(messageId).toBe("1234567890-0");
      expect(mockRedisClient.xadd).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        "*",
        expect.stringContaining("action"),
        "resolved",
      );
    });
  });

  describe("Auto-Sync Integration", () => {
    it("should notify consumers of sync events", async () => {
      const syncHandler = mock();
      serviceNowStreams.registerConsumer(["*"], syncHandler);

      const syncChange: ServiceNowChange = {
        type: "incident",
        action: "synced",
        sys_id: "sync-test-123",
        number: "INC0012345",
        state: "2",
        timestamp: new Date().toISOString(),
        data: {},
        sync_type: "full",
      };

      await serviceNowStreams.publishChange(syncChange);

      expect(mockRedisClient.xadd).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        "*",
        expect.stringContaining("action"),
        "synced",
      );
    });

    it("should handle SLM update notifications", async () => {
      const slmChange: ServiceNowChange = {
        type: "incident",
        action: "slm_updated",
        sys_id: "slm-test-123",
        number: "INC0012345",
        state: "2",
        timestamp: new Date().toISOString(),
        data: {
          slm_percentage: 75,
          slm_due_date: "2025-01-01 15:00:00",
        },
        slm_count: 3,
      };

      await serviceNowStreams.publishChange(slmChange);

      expect(mockRedisClient.xadd).toHaveBeenCalledWith(
        mockStreamConfig.streamKey,
        "*",
        expect.stringContaining("action"),
        "slm_updated",
      );
    });
  });
});

// Mock jest functions for Bun compatibility
if (typeof jest === "undefined") {
  (globalThis as any).jest = {
    doMock: (module: string, factory: Function) => {
      console.log(`Mocking ${module}`);
    },
  };
}

// Bun test compatibility helpers
if (typeof mock === "undefined") {
  (globalThis as any).mock = (implementation?: Function) => {
    const mockFn = implementation || (() => {});
    (mockFn as any).mock = { calls: [], results: [] };
    (mockFn as any).mockResolvedValue = (value: any) => {
      (mockFn as any).mockImplementation = () => Promise.resolve(value);
      return mockFn;
    };
    (mockFn as any).mockResolvedValueOnce = (value: any) => {
      (mockFn as any).mockImplementationOnce = () => Promise.resolve(value);
      return mockFn;
    };
    (mockFn as any).mockRejectedValue = (error: any) => {
      (mockFn as any).mockImplementation = () => Promise.reject(error);
      return mockFn;
    };
    (mockFn as any).mockRejectedValueOnce = (error: any) => {
      (mockFn as any).mockImplementationOnce = () => Promise.reject(error);
      return mockFn;
    };
    return mockFn;
  };
}

if (typeof spyOn === "undefined") {
  (globalThis as any).spyOn = (object: any, method: string) => {
    const original = object[method];
    const mockFn = mock(original);
    object[method] = mockFn;
    return mockFn;
  };
}
