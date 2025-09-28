/**
 * System Integration Test Suite - Real System Integration Testing
 * Tests real connectivity and integration with ServiceNow, MongoDB, Redis and other infrastructure
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeAll, afterAll, test } from "bun:test";
import { RedisConnection } from "../../utils/RedisConnection";
import { ConsolidatedDataService } from "../../services/ConsolidatedDataService";
import { ServiceNowAuthCore } from "../../services/auth/ServiceNowAuthCore";

// Integration test configuration for real systems
const integrationConfig = {
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
  servicenow: {
    instanceUrl:
      process.env.SNC_INSTANCE_URL || "https://iberdrola.service-now.com",
    authType: "saml" as const,
  },
  timeout: 30000, // 30 seconds for real system tests
};

describe("System Integration Tests", () => {
  let redisConnection: RedisConnection;
  let consolidatedDataService: ConsolidatedDataService;
  let authService: ServiceNowAuthCore;

  beforeAll(async () => {
    // Setup real connections with extended timeout
    console.log("🔄 Setting up real system connections...");
  }, integrationConfig.timeout);

  afterAll(async () => {
    // Cleanup connections
    try {
      if (redisConnection) {
        await redisConnection.disconnect();
      }
      if (consolidatedDataService) {
        await consolidatedDataService.cleanup();
      }
      if (authService) {
        await authService.cleanup?.();
      }
    } catch (error) {
      console.warn("Cleanup warning:", error);
    }
  });

  describe("Redis Integration", () => {
    test(
      "should establish Redis connection successfully",
      async () => {
        redisConnection = new RedisConnection(
          integrationConfig.redis.host,
          integrationConfig.redis.port,
          integrationConfig.redis.password,
        );

        await expect(redisConnection.connect()).resolves.not.toThrow();

        const isConnected = redisConnection.isConnected();
        expect(isConnected).toBe(true);
      },
      integrationConfig.timeout,
    );

    test(
      "should perform basic Redis operations",
      async () => {
        if (!redisConnection || !redisConnection.isConnected()) {
          redisConnection = new RedisConnection(
            integrationConfig.redis.host,
            integrationConfig.redis.port,
            integrationConfig.redis.password,
          );
          await redisConnection.connect();
        }

        const testKey = `test:integration:${Date.now()}`;
        const testValue = "integration-test-value";

        // Test SET operation
        await expect(
          redisConnection.getClient().set(testKey, testValue, "EX", 60),
        ).resolves.toBe("OK");

        // Test GET operation
        const retrievedValue = await redisConnection.getClient().get(testKey);
        expect(retrievedValue).toBe(testValue);

        // Cleanup test key
        await redisConnection.getClient().del(testKey);
      },
      integrationConfig.timeout,
    );

    test(
      "should handle Redis Stream operations",
      async () => {
        if (!redisConnection || !redisConnection.isConnected()) {
          redisConnection = new RedisConnection(
            integrationConfig.redis.host,
            integrationConfig.redis.port,
            integrationConfig.redis.password,
          );
          await redisConnection.connect();
        }

        const streamKey = `test-stream:${Date.now()}`;
        const testMessage = {
          event: "test",
          data: JSON.stringify({ test: true, timestamp: Date.now() }),
        };

        // Test XADD operation
        const messageId = await redisConnection
          .getClient()
          .xadd(
            streamKey,
            "*",
            "event",
            testMessage.event,
            "data",
            testMessage.data,
          );

        expect(messageId).toBeDefined();
        expect(typeof messageId).toBe("string");

        // Test XREAD operation
        const messages = await redisConnection
          .getClient()
          .xread("COUNT", 1, "STREAMS", streamKey, "0");

        expect(messages).toBeDefined();
        expect(Array.isArray(messages)).toBe(true);

        // Cleanup test stream
        await redisConnection.getClient().del(streamKey);
      },
      integrationConfig.timeout,
    );
  });

  describe("MongoDB Integration", () => {
    test(
      "should establish MongoDB connection through ConsolidatedDataService",
      async () => {
        consolidatedDataService = ConsolidatedDataService.getInstance();

        await expect(
          consolidatedDataService.initialize?.(),
        ).resolves.not.toThrow();

        const stats = await consolidatedDataService.getStats();
        expect(stats).toBeDefined();
        expect(stats.mongodb?.connected).toBe(true);
      },
      integrationConfig.timeout,
    );

    test(
      "should perform basic MongoDB operations",
      async () => {
        if (!consolidatedDataService) {
          consolidatedDataService = new HybridDataService();
          await consolidatedDataService.initialize();
        }

        const testDocument = {
          sys_id: `test-${Date.now()}`,
          number: `TEST${Date.now()}`,
          data: {
            test: true,
            timestamp: new Date(),
            description: "Integration test document",
          },
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Test document insertion
        const insertResult = await consolidatedDataService.upsertTicket(
          "sn_incidents",
          testDocument,
        );

        expect(insertResult).toBeDefined();
        expect(insertResult.success).toBe(true);

        // Test document retrieval
        const retrievedDoc = await consolidatedDataService.getTicketBySysId(
          "sn_incidents",
          testDocument.sys_id,
        );

        expect(retrievedDoc).toBeDefined();
        expect(retrievedDoc?.sys_id).toBe(testDocument.sys_id);
        expect(retrievedDoc?.number).toBe(testDocument.number);

        // Cleanup test document
        await consolidatedDataService.deleteTicket(
          "sn_incidents",
          testDocument.sys_id,
        );
      },
      integrationConfig.timeout,
    );

    test(
      "should handle MongoDB indexing operations",
      async () => {
        if (!consolidatedDataService) {
          consolidatedDataService = new HybridDataService();
          await consolidatedDataService.initialize();
        }

        // Test index creation and verification
        const indexStats =
          await consolidatedDataService.getIndexStats("sn_incidents");

        expect(indexStats).toBeDefined();
        expect(Array.isArray(indexStats)).toBe(true);
        expect(indexStats.length).toBeGreaterThan(0);

        // Verify critical indexes exist
        const indexNames = indexStats.map((idx: any) => idx.name);
        expect(indexNames).toContain("sys_id_1");
        expect(indexNames).toContain("number_1");
      },
      integrationConfig.timeout,
    );
  });

  describe("ServiceNow Integration", () => {
    test(
      "should initialize ServiceNow authentication service",
      async () => {
        authService = new ServiceNowAuthCore();

        await expect(authService.initialize()).resolves.not.toThrow();

        const authStatus = authService.getAuthenticationStatus();
        expect(authStatus).toBeDefined();
        expect(authStatus.type).toBe("saml");
      },
      integrationConfig.timeout,
    );

    test(
      "should validate ServiceNow connection configuration",
      async () => {
        if (!authService) {
          authService = new ServiceNowAuthCore();
          await authService.initialize();
        }

        const connectionConfig = authService.getConnectionConfig();

        expect(connectionConfig).toBeDefined();
        expect(connectionConfig.instanceUrl).toBe(
          integrationConfig.servicenow.instanceUrl,
        );
        expect(connectionConfig.authType).toBe(
          integrationConfig.servicenow.authType,
        );
      },
      integrationConfig.timeout,
    );

    test(
      "should handle ServiceNow proxy configuration",
      async () => {
        if (!authService) {
          authService = new ServiceNowAuthCore();
          await authService.initialize();
        }

        const proxyConfig = authService.getProxyConfiguration();

        expect(proxyConfig).toBeDefined();
        expect(proxyConfig.enabled).toBe(true);
        expect(proxyConfig.url).toContain("10.219.8.210:3008");
      },
      integrationConfig.timeout,
    );
  });

  describe("System Health Integration", () => {
    test(
      "should validate all system components health",
      async () => {
        // Initialize all services if not already done
        if (!redisConnection || !redisConnection.isConnected()) {
          redisConnection = new RedisConnection(
            integrationConfig.redis.host,
            integrationConfig.redis.port,
            integrationConfig.redis.password,
          );
          await redisConnection.connect();
        }

        if (!consolidatedDataService) {
          consolidatedDataService = new HybridDataService();
          await consolidatedDataService.initialize();
        }

        if (!authService) {
          authService = new ServiceNowAuthCore();
          await authService.initialize();
        }

        // Validate Redis health
        const redisHealth = redisConnection.isConnected();
        expect(redisHealth).toBe(true);

        // Validate MongoDB health
        const mongoStats = await consolidatedDataService.getConnectionStats();
        expect(mongoStats.mongodb?.connected).toBe(true);

        // Validate ServiceNow auth health
        const authStatus = authService.getAuthenticationStatus();
        expect(authStatus.initialized).toBe(true);

        console.log("✅ All system components are healthy");
      },
      integrationConfig.timeout,
    );

    test(
      "should validate system performance metrics",
      async () => {
        if (!consolidatedDataService) {
          consolidatedDataService = new HybridDataService();
          await consolidatedDataService.initialize();
        }

        const performanceMetrics =
          await consolidatedDataService.getPerformanceMetrics();

        expect(performanceMetrics).toBeDefined();
        expect(performanceMetrics.uptime).toBeGreaterThan(0);
        expect(performanceMetrics.memoryUsage).toBeDefined();
        expect(performanceMetrics.activeConnections).toBeDefined();
      },
      integrationConfig.timeout,
    );
  });

  describe("End-to-End Data Flow", () => {
    test(
      "should perform complete data synchronization cycle",
      async () => {
        // Initialize all required services
        if (!redisConnection || !redisConnection.isConnected()) {
          redisConnection = new RedisConnection(
            integrationConfig.redis.host,
            integrationConfig.redis.port,
            integrationConfig.redis.password,
          );
          await redisConnection.connect();
        }

        if (!consolidatedDataService) {
          consolidatedDataService = new HybridDataService();
          await consolidatedDataService.initialize();
        }

        // Create test data for sync
        const testSyncData = {
          sys_id: `sync-test-${Date.now()}`,
          number: `SYNC${Date.now()}`,
          data: {
            incident: {
              state: "1",
              priority: "3",
              short_description: "Integration test sync",
              assignment_group: "test-group",
            },
            sync_timestamp: new Date(),
          },
          created_at: new Date(),
          updated_at: new Date(),
        };

        // 1. Store data in MongoDB
        const storeResult = await consolidatedDataService.upsertTicket(
          "sn_incidents",
          testSyncData,
        );
        expect(storeResult.success).toBe(true);

        // 2. Publish change to Redis Stream
        const streamEvent = {
          event: "incident.updated",
          sys_id: testSyncData.sys_id,
          table: "incident",
          timestamp: new Date().toISOString(),
          data: JSON.stringify(testSyncData.data),
        };

        const streamKey = "servicenow:changes";
        const messageId = await redisConnection
          .getClient()
          .xadd(
            streamKey,
            "*",
            "event",
            streamEvent.event,
            "sys_id",
            streamEvent.sys_id,
            "table",
            streamEvent.table,
            "timestamp",
            streamEvent.timestamp,
            "data",
            streamEvent.data,
          );

        expect(messageId).toBeDefined();

        // 3. Verify data consistency
        const retrievedData = await consolidatedDataService.getTicketBySysId(
          "sn_incidents",
          testSyncData.sys_id,
        );

        expect(retrievedData).toBeDefined();
        expect(retrievedData?.sys_id).toBe(testSyncData.sys_id);
        expect(retrievedData?.data.incident.state).toBe("1");

        // 4. Verify stream message
        const streamMessages = await redisConnection
          .getClient()
          .xread("COUNT", 1, "STREAMS", streamKey, messageId);

        expect(streamMessages).toBeDefined();

        // Cleanup
        await consolidatedDataService.deleteTicket(
          "sn_incidents",
          testSyncData.sys_id,
        );
      },
      integrationConfig.timeout,
    );

    test(
      "should handle error scenarios gracefully",
      async () => {
        if (!consolidatedDataService) {
          consolidatedDataService = new HybridDataService();
          await consolidatedDataService.initialize();
        }

        // Test invalid data handling
        const invalidData = {
          sys_id: "", // Invalid empty sys_id
          data: null, // Invalid null data
        };

        const result = await consolidatedDataService.upsertTicket(
          "sn_incidents",
          invalidData as any,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      },
      integrationConfig.timeout,
    );
  });

  describe("Auto-Sync Integration", () => {
    test(
      "should validate auto-sync service integration",
      async () => {
        if (!consolidatedDataService) {
          consolidatedDataService = new HybridDataService();
          await consolidatedDataService.initialize();
        }

        // Test sync status tracking
        const syncStatus = await consolidatedDataService.getSyncStatus();

        expect(syncStatus).toBeDefined();
        expect(syncStatus.lastSync).toBeDefined();
        expect(syncStatus.nextSync).toBeDefined();
        expect(syncStatus.isRunning).toBeDefined();
      },
      integrationConfig.timeout,
    );

    test(
      "should validate sync configuration",
      async () => {
        if (!consolidatedDataService) {
          consolidatedDataService = new HybridDataService();
          await consolidatedDataService.initialize();
        }

        const syncConfig = await consolidatedDataService.getSyncConfiguration();

        expect(syncConfig).toBeDefined();
        expect(syncConfig.interval).toBeDefined();
        expect(syncConfig.tables).toBeDefined();
        expect(Array.isArray(syncConfig.tables)).toBe(true);
        expect(syncConfig.tables).toContain("incident");
        expect(syncConfig.tables).toContain("change_task");
        expect(syncConfig.tables).toContain("sc_task");
      },
      integrationConfig.timeout,
    );
  });
});

// Helper function for integration test delays
const waitForIntegration = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
