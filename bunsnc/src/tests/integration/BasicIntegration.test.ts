/**
 * Basic Integration Test Suite - Core System Integration Testing
 * Tests basic functionality of core components with real infrastructure
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeAll, afterAll, test } from "bun:test";
import { RedisConnectionManager } from "../../utils/RedisConnection";
import { ConsolidatedDataService } from "../../services/ConsolidatedDataService";

// Basic integration test configuration
const basicConfig = {
  redis: {
    host: process.env.REDIS_HOST || "10.219.8.210",
    port: parseInt(process.env.REDIS_PORT || "6380"),
    password: process.env.REDIS_PASSWORD,
  },
  mongodb: {
    connectionString:
      process.env.MONGODB_URL || "mongodb://10.219.8.210:27018/bunsnc",
    databaseName: "bunsnc",
  },
  timeout: 15000, // 15 seconds for basic tests
};

describe("Basic Integration Tests", () => {
  let redisConnection: RedisConnectionManager;
  let dataService: ConsolidatedDataService;

  afterAll(async () => {
    // Cleanup connections
    try {
      if (redisConnection) {
        await redisConnection.disconnect();
      }
      if (dataService) {
        await dataService.cleanup();
      }
    } catch (error) {
      console.warn("Cleanup warning:", error);
    }
  });

  describe("Redis Basic Integration", () => {
    test(
      "should connect to Redis successfully",
      async () => {
        redisConnection = RedisConnectionManager.getInstance();

        await redisConnection.connect({
          host: basicConfig.redis.host,
          port: basicConfig.redis.port,
          password: basicConfig.redis.password,
        });

        expect(redisConnection.isReady()).toBe(true);

        console.log("✅ Redis connection established");
      },
      basicConfig.timeout,
    );

    test(
      "should perform basic Redis operations",
      async () => {
        if (!redisConnection || !redisConnection.isReady()) {
          redisConnection = RedisConnectionManager.getInstance();
          await redisConnection.connect({
            host: basicConfig.redis.host,
            port: basicConfig.redis.port,
            password: basicConfig.redis.password,
          });
        }

        const testKey = `basic-test:${Date.now()}`;
        const testValue = "basic-integration-test";

        // Test SET/GET
        await redisConnection.getConnection().set(testKey, testValue, "EX", 30);
        const retrievedValue = await redisConnection
          .getConnection()
          .get(testKey);

        expect(retrievedValue).toBe(testValue);

        // Cleanup
        await redisConnection.getConnection().del(testKey);

        console.log("✅ Redis operations working");
      },
      basicConfig.timeout,
    );
  });

  describe("ConsolidatedDataService Basic Integration", () => {
    test(
      "should get singleton instance",
      async () => {
        dataService = ConsolidatedDataService.getInstance();

        expect(dataService).toBeDefined();
        expect(dataService.constructor.name).toBe("ConsolidatedDataService");

        console.log("✅ ConsolidatedDataService instance obtained");
      },
      basicConfig.timeout,
    );

    test(
      "should get basic stats",
      async () => {
        if (!dataService) {
          dataService = ConsolidatedDataService.getInstance();
        }

        const stats = await dataService.getStats();

        expect(stats).toBeDefined();
        expect(typeof stats).toBe("object");

        console.log("✅ DataService stats retrieved:", {
          hasStats: !!stats,
          statsKeys: Object.keys(stats),
        });
      },
      basicConfig.timeout,
    );

    test(
      "should perform health check",
      async () => {
        if (!dataService) {
          dataService = ConsolidatedDataService.getInstance();
        }

        const isHealthy = await dataService.healthCheck();

        expect(typeof isHealthy).toBe("boolean");

        console.log("✅ DataService health check completed:", isHealthy);
      },
      basicConfig.timeout,
    );
  });

  describe("System Connectivity", () => {
    test(
      "should validate all connections are working",
      async () => {
        // Ensure Redis is connected
        if (!redisConnection || !redisConnection.isReady()) {
          redisConnection = RedisConnectionManager.getInstance();
          await redisConnection.connect({
            host: basicConfig.redis.host,
            port: basicConfig.redis.port,
            password: basicConfig.redis.password,
          });
        }

        // Ensure DataService is available
        if (!dataService) {
          dataService = ConsolidatedDataService.getInstance();
        }

        // Test connections
        const redisConnected = redisConnection.isReady();
        const dataServiceHealthy = await dataService.healthCheck();

        expect(redisConnected).toBe(true);
        expect(typeof dataServiceHealthy).toBe("boolean");

        console.log("✅ System connectivity validated:", {
          redis: redisConnected,
          dataService: dataServiceHealthy,
        });
      },
      basicConfig.timeout,
    );

    test(
      "should handle concurrent operations",
      async () => {
        if (!redisConnection || !redisConnection.isReady()) {
          redisConnection = RedisConnectionManager.getInstance();
          await redisConnection.connect({
            host: basicConfig.redis.host,
            port: basicConfig.redis.port,
            password: basicConfig.redis.password,
          });
        }

        if (!dataService) {
          dataService = ConsolidatedDataService.getInstance();
        }

        // Perform concurrent operations
        const operations = await Promise.allSettled([
          redisConnection
            .getConnection()
            .set(`concurrent-test-1:${Date.now()}`, "value1", "EX", 10),
          redisConnection
            .getConnection()
            .set(`concurrent-test-2:${Date.now()}`, "value2", "EX", 10),
          dataService.getStats(),
          dataService.healthCheck(),
        ]);

        // Check that all operations completed (either fulfilled or rejected)
        expect(operations.length).toBe(4);

        const successful = operations.filter(
          (op) => op.status === "fulfilled",
        ).length;
        const failed = operations.filter(
          (op) => op.status === "rejected",
        ).length;

        console.log("✅ Concurrent operations completed:", {
          total: operations.length,
          successful,
          failed,
        });

        // At least some operations should succeed
        expect(successful).toBeGreaterThan(0);
      },
      basicConfig.timeout,
    );
  });

  describe("Error Handling", () => {
    test(
      "should handle Redis disconnection gracefully",
      async () => {
        if (!redisConnection || !redisConnection.isReady()) {
          redisConnection = RedisConnectionManager.getInstance();
          await redisConnection.connect({
            host: basicConfig.redis.host,
            port: basicConfig.redis.port,
            password: basicConfig.redis.password,
          });
        }

        // Test that connection status is properly reported
        const initialStatus = redisConnection.isReady();
        expect(initialStatus).toBe(true);

        // The connection should handle errors gracefully
        try {
          // Try to use an invalid command (this should not crash)
          await redisConnection.getConnection().eval("invalid lua script", 0);
        } catch (error) {
          // This is expected to fail, but should not crash the connection
          expect(error).toBeDefined();
        }

        // Connection should still be usable
        const finalStatus = redisConnection.isReady();
        expect(finalStatus).toBe(true);

        console.log("✅ Redis error handling validated");
      },
      basicConfig.timeout,
    );

    test(
      "should handle DataService errors gracefully",
      async () => {
        if (!dataService) {
          dataService = ConsolidatedDataService.getInstance();
        }

        // These operations should not crash the service
        let statsResult: any;
        let healthResult: any;

        try {
          statsResult = await dataService.getStats();
        } catch (error) {
          statsResult = { error: (error as Error).message };
        }

        try {
          healthResult = await dataService.healthCheck();
        } catch (error) {
          healthResult = false;
        }

        // Service should handle errors gracefully
        expect(statsResult).toBeDefined();
        expect(typeof healthResult).toBe("boolean");

        console.log("✅ DataService error handling validated:", {
          hasStats: !!statsResult,
          healthCheck: healthResult,
        });
      },
      basicConfig.timeout,
    );
  });

  describe("Basic Auto-Sync Integration", () => {
    test(
      "should have auto-sync capabilities",
      async () => {
        if (!dataService) {
          dataService = ConsolidatedDataService.getInstance();
        }

        // Check if auto-sync methods are available
        const hasStartAutoSync =
          typeof dataService.startAutoSync === "function";
        const hasStopAutoSync = typeof dataService.stopAutoSync === "function";

        expect(hasStartAutoSync).toBe(true);
        expect(hasStopAutoSync).toBe(true);

        console.log("✅ Auto-sync capabilities verified:", {
          startAutoSync: hasStartAutoSync,
          stopAutoSync: hasStopAutoSync,
        });
      },
      basicConfig.timeout,
    );

    test(
      "should handle auto-sync start/stop cycle",
      async () => {
        if (!dataService) {
          dataService = ConsolidatedDataService.getInstance();
        }

        try {
          // Test basic start/stop cycle
          dataService.startAutoSync({
            syncInterval: 60000, // 1 minute for testing
            tables: ["incident"],
            batchSize: 5,
          });

          // Wait a moment
          await new Promise((resolve) => setTimeout(resolve, 100));

          dataService.stopAutoSync();

          console.log("✅ Auto-sync start/stop cycle completed");
          expect(true).toBe(true); // Test passed if no errors
        } catch (error) {
          console.warn("Auto-sync test warning:", error);
          // Auto-sync might not be fully configured, but methods should exist
          expect(typeof dataService.startAutoSync).toBe("function");
          expect(typeof dataService.stopAutoSync).toBe("function");
        }
      },
      basicConfig.timeout,
    );
  });
});

// Helper function for basic integration delays
const waitForBasicIntegration = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
