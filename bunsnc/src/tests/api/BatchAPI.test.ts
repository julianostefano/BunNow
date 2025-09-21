/**
 * BatchAPI Tests - Comprehensive test suite for batch operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { BatchAPI, BatchConfig } from "../../api/BatchAPI";
import type { ServiceNowRecord } from "../../types/servicenow";
import { Logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";

// Mock ServiceNowClient
class MockServiceNowClient {
  private records: Map<string, ServiceNowRecord[]> = new Map();

  constructor() {
    this.records.set("incident", [
      {
        sys_id: "1",
        state: "1",
        priority: "3",
        short_description: "Test incident 1",
      },
      {
        sys_id: "2",
        state: "2",
        priority: "2",
        short_description: "Test incident 2",
      },
      {
        sys_id: "3",
        state: "3",
        priority: "1",
        short_description: "Test incident 3",
      },
    ]);
  }

  async query(options: any): Promise<ServiceNowRecord[]> {
    const records = this.records.get(options.table) || [];
    return records.filter(
      (_, index) =>
        index >= (options.offset || 0) &&
        index < (options.offset || 0) + (options.limit || records.length),
    );
  }

  async create(
    table: string,
    data: ServiceNowRecord,
  ): Promise<ServiceNowRecord> {
    const newRecord = { ...data, sys_id: `new_${Date.now()}` };
    const records = this.records.get(table) || [];
    records.push(newRecord);
    this.records.set(table, records);
    return newRecord;
  }

  async update(
    table: string,
    sysId: string,
    data: ServiceNowRecord,
  ): Promise<ServiceNowRecord> {
    const records = this.records.get(table) || [];
    const index = records.findIndex((r) => r.sys_id === sysId);
    if (index >= 0) {
      records[index] = { ...records[index], ...data };
      return records[index];
    }
    throw new Error(`Record ${sysId} not found`);
  }

  async delete(table: string, sysId: string): Promise<boolean> {
    const records = this.records.get(table) || [];
    const index = records.findIndex((r) => r.sys_id === sysId);
    if (index >= 0) {
      records.splice(index, 1);
      return true;
    }
    return false;
  }
}

describe("BatchAPI", () => {
  let batchAPI: BatchAPI;
  let mockClient: MockServiceNowClient;
  let consoleSpy: any;

  beforeEach(() => {
    mockClient = new MockServiceNowClient();
    batchAPI = new BatchAPI(mockClient as any);

    // Mock console methods
    consoleSpy = mock(() => {});
    console.log = consoleSpy;
    console.error = consoleSpy;
    console.warn = consoleSpy;

    // Clear metrics
    performanceMonitor.clearMetrics();
  });

  afterEach(() => {
    batchAPI.destroy();
  });

  describe("Batch Configuration", () => {
    test("should create BatchAPI with default configuration", () => {
      const defaultBatch = new BatchAPI(mockClient as any);

      expect(defaultBatch).toBeTruthy();

      defaultBatch.destroy();
    });

    test("should create BatchAPI with custom configuration", () => {
      const config: BatchConfig = {
        batchSize: 50,
        concurrency: 2,
        retryAttempts: 5,
        retryDelay: 2000,
        failureThreshold: 0.2,
        enableLogging: false,
        enablePerformanceMonitoring: false,
        enableCaching: false,
      };

      const customBatch = new BatchAPI(mockClient as any, config);

      expect(customBatch).toBeTruthy();

      customBatch.destroy();
    });
  });

  describe("Batch Query Operations", () => {
    test("should execute batch query successfully", async () => {
      const queries = [
        { table: "incident", query: "state=1", limit: 10 },
        { table: "incident", query: "state=2", limit: 10 },
        { table: "incident", query: "state=3", limit: 10 },
      ];

      const results = await batchAPI.batchQuery(queries);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);

      expect(results[0].data).toBeTruthy();
      expect(Array.isArray(results[0].data)).toBe(true);
    });

    test("should handle partial failures in batch query", async () => {
      const queries = [
        { table: "incident", query: "state=1", limit: 10 },
        { table: "nonexistent", query: "state=2", limit: 10 },
        { table: "incident", query: "state=3", limit: 10 },
      ];

      const results = await batchAPI.batchQuery(queries);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);

      expect(results[1].error).toBeTruthy();
    });

    test("should respect batch size limits", async () => {
      const config: BatchConfig = { batchSize: 2 };
      const limitedBatch = new BatchAPI(mockClient as any, config);

      const queries = Array.from({ length: 5 }, (_, i) => ({
        table: "incident",
        query: `state=${i + 1}`,
        limit: 10,
      }));

      const results = await limitedBatch.batchQuery(queries);

      expect(results).toHaveLength(5);

      limitedBatch.destroy();
    });
  });

  describe("Batch Create Operations", () => {
    test("should execute batch create successfully", async () => {
      const records = [
        { short_description: "Batch created incident 1", priority: "3" },
        { short_description: "Batch created incident 2", priority: "2" },
        { short_description: "Batch created incident 3", priority: "1" },
      ];

      const results = await batchAPI.batchCreate("incident", records);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.data).toBeTruthy();
        expect(result.data.sys_id).toBeTruthy();
      });
    });

    test("should handle validation errors in batch create", async () => {
      const records = [
        { short_description: "Valid incident", priority: "3" },
        {},
        { short_description: "Another valid incident", priority: "2" },
      ];

      const results = await batchAPI.batchCreate("incident", records);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);

      expect(results[1].error).toBeTruthy();
    });
  });

  describe("Batch Update Operations", () => {
    test("should execute batch update successfully", async () => {
      const updates = [
        { sys_id: "1", state: "6", comments: "Updated via batch" },
        { sys_id: "2", state: "7", comments: "Updated via batch" },
        { sys_id: "3", state: "8", comments: "Updated via batch" },
      ];

      const results = await batchAPI.batchUpdate("incident", updates);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.data).toBeTruthy();
      });
    });

    test("should handle non-existent records in batch update", async () => {
      const updates = [
        { sys_id: "1", state: "6" },
        { sys_id: "nonexistent", state: "7" },
        { sys_id: "3", state: "8" },
      ];

      const results = await batchAPI.batchUpdate("incident", updates);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);

      expect(results[1].error).toBeTruthy();
    });
  });

  describe("Batch Delete Operations", () => {
    test("should execute batch delete successfully", async () => {
      const sysIds = ["1", "2"];

      const results = await batchAPI.batchDelete("incident", sysIds);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    test("should handle non-existent records in batch delete", async () => {
      const sysIds = ["1", "nonexistent", "3"];

      const results = await batchAPI.batchDelete("incident", sysIds);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);

      expect(results[1].error).toBeTruthy();
    });
  });

  describe("Error Handling and Retry Logic", () => {
    test("should retry failed operations", async () => {
      let attempts = 0;
      const failingMockClient = {
        query: mock(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error("Temporary failure");
          }
          return [];
        }),
      };

      const retryBatch = new BatchAPI(failingMockClient as any, {
        retryAttempts: 3,
        retryDelay: 100,
      });

      const queries = [{ table: "incident", query: "state=1", limit: 10 }];
      const results = await retryBatch.batchQuery(queries);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(attempts).toBe(3);

      retryBatch.destroy();
    });

    test("should respect retry limits", async () => {
      const alwaysFailingMockClient = {
        query: mock(async () => {
          throw new Error("Permanent failure");
        }),
      };

      const retryBatch = new BatchAPI(alwaysFailingMockClient as any, {
        retryAttempts: 2,
        retryDelay: 50,
      });

      const queries = [{ table: "incident", query: "state=1", limit: 10 }];
      const results = await retryBatch.batchQuery(queries);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeTruthy();

      retryBatch.destroy();
    });
  });

  describe("Performance Monitoring", () => {
    test("should track batch operation metrics", async () => {
      const monitoringBatch = new BatchAPI(mockClient as any, {
        enablePerformanceMonitoring: true,
      });

      const queries = [
        { table: "incident", query: "state=1", limit: 10 },
        { table: "incident", query: "state=2", limit: 10 },
      ];

      await monitoringBatch.batchQuery(queries);

      const metrics = performanceMonitor.getRealTimeMetrics();
      expect(metrics.length).toBeGreaterThan(0);

      monitoringBatch.destroy();
    });

    test("should generate performance reports", async () => {
      const reportingBatch = new BatchAPI(mockClient as any, {
        enablePerformanceMonitoring: true,
      });

      const records = Array.from({ length: 5 }, (_, i) => ({
        short_description: `Performance test ${i + 1}`,
        priority: "3",
      }));

      await reportingBatch.batchCreate("incident", records);

      const report = reportingBatch.getPerformanceReport();

      expect(report).toBeTruthy();
      expect(report.totalOperations).toBeGreaterThan(0);
      expect(report.averageResponseTime).toBeGreaterThan(0);

      reportingBatch.destroy();
    });
  });

  describe("Bulk Operations", () => {
    test("should handle large volume bulk operations", async () => {
      const bulkBatch = new BatchAPI(mockClient as any, {
        batchSize: 100,
        concurrency: 5,
      });

      const records = Array.from({ length: 200 }, (_, i) => ({
        short_description: `Bulk operation record ${i + 1}`,
        priority: `${(i % 4) + 1}`,
        state: `${(i % 7) + 1}`,
      }));

      const startTime = Date.now();
      const results = await bulkBatch.batchCreate("incident", records);
      const endTime = Date.now();

      expect(results).toHaveLength(200);
      expect(results.every((r) => r.success)).toBe(true);
      expect(endTime - startTime).toBeLessThan(30000);

      bulkBatch.destroy();
    });
  });

  describe("Memory Management", () => {
    test("should manage memory efficiently during operations", async () => {
      const memoryBatch = new BatchAPI(mockClient as any, {
        batchSize: 20,
      });

      const records = Array.from({ length: 100 }, (_, i) => ({
        short_description: `Memory test ${i + 1}`,
        priority: "3",
      }));

      const initialMemory = process.memoryUsage().heapUsed;

      await memoryBatch.batchCreate("incident", records);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      memoryBatch.destroy();
    });
  });

  describe("Cleanup and Resource Management", () => {
    test("should cleanup resources properly", () => {
      const resourceBatch = new BatchAPI(mockClient as any);

      expect(() => {
        resourceBatch.destroy();
      }).not.toThrow();
    });

    test("should handle multiple destroy calls gracefully", () => {
      const multipleBatch = new BatchAPI(mockClient as any);

      expect(() => {
        multipleBatch.destroy();
        multipleBatch.destroy();
        multipleBatch.destroy();
      }).not.toThrow();
    });
  });
});
