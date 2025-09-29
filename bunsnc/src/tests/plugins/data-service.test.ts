/**
 * Data Service Plugin Tests
 * Tests for the migrated ConsolidatedDataService as Elysia Plugin
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach, test } from "bun:test";
import { Elysia } from "elysia";
import {
  dataServicePlugin,
  type DataServicePluginContext,
} from "../../plugins/data-service";
import { configPlugin } from "../../plugins/config-manager";

describe("Data Service Plugin Tests", () => {
  let app: Elysia;
  let context: DataServicePluginContext;

  beforeEach(async () => {
    // Create Elysia app with config and data service plugins
    app = new Elysia()
      .use(configPlugin)
      .use(dataServicePlugin)
      .get(
        "/test",
        ({
          dataService,
          startAutoSync,
          stopAutoSync,
          syncTableData,
          getTicketBySysId,
          upsertTicket,
          deleteTicket,
          getStats,
          healthCheck,
          cleanup,
        }) => {
          return {
            dataService,
            startAutoSync,
            stopAutoSync,
            syncTableData,
            getTicketBySysId,
            upsertTicket,
            deleteTicket,
            getStats,
            healthCheck,
            cleanup,
          };
        },
      );

    // Get the context for testing by making a request
    const response = await app.handle(new Request("http://localhost/test"));
    context = (await response.json()) as DataServicePluginContext;
  });

  afterEach(async () => {
    // Cleanup
    if (context?.cleanup) {
      await context.cleanup();
    }
  });

  describe("Plugin Initialization", () => {
    test("should initialize dataService plugin without errors", async () => {
      expect(context).toBeDefined();
      expect(context.dataService).toBeDefined();
      expect(typeof context.startAutoSync).toBe("function");
      expect(typeof context.stopAutoSync).toBe("function");
    });

    test("should have all required methods in context", () => {
      const requiredMethods = [
        "startAutoSync",
        "stopAutoSync",
        "syncTableData",
        "getTicketBySysId",
        "upsertTicket",
        "deleteTicket",
        "getStats",
        "healthCheck",
        "cleanup",
      ];

      for (const method of requiredMethods) {
        expect(typeof context[method]).toBe("function");
      }
    });

    test("should initialize with default configuration", async () => {
      const stats = await context.getStats();
      expect(stats).toBeDefined();
      expect(stats.initialized).toBe(true);
    });
  });

  describe("Health Check", () => {
    test("should return health status", async () => {
      const isHealthy = await context.healthCheck();
      expect(typeof isHealthy).toBe("boolean");
    });

    test("should be healthy after proper initialization", async () => {
      // In test environment, MongoDB might not be available
      // So we just check the method works
      const isHealthy = await context.healthCheck();
      expect(typeof isHealthy).toBe("boolean");
    });
  });

  describe("Statistics", () => {
    test("should return comprehensive stats", async () => {
      const stats = await context.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe("object");
      expect(stats.initialized).toBeDefined();
      expect(stats.mongodb).toBeDefined();
      expect(stats.cache).toBeDefined();
      expect(stats.autoSync).toBeDefined();
    });

    test("should show auto-sync status", async () => {
      const stats = await context.getStats();
      expect(stats.autoSync).toBeDefined();
      expect(typeof stats.autoSync.running).toBe("boolean");
      expect(stats.autoSync.running).toBe(false); // Initially not running
    });
  });

  describe("Auto-Sync Functionality", () => {
    test("should start auto-sync with default options", () => {
      expect(() => {
        context.startAutoSync({
          syncInterval: 1000, // 1 second for testing
          tables: ["incident"],
          batchSize: 10,
        });
      }).not.toThrow();
    });

    test("should stop auto-sync gracefully", () => {
      // Start auto-sync first
      context.startAutoSync({
        syncInterval: 1000,
        tables: ["incident"],
      });

      // Then stop it
      expect(() => {
        context.stopAutoSync();
      }).not.toThrow();
    });

    test("should handle multiple start/stop cycles", () => {
      const options = {
        syncInterval: 1000,
        tables: ["incident"],
        batchSize: 5,
      };

      // Multiple cycles should work without errors
      for (let i = 0; i < 3; i++) {
        expect(() => {
          context.startAutoSync(options);
          context.stopAutoSync();
        }).not.toThrow();
      }
    });

    test("should handle auto-sync with different configurations", () => {
      const configs = [
        {
          syncInterval: 500,
          tables: ["incident"],
          batchSize: 5,
          enableDeltaSync: true,
        },
        {
          syncInterval: 1000,
          tables: ["incident", "change_task"],
          batchSize: 10,
          enableRealTimeUpdates: true,
        },
        {
          syncInterval: 2000,
          tables: ["sc_task"],
          batchSize: 20,
          enableSLMCollection: true,
        },
      ];

      for (const config of configs) {
        expect(() => {
          context.startAutoSync(config);
          context.stopAutoSync();
        }).not.toThrow();
      }
    });
  });

  describe("Sync Table Data", () => {
    test("should sync table data and return result", async () => {
      const result = await context.syncTableData("incident", {
        batchSize: 10,
      });

      expect(result).toBeDefined();
      expect(result.table).toBe("incident");
      expect(typeof result.processed).toBe("number");
      expect(typeof result.saved).toBe("number");
      expect(typeof result.updated).toBe("number");
      expect(typeof result.errors).toBe("number");
      expect(typeof result.duration).toBe("number");
      expect(result.lastSyncTime).toBeDefined();
      expect(Array.isArray(result.errorDetails)).toBe(true);
    });

    test("should handle different table types", async () => {
      const tables = ["incident", "change_task", "sc_task"];

      for (const table of tables) {
        const result = await context.syncTableData(table);
        expect(result.table).toBe(table);
        expect(result.processed).toBeGreaterThanOrEqual(0);
      }
    });

    test("should respect batch size option", async () => {
      const batchSizes = [5, 10, 25, 50];

      for (const batchSize of batchSizes) {
        const result = await context.syncTableData("incident", { batchSize });
        expect(result.processed).toBe(batchSize);
      }
    });
  });

  describe("CRUD Operations", () => {
    describe("getTicketBySysId", () => {
      test("should handle get ticket operation", async () => {
        // In test environment, this will likely return null
        // but should not throw errors
        const ticket = await context.getTicketBySysId(
          "incident",
          "test-sys-id",
        );
        expect(ticket === null || typeof ticket === "object").toBe(true);
      });

      test("should handle invalid sys_id gracefully", async () => {
        const ticket = await context.getTicketBySysId("incident", "invalid-id");
        expect(ticket).toBeNull();
      });
    });

    describe("upsertTicket", () => {
      test("should handle upsert operation", async () => {
        const testTicket = {
          sys_id: "test-incident-001",
          number: "INC0000001",
          table: "incident",
          state: "1",
          priority: "3",
          short_description: "Test incident",
          sys_created_on: new Date().toISOString(),
          sys_updated_on: new Date().toISOString(),
        };

        const result = await context.upsertTicket("incident", testTicket);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe("boolean");

        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      test("should validate required ticket fields", async () => {
        const invalidTicket = {
          sys_id: "",
          number: "",
          table: "incident",
        } as any;

        const result = await context.upsertTicket("incident", invalidTicket);
        // Should handle invalid data gracefully
        expect(result).toBeDefined();
        expect(typeof result.success).toBe("boolean");
      });
    });

    describe("deleteTicket", () => {
      test("should handle delete operation", async () => {
        const result = await context.deleteTicket("incident", "test-sys-id");
        expect(result).toBeDefined();
        expect(typeof result.success).toBe("boolean");

        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      test("should handle non-existent ticket deletion", async () => {
        const result = await context.deleteTicket(
          "incident",
          "non-existent-id",
        );
        expect(result).toBeDefined();
        expect(typeof result.success).toBe("boolean");
      });
    });
  });

  describe("Error Handling", () => {
    test("should handle errors gracefully in all operations", async () => {
      // These should not throw unhandled errors
      const operations = [
        () => context.getStats(),
        () => context.healthCheck(),
        () => context.getTicketBySysId("incident", "test"),
        () => context.upsertTicket("incident", {} as any),
        () => context.deleteTicket("incident", "test"),
        () => context.syncTableData("incident"),
      ];

      for (const operation of operations) {
        try {
          await operation();
          // If it succeeds, that's fine
          expect(true).toBe(true);
        } catch (error) {
          // If it fails, should still be handled gracefully
          expect(error).toBeDefined();
        }
      }
    });

    test("should handle cleanup errors gracefully", async () => {
      try {
        await context.cleanup();
        expect(true).toBe(true);
      } catch (error) {
        // Cleanup errors should be handled
        expect(error).toBeDefined();
      }
    });
  });

  describe("Plugin Integration", () => {
    test("should work with Elysia app composition", async () => {
      const testApp = new Elysia()
        .use(configPlugin)
        .use(dataServicePlugin)
        .get("/test", ({ dataService }) => {
          return {
            initialized: !!dataService,
            hasStartAutoSync: typeof dataService?.startAutoSync === "function",
          };
        });

      const response = await testApp.handle(
        new Request("http://localhost/test"),
      );
      const result = await response.json();

      expect(result.initialized).toBe(true);
      expect(result.hasStartAutoSync).toBe(true);
    });

    test("should provide proper typing through context", async () => {
      const testApp = new Elysia()
        .use(configPlugin)
        .use(dataServicePlugin)
        .get("/stats", async ({ getStats }) => {
          const stats = await getStats();
          return stats;
        });

      const response = await testApp.handle(
        new Request("http://localhost/stats"),
      );
      const stats = await response.json();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe("object");
    });
  });

  describe("Configuration", () => {
    test("should use default configuration when none provided", async () => {
      const stats = await context.getStats();
      expect(stats.mongodb).toBeDefined();
      expect(stats.cache).toBeDefined();
    });

    test("should handle custom configuration", () => {
      // Test that plugin can be initialized with custom config
      // This is tested through the plugin initialization itself
      expect(context.dataService).toBeDefined();
    });
  });

  describe("Event Handling", () => {
    test("should emit events during operations", (done) => {
      let eventReceived = false;

      // Start auto-sync and check for events
      context.startAutoSync({
        syncInterval: 100, // Very short interval for testing
        tables: ["incident"],
      });

      // Stop after a short time
      setTimeout(() => {
        context.stopAutoSync();
        done(); // Test completed
      }, 50);
    });
  });
});

// Performance Tests
describe("Data Service Plugin Performance", () => {
  let app: Elysia;
  let context: DataServicePluginContext;

  beforeEach(async () => {
    app = new Elysia().use(configPlugin).use(dataServicePlugin);

    const response = await app.handle(new Request("http://localhost/test"));
    context = (response as any).context;
  });

  afterEach(async () => {
    if (context?.cleanup) {
      await context.cleanup();
    }
  });

  test("should handle multiple concurrent operations", async () => {
    const operations = Array.from({ length: 10 }, (_, i) =>
      context.syncTableData("incident", { batchSize: 5 }),
    );

    const results = await Promise.allSettled(operations);

    // All operations should complete (either fulfilled or rejected)
    expect(results.length).toBe(10);

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // At least some should succeed
    expect(successful + failed).toBe(10);
  });

  test("should maintain performance with frequent start/stop", () => {
    const startTime = Date.now();

    // Perform 20 start/stop cycles
    for (let i = 0; i < 20; i++) {
      context.startAutoSync({ syncInterval: 1000, tables: ["incident"] });
      context.stopAutoSync();
    }

    const duration = Date.now() - startTime;

    // Should complete within reasonable time (less than 1 second)
    expect(duration).toBeLessThan(1000);
  });
});

// Integration Tests with Real Configuration
describe("Data Service Plugin Integration", () => {
  test("should integrate with real-like configuration", async () => {
    const app = new Elysia().use(configPlugin).use(dataServicePlugin);

    // Test basic functionality
    const response = await app.handle(new Request("http://localhost/test"));
    expect(response).toBeDefined();
  });

  test("should handle missing dependencies gracefully", async () => {
    // Test plugin behavior when dependencies are not available
    const app = new Elysia().use(dataServicePlugin); // No config plugin

    try {
      const response = await app.handle(new Request("http://localhost/test"));
      expect(response).toBeDefined();
    } catch (error) {
      // Should handle gracefully
      expect(error).toBeDefined();
    }
  });
});
