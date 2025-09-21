/**
 * GlideRecord Tests - Comprehensive test suite for advanced GlideRecord functionality
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { GlideRecord } from "../../core/GlideRecord";
import type { ServiceNowRecord, QueryOptions } from "../../types/servicenow";
import { Logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";
import { Cache } from "../../utils/Cache";

// Mock ServiceNowClient
class MockServiceNowClient {
  private tables: Map<string, ServiceNowRecord[]> = new Map();

  constructor() {
    // Initialize mock data
    this.tables.set("incident", [
      {
        sys_id: "1",
        number: "INC0000001",
        state: "1",
        priority: "3",
        short_description: "Test incident 1",
        assigned_to: "user1",
        category: "software",
        sys_created_on: "2025-01-01 10:00:00",
      },
      {
        sys_id: "2",
        number: "INC0000002",
        state: "2",
        priority: "2",
        short_description: "Test incident 2",
        assigned_to: "user2",
        category: "hardware",
        sys_created_on: "2025-01-02 11:00:00",
      },
      {
        sys_id: "3",
        number: "INC0000003",
        state: "3",
        priority: "1",
        short_description: "Test incident 3",
        assigned_to: "user1",
        category: "software",
        sys_created_on: "2025-01-03 12:00:00",
      },
      {
        sys_id: "4",
        number: "INC0000004",
        state: "6",
        priority: "4",
        short_description: "Test incident 4",
        assigned_to: "user3",
        category: "network",
        sys_created_on: "2025-01-04 13:00:00",
      },
      {
        sys_id: "5",
        number: "INC0000005",
        state: "7",
        priority: "2",
        short_description: "Test incident 5",
        assigned_to: "user2",
        category: "software",
        sys_created_on: "2025-01-05 14:00:00",
      },
    ]);

    this.tables.set("problem", [
      {
        sys_id: "p1",
        number: "PRB0000001",
        state: "1",
        priority: "2",
        short_description: "Test problem 1",
        assigned_to: "user1",
      },
      {
        sys_id: "p2",
        number: "PRB0000002",
        state: "2",
        priority: "1",
        short_description: "Test problem 2",
        assigned_to: "user2",
      },
    ]);
  }

  async query(options: QueryOptions): Promise<ServiceNowRecord[]> {
    const records = this.tables.get(options.table) || [];
    let filteredRecords = [...records];

    // Apply query filters
    if (options.query) {
      filteredRecords = this.applyQuery(filteredRecords, options.query);
    }

    // Apply ordering
    if (options.orderBy) {
      filteredRecords = this.applyOrdering(filteredRecords, options.orderBy);
    }

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || filteredRecords.length;

    return filteredRecords.slice(offset, offset + limit);
  }

  async create(
    table: string,
    data: ServiceNowRecord,
  ): Promise<ServiceNowRecord> {
    const records = this.tables.get(table) || [];
    const newRecord = {
      ...data,
      sys_id: `new_${Date.now()}`,
      sys_created_on: new Date().toISOString(),
    };
    records.push(newRecord);
    this.tables.set(table, records);
    return newRecord;
  }

  async update(
    table: string,
    sysId: string,
    data: ServiceNowRecord,
  ): Promise<ServiceNowRecord> {
    const records = this.tables.get(table) || [];
    const index = records.findIndex((r) => r.sys_id === sysId);
    if (index >= 0) {
      records[index] = {
        ...records[index],
        ...data,
        sys_updated_on: new Date().toISOString(),
      };
      return records[index];
    }
    throw new Error(`Record ${sysId} not found`);
  }

  async delete(table: string, sysId: string): Promise<boolean> {
    const records = this.tables.get(table) || [];
    const index = records.findIndex((r) => r.sys_id === sysId);
    if (index >= 0) {
      records.splice(index, 1);
      return true;
    }
    return false;
  }

  async getById(
    table: string,
    sysId: string,
  ): Promise<ServiceNowRecord | null> {
    const records = this.tables.get(table) || [];
    return records.find((r) => r.sys_id === sysId) || null;
  }

  private applyQuery(
    records: ServiceNowRecord[],
    query: string,
  ): ServiceNowRecord[] {
    // Simple query parsing for tests
    const conditions = query.split("^");

    return records.filter((record) => {
      return conditions.every((condition) => {
        if (condition.includes("=")) {
          const [field, value] = condition.split("=");
          return record[field] === value;
        }
        if (condition.includes("CONTAINS")) {
          const [field, value] = condition.split("CONTAINS");
          return record[field]?.toString().includes(value);
        }
        if (condition.includes("STARTSWITH")) {
          const [field, value] = condition.split("STARTSWITH");
          return record[field]?.toString().startsWith(value);
        }
        return true;
      });
    });
  }

  private applyOrdering(
    records: ServiceNowRecord[],
    orderBy: string,
  ): ServiceNowRecord[] {
    const [field, direction = "ASC"] = orderBy.split(" ");

    return records.sort((a, b) => {
      const aValue = a[field];
      const bValue = b[field];

      if (aValue < bValue) return direction === "ASC" ? -1 : 1;
      if (aValue > bValue) return direction === "ASC" ? 1 : -1;
      return 0;
    });
  }
}

describe("GlideRecord Advanced Functionality", () => {
  let glideRecord: GlideRecord;
  let mockClient: MockServiceNowClient;
  let consoleSpy: any;

  beforeEach(() => {
    mockClient = new MockServiceNowClient();
    glideRecord = new GlideRecord(mockClient as any, "incident");

    // Mock console methods
    consoleSpy = mock(() => {});
    console.log = consoleSpy;
    console.error = consoleSpy;
    console.warn = consoleSpy;

    // Clear metrics
    performanceMonitor.clearMetrics();
  });

  afterEach(() => {
    glideRecord.destroy();
  });

  describe("Basic Query Operations", () => {
    test("should query records with simple conditions", async () => {
      glideRecord.addQuery("state", "1");

      const records = await glideRecord.query();

      expect(records).toHaveLength(1);
      expect(records[0].sys_id).toBe("1");
      expect(records[0].state).toBe("1");
    });

    test("should query records with multiple conditions", async () => {
      glideRecord.addQuery("state", "1");
      glideRecord.addQuery("priority", "3");

      const records = await glideRecord.query();

      expect(records).toHaveLength(1);
      expect(records[0].sys_id).toBe("1");
    });

    test("should query records with OR conditions", async () => {
      glideRecord.addQuery("state", "1");
      glideRecord.addOrCondition("state", "2");

      const records = await glideRecord.query();

      expect(records).toHaveLength(2);
      expect(records.map((r) => r.sys_id)).toEqual(["1", "2"]);
    });

    test("should query records with complex query operators", async () => {
      glideRecord.addQuery("priority", "IN", "1,2,3");

      const records = await glideRecord.query();

      expect(records.length).toBeGreaterThan(0);
      expect(records.every((r) => ["1", "2", "3"].includes(r.priority))).toBe(
        true,
      );
    });

    test("should query records with CONTAINS operator", async () => {
      glideRecord.addQuery("short_description", "CONTAINS", "Test");

      const records = await glideRecord.query();

      expect(records.length).toBeGreaterThan(0);
      expect(records.every((r) => r.short_description.includes("Test"))).toBe(
        true,
      );
    });

    test("should query records with STARTSWITH operator", async () => {
      glideRecord.addQuery("number", "STARTSWITH", "INC");

      const records = await glideRecord.query();

      expect(records.length).toBeGreaterThan(0);
      expect(records.every((r) => r.number.startsWith("INC"))).toBe(true);
    });
  });

  describe("Advanced Query Features", () => {
    test("should support dynamic query building", async () => {
      const conditions = [
        { field: "state", operator: "=", value: "1" },
        { field: "priority", operator: "IN", value: "1,2,3" },
      ];

      conditions.forEach((condition) => {
        glideRecord.addQuery(
          condition.field,
          condition.operator,
          condition.value,
        );
      });

      const records = await glideRecord.query();

      expect(records).toHaveLength(1);
      expect(records[0].state).toBe("1");
    });

    test("should support query templates", async () => {
      const template = glideRecord.createQueryTemplate("active_incidents", {
        state: "IN",
        assigned_to: "=",
      });

      const activeIncidents = await glideRecord.executeTemplate(template, {
        state: "1,2,3",
        assigned_to: "user1",
      });

      expect(activeIncidents).toHaveLength(1);
      expect(activeIncidents[0].assigned_to).toBe("user1");
    });

    test("should support saved queries", async () => {
      glideRecord.addQuery("state", "!=", "6");
      glideRecord.addQuery("state", "!=", "7");

      const queryName = "open_incidents";
      glideRecord.saveQuery(queryName);

      // Create new instance and load saved query
      const newGlideRecord = new GlideRecord(mockClient as any, "incident");
      newGlideRecord.loadQuery(queryName);

      const records = await newGlideRecord.query();

      expect(records.length).toBeGreaterThan(0);
      expect(records.every((r) => r.state !== "6" && r.state !== "7")).toBe(
        true,
      );

      newGlideRecord.destroy();
    });

    test("should support query caching", async () => {
      const cachingGlideRecord = new GlideRecord(
        mockClient as any,
        "incident",
        {
          enableCaching: true,
          cacheTimeout: 5000,
        },
      );

      cachingGlideRecord.addQuery("state", "1");

      // First query - should cache
      const records1 = await cachingGlideRecord.query();

      // Second query - should use cache
      const records2 = await cachingGlideRecord.query();

      expect(records1).toEqual(records2);

      cachingGlideRecord.destroy();
    });
  });

  describe("Ordering and Pagination", () => {
    test("should order records ascending", async () => {
      glideRecord.orderBy("priority");

      const records = await glideRecord.query();

      expect(records).toHaveLength(5);
      expect(records[0].priority).toBe("1");
      expect(records[records.length - 1].priority).toBe("4");
    });

    test("should order records descending", async () => {
      glideRecord.orderByDesc("priority");

      const records = await glideRecord.query();

      expect(records).toHaveLength(5);
      expect(records[0].priority).toBe("4");
      expect(records[records.length - 1].priority).toBe("1");
    });

    test("should support multiple order fields", async () => {
      glideRecord.orderBy("category");
      glideRecord.orderBy("priority");

      const records = await glideRecord.query();

      expect(records).toHaveLength(5);

      // Check that records are ordered by category, then by priority
      for (let i = 1; i < records.length; i++) {
        const prev = records[i - 1];
        const curr = records[i];

        if (prev.category === curr.category) {
          expect(prev.priority <= curr.priority).toBe(true);
        }
      }
    });

    test("should support pagination", async () => {
      glideRecord.setLimit(2);
      glideRecord.setOffset(1);

      const records = await glideRecord.query();

      expect(records).toHaveLength(2);
      expect(records[0].sys_id).toBe("2");
      expect(records[1].sys_id).toBe("3");
    });

    test("should support auto-pagination", async () => {
      const autoPaginationGR = new GlideRecord(mockClient as any, "incident", {
        enableAutoPagination: true,
        pageSize: 2,
      });

      const allRecords: ServiceNowRecord[] = [];

      await autoPaginationGR.queryStream(async (record) => {
        allRecords.push(record);
      });

      expect(allRecords).toHaveLength(5);
      expect(allRecords.map((r) => r.sys_id)).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
      ]);

      autoPaginationGR.destroy();
    });
  });

  describe("Record Manipulation", () => {
    test("should create new record", async () => {
      glideRecord.initialize();
      glideRecord.setValue("short_description", "New incident");
      glideRecord.setValue("priority", "2");
      glideRecord.setValue("state", "1");

      const newRecord = await glideRecord.insert();

      expect(newRecord).toBeTruthy();
      expect(newRecord.short_description).toBe("New incident");
      expect(newRecord.priority).toBe("2");
      expect(newRecord.sys_id).toBeTruthy();
    });

    test("should update existing record", async () => {
      glideRecord.get("1");
      glideRecord.setValue("priority", "1");
      glideRecord.setValue("state", "2");

      const updatedRecord = await glideRecord.update();

      expect(updatedRecord).toBeTruthy();
      expect(updatedRecord.priority).toBe("1");
      expect(updatedRecord.state).toBe("2");
      expect(updatedRecord.sys_updated_on).toBeTruthy();
    });

    test("should delete record", async () => {
      glideRecord.get("1");

      const deleted = await glideRecord.deleteRecord();

      expect(deleted).toBe(true);
    });

    test("should handle bulk operations", async () => {
      const records = [
        { short_description: "Bulk record 1", priority: "3", state: "1" },
        { short_description: "Bulk record 2", priority: "2", state: "1" },
        { short_description: "Bulk record 3", priority: "1", state: "1" },
      ];

      const results = await glideRecord.bulkInsert(records);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    test("should handle bulk updates", async () => {
      const updates = [
        { sys_id: "1", priority: "1" },
        { sys_id: "2", priority: "1" },
        { sys_id: "3", state: "6" },
      ];

      const results = await glideRecord.bulkUpdate(updates);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    test("should handle bulk deletes", async () => {
      const sysIds = ["1", "2"];

      const results = await glideRecord.bulkDelete(sysIds);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe("Field Operations", () => {
    test("should get field values", async () => {
      const record = await glideRecord.get("1");

      expect(glideRecord.getValue("short_description")).toBe("Test incident 1");
      expect(glideRecord.getValue("priority")).toBe("3");
      expect(glideRecord.getValue("state")).toBe("1");
    });

    test("should set field values", () => {
      glideRecord.initialize();
      glideRecord.setValue("short_description", "Updated description");
      glideRecord.setValue("priority", "1");

      expect(glideRecord.getValue("short_description")).toBe(
        "Updated description",
      );
      expect(glideRecord.getValue("priority")).toBe("1");
    });

    test("should handle field display values", async () => {
      await glideRecord.get("1");

      const displayValue = glideRecord.getDisplayValue("priority");
      const choiceList = glideRecord.getChoiceList("priority");

      expect(displayValue).toBeTruthy();
      expect(Array.isArray(choiceList)).toBe(true);
    });

    test("should validate field values", () => {
      glideRecord.initialize();

      const validations = [
        { field: "priority", value: "5", expected: false }, // Invalid priority
        { field: "priority", value: "1", expected: true }, // Valid priority
        { field: "state", value: "10", expected: false }, // Invalid state
        { field: "state", value: "1", expected: true }, // Valid state
      ];

      validations.forEach(({ field, value, expected }) => {
        glideRecord.setValue(field, value);
        expect(glideRecord.isValid()).toBe(expected);
      });
    });

    test("should handle field changes tracking", async () => {
      await glideRecord.get("1");

      const originalValue = glideRecord.getValue("priority");
      glideRecord.setValue("priority", "1");

      expect(glideRecord.isFieldChanged("priority")).toBe(true);
      expect(glideRecord.getOriginalValue("priority")).toBe(originalValue);
      expect(glideRecord.getChangedFields()).toContain("priority");
    });
  });

  describe("Aggregation and Statistics", () => {
    test("should perform aggregate queries", async () => {
      const stats = await glideRecord.aggregate([
        { field: "priority", operation: "COUNT" },
        { field: "priority", operation: "AVG" },
      ]);

      expect(stats).toBeTruthy();
      expect(stats.count).toBe(5);
      expect(stats.avg).toBeGreaterThan(0);
    });

    test("should group by field", async () => {
      const groups = await glideRecord.groupBy("assigned_to", [
        { field: "sys_id", operation: "COUNT" },
      ]);

      expect(Object.keys(groups)).toContain("user1");
      expect(Object.keys(groups)).toContain("user2");
      expect(groups.user1.count).toBe(2); // user1 has 2 incidents
    });

    test("should calculate field statistics", async () => {
      const stats = await glideRecord.getFieldStats("priority");

      expect(stats.min).toBe("1");
      expect(stats.max).toBe("4");
      expect(stats.count).toBe(5);
      expect(stats.distinct).toBeGreaterThan(0);
    });
  });

  describe("Performance Features", () => {
    test("should track query performance", async () => {
      const performanceGR = new GlideRecord(mockClient as any, "incident", {
        enablePerformanceMonitoring: true,
      });

      performanceGR.addQuery("state", "1");
      await performanceGR.query();

      const metrics = performanceMonitor.getRealTimeMetrics();
      expect(metrics.length).toBeGreaterThan(0);

      performanceGR.destroy();
    });

    test("should optimize queries automatically", async () => {
      const optimizedGR = new GlideRecord(mockClient as any, "incident", {
        enableQueryOptimization: true,
      });

      optimizedGR.addQuery("state", "1");
      optimizedGR.addQuery("priority", "3");
      optimizedGR.orderBy("sys_created_on");

      const records = await optimizedGR.query();

      expect(records).toHaveLength(1);

      optimizedGR.destroy();
    });

    test("should use connection pooling", async () => {
      const pooledGR = new GlideRecord(mockClient as any, "incident", {
        enableConnectionPooling: true,
        maxPoolSize: 5,
      });

      // Simulate multiple concurrent queries
      const promises = Array.from({ length: 10 }, () => {
        const gr = new GlideRecord(mockClient as any, "incident", {
          enableConnectionPooling: true,
        });
        gr.addQuery("state", "IN", "1,2,3");
        return gr.query();
      });

      const results = await Promise.all(promises);

      expect(results.every((r) => Array.isArray(r))).toBe(true);

      pooledGR.destroy();
    });
  });

  describe("Advanced Features", () => {
    test("should support field-level security", async () => {
      const secureGR = new GlideRecord(mockClient as any, "incident", {
        enforceFieldSecurity: true,
        allowedFields: ["sys_id", "short_description", "state"],
      });

      await secureGR.get("1");

      expect(secureGR.getValue("short_description")).toBeTruthy();
      expect(secureGR.getValue("priority")).toBeUndefined(); // Restricted field

      secureGR.destroy();
    });

    test("should support record versioning", async () => {
      const versionedGR = new GlideRecord(mockClient as any, "incident", {
        enableVersioning: true,
      });

      await versionedGR.get("1");

      const originalValue = versionedGR.getValue("priority");
      versionedGR.setValue("priority", "1");
      await versionedGR.update();

      const versions = versionedGR.getVersionHistory();
      expect(versions).toHaveLength(1);
      expect(versions[0].field).toBe("priority");
      expect(versions[0].oldValue).toBe(originalValue);
      expect(versions[0].newValue).toBe("1");

      versionedGR.destroy();
    });

    test("should support audit logging", async () => {
      const auditGR = new GlideRecord(mockClient as any, "incident", {
        enableAuditLogging: true,
      });

      auditGR.initialize();
      auditGR.setValue("short_description", "Audit test");
      await auditGR.insert();

      const auditLogs = auditGR.getAuditLogs();
      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].operation).toBe("INSERT");

      auditGR.destroy();
    });

    test("should support workflow triggers", async () => {
      let workflowTriggered = false;

      const workflowGR = new GlideRecord(mockClient as any, "incident", {
        enableWorkflows: true,
      });

      workflowGR.onBeforeInsert(() => {
        workflowTriggered = true;
      });

      workflowGR.initialize();
      workflowGR.setValue("short_description", "Workflow test");
      await workflowGR.insert();

      expect(workflowTriggered).toBe(true);

      workflowGR.destroy();
    });
  });

  describe("Error Handling and Validation", () => {
    test("should handle query errors gracefully", async () => {
      const errorClient = {
        ...mockClient,
        query: mock(() => Promise.reject(new Error("Database error"))),
      };

      const errorGR = new GlideRecord(errorClient as any, "incident");

      await expect(errorGR.query()).rejects.toThrow("Database error");

      errorGR.destroy();
    });

    test("should validate record before insert", async () => {
      glideRecord.initialize();
      // Don't set required fields

      await expect(glideRecord.insert()).rejects.toThrow();
    });

    test("should handle concurrent modifications", async () => {
      const record1 = new GlideRecord(mockClient as any, "incident");
      const record2 = new GlideRecord(mockClient as any, "incident");

      await record1.get("1");
      await record2.get("1");

      record1.setValue("priority", "1");
      record2.setValue("priority", "2");

      await record1.update();

      // Second update should handle conflict
      await expect(record2.update()).rejects.toThrow();

      record1.destroy();
      record2.destroy();
    });
  });

  describe("Memory Management and Cleanup", () => {
    test("should manage memory efficiently", async () => {
      const memoryGR = new GlideRecord(mockClient as any, "incident", {
        enableMemoryOptimization: true,
        maxRecordsInMemory: 100,
      });

      // Query large dataset
      const records = await memoryGR.query();

      const memoryUsage = process.memoryUsage();
      expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB

      memoryGR.destroy();
    });

    test("should cleanup resources properly", () => {
      const resourceGR = new GlideRecord(mockClient as any, "incident");

      expect(() => {
        resourceGR.destroy();
      }).not.toThrow();
    });

    test("should handle multiple destroy calls", () => {
      const multipleGR = new GlideRecord(mockClient as any, "incident");

      expect(() => {
        multipleGR.destroy();
        multipleGR.destroy();
        multipleGR.destroy();
      }).not.toThrow();
    });
  });

  describe("Cross-Table Operations", () => {
    test("should support table switching", async () => {
      // Start with incident table
      glideRecord.addQuery("state", "1");
      const incidents = await glideRecord.query();

      // Switch to problem table
      glideRecord.setTable("problem");
      glideRecord.addQuery("state", "1");
      const problems = await glideRecord.query();

      expect(incidents[0].number).toStartWith("INC");
      expect(problems[0].number).toStartWith("PRB");
    });

    test("should support joins across tables", async () => {
      const joinGR = new GlideRecord(mockClient as any, "incident");

      const joinedResults = await joinGR.join(
        "problem",
        "assigned_to",
        "assigned_to",
      );

      expect(Array.isArray(joinedResults)).toBe(true);
      expect(joinedResults.length).toBeGreaterThan(0);

      joinGR.destroy();
    });

    test("should support related record queries", async () => {
      await glideRecord.get("1");

      const relatedProblems = await glideRecord.getRelatedRecords(
        "problem",
        "assigned_to",
      );

      expect(Array.isArray(relatedProblems)).toBe(true);
    });
  });
});
