/**
 * Comprehensive Tests for Parquet Integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ParquetWriter, ParquetWriteStats } from "../parquet/ParquetWriter";
import { ParquetReader } from "../parquet/ParquetReader";
import { ServiceNowParquetIntegration } from "../parquet/index";
import * as fs from "fs/promises";
import * as path from "path";

// Test data setup
const testDataPath = "/tmp/test_parquet_data";
const sampleIncidentData = [
  {
    sys_id: "inc001",
    number: "INC0000001",
    short_description: "Test incident 1",
    description: "This is a test incident for Parquet testing",
    priority: "3",
    state: "1",
    sys_created_on: "2025-01-01T10:00:00Z",
    sys_updated_on: "2025-01-01T12:00:00Z",
    caller_id: "user001",
    assignment_group: "IT Support",
  },
  {
    sys_id: "inc002",
    number: "INC0000002",
    short_description: "Test incident 2",
    description: "Another test incident with different priority",
    priority: "1",
    state: "2",
    sys_created_on: "2025-01-02T10:00:00Z",
    sys_updated_on: "2025-01-02T11:30:00Z",
    caller_id: "user002",
    assignment_group: "Network Team",
  },
  {
    sys_id: "inc003",
    number: "INC0000003",
    short_description: "Test incident 3",
    description: "Critical incident requiring immediate attention",
    priority: "1",
    state: "3",
    sys_created_on: "2025-01-03T08:00:00Z",
    sys_updated_on: "2025-01-03T09:15:00Z",
    caller_id: "user003",
    assignment_group: "Database Team",
  },
];

describe("ParquetWriter", () => {
  let writer: ParquetWriter;
  let testOutputPath: string;

  beforeEach(async () => {
    writer = new ParquetWriter({
      compressionType: "snappy",
      enablePartitioning: true,
      partitionBy: ["priority"],
      validateSchema: true,
      bufferSize: 1000,
      enableStatistics: true,
      optimizeForAnalytics: true,
    });

    testOutputPath = path.join(testDataPath, `test_${Date.now()}.parquet`);

    // Ensure test directory exists
    await fs.mkdir(testDataPath, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await fs.rm(testDataPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should write ServiceNow records to Parquet format", async () => {
    const stats = await writer.writeRecords(
      sampleIncidentData,
      testOutputPath,
      "incident",
    );

    expect(stats.success).toBe(true);
    expect(stats.recordsWritten).toBe(3);
    expect(stats.compressionRatio).toBeGreaterThan(0);
    expect(stats.fileSizeBytes).toBeGreaterThan(0);
    expect(stats.partitionsCreated).toBeGreaterThan(0);

    // Verify file exists
    const fileExists = await fs
      .access(testOutputPath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);
  });

  it("should handle schema validation correctly", async () => {
    const invalidData = [
      {
        sys_id: "invalid",
        // Missing required fields
        priority: "invalid_priority",
      },
    ];

    const stats = await writer.writeRecords(
      invalidData,
      testOutputPath,
      "incident",
    );

    expect(stats.success).toBe(false);
    expect(stats.validationErrors.length).toBeGreaterThan(0);
  });

  it("should support different compression types", async () => {
    const compressionTypes = ["snappy", "gzip", "lz4"] as const;
    const results: Array<{ type: string; stats: ParquetWriteStats }> = [];

    for (const compressionType of compressionTypes) {
      const testWriter = new ParquetWriter({
        compressionType,
        enableStatistics: true,
      });

      const outputPath = path.join(
        testDataPath,
        `compression_${compressionType}.parquet`,
      );
      const stats = await testWriter.writeRecords(
        sampleIncidentData,
        outputPath,
        "incident",
      );

      results.push({ type: compressionType, stats });
      expect(stats.success).toBe(true);
    }

    // Verify different compression ratios
    expect(results.length).toBe(3);
    results.forEach((result) => {
      expect(result.stats.compressionRatio).toBeGreaterThan(0);
    });
  });

  it("should handle large datasets efficiently", async () => {
    const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
      ...sampleIncidentData[0],
      sys_id: `inc_large_${i}`,
      number: `INC${String(i).padStart(7, "0")}`,
      short_description: `Large dataset test incident ${i}`,
      sys_created_on: new Date(Date.now() - i * 1000).toISOString(),
    }));

    const startTime = Date.now();
    const stats = await writer.writeRecords(
      largeDataset,
      testOutputPath,
      "incident",
    );
    const processingTime = Date.now() - startTime;

    expect(stats.success).toBe(true);
    expect(stats.recordsWritten).toBe(10000);
    expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
    expect(stats.performanceMetrics.avgRecordsPerSecond).toBeGreaterThan(100);
  });

  it("should create partitions correctly", async () => {
    const partitionedWriter = new ParquetWriter({
      enablePartitioning: true,
      partitionBy: ["priority", "assignment_group"],
      compressionType: "snappy",
    });

    const stats = await partitionedWriter.writeRecords(
      sampleIncidentData,
      testOutputPath,
      "incident",
    );

    expect(stats.success).toBe(true);
    expect(stats.partitionsCreated).toBeGreaterThan(1);
    expect(stats.partitionInfo.length).toBeGreaterThan(0);

    // Verify partition structure
    for (const partition of stats.partitionInfo) {
      expect(partition.path).toContain("priority=");
      expect(partition.recordCount).toBeGreaterThan(0);
    }
  });
});

describe("ParquetReader", () => {
  let writer: ParquetWriter;
  let reader: ParquetReader;
  let testFilePath: string;

  beforeEach(async () => {
    writer = new ParquetWriter({
      compressionType: "snappy",
      enableStatistics: true,
    });

    reader = new ParquetReader({
      enableCache: true,
      maxCacheSize: 100,
      enablePredicate: true,
    });

    testFilePath = path.join(testDataPath, `reader_test_${Date.now()}.parquet`);

    await fs.mkdir(testDataPath, { recursive: true });

    // Write test data first
    await writer.writeRecords(sampleIncidentData, testFilePath, "incident");
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should read all records from Parquet file", async () => {
    const result = await reader.readRecords(testFilePath);

    expect(result.success).toBe(true);
    expect(result.records.length).toBe(3);
    expect(result.totalRecords).toBe(3);

    // Verify data integrity
    const firstRecord = result.records[0];
    expect(firstRecord.sys_id).toBe("inc001");
    expect(firstRecord.short_description).toBe("Test incident 1");
  });

  it("should support filtering with predicates", async () => {
    const result = await reader.readRecordsWithFilter(testFilePath, {
      filters: [{ column: "priority", operator: "equals", value: "1" }],
    });

    expect(result.success).toBe(true);
    expect(result.records.length).toBe(2); // Two critical incidents

    result.records.forEach((record) => {
      expect(record.priority).toBe("1");
    });
  });

  it("should support column selection", async () => {
    const result = await reader.readRecordsWithProjection(testFilePath, {
      columns: ["sys_id", "number", "priority"],
      limit: 10,
    });

    expect(result.success).toBe(true);
    expect(result.records.length).toBe(3);

    // Verify only selected columns are present
    result.records.forEach((record) => {
      expect(record.sys_id).toBeDefined();
      expect(record.number).toBeDefined();
      expect(record.priority).toBeDefined();
      expect(record.description).toBeUndefined();
      expect(record.short_description).toBeUndefined();
    });
  });

  it("should perform aggregations correctly", async () => {
    const result = await reader.aggregate(testFilePath, {
      groupBy: ["priority"],
      aggregations: [
        { column: "sys_id", function: "count", alias: "incident_count" },
        {
          column: "priority",
          function: "distinct_count",
          alias: "unique_priorities",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);

    // Verify aggregation structure
    const firstGroup = result.results[0];
    expect(firstGroup.priority).toBeDefined();
    expect(firstGroup.incident_count).toBeGreaterThan(0);
  });

  it("should handle streaming reads for large files", async () => {
    const streamResult = await reader.readRecordsStream(testFilePath, {
      batchSize: 2,
      enableStreaming: true,
    });

    expect(streamResult.success).toBe(true);

    let totalRecords = 0;
    const batches: any[][] = [];

    for (const batch of streamResult.recordStream!) {
      batches.push(batch);
      totalRecords += batch.length;
    }

    expect(totalRecords).toBe(3);
    expect(batches.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ServiceNowParquetIntegration", () => {
  let integration: ServiceNowParquetIntegration;
  let mockGlideRecord: any;

  beforeEach(async () => {
    integration = new ServiceNowParquetIntegration({
      outputPath: testDataPath,
      compressionType: "snappy",
      enablePartitioning: true,
      batchSize: 1000,
      enableMonitoring: true,
    });

    // Mock GlideRecord
    mockGlideRecord = {
      query: jest.fn(),
      next: jest
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false),
      getValue: jest.fn((field: string) => {
        const recordIndex = mockGlideRecord.next.mock.calls.length - 1;
        return sampleIncidentData[recordIndex]?.[
          field as keyof (typeof sampleIncidentData)[0]
        ];
      }),
      getRowCount: jest.fn().mockReturnValue(3),
      addQuery: jest.fn(),
      orderBy: jest.fn(),
      setLimit: jest.fn(),
    };

    await fs.mkdir(testDataPath, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should export ServiceNow table to Parquet successfully", async () => {
    const result = await integration.exportTableToParquet(
      "incident",
      mockGlideRecord,
      { compressionType: "snappy" },
    );

    expect(result.success).toBe(true);
    expect(result.recordsExported).toBe(3);
    expect(result.outputPath).toContain("incident");
    expect(result.compressionRatio).toBeGreaterThan(0);

    // Verify mock calls
    expect(mockGlideRecord.query).toHaveBeenCalled();
    expect(mockGlideRecord.next).toHaveBeenCalledTimes(4); // 3 records + final false
  });

  it("should handle incremental exports correctly", async () => {
    const lastExportTime = new Date("2025-01-01T00:00:00Z");

    const result = await integration.exportTableIncremental(
      "incident",
      mockGlideRecord,
      lastExportTime,
      { compressionType: "gzip" },
    );

    expect(result.success).toBe(true);
    expect(result.isIncremental).toBe(true);
    expect(result.lastExportTime).toBeInstanceOf(Date);

    // Verify incremental query was applied
    expect(mockGlideRecord.addQuery).toHaveBeenCalledWith(
      "sys_updated_on",
      ">",
      expect.any(String),
    );
  });

  it("should perform analytics queries on Parquet data", async () => {
    // First export data
    await integration.exportTableToParquet("incident", mockGlideRecord);

    // Then query analytics
    const analyticsResult = await integration.queryIncidentAnalytics({
      dateRange: {
        from: new Date("2025-01-01"),
        to: new Date("2025-01-31"),
      },
      groupBy: ["priority", "assignment_group"],
      includeTimeSeriesAnalysis: true,
    });

    expect(analyticsResult.success).toBe(true);
    expect(analyticsResult.summaryStats).toBeDefined();
    expect(analyticsResult.groupedResults.length).toBeGreaterThan(0);
    expect(analyticsResult.timeSeriesData).toBeDefined();
  });

  it("should handle concurrent exports safely", async () => {
    const concurrentExports = Promise.all([
      integration.exportTableToParquet("incident", mockGlideRecord, {
        outputPath: path.join(testDataPath, "concurrent1"),
      }),
      integration.exportTableToParquet("incident", mockGlideRecord, {
        outputPath: path.join(testDataPath, "concurrent2"),
      }),
      integration.exportTableToParquet("incident", mockGlideRecord, {
        outputPath: path.join(testDataPath, "concurrent3"),
      }),
    ]);

    const results = await concurrentExports;

    results.forEach((result, index) => {
      expect(result.success).toBe(true);
      expect(result.outputPath).toContain(`concurrent${index + 1}`);
    });
  });

  it("should monitor performance metrics during export", async () => {
    const result = await integration.exportTableToParquet(
      "incident",
      mockGlideRecord,
      { enablePerformanceMonitoring: true },
    );

    expect(result.success).toBe(true);
    expect(result.performanceMetrics).toBeDefined();
    expect(result.performanceMetrics.totalDurationMs).toBeGreaterThan(0);
    expect(result.performanceMetrics.avgRecordsPerSecond).toBeGreaterThan(0);
    expect(result.performanceMetrics.peakMemoryUsageMB).toBeGreaterThan(0);
  });

  it("should validate data integrity during export", async () => {
    const result = await integration.exportTableToParquet(
      "incident",
      mockGlideRecord,
      {
        enableDataValidation: true,
        validationRules: {
          requiredFields: ["sys_id", "number"],
          dataTypeValidation: true,
          businessRuleValidation: true,
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.dataValidation).toBeDefined();
    expect(result.dataValidation.recordsValidated).toBe(3);
    expect(result.dataValidation.validationErrors.length).toBe(0);
  });
});

describe("Parquet Performance Tests", () => {
  let writer: ParquetWriter;
  let reader: ParquetReader;

  beforeEach(async () => {
    writer = new ParquetWriter({
      compressionType: "snappy",
      enableStatistics: true,
      optimizeForAnalytics: true,
      bufferSize: 10000,
    });

    reader = new ParquetReader({
      enableCache: true,
      maxCacheSize: 1000,
      enablePredicate: true,
    });

    await fs.mkdir(testDataPath, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should handle very large datasets efficiently", async () => {
    const largeDataset = Array.from({ length: 100000 }, (_, i) => ({
      sys_id: `large_${i}`,
      number: `INC${String(i).padStart(7, "0")}`,
      short_description: `Performance test incident ${i}`,
      description: `This is a performance test record with index ${i} and some additional content to simulate real data size`,
      priority: String((i % 4) + 1),
      state: String((i % 6) + 1),
      sys_created_on: new Date(Date.now() - i * 1000).toISOString(),
      sys_updated_on: new Date(Date.now() - i * 500).toISOString(),
      caller_id: `user_${i % 1000}`,
      assignment_group: `team_${i % 50}`,
    }));

    const testFilePath = path.join(
      testDataPath,
      "large_performance_test.parquet",
    );

    // Write performance test
    const writeStartTime = Date.now();
    const writeStats = await writer.writeRecords(
      largeDataset,
      testFilePath,
      "incident",
    );
    const writeDuration = Date.now() - writeStartTime;

    expect(writeStats.success).toBe(true);
    expect(writeStats.recordsWritten).toBe(100000);
    expect(writeDuration).toBeLessThan(60000); // Should complete within 1 minute
    expect(writeStats.performanceMetrics.avgRecordsPerSecond).toBeGreaterThan(
      1000,
    );

    // Read performance test
    const readStartTime = Date.now();
    const readResult = await reader.readRecords(testFilePath);
    const readDuration = Date.now() - readStartTime;

    expect(readResult.success).toBe(true);
    expect(readResult.records.length).toBe(100000);
    expect(readDuration).toBeLessThan(30000); // Should read within 30 seconds

    // Memory usage should be reasonable
    const memoryUsage = process.memoryUsage();
    expect(memoryUsage.heapUsed / 1024 / 1024).toBeLessThan(1000); // Less than 1GB
  }, 120000); // 2 minute timeout for performance test

  it("should demonstrate compression effectiveness", async () => {
    const compressibleData = Array.from({ length: 10000 }, (_, i) => ({
      sys_id: `compress_${i}`,
      number: "INC0000001", // Repeated value for better compression
      short_description: "Repeated short description for compression testing",
      description:
        "This is a repeated description that should compress well due to its repetitive nature",
      priority: "3", // Repeated value
      state: "1", // Repeated value
      sys_created_on: "2025-01-01T10:00:00Z", // Repeated value
      sys_updated_on: "2025-01-01T10:00:00Z", // Repeated value
      caller_id: "repeated_user",
      assignment_group: "repeated_group",
    }));

    const testFilePath = path.join(testDataPath, "compression_test.parquet");
    const stats = await writer.writeRecords(
      compressibleData,
      testFilePath,
      "incident",
    );

    expect(stats.success).toBe(true);
    expect(stats.compressionRatio).toBeLessThan(0.3); // Should achieve at least 70% compression

    // Verify file size is reasonable
    const fileStats = await fs.stat(testFilePath);
    const fileSizeMB = fileStats.size / 1024 / 1024;
    expect(fileSizeMB).toBeLessThan(1); // Should be less than 1MB for this data
  });
});

// Mock jest functions for Bun compatibility
global.jest = {
  fn: (implementation?: Function) => {
    const mockFn = implementation
      ? (...args: any[]) => implementation(...args)
      : () => {};
    mockFn.mock = {
      calls: [] as any[][],
      results: [] as any[],
    };

    const originalFn = mockFn;
    const wrappedFn = (...args: any[]) => {
      wrappedFn.mock.calls.push(args);
      const result = originalFn(...args);
      wrappedFn.mock.results.push({ type: "return", value: result });
      return result;
    };

    Object.assign(wrappedFn, mockFn);
    wrappedFn.mockReturnValue = (value: any) => {
      wrappedFn.mock.results = [{ type: "return", value }];
      return wrappedFn;
    };

    wrappedFn.mockReturnValueOnce = (value: any) => {
      const currentImplementation = wrappedFn;
      let called = false;
      const newImplementation = (...args: any[]) => {
        if (!called) {
          called = true;
          return value;
        }
        return currentImplementation(...args);
      };
      Object.assign(newImplementation, wrappedFn);
      return newImplementation as any;
    };

    return wrappedFn;
  },
} as any;
