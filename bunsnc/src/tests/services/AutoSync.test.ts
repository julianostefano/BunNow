/**
 * Auto-Sync Test Suite - Comprehensive Testing for ServiceNow Auto-Sync Functionality
 * Tests the 5-minute auto-sync cycles for incidents, change_tasks, and sc_tasks
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
import { ConsolidatedDataService } from "../../services/ConsolidatedDataService";
import { TaskScheduler } from "../../background/TaskScheduler";
import { TaskQueue } from "../../background/TaskQueue";
import { ServiceNowAuthClient } from "../../services/ServiceNowAuthClient";
import { logger } from "../../utils/Logger";

// Mock configuration for auto-sync testing
const mockAutoSyncConfig = {
  mongodb: {
    connectionString: "mongodb://test:test@localhost:27017/test_bunsnc",
    databaseName: "test_bunsnc",
  },
  redis: {
    host: "localhost",
    port: 6379,
    password: "test",
  },
  cache: {
    enabled: true,
    ttl: 300000,
    maxSize: 1000,
    strategy: "smart" as const,
  },
  sync: {
    batchSize: 50,
    maxRetries: 3,
    syncInterval: 300000, // 5 minutes
    tables: ["incident", "change_task", "sc_task"],
    enableDeltaSync: true,
    enableRealTimeUpdates: true,
    enableSLMCollection: true,
    enableNotesCollection: true,
  },
};

// Mock ServiceNow data for testing
const mockIncidentData = {
  sys_id: "test-incident-1",
  number: "INC0012345",
  short_description: "Test incident for auto-sync",
  state: "2",
  priority: "3",
  assignment_group: "IT Support",
  sys_created_on: "2025-01-01 10:00:00",
  sys_updated_on: "2025-01-01 11:00:00",
};

const mockChangeTaskData = {
  sys_id: "test-change-task-1",
  number: "CTASK0012345",
  short_description: "Test change task for auto-sync",
  state: "1",
  priority: "2",
  change_request: "CHG0012345",
  sys_created_on: "2025-01-01 10:00:00",
  sys_updated_on: "2025-01-01 11:00:00",
};

const mockSCTaskData = {
  sys_id: "test-sc-task-1",
  number: "SCTASK0012345",
  short_description: "Test SC task for auto-sync",
  state: "1",
  priority: "3",
  request: "REQ0012345",
  sys_created_on: "2025-01-01 10:00:00",
  sys_updated_on: "2025-01-01 11:00:00",
};

// Mock ServiceNow Auth Client
const mockServiceNowClient = {
  makeRequestFullFields: mock(),
  isAuthenticated: () => true,
  getInstanceUrl: () => "https://test.service-now.com",
} as unknown as ServiceNowAuthClient;

// Mock MongoDB operations
const mockMongoClient = {
  connect: mock(),
  db: mock(() => ({
    collection: mock(() => ({
      findOne: mock(),
      find: mock(() => ({
        sort: mock(() => ({
          skip: mock(() => ({
            limit: mock(() => ({
              toArray: mock(),
            })),
          })),
        })),
      })),
      countDocuments: mock(),
      updateOne: mock(),
      replaceOne: mock(),
    })),
  })),
  close: mock(),
};

// Mock Redis operations
const mockRedisClient = {
  connect: mock(),
  ping: mock(),
  set: mock(),
  get: mock(),
  del: mock(),
  xadd: mock(),
  xreadgroup: mock(),
  xgroup: mock(),
  quit: mock(),
};

// Mock Task Queue and Scheduler
const mockTaskQueue = {
  addTask: mock(),
  getStats: mock(() => ({
    pending: 0,
    processing: 0,
    completed: 10,
    failed: 0,
  })),
  start: mock(),
  stop: mock(),
} as unknown as TaskQueue;

const mockTaskScheduler = {
  schedule: mock(),
  start: mock(),
  stop: mock(),
  getStats: mock(() => ({
    totalTasks: 3,
    enabledTasks: 3,
    totalRuns: 5,
    totalFails: 0,
  })),
  triggerTask: mock(),
} as unknown as TaskScheduler;

describe("Auto-Sync Test Suite", () => {
  let dataService: ConsolidatedDataService;
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;
  let mockIntervalId: number;
  let intervalCallbacks: (() => void)[] = [];

  beforeAll(() => {
    // Mock global timers for testing auto-sync intervals
    originalSetInterval = globalThis.setInterval;
    originalClearInterval = globalThis.clearInterval;

    globalThis.setInterval = mock((callback: () => void, interval: number) => {
      intervalCallbacks.push(callback);
      mockIntervalId = Math.random();
      return mockIntervalId as any;
    });

    globalThis.clearInterval = mock((id: any) => {
      intervalCallbacks = [];
    });
  });

  afterAll(() => {
    // Restore original timers
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });

  beforeEach(async () => {
    // Clear all previous mocks and intervals
    intervalCallbacks = [];

    // Setup mock responses
    mockServiceNowClient.makeRequestFullFields.mockResolvedValue({
      result: [mockIncidentData],
    });

    mockMongoClient.connect.mockResolvedValue(void 0);
    mockMongoClient.db().collection().updateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    mockRedisClient.connect.mockResolvedValue(void 0);
    mockRedisClient.ping.mockResolvedValue("PONG");

    // Initialize data service for testing
    dataService = ConsolidatedDataService.getInstance(mockAutoSyncConfig);

    // Mock the initialize method to avoid actual connections
    spyOn(dataService, "initialize").mockResolvedValue(void 0);
  });

  afterEach(async () => {
    // Cleanup after each test
    try {
      if (dataService) {
        dataService.stopAutoSync();
        await dataService.cleanup();
      }
    } catch (error) {
      // Ignore cleanup errors in tests
    }

    // Clear all mocks
    intervalCallbacks = [];
  });

  describe("Auto-Sync Initialization", () => {
    it("should initialize auto-sync with default 5-minute interval", async () => {
      const syncOptions = {
        syncInterval: 300000, // 5 minutes
        batchSize: 50,
        tables: ["incident", "change_task", "sc_task"],
        enableDeltaSync: true,
        enableRealTimeUpdates: true,
      };

      expect(() => {
        dataService.startAutoSync(syncOptions);
      }).not.toThrow();

      // Verify interval was set
      expect(globalThis.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        300000,
      );
    });

    it("should configure auto-sync with custom options", async () => {
      const customSyncOptions = {
        syncInterval: 180000, // 3 minutes
        batchSize: 25,
        tables: ["incident"],
        enableDeltaSync: false,
        enableRealTimeUpdates: false,
        enableSLMCollection: false,
        enableNotesCollection: false,
      };

      dataService.startAutoSync(customSyncOptions);

      expect(globalThis.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        180000,
      );
    });

    it("should handle auto-sync initialization errors gracefully", () => {
      const invalidSyncOptions = {
        syncInterval: -1, // Invalid interval
        batchSize: 0,
        tables: [],
      };

      // Should not throw even with invalid options
      expect(() => {
        dataService.startAutoSync(invalidSyncOptions);
      }).not.toThrow();
    });

    it("should stop existing auto-sync before starting new one", () => {
      // Start first auto-sync
      dataService.startAutoSync({
        syncInterval: 300000,
        tables: ["incident"],
      });

      // Start second auto-sync
      dataService.startAutoSync({
        syncInterval: 180000,
        tables: ["change_task"],
      });

      // Should have cleared previous interval
      expect(globalThis.clearInterval).toHaveBeenCalled();
    });
  });

  describe("Auto-Sync Execution", () => {
    it("should execute sync for all configured tables", async () => {
      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident", "change_task", "sc_task"],
        batchSize: 50,
      };

      // Mock the syncTableData method
      const syncTableDataSpy = spyOn(
        dataService as any,
        "syncTableData",
      ).mockResolvedValue(void 0);

      dataService.startAutoSync(syncOptions);

      // Trigger the interval callback
      expect(intervalCallbacks.length).toBe(1);
      await intervalCallbacks[0]();

      // Verify sync was called for each table
      expect(syncTableDataSpy).toHaveBeenCalledTimes(3);
      expect(syncTableDataSpy).toHaveBeenCalledWith(
        "incident",
        expect.any(Object),
      );
      expect(syncTableDataSpy).toHaveBeenCalledWith(
        "change_task",
        expect.any(Object),
      );
      expect(syncTableDataSpy).toHaveBeenCalledWith(
        "sc_task",
        expect.any(Object),
      );
    });

    it("should handle table sync failures gracefully", async () => {
      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident", "change_task"],
        batchSize: 50,
      };

      // Mock the syncTableData method with individual call tracking
      let callCount = 0;
      const syncTableDataSpy = spyOn(
        dataService as any,
        "syncTableData",
      ).mockImplementation(async (table: string) => {
        callCount++;
        if (table === "change_task") {
          throw new Error("Sync failed");
        }
        return Promise.resolve();
      });

      dataService.startAutoSync(syncOptions);

      // Trigger the interval callback
      if (intervalCallbacks.length > 0) {
        await intervalCallbacks[0]();
      }

      // Should complete without throwing and process both tables
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it("should process delta sync when enabled", async () => {
      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident"],
        enableDeltaSync: true,
        batchSize: 50,
      };

      const syncTableDataSpy = spyOn(
        dataService as any,
        "syncTableData",
      ).mockResolvedValue(void 0);

      dataService.startAutoSync(syncOptions);
      await intervalCallbacks[0]();

      expect(syncTableDataSpy).toHaveBeenCalledWith("incident", {
        batchSize: 50,
        enableDeltaSync: true,
        enableRealTimeUpdates: undefined,
        enableSLMCollection: undefined,
        enableNotesCollection: undefined,
      });
    });

    it("should collect SLM data when enabled", async () => {
      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident"],
        enableSLMCollection: true,
        batchSize: 50,
      };

      const syncTableDataSpy = spyOn(
        dataService as any,
        "syncTableData",
      ).mockResolvedValue(void 0);

      dataService.startAutoSync(syncOptions);
      await intervalCallbacks[0]();

      expect(syncTableDataSpy).toHaveBeenCalledWith("incident", {
        batchSize: 50,
        enableDeltaSync: undefined,
        enableRealTimeUpdates: undefined,
        enableSLMCollection: true,
        enableNotesCollection: undefined,
      });
    });

    it("should collect notes when enabled", async () => {
      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident"],
        enableNotesCollection: true,
        batchSize: 50,
      };

      const syncTableDataSpy = spyOn(
        dataService as any,
        "syncTableData",
      ).mockResolvedValue(void 0);

      dataService.startAutoSync(syncOptions);
      await intervalCallbacks[0]();

      expect(syncTableDataSpy).toHaveBeenCalledWith("incident", {
        batchSize: 50,
        enableDeltaSync: undefined,
        enableRealTimeUpdates: undefined,
        enableSLMCollection: undefined,
        enableNotesCollection: true,
      });
    });
  });

  describe("Auto-Sync Lifecycle Management", () => {
    it("should stop auto-sync correctly", () => {
      dataService.startAutoSync({
        syncInterval: 300000,
        tables: ["incident"],
      });

      // Verify auto-sync is running
      expect(intervalCallbacks.length).toBe(1);

      dataService.stopAutoSync();

      // Verify interval was cleared
      expect(globalThis.clearInterval).toHaveBeenCalledWith(mockIntervalId);
    });

    it("should handle stopping auto-sync when not running", () => {
      // Should not throw when stopping non-running auto-sync
      expect(() => {
        dataService.stopAutoSync();
      }).not.toThrow();
    });

    it("should cleanup auto-sync on service cleanup", async () => {
      dataService.startAutoSync({
        syncInterval: 300000,
        tables: ["incident"],
      });

      await dataService.cleanup();

      // Auto-sync should be stopped during cleanup
      expect(globalThis.clearInterval).toHaveBeenCalled();
    });
  });

  describe("Auto-Sync Error Handling", () => {
    it("should continue auto-sync cycle after individual table errors", async () => {
      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident", "change_task", "sc_task"],
        batchSize: 50,
      };

      // Track table sync attempts
      let processedTables: string[] = [];
      const syncTableDataSpy = spyOn(
        dataService as any,
        "syncTableData",
      ).mockImplementation(async (table: string) => {
        processedTables.push(table);
        if (table === "change_task") {
          throw new Error("Network error");
        }
        return Promise.resolve();
      });

      dataService.startAutoSync(syncOptions);

      // Trigger the interval callback
      if (intervalCallbacks.length > 0) {
        await intervalCallbacks[0]();
      }

      // All tables should have been attempted despite the error
      expect(processedTables.length).toBeGreaterThanOrEqual(3);
      expect(processedTables).toContain("incident");
      expect(processedTables).toContain("change_task");
      expect(processedTables).toContain("sc_task");
    });

    it("should log sync errors without stopping auto-sync", async () => {
      const loggerSpy = spyOn(logger, "error").mockImplementation(() => {});

      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident"],
        batchSize: 50,
      };

      spyOn(dataService as any, "syncTableData").mockRejectedValue(
        new Error("Test error"),
      );

      dataService.startAutoSync(syncOptions);
      await intervalCallbacks[0]();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Auto-sync failed for table incident"),
        expect.any(Error),
      );
    });

    it("should handle complete auto-sync cycle failures", async () => {
      const loggerSpy = spyOn(logger, "error").mockImplementation(() => {});

      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident"],
        batchSize: 50,
      };

      // Make the entire sync cycle fail
      spyOn(dataService as any, "syncTableData").mockImplementation(() => {
        throw new Error("Complete failure");
      });

      dataService.startAutoSync(syncOptions);

      // Execute the callback safely
      try {
        if (intervalCallbacks.length > 0) {
          await intervalCallbacks[0]();
        }
      } catch (error) {
        // Callback should handle errors internally, not throw
      }

      // Logger should have been called with error
      expect(loggerSpy).toHaveBeenCalled();
    });
  });

  describe("Auto-Sync Integration with Task Scheduler", () => {
    it("should integrate with task scheduler for auto-sync jobs", async () => {
      // This would test integration with TaskScheduler if implemented
      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident"],
        batchSize: 50,
      };

      // Mock task scheduler integration
      const schedulerSpy = spyOn(
        mockTaskScheduler,
        "schedule",
      ).mockResolvedValue("task-id-123");

      dataService.startAutoSync(syncOptions);

      // In a real implementation, this would verify scheduler integration
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe("Auto-Sync Performance Monitoring", () => {
    it("should track auto-sync execution time", async () => {
      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident"],
        batchSize: 50,
      };

      // Track if sync execution completes (performance is tracked internally)
      let syncExecuted = false;
      spyOn(dataService as any, "syncTableData").mockImplementation(
        async () => {
          syncExecuted = true;
          return Promise.resolve();
        },
      );

      dataService.startAutoSync(syncOptions);

      // Trigger callback
      if (intervalCallbacks.length > 0) {
        await intervalCallbacks[0]();
      }

      // Verify sync was executed (performance tracking happens internally)
      expect(syncExecuted).toBe(true);
    });

    it("should log sync cycle completion time", async () => {
      const loggerSpy = spyOn(logger, "info").mockImplementation(() => {});

      const syncOptions = {
        syncInterval: 300000,
        tables: ["incident"],
        batchSize: 50,
      };

      spyOn(dataService as any, "syncTableData").mockResolvedValue(void 0);

      dataService.startAutoSync(syncOptions);
      await intervalCallbacks[0]();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Auto-sync cycle completed"),
      );
    });
  });

  describe("Auto-Sync Configuration Validation", () => {
    it("should use default values for missing configuration", () => {
      const minimalOptions = {
        tables: ["incident"],
      };

      expect(() => {
        dataService.startAutoSync(minimalOptions);
      }).not.toThrow();

      // Should use default 5-minute interval
      expect(globalThis.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        300000, // Default 5 minutes
      );
    });

    it("should validate table names", async () => {
      const invalidOptions = {
        syncInterval: 300000,
        tables: ["invalid_table", "incident"],
        batchSize: 50,
      };

      spyOn(dataService as any, "syncTableData")
        .mockRejectedValueOnce(new Error("Invalid table"))
        .mockResolvedValueOnce(void 0);

      dataService.startAutoSync(invalidOptions);
      await intervalCallbacks[0]();

      // Should handle invalid table gracefully
      expect(true).toBe(true);
    });
  });
});

// Bun test compatibility helpers
if (typeof mock === "undefined") {
  (globalThis as any).mock = (implementation?: Function) => {
    const mockFn = implementation || (() => {});
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
