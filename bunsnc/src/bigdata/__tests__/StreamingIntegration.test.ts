/**
 * Comprehensive Tests for Streaming Data Processing with Elysia.js
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Elysia } from "elysia";
import {
  StreamProcessor,
  ServiceNowStreamProcessorFactory,
} from "../streaming/StreamProcessor";
import { ServiceNowStreamingPlatform } from "../streaming/index";
import { Readable, Writable, Transform } from "stream";

// Mock streaming data source
class MockServiceNowDataStream extends Readable {
  private recordCount = 0;
  private maxRecords: number;
  private recordType: string;

  constructor(maxRecords: number = 1000, recordType: string = "incident") {
    super({ objectMode: true });
    this.maxRecords = maxRecords;
    this.recordType = recordType;
  }

  _read() {
    if (this.recordCount >= this.maxRecords) {
      this.push(null); // End stream
      return;
    }

    const record = {
      sys_id: `${this.recordType}_${this.recordCount}`,
      number: `${this.recordType.toUpperCase()}${String(this.recordCount).padStart(7, "0")}`,
      short_description: `${this.recordType} ${this.recordCount}`,
      description: `Test ${this.recordType} record number ${this.recordCount}`,
      priority: String((this.recordCount % 4) + 1),
      state: String((this.recordCount % 6) + 1),
      category: ["Database", "Network", "Application", "Hardware"][
        this.recordCount % 4
      ],
      assignment_group: ["Team A", "Team B", "Team C"][this.recordCount % 3],
      sys_created_on: new Date(
        Date.now() - this.recordCount * 1000,
      ).toISOString(),
      sys_updated_on: new Date().toISOString(),
      timestamp: Date.now(),
    };

    this.recordCount++;
    this.push(record);
  }
}

// Mock destination stream
class MockDestinationStream extends Writable {
  public records: any[] = [];
  public writeErrors: any[] = [];

  constructor() {
    super({ objectMode: true });
  }

  _write(chunk: any, encoding: string, callback: Function) {
    try {
      // Simulate processing time
      setTimeout(() => {
        this.records.push(chunk);
        callback();
      }, Math.random() * 10); // 0-10ms processing time
    } catch (error: unknown) {
      this.writeErrors.push({ chunk, error });
      callback(error);
    }
  }

  getStats() {
    return {
      recordsWritten: this.records.length,
      errors: this.writeErrors.length,
      lastRecord: this.records[this.records.length - 1],
    };
  }
}

describe("StreamProcessor with Elysia Monitoring", () => {
  let processor: StreamProcessor;
  let app: Elysia;

  beforeEach(() => {
    processor = ServiceNowStreamProcessorFactory.createIncidentProcessor({
      name: "test_incident_processor",
      batchSize: 100,
      bufferSize: 1000,
      backpressureThreshold: 0.8,
      monitoring: {
        enabled: true,
        metricsInterval: 1000,
        alertThresholds: {
          bufferUtilization: 0.8,
          processingLatency: 5000,
          errorRate: 0.1,
          throughput: 50,
        },
      },
    });

    // Create Elysia app for monitoring and control
    app = new Elysia()
      .derive(async () => ({ processor }))
      .group("/streaming", (app) =>
        app
          .get("/metrics", async ({ processor }) => {
            const metrics = processor.getCurrentMetrics();
            return metrics;
          })
          .get("/health", async ({ processor }) => {
            return {
              healthy: processor.isHealthy(),
              backpressureState: processor.getBackpressureState(),
            };
          })
          .post("/pause", async ({ processor }) => {
            processor.pause();
            return { success: true, status: "paused" };
          })
          .post("/resume", async ({ processor }) => {
            processor.resume();
            return { success: true, status: "resumed" };
          })
          .get("/history/:limit?", async ({ params, processor }) => {
            const limit = params.limit ? parseInt(params.limit) : 100;
            const history = processor.getMetricsHistory(limit);
            return { history, count: history.length };
          }),
      );
  });

  afterEach(async () => {
    await processor.shutdown();
  });

  it("should process streaming data with proper metrics via Elysia", async () => {
    const sourceStream = new MockServiceNowDataStream(500, "incident");
    const destinationStream = new MockDestinationStream();

    const processingStream = processor.createProcessingStream(
      async (batch: any[]) => {
        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 50));

        return batch.map((record) => ({
          ...record,
          processed_at: new Date().toISOString(),
          processed_by: "test_processor",
        }));
      },
    );

    // Connect streams
    sourceStream.pipe(processingStream).pipe(destinationStream);

    // Wait for processing to complete
    await new Promise((resolve) => {
      destinationStream.on("finish", resolve);
    });

    // Check metrics via Elysia endpoint
    const response = await app.handle(
      new Request("http://localhost/streaming/metrics"),
    );
    const metrics = await response.json();

    expect(metrics.recordsProcessed).toBe(500);
    expect(metrics.avgProcessingTimeMs).toBeGreaterThan(0);
    expect(metrics.throughputPerSecond).toBeGreaterThan(0);
    expect(metrics.errorRate).toBeLessThanOrEqual(0.1);

    const destinationStats = destinationStream.getStats();
    expect(destinationStats.recordsWritten).toBe(500);
    expect(destinationStats.errors).toBe(0);
  });

  it("should handle backpressure correctly", async () => {
    // Create fast source, slow destination to trigger backpressure
    const fastSource = new MockServiceNowDataStream(2000, "incident");
    const slowDestination = new MockDestinationStream();

    // Override write to be slower
    const originalWrite = slowDestination._write;
    slowDestination._write = function (
      chunk: any,
      encoding: string,
      callback: Function,
    ) {
      setTimeout(() => {
        originalWrite.call(this, chunk, encoding, callback);
      }, 100); // 100ms delay per record
    };

    const processingStream = processor.createProcessingStream(
      async (batch: any[]) => {
        // Fast processing
        return batch;
      },
    );

    fastSource.pipe(processingStream).pipe(slowDestination);

    // Monitor backpressure activation
    let backpressureActivated = false;
    processor.on("backpressure:activated", () => {
      backpressureActivated = true;
    });

    // Let it run for a short time
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const healthResponse = await app.handle(
      new Request("http://localhost/streaming/health"),
    );
    const health = await response.json();

    expect(backpressureActivated).toBe(true);
    expect(health.backpressureState.isActive).toBe(true);
  });

  it("should support stream transformation with filtering", async () => {
    const sourceStream = new MockServiceNowDataStream(1000, "incident");
    const destinationStream = new MockDestinationStream();

    const filterStream = processor.createFilterStream((record: any) => {
      return record.priority === "1" || record.priority === "2"; // Only critical and high
    });

    const transformStream = processor.createTransformStream((record: any) => ({
      ...record,
      priority_text:
        record.priority === "1"
          ? "Critical"
          : record.priority === "2"
            ? "High"
            : record.priority === "3"
              ? "Medium"
              : "Low",
      processed_timestamp: Date.now(),
    }));

    sourceStream
      .pipe(filterStream)
      .pipe(transformStream)
      .pipe(destinationStream);

    await new Promise((resolve) => {
      destinationStream.on("finish", resolve);
    });

    const stats = destinationStream.getStats();

    // Should have approximately 50% of records (priority 1 and 2 out of 4 possible)
    expect(stats.recordsWritten).toBeLessThan(1000);
    expect(stats.recordsWritten).toBeGreaterThan(400);

    // All records should have priority_text
    stats.recordsWritten > 0 &&
      expect(destinationStream.records[0].priority_text).toBeDefined();
  });

  it("should handle streaming errors gracefully", async () => {
    const sourceStream = new MockServiceNowDataStream(500, "incident");
    const destinationStream = new MockDestinationStream();

    const faultyProcessingStream = processor.createProcessingStream(
      async (batch: any[]) => {
        return batch.map((record) => {
          // Simulate random failures
          if (Math.random() < 0.1) {
            // 10% failure rate
            throw new Error(`Processing failed for ${record.sys_id}`);
          }
          return { ...record, processed: true };
        });
      },
    );

    let errorCount = 0;
    processor.on("processing:error", () => {
      errorCount++;
    });

    sourceStream.pipe(faultyProcessingStream).pipe(destinationStream);

    await new Promise((resolve) => {
      destinationStream.on("finish", resolve);
    });

    expect(errorCount).toBeGreaterThan(0);

    const metricsResponse = await app.handle(
      new Request("http://localhost/streaming/metrics"),
    );
    const metrics = await response.json();

    expect(metrics.recordsErrored).toBeGreaterThan(0);
    expect(metrics.errorRate).toBeGreaterThan(0);
  });

  it("should support rate limiting and throttling", async () => {
    const sourceStream = new MockServiceNowDataStream(1000, "incident");
    const destinationStream = new MockDestinationStream();

    const rateLimitStream = processor.createRateLimitingStream(100); // 100 records/second

    const startTime = Date.now();

    sourceStream.pipe(rateLimitStream).pipe(destinationStream);

    await new Promise((resolve) => {
      destinationStream.on("finish", resolve);
    });

    const duration = Date.now() - startTime;
    const actualRate = 1000 / (duration / 1000);

    // Should be close to but not exceed 100 records/second
    expect(actualRate).toBeLessThan(120); // Allow some tolerance
    expect(duration).toBeGreaterThan(9000); // Should take at least 9 seconds for 1000 records at 100/sec
  });

  it("should provide comprehensive metrics history", async () => {
    const sourceStream = new MockServiceNowDataStream(200, "incident");
    const destinationStream = new MockDestinationStream();

    const processingStream = processor.createProcessingStream(
      async (batch: any[]) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return batch;
      },
    );

    sourceStream.pipe(processingStream).pipe(destinationStream);

    // Let metrics accumulate
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const historyResponse = await app.handle(
      new Request("http://localhost/streaming/history/50"),
    );
    const historyData = await historyResponse.json();

    expect(historyData.history.length).toBeGreaterThan(0);
    expect(historyData.count).toBe(historyData.history.length);

    // Each history entry should have required fields
    historyData.history.forEach((entry: any) => {
      expect(entry.timestamp).toBeDefined();
      expect(entry.recordsProcessed).toBeDefined();
      expect(entry.throughputPerSecond).toBeDefined();
    });
  });
});

describe("ServiceNowStreamingPlatform with Elysia Integration", () => {
  let platform: ServiceNowStreamingPlatform;
  let app: Elysia;

  beforeEach(() => {
    platform = new ServiceNowStreamingPlatform();

    // Create comprehensive Elysia API for streaming platform
    app = new Elysia()
      .derive(async () => ({ platform }))
      .group("/platform", (app) =>
        app
          .post("/processor", async ({ body, platform }) => {
            const { name, config, type } = body as any;
            const processor = platform.createProcessor(name, config, type);
            return { success: true, processorName: name };
          })
          .get("/processors", async ({ platform }) => {
            const processors = platform.getProcessors();
            return {
              processors: processors.map((p) => ({
                name: p.name,
                healthy: p.processor.isHealthy(),
                metrics: p.processor.getCurrentMetrics(),
              })),
            };
          })
          .post("/pipeline/incident", async ({ body, platform }) => {
            const config = body as any;
            const result =
              await platform.createIncidentProcessingPipeline(config);
            return {
              success: true,
              processorName: result.processor.getCurrentMetrics().timestamp,
              streamKey: result.streamKey,
            };
          })
          .post("/pipeline/export", async ({ body, platform }) => {
            const config = body as any;
            const result = await platform.createDataExportPipeline(config);
            return { success: true };
          })
          .post("/pipeline/notification", async ({ body, platform }) => {
            const config = body as any;
            const result = await platform.createNotificationPipeline(config);
            return { success: true };
          })
          .get("/metrics", async ({ platform }) => {
            const metrics = platform.getPlatformMetrics();
            return metrics;
          })
          .post("/start", async ({ platform }) => {
            await platform.startAll();
            return { success: true, status: "started" };
          })
          .post("/stop", async ({ platform }) => {
            await platform.stopAll();
            return { success: true, status: "stopped" };
          }),
      );
  });

  afterEach(async () => {
    await platform.stopAll();
  });

  it("should create and manage multiple stream processors", async () => {
    // Create incident processor
    const incidentConfig = {
      name: "incident_processor_1",
      config: {
        batchSize: 50,
        backpressureThreshold: 0.7,
      },
      type: "incident",
    };

    const response1 = await app.handle(
      new Request("http://localhost/platform/processor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(incidentConfig),
      }),
    );

    const result1 = await response1.json();
    expect(result1.success).toBe(true);

    // Create export processor
    const exportConfig = {
      name: "export_processor_1",
      config: {
        batchSize: 1000,
        maxConcurrency: 8,
      },
      type: "export",
    };

    const response2 = await app.handle(
      new Request("http://localhost/platform/processor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportConfig),
      }),
    );

    const result2 = await response2.json();
    expect(result2.success).toBe(true);

    // Check processors list
    const processorsResponse = await app.handle(
      new Request("http://localhost/platform/processors"),
    );
    const processorsList = await processorsResponse.json();

    expect(processorsList.processors.length).toBe(2);
    expect(processorsList.processors[0].name).toBe("incident_processor_1");
    expect(processorsList.processors[1].name).toBe("export_processor_1");
  });

  it("should create complete incident processing pipeline", async () => {
    const pipelineConfig = {
      name: "test_incident_pipeline",
      redisStreamKey: "test:incidents:stream",
      openSearchIndexPrefix: "test-incidents",
      enableParquetStorage: true,
      parquetOutputPath: "/tmp/test-incidents",
      batchSize: 100,
    };

    const response = await app.handle(
      new Request("http://localhost/platform/pipeline/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pipelineConfig),
      }),
    );

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.streamKey).toBe("test:incidents:stream");
  });

  it("should create data export pipeline with multiple formats", async () => {
    const exportConfig = {
      name: "bulk_export_pipeline",
      tables: ["incident", "problem", "change_request"],
      outputFormat: "parquet",
      outputPath: "/tmp/exports",
      compressionType: "snappy",
      batchSize: 2000,
      parallelism: 4,
    };

    const response = await app.handle(
      new Request("http://localhost/platform/pipeline/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportConfig),
      }),
    );

    const result = await response.json();
    expect(result.success).toBe(true);
  });

  it("should create notification pipeline with multiple channels", async () => {
    const notificationConfig = {
      name: "alert_notification_pipeline",
      notificationTypes: ["email", "slack", "webhook"],
      triggers: [
        {
          table: "incident",
          conditions: [{ field: "priority", operator: "equals", value: "1" }],
          template: "critical_incident_alert",
          priority: "critical",
        },
      ],
      batchSize: 25,
      rateLimitPerMinute: 500,
    };

    const response = await app.handle(
      new Request("http://localhost/platform/pipeline/notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationConfig),
      }),
    );

    const result = await response.json();
    expect(result.success).toBe(true);
  });

  it("should provide comprehensive platform metrics", async () => {
    // Create some processors first
    await platform.createProcessor(
      "test_metrics_1",
      { batchSize: 100 },
      "incident",
    );
    await platform.createProcessor(
      "test_metrics_2",
      { batchSize: 200 },
      "export",
    );

    const response = await app.handle(
      new Request("http://localhost/platform/metrics"),
    );
    const metrics = await response.json();

    expect(metrics.global).toBeDefined();
    expect(metrics.global.totalProcessors).toBe(2);
    expect(metrics.processors).toBeDefined();
    expect(metrics.processors.length).toBe(2);
    expect(metrics.systemHealth).toBeDefined();
    expect(metrics.systemHealth.overallHealth).toMatch(
      /healthy|degraded|critical/,
    );
  });

  it("should support platform lifecycle management", async () => {
    // Start platform
    const startResponse = await app.handle(
      new Request("http://localhost/platform/start", {
        method: "POST",
      }),
    );
    const startResult = await startResponse.json();
    expect(startResult.success).toBe(true);
    expect(startResult.status).toBe("started");

    // Create some activity
    await platform.createProcessor(
      "lifecycle_test",
      { batchSize: 50 },
      "incident",
    );

    // Stop platform
    const stopResponse = await app.handle(
      new Request("http://localhost/platform/stop", {
        method: "POST",
      }),
    );
    const stopResult = await stopResponse.json();
    expect(stopResult.success).toBe(true);
    expect(stopResult.status).toBe("stopped");
  });

  it("should handle high-throughput streaming scenarios", async () => {
    // Create high-capacity processors
    const processorConfigs = Array.from({ length: 5 }, (_, i) => ({
      name: `high_throughput_${i}`,
      config: {
        batchSize: 500,
        maxConcurrency: 8,
        bufferSize: 5000,
        backpressureStrategy: "throttle",
      },
      type: "export",
    }));

    const createPromises = processorConfigs.map((config) =>
      app.handle(
        new Request("http://localhost/platform/processor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        }),
      ),
    );

    await Promise.all(createPromises);

    // Start platform
    await app.handle(
      new Request("http://localhost/platform/start", { method: "POST" }),
    );

    // Simulate high throughput by creating multiple data streams
    const streamPromises = Array.from({ length: 5 }, async (_, i) => {
      const processor = platform.getProcessor(`high_throughput_${i}`);
      if (!processor) return;

      const sourceStream = new MockServiceNowDataStream(1000, "incident");
      const destinationStream = new MockDestinationStream();

      const processingStream = processor.createProcessingStream(
        async (batch: any[]) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return batch;
        },
      );

      sourceStream.pipe(processingStream).pipe(destinationStream);

      return new Promise((resolve) => {
        destinationStream.on("finish", () => {
          resolve(destinationStream.getStats());
        });
      });
    });

    const results = await Promise.all(streamPromises.filter((p) => p));

    expect(results.length).toBe(5);
    results.forEach((stats) => {
      expect((stats as any).recordsWritten).toBe(1000);
    });

    // Check platform metrics after high throughput
    const metricsResponse = await app.handle(
      new Request("http://localhost/platform/metrics"),
    );
    const finalMetrics = await metricsResponse.json();

    expect(finalMetrics.global.totalRecordsProcessed).toBeGreaterThan(0);
    expect(finalMetrics.systemHealth.overallHealth).toMatch(/healthy|degraded/);
  }, 60000); // Extended timeout for high-throughput test
});
