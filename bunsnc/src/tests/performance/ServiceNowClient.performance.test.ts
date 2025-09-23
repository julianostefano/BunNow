/**
 * ServiceNowClient Performance Tests - Benchmarking and performance validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { performanceMonitor } from "../../utils/PerformanceMonitor";

// Mock ServiceNowClient for performance testing
class MockServiceNowClient {
  private simulatedLatency: number = 100; // Base latency in ms
  private errorRate: number = 0.05; // 5% error rate

  setSimulatedLatency(latency: number) {
    this.simulatedLatency = latency;
  }

  setErrorRate(rate: number) {
    this.errorRate = rate;
  }

  private async simulateOperation(complexity: number = 1): Promise<any> {
    const latency = this.simulatedLatency * complexity;
    const shouldError = Math.random() < this.errorRate;

    if (shouldError) {
      await new Promise((resolve) => setTimeout(resolve, latency / 2));
      throw new Error("Simulated error");
    }

    await new Promise((resolve) => setTimeout(resolve, latency));
    return { success: true, timestamp: Date.now() };
  }

  async query(options: any): Promise<any[]> {
    const complexity = (options.limit || 100) / 100; // Scale complexity by result count
    await this.simulateOperation(complexity);

    return Array.from({ length: options.limit || 100 }, (_, i) => ({
      sys_id: `record_${i}`,
      number: `REC${String(i).padStart(7, "0")}`,
      state: String((i % 7) + 1),
      priority: String((i % 5) + 1),
    }));
  }

  async create(table: string, data: any): Promise<any> {
    await this.simulateOperation();
    return { sys_id: `new_${Date.now()}`, ...data };
  }

  async update(table: string, sysId: string, data: any): Promise<any> {
    await this.simulateOperation();
    return { sys_id: sysId, ...data };
  }

  async delete(table: string, sysId: string): Promise<boolean> {
    await this.simulateOperation();
    return true;
  }

  async batchQuery(queries: any[]): Promise<any[]> {
    const complexity = queries.length / 10; // Scale by number of queries
    const results = await Promise.all(
      queries.map(async (query, index) => {
        await this.simulateOperation(complexity);
        return {
          success: true,
          data: Array.from({ length: 10 }, (_, i) => ({
            sys_id: `batch_${index}_${i}`,
            query_index: index,
          })),
        };
      }),
    );
    return results;
  }

  async batchCreate(table: string, records: any[]): Promise<any[]> {
    const complexity = records.length / 100; // Scale by number of records
    const results = await Promise.all(
      records.map(async (record, index) => {
        await this.simulateOperation(complexity);
        return {
          success: Math.random() > this.errorRate,
          data: { sys_id: `batch_created_${index}`, ...record },
        };
      }),
    );
    return results;
  }
}

describe("ServiceNowClient Performance Tests", () => {
  let client: MockServiceNowClient;
  let startTime: number;

  beforeEach(() => {
    client = new MockServiceNowClient();
    performanceMonitor.clearMetrics();
    startTime = performance.now();
  });

  afterEach(() => {
    const endTime = performance.now();
    const testDuration = endTime - startTime;
    console.log(`Test completed in ${testDuration.toFixed(2)}ms`);
  });

  describe("Query Performance", () => {
    test("should handle small queries efficiently", async () => {
      const timer = "small_query_test";
      performanceMonitor.startTimer(timer, "PerformanceTest");

      const results = await client.query({ table: "incident", limit: 10 });

      const duration = performanceMonitor.endTimer(timer);

      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(500); // Should complete in under 500ms
      expect(duration).toBeGreaterThan(50); // But take some realistic time
    });

    test("should handle medium queries within acceptable time", async () => {
      const timer = "medium_query_test";
      performanceMonitor.startTimer(timer, "PerformanceTest");

      const results = await client.query({ table: "incident", limit: 100 });

      const duration = performanceMonitor.endTimer(timer);

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete in under 1s
    });

    test("should handle large queries with reasonable performance", async () => {
      const timer = "large_query_test";
      performanceMonitor.startTimer(timer, "PerformanceTest");

      const results = await client.query({ table: "incident", limit: 1000 });

      const duration = performanceMonitor.endTimer(timer);

      expect(results).toHaveLength(1000);
      expect(duration).toBeLessThan(5000); // Should complete in under 5s
    });

    test("should demonstrate query performance scaling", async () => {
      const sizes = [10, 50, 100, 500];
      const results: Array<{ size: number; duration: number; rps: number }> =
        [];

      for (const size of sizes) {
        const timer = `scaling_test_${size}`;
        performanceMonitor.startTimer(timer, "PerformanceTest");

        await client.query({ table: "incident", limit: size });

        const duration = performanceMonitor.endTimer(timer);
        const rps = (size / duration) * 1000; // Records per second

        results.push({ size, duration, rps });
      }

      // Verify that performance scales reasonably
      expect(results[0].rps).toBeGreaterThan(results[3].rps * 0.5); // Shouldn't degrade by more than 50%

      console.log("Query Performance Scaling:");
      results.forEach((result) => {
        console.log(
          `  ${result.size} records: ${result.duration.toFixed(2)}ms (${result.rps.toFixed(2)} RPS)`,
        );
      });
    });
  });

  describe("Concurrent Operation Performance", () => {
    test("should handle concurrent queries efficiently", async () => {
      const concurrencyLevels = [1, 5, 10];
      const results: Array<{
        concurrency: number;
        totalTime: number;
        avgTime: number;
      }> = [];

      for (const concurrency of concurrencyLevels) {
        const timer = `concurrent_test_${concurrency}`;
        performanceMonitor.startTimer(timer, "PerformanceTest");

        const promises = Array.from({ length: concurrency }, () =>
          client.query({ table: "incident", limit: 50 }),
        );

        await Promise.all(promises);

        const totalTime = performanceMonitor.endTimer(timer);
        const avgTime = totalTime / concurrency;

        results.push({ concurrency, totalTime, avgTime });
      }

      // Verify concurrent operations are more efficient than sequential
      const sequential = results[0].totalTime * results[2].concurrency;
      const concurrent = results[2].totalTime;

      expect(concurrent).toBeLessThan(sequential * 0.8); // Should be at least 20% faster

      console.log("Concurrent Query Performance:");
      results.forEach((result) => {
        console.log(
          `  ${result.concurrency} concurrent: ${result.totalTime.toFixed(2)}ms total, ${result.avgTime.toFixed(2)}ms avg`,
        );
      });
    });

    test("should handle high concurrency without degradation", async () => {
      const highConcurrency = 20;
      const timer = "high_concurrency_test";
      performanceMonitor.startTimer(timer, "PerformanceTest");

      const promises = Array.from({ length: highConcurrency }, (_, i) =>
        client.query({ table: "incident", limit: 25, offset: i * 25 }),
      );

      const results = await Promise.all(promises);

      const duration = performanceMonitor.endTimer(timer);

      expect(results).toHaveLength(highConcurrency);
      expect(duration).toBeLessThan(3000); // Should handle 20 concurrent requests in under 3s

      // Check that all requests completed successfully
      results.forEach((result, index) => {
        expect(result).toHaveLength(25);
      });
    });
  });

  describe("Batch Operation Performance", () => {
    test("should demonstrate batch query efficiency", async () => {
      // Compare individual queries vs batch queries
      const queryCount = 10;

      // Individual queries
      const individualTimer = "individual_queries";
      performanceMonitor.startTimer(individualTimer, "PerformanceTest");

      for (let i = 0; i < queryCount; i++) {
        await client.query({ table: "incident", limit: 10, offset: i * 10 });
      }

      const individualTime = performanceMonitor.endTimer(individualTimer);

      // Batch queries
      const batchTimer = "batch_queries";
      performanceMonitor.startTimer(batchTimer, "PerformanceTest");

      const batchQueries = Array.from({ length: queryCount }, (_, i) => ({
        table: "incident",
        limit: 10,
        offset: i * 10,
      }));

      await client.batchQuery(batchQueries);

      const batchTime = performanceMonitor.endTimer(batchTimer);

      // Batch should be significantly faster
      expect(batchTime).toBeLessThan(individualTime * 0.7); // At least 30% improvement

      console.log(`Batch vs Individual Queries:`);
      console.log(`  Individual: ${individualTime.toFixed(2)}ms`);
      console.log(`  Batch: ${batchTime.toFixed(2)}ms`);
      console.log(
        `  Improvement: ${(((individualTime - batchTime) / individualTime) * 100).toFixed(1)}%`,
      );
    });

    test("should handle large batch operations efficiently", async () => {
      const batchSizes = [10, 50, 100];
      const results: Array<{
        size: number;
        duration: number;
        throughput: number;
      }> = [];

      for (const size of batchSizes) {
        const records = Array.from({ length: size }, (_, i) => ({
          short_description: `Batch record ${i}`,
          priority: String((i % 5) + 1),
          state: "1",
        }));

        const timer = `batch_create_${size}`;
        performanceMonitor.startTimer(timer, "PerformanceTest");

        await client.batchCreate("incident", records);

        const duration = performanceMonitor.endTimer(timer);
        const throughput = (size / duration) * 1000; // Records per second

        results.push({ size, duration, throughput });
      }

      console.log("Batch Create Performance:");
      results.forEach((result) => {
        console.log(
          `  ${result.size} records: ${result.duration.toFixed(2)}ms (${result.throughput.toFixed(2)} RPS)`,
        );
      });

      // Verify reasonable throughput
      expect(results[0].throughput).toBeGreaterThan(50); // At least 50 RPS for small batches
    });
  });

  describe("Error Handling Performance", () => {
    test("should handle errors without significant performance impact", async () => {
      client.setErrorRate(0.3); // 30% error rate

      const timer = "error_handling_test";
      performanceMonitor.startTimer(timer, "PerformanceTest");

      const promises = Array.from({ length: 20 }, async (_, i) => {
        try {
          return await client.query({ table: "incident", limit: 25 });
        } catch (error: unknown) {
          return { error: true, index: i };
        }
      });

      const results = await Promise.all(promises);

      const duration = performanceMonitor.endTimer(timer);

      // Count successes and errors
      const successes = results.filter((r) => !("error" in r));
      const errors = results.filter((r) => "error" in r);

      expect(successes.length).toBeGreaterThan(10); // Should have some successes
      expect(errors.length).toBeGreaterThan(3); // Should have some errors
      expect(duration).toBeLessThan(4000); // Should handle errors efficiently

      console.log(
        `Error Handling: ${successes.length} successes, ${errors.length} errors in ${duration.toFixed(2)}ms`,
      );

      // Reset error rate
      client.setErrorRate(0.05);
    });

    test("should demonstrate retry performance impact", async () => {
      client.setErrorRate(0.8); // High error rate to trigger retries

      const withRetries = async () => {
        const maxRetries = 3;
        let attempt = 0;

        while (attempt < maxRetries) {
          try {
            return await client.query({ table: "incident", limit: 10 });
          } catch (error: unknown) {
            attempt++;
            if (attempt >= maxRetries) throw error;
            await new Promise((resolve) => setTimeout(resolve, 100 * attempt)); // Exponential backoff
          }
        }
      };

      const timer = "retry_performance_test";
      performanceMonitor.startTimer(timer, "PerformanceTest");

      const promises = Array.from({ length: 5 }, async () => {
        try {
          return await withRetries();
        } catch (error: unknown) {
          return { error: true };
        }
      });

      const results = await Promise.all(promises);
      const duration = performanceMonitor.endTimer(timer);

      console.log(
        `Retry Performance: ${results.filter((r) => !("error" in r)).length}/5 succeeded in ${duration.toFixed(2)}ms`,
      );

      // Reset error rate
      client.setErrorRate(0.05);
    });
  });

  describe("Memory Performance", () => {
    test("should handle large result sets without memory leaks", async () => {
      const initialMemory = process.memoryUsage();
      const results: any[] = [];

      // Process multiple large queries
      for (let i = 0; i < 5; i++) {
        const queryResults = await client.query({
          table: "incident",
          limit: 500,
        });
        results.push(queryResults);

        // Clear previous results to test memory management
        if (i > 0) {
          results.shift();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      console.log(
        `Memory Impact: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB increase`,
      );
    });

    test("should demonstrate garbage collection efficiency", async () => {
      const measurements: Array<{ iteration: number; heapUsed: number }> = [];

      for (let i = 0; i < 10; i++) {
        // Create and discard large objects
        const largeResult = await client.query({
          table: "incident",
          limit: 200,
        });

        // Force garbage collection hint (not guaranteed)
        if (global.gc) {
          global.gc();
        }

        measurements.push({
          iteration: i,
          heapUsed: process.memoryUsage().heapUsed,
        });

        // Discard reference
        largeResult.length = 0;
      }

      // Memory should stabilize rather than continuously growing
      const firstHalf = measurements.slice(0, 5);
      const secondHalf = measurements.slice(5, 10);

      const firstAvg =
        firstHalf.reduce((sum, m) => sum + m.heapUsed, 0) / firstHalf.length;
      const secondAvg =
        secondHalf.reduce((sum, m) => sum + m.heapUsed, 0) / secondHalf.length;

      const memoryGrowth = secondAvg - firstAvg;

      // Memory growth should be minimal (less than 10MB)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);

      console.log(
        `Memory Stability: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth over 10 iterations`,
      );
    });
  });

  describe("Performance Regression Tests", () => {
    test("should maintain baseline performance standards", async () => {
      const baselines = {
        singleQuery: 200, // ms
        batchQuery10: 500, // ms
        concurrentQuery5: 800, // ms
        create: 150, // ms
        update: 150, // ms
        delete: 150, // ms
      };

      const results: Record<string, number> = {};

      // Single query test
      const singleTimer = "baseline_single";
      performanceMonitor.startTimer(singleTimer, "PerformanceTest");
      await client.query({ table: "incident", limit: 50 });
      results.singleQuery = performanceMonitor.endTimer(singleTimer);

      // Batch query test
      const batchTimer = "baseline_batch";
      performanceMonitor.startTimer(batchTimer, "PerformanceTest");
      await client.batchQuery(
        Array.from({ length: 10 }, (_, i) => ({
          table: "incident",
          limit: 10,
          offset: i * 10,
        })),
      );
      results.batchQuery10 = performanceMonitor.endTimer(batchTimer);

      // Concurrent query test
      const concurrentTimer = "baseline_concurrent";
      performanceMonitor.startTimer(concurrentTimer, "PerformanceTest");
      await Promise.all(
        Array.from({ length: 5 }, () =>
          client.query({ table: "incident", limit: 20 }),
        ),
      );
      results.concurrentQuery5 = performanceMonitor.endTimer(concurrentTimer);

      // CRUD operations
      const createTimer = "baseline_create";
      performanceMonitor.startTimer(createTimer, "PerformanceTest");
      await client.create("incident", { short_description: "Test" });
      results.create = performanceMonitor.endTimer(createTimer);

      const updateTimer = "baseline_update";
      performanceMonitor.startTimer(updateTimer, "PerformanceTest");
      await client.update("incident", "test_id", { state: "2" });
      results.update = performanceMonitor.endTimer(updateTimer);

      const deleteTimer = "baseline_delete";
      performanceMonitor.startTimer(deleteTimer, "PerformanceTest");
      await client.delete("incident", "test_id");
      results.delete = performanceMonitor.endTimer(deleteTimer);

      // Check all baselines
      console.log("Performance Baseline Results:");
      Object.entries(results).forEach(([operation, duration]) => {
        const baseline = baselines[operation as keyof typeof baselines];
        const status = duration <= baseline ? "" : "";
        console.log(
          `  ${operation}: ${duration.toFixed(2)}ms (baseline: ${baseline}ms) ${status}`,
        );

        // Allow some variance for CI environments
        expect(duration).toBeLessThan(baseline * 1.5); // 50% tolerance
      });
    });
  });

  describe("Stress Testing", () => {
    test("should handle sustained load", async () => {
      const duration = 5000; // 5 seconds
      const startTime = Date.now();
      const operations: number[] = [];
      let operationCount = 0;

      while (Date.now() - startTime < duration) {
        const opStart = performance.now();

        try {
          await client.query({ table: "incident", limit: 10 });
          operationCount++;
        } catch (error: unknown) {
          // Count errors but continue
        }

        const opEnd = performance.now();
        operations.push(opEnd - opStart);
      }

      const actualDuration = Date.now() - startTime;
      const opsPerSecond = (operationCount / actualDuration) * 1000;
      const avgResponseTime =
        operations.reduce((a, b) => a + b, 0) / operations.length;
      const p95ResponseTime = operations.sort((a, b) => a - b)[
        Math.floor(operations.length * 0.95)
      ];

      console.log("Stress Test Results:");
      console.log(`  Duration: ${actualDuration}ms`);
      console.log(`  Operations: ${operationCount}`);
      console.log(`  Ops/sec: ${opsPerSecond.toFixed(2)}`);
      console.log(`  Avg response: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`  P95 response: ${p95ResponseTime.toFixed(2)}ms`);

      // Basic performance expectations
      expect(opsPerSecond).toBeGreaterThan(5); // At least 5 ops/sec
      expect(avgResponseTime).toBeLessThan(500); // Average under 500ms
      expect(p95ResponseTime).toBeLessThan(1000); // P95 under 1s
    });
  });
});
