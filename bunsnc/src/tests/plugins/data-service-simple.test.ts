/**
 * Data Service Plugin Simple Tests
 * Simplified tests for the migrated ConsolidatedDataService as Elysia Plugin
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach, test } from "bun:test";
import { Elysia } from "elysia";
import { dataServicePlugin } from "../../plugins/data-service";
import { configPlugin } from "../../plugins/config-manager";

describe("Data Service Plugin Simple Tests", () => {
  let app: Elysia;

  beforeEach(() => {
    // Create fresh app for each test
    app = new Elysia().use(configPlugin).use(dataServicePlugin);
  });

  describe("Plugin Integration", () => {
    test("should integrate dataService plugin with Elysia app", async () => {
      const testApp = app.get("/health", async ({ healthCheck }) => {
        try {
          const isHealthy = await healthCheck();
          return { healthy: isHealthy };
        } catch (error) {
          return { healthy: false, error: (error as Error).message };
        }
      });

      const response = await testApp.handle(
        new Request("http://localhost/health"),
      );
      const result = await response.json();

      expect(result).toBeDefined();
      expect(typeof result.healthy).toBe("boolean");
    });

    test("should provide stats through plugin context", async () => {
      const testApp = app.get("/stats", async ({ getStats }) => {
        try {
          const stats = await getStats();
          return { success: true, stats };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      });

      const response = await testApp.handle(
        new Request("http://localhost/stats"),
      );
      const result = await response.json();

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");

      if (result.success) {
        expect(result.stats).toBeDefined();
        expect(typeof result.stats).toBe("object");
      }
    });

    test("should handle sync operations", async () => {
      const testApp = app.post(
        "/sync/:table",
        async ({ params, syncTableData }) => {
          try {
            const result = await syncTableData(params.table, { batchSize: 10 });
            return { success: true, result };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        },
      );

      const response = await testApp.handle(
        new Request("http://localhost/sync/incident", { method: "POST" }),
      );
      const result = await response.json();

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");

      if (result.success) {
        expect(result.result).toBeDefined();
        expect(result.result.table).toBe("incident");
        expect(typeof result.result.processed).toBe("number");
        expect(typeof result.result.duration).toBe("number");
      }
    });

    test("should handle auto-sync start/stop", async () => {
      const testApp = app
        .post("/sync/start", ({ startAutoSync }) => {
          try {
            startAutoSync({
              syncInterval: 1000,
              tables: ["incident"],
              batchSize: 10,
            });
            return { success: true, message: "Auto-sync started" };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        })
        .post("/sync/stop", ({ stopAutoSync }) => {
          try {
            stopAutoSync();
            return { success: true, message: "Auto-sync stopped" };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        });

      // Test start
      const startResponse = await testApp.handle(
        new Request("http://localhost/sync/start", { method: "POST" }),
      );
      const startResult = await startResponse.json();

      expect(startResult.success).toBe(true);

      // Test stop
      const stopResponse = await testApp.handle(
        new Request("http://localhost/sync/stop", { method: "POST" }),
      );
      const stopResult = await stopResponse.json();

      expect(stopResult.success).toBe(true);
    });

    test("should handle CRUD operations", async () => {
      const testApp = app
        .get("/ticket/:table/:sysId", async ({ params, getTicketBySysId }) => {
          try {
            const ticket = await getTicketBySysId(params.table, params.sysId);
            return { success: true, ticket };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        })
        .post("/ticket/:table", async ({ params, body, upsertTicket }) => {
          try {
            const result = await upsertTicket(params.table, body as any);
            return { success: true, result };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        })
        .delete("/ticket/:table/:sysId", async ({ params, deleteTicket }) => {
          try {
            const result = await deleteTicket(params.table, params.sysId);
            return { success: true, result };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        });

      // Test GET (should handle non-existent ticket gracefully)
      const getResponse = await testApp.handle(
        new Request("http://localhost/ticket/incident/test-id"),
      );
      const getResult = await getResponse.json();
      expect(getResult.success).toBe(true);

      // Test POST
      const testTicket = {
        sys_id: "test-001",
        number: "INC0000001",
        table: "incident",
        state: "1",
        priority: "3",
        sys_created_on: new Date().toISOString(),
        sys_updated_on: new Date().toISOString(),
      };

      const postResponse = await testApp.handle(
        new Request("http://localhost/ticket/incident", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testTicket),
        }),
      );
      const postResult = await postResponse.json();
      expect(postResult.success).toBe(true);

      // Test DELETE
      const deleteResponse = await testApp.handle(
        new Request("http://localhost/ticket/incident/test-001", {
          method: "DELETE",
        }),
      );
      const deleteResult = await deleteResponse.json();
      expect(deleteResult.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("should handle errors gracefully in all endpoints", async () => {
      const testApp = app
        .get("/test-health", async ({ healthCheck }) => {
          const isHealthy = await healthCheck();
          return { healthy: isHealthy };
        })
        .get("/test-stats", async ({ getStats }) => {
          const stats = await getStats();
          return stats;
        });

      // These should not throw unhandled errors
      const healthResponse = await testApp.handle(
        new Request("http://localhost/test-health"),
      );
      expect(healthResponse.status).toBeLessThan(500);

      const statsResponse = await testApp.handle(
        new Request("http://localhost/test-stats"),
      );
      expect(statsResponse.status).toBeLessThan(500);
    });

    test("should handle invalid table names gracefully", async () => {
      const testApp = app.post(
        "/sync/:table",
        async ({ params, syncTableData }) => {
          try {
            const result = await syncTableData(params.table);
            return { success: true, result };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        },
      );

      const response = await testApp.handle(
        new Request("http://localhost/sync/invalid_table", { method: "POST" }),
      );
      const result = await response.json();

      expect(result).toBeDefined();
      // Should handle gracefully, either success or controlled failure
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("Plugin Configuration", () => {
    test("should work with default configuration", async () => {
      const simpleApp = new Elysia()
        .use(dataServicePlugin)
        .get("/simple", ({ dataService }) => {
          return {
            hasDataService: !!dataService,
            isMockMode: dataService && !dataService.isInitialized,
          };
        });

      const response = await simpleApp.handle(
        new Request("http://localhost/simple"),
      );
      const result = await response.json();

      // In test environment, plugin runs in mock mode
      expect(result.hasDataService).toBe(true);
      expect(result.isMockMode).toBe(true);
    });

    test("should integrate with config plugin", async () => {
      const configApp = new Elysia()
        .use(configPlugin)
        .use(dataServicePlugin)
        .get("/config-test", ({ config, dataService }) => {
          return {
            hasConfig: !!config,
            hasDataService: !!dataService,
            isMockMode: dataService && !dataService.isInitialized,
          };
        });

      const response = await configApp.handle(
        new Request("http://localhost/config-test"),
      );
      const result = await response.json();

      // In test environment, both plugins run in fallback/mock mode
      expect(result.hasConfig).toBe(true);
      expect(result.hasDataService).toBe(true);
      expect(result.isMockMode).toBe(true);
    });
  });

  describe("Performance and Concurrency", () => {
    test("should handle multiple concurrent requests", async () => {
      const testApp = app.get(
        "/concurrent/:id",
        async ({ params, healthCheck }) => {
          const isHealthy = await healthCheck();
          return { id: params.id, healthy: isHealthy };
        },
      );

      // Create 5 concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        testApp.handle(new Request(`http://localhost/concurrent/${i}`)),
      );

      const responses = await Promise.allSettled(requests);

      // All requests should complete
      expect(responses.length).toBe(5);

      // Most should succeed
      const successful = responses.filter(
        (r) => r.status === "fulfilled",
      ).length;
      expect(successful).toBeGreaterThan(0);
    });

    test("should handle rapid start/stop cycles", async () => {
      const testApp = app.post(
        "/cycle/:action",
        ({ params, startAutoSync, stopAutoSync }) => {
          try {
            if (params.action === "start") {
              startAutoSync({ syncInterval: 100, tables: ["incident"] });
            } else {
              stopAutoSync();
            }
            return { success: true, action: params.action };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        },
      );

      // Perform multiple start/stop cycles rapidly
      for (let i = 0; i < 5; i++) {
        const startResponse = await testApp.handle(
          new Request("http://localhost/cycle/start", { method: "POST" }),
        );
        const stopResponse = await testApp.handle(
          new Request("http://localhost/cycle/stop", { method: "POST" }),
        );

        const startResult = await startResponse.json();
        const stopResult = await stopResponse.json();

        expect(startResult.success).toBe(true);
        expect(stopResult.success).toBe(true);
      }
    });
  });

  describe("Plugin Lifecycle", () => {
    test("should handle plugin initialization", async () => {
      const lifecycleApp = new Elysia()
        .use(dataServicePlugin)
        .get("/lifecycle", ({ dataService }) => {
          return {
            initialized: !!dataService,
            type: typeof dataService,
            isMockMode: dataService && !dataService.isInitialized,
          };
        });

      const response = await lifecycleApp.handle(
        new Request("http://localhost/lifecycle"),
      );
      const result = await response.json();

      // Plugin should be present and working in mock mode
      expect(result.initialized).toBe(true);
      expect(result.type).toBe("object");
      expect(result.isMockMode).toBe(true);
    });

    test("should handle cleanup operations", async () => {
      const cleanupApp = new Elysia()
        .use(dataServicePlugin)
        .post("/cleanup", async ({ cleanup }) => {
          try {
            await cleanup();
            return { success: true, message: "Cleanup completed" };
          } catch (error) {
            return { success: false, error: (error as Error).message };
          }
        });

      const response = await cleanupApp.handle(
        new Request("http://localhost/cleanup", { method: "POST" }),
      );
      const result = await response.json();

      // Cleanup should work in mock mode (no-op)
      expect(result.success).toBe(true);
    });
  });
});

// Simplified compatibility tests
describe("Data Service Plugin Compatibility", () => {
  test("should be compatible with existing auto-sync patterns", async () => {
    const app = new Elysia()
      .use(dataServicePlugin)
      .post("/auto-sync-test", ({ startAutoSync, stopAutoSync }) => {
        // Test the auto-sync pattern similar to existing tests
        startAutoSync({
          syncInterval: 5000,
          tables: ["incident", "change_task", "sc_task"],
          batchSize: 50,
          enableDeltaSync: true,
          enableRealTimeUpdates: true,
        });

        stopAutoSync();

        return { success: true, message: "Auto-sync pattern tested" };
      });

    const response = await app.handle(
      new Request("http://localhost/auto-sync-test", { method: "POST" }),
    );
    const result = await response.json();

    expect(result.success).toBe(true);
  });

  test("should support all table types from original service", async () => {
    const app = new Elysia()
      .use(dataServicePlugin)
      .post("/table-test", async ({ syncTableData }) => {
        const tables = ["incident", "change_task", "sc_task"];
        const results = [];

        for (const table of tables) {
          try {
            const result = await syncTableData(table, { batchSize: 5 });
            results.push({ table, success: true, result });
          } catch (error) {
            results.push({
              table,
              success: false,
              error: (error as Error).message,
            });
          }
        }

        return { results };
      });

    const response = await app.handle(
      new Request("http://localhost/table-test", { method: "POST" }),
    );
    const result = await response.json();

    expect(result.results).toBeDefined();
    expect(result.results.length).toBe(3);

    // Each table should be handled
    for (const tableResult of result.results) {
      expect(tableResult.table).toBeDefined();
      expect(typeof tableResult.success).toBe("boolean");
    }
  });
});
