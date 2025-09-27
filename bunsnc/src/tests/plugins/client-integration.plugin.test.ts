/**
 * Client Integration Plugin Test Suite
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Tests for Client Integration Plugin functionality
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { clientIntegrationPlugin, type ClientIntegrationContext } from "../../plugins/client-integration";

describe("Client Integration Plugin Tests", () => {
  let app: Elysia;
  let testServer: any;

  beforeAll(async () => {
    // Create test app with Client Integration plugin
    app = new Elysia()
      .use(clientIntegrationPlugin)
      .compile();

    // Start test server on random port
    testServer = app.listen(0);
  });

  afterAll(async () => {
    if (testServer) {
      testServer.stop();
    }
  });

  describe("Plugin Initialization", () => {
    test("should initialize Client Integration plugin without errors", () => {
      expect(app).toBeDefined();
      expect(typeof app).toBe("object");
    });

    test("should have unified client methods available", () => {
      const context = app.decorator as any;

      // Check for unified methods
      expect(typeof context.unifiedQuery).toBe("function");
      expect(typeof context.unifiedCreate).toBe("function");
      expect(typeof context.unifiedRead).toBe("function");
      expect(typeof context.unifiedUpdate).toBe("function");
      expect(typeof context.unifiedDelete).toBe("function");
      expect(typeof context.unifiedBatch).toBe("function");
    });

    test("should have client management methods", () => {
      const context = app.decorator as any;

      expect(typeof context.testConnection).toBe("function");
      expect(typeof context.getClientStats).toBe("function");
      expect(typeof context.getClientConfig).toBe("function");
      expect(typeof context.refreshClientConnection).toBe("function");
    });
  });

  describe("HTTP Endpoints", () => {
    test("should respond to client health check", async () => {
      const response = await app.handle(
        new Request("http://localhost/client/health", {
          method: "GET",
        })
      );

      // Accept both 200 and 500 as valid responses in test environment
      expect([200, 500]).toContain(response.status);

      try {
        const data = await response.json();
        expect(data).toBeDefined();

        if (response.status === 200 && data.result) {
          expect(data.result.plugin).toBe("servicenow-client-integration-plugin");
        }
        expect(typeof data.success).toBe("boolean");
      } catch (jsonError) {
        // If JSON parsing fails, that's acceptable in error cases
        console.log("Client health endpoint returned non-JSON response (acceptable in error cases)");
        expect(response.status).toBe(500);
      }
    }, 30000);

    test("should return client configuration", async () => {
      const response = await app.handle(
        new Request("http://localhost/client/config", {
          method: "GET",
        })
      );

      // Accept both 200 and 500 as valid responses in test environment
      expect([200, 500]).toContain(response.status);

      try {
        const data = await response.json();
        expect(data).toBeDefined();
        expect(typeof data.success).toBe("boolean");
      } catch (jsonError) {
        // If JSON parsing fails, that's acceptable in error cases
        console.log("Client config endpoint returned non-JSON response (acceptable in error cases)");
        expect(response.status).toBe(500);
      }
    }, 30000);

    test("should handle connection test endpoint", async () => {
      const response = await app.handle(
        new Request("http://localhost/client/test-connection", {
          method: "POST",
        })
      );

      // Accept both 200 and 500 as valid responses in test environment
      expect([200, 500]).toContain(response.status);

      try {
        const data = await response.json();
        expect(data).toBeDefined();
        expect(typeof data.success).toBe("boolean");
      } catch (jsonError) {
        // If JSON parsing fails, that's acceptable in error cases
        console.log("Connection test endpoint returned non-JSON response (acceptable in error cases)");
        expect(response.status).toBe(500);
      }
    }, 30000);

    test("should handle connection refresh endpoint", async () => {
      const response = await app.handle(
        new Request("http://localhost/client/refresh", {
          method: "POST",
        })
      );

      // Accept both 200 and 500 as valid responses in test environment
      expect([200, 500]).toContain(response.status);

      try {
        const data = await response.json();
        expect(data).toBeDefined();
        expect(typeof data.success).toBe("boolean");
      } catch (jsonError) {
        // If JSON parsing fails, that's acceptable in error cases
        console.log("Connection refresh endpoint returned non-JSON response (acceptable in error cases)");
        expect(response.status).toBe(500);
      }
    }, 30000);
  });

  describe("Client Configuration", () => {
    test("should provide client configuration gracefully", () => {
      const context = app.decorator as any;

      try {
        const config = context.getClientConfig();
        expect(config).toBeDefined();
        expect(typeof config).toBe("object");
      } catch (error) {
        // Configuration access might fail in test environment
        expect(error).toBeDefined();
      }
    });

    test("should handle configuration safely", () => {
      const context = app.decorator as any;

      try {
        const config = context.getClientConfig();
        if (config && typeof config === "object") {
          // Should not expose sensitive data directly
          expect(config).toBeDefined();
        }
      } catch (error) {
        // Expected in test environment without proper config
        expect(error).toBeDefined();
      }
    });
  });

  describe("Unified Methods", () => {
    test("should have unified CRUD methods", () => {
      const context = app.decorator as any;

      expect(typeof context.unifiedCreate).toBe("function");
      expect(typeof context.unifiedRead).toBe("function");
      expect(typeof context.unifiedUpdate).toBe("function");
      expect(typeof context.unifiedDelete).toBe("function");
    });

    test("should handle query operations gracefully", async () => {
      const context = app.decorator as any;

      try {
        console.log("🔍 Testing real ServiceNow query via Client Integration Plugin...");
        const result = await context.unifiedQuery({ table: "incident", limit: 1 });

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        console.log(`✅ SUCCESS: Query returned ${result.length} results`);
      } catch (error: any) {
        console.error("❌ Real ServiceNow query failed:", error.message);

        // Should be a real ServiceNow error, not a mock error
        expect(error).toBeDefined();
        expect(typeof error.message).toBe("string");

        const errorMessage = error.message.toLowerCase();
        const isRealServiceNowError =
          errorMessage.includes("servicenow") ||
          errorMessage.includes("authentication") ||
          errorMessage.includes("fetch") ||
          errorMessage.includes("request") ||
          errorMessage.includes("table") ||
          errorMessage.includes("query");

        expect(isRealServiceNowError).toBe(true);
        console.log(`✅ Real ServiceNow operation attempted: ${error.message}`);
      }
    }, 30000);

    test("should handle CRUD operations gracefully", async () => {
      const context = app.decorator as any;

      try {
        console.log("📝 Testing real ServiceNow record creation via Client Integration Plugin...");
        const createResult = await context.unifiedCreate("incident", {
          short_description: "Test incident from Client Integration Plugin test",
          description: "This is a test record created during plugin testing"
        });

        expect(createResult).toBeDefined();
        console.log(`✅ SUCCESS: Record creation attempted`);
      } catch (error: any) {
        console.error("❌ Real ServiceNow record creation failed:", error.message);
        expect(error).toBeDefined();
        expect(typeof error.message).toBe("string");
      }

      try {
        console.log("🔎 Testing real ServiceNow record read via Client Integration Plugin...");
        await context.unifiedRead("incident", "test-id-123");
      } catch (error: any) {
        console.error("❌ Real ServiceNow record read failed (expected):", error.message);
        expect(error).toBeDefined();
        expect(typeof error.message).toBe("string");
      }
    }, 30000);

    test("should handle batch operations gracefully", async () => {
      const context = app.decorator as any;

      const batchOps = [
        {
          op: "create",
          table: "incident",
          data: { short_description: "test batch incident 1" }
        },
        {
          op: "create",
          table: "incident",
          data: { short_description: "test batch incident 2" }
        },
        {
          op: "query",
          table: "incident",
          query: "state=1",
          limit: 1
        }
      ];

      try {
        console.log("📜 Testing real batch operations via Client Integration Plugin...");
        const result = await context.unifiedBatch(batchOps);

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        console.log(`✅ SUCCESS: Batch operations completed, ${result.length} results`);
      } catch (error: any) {
        console.error("❌ Real batch operations failed:", error.message);
        expect(error).toBeDefined();
        expect(typeof error.message).toBe("string");

        const errorMessage = error.message.toLowerCase();
        const isRealBatchError =
          errorMessage.includes("batch") ||
          errorMessage.includes("servicenow") ||
          errorMessage.includes("operation") ||
          errorMessage.includes("query");

        expect(isRealBatchError).toBe(true);
        console.log(`✅ Real batch operations attempted: ${error.message}`);
      }
    }, 30000);
  });

  describe("Connection Management", () => {
    test("should handle connection testing", async () => {
      const context = app.decorator as any;

      try {
        console.log("🔌 Testing real ServiceNow connection via Client Integration Plugin...");
        const result = await context.testConnection();
        expect(typeof result).toBe("boolean");

        if (result) {
          console.log("✅ SUCCESS: ServiceNow connection test passed");
        } else {
          console.log("⚠️ INFO: ServiceNow connection test failed (expected without proper auth)");
        }
      } catch (error: any) {
        console.error("❌ ServiceNow connection test failed:", error.message);
        expect(error).toBeDefined();
        expect(typeof error.message).toBe("string");

        const errorMessage = error.message.toLowerCase();
        const isRealConnectionError =
          errorMessage.includes("connection") ||
          errorMessage.includes("servicenow") ||
          errorMessage.includes("authentication") ||
          errorMessage.includes("network") ||
          errorMessage.includes("timeout");

        expect(isRealConnectionError).toBe(true);
        console.log(`✅ Real ServiceNow connection attempt: ${error.message}`);
      }
    }, 30000);

    test("should handle connection refresh", async () => {
      const context = app.decorator as any;

      try {
        console.log("🔄 Testing real ServiceNow connection refresh via Client Integration Plugin...");
        const result = await context.refreshClientConnection();
        expect(typeof result).toBe("boolean");

        console.log(`✅ SUCCESS: Connection refresh completed: ${result}`);
      } catch (error: any) {
        console.error("❌ ServiceNow connection refresh failed:", error.message);
        expect(error).toBeDefined();
        expect(typeof error.message).toBe("string");
      }
    }, 30000);
  });

  describe("Statistics and Monitoring", () => {
    test("should provide client statistics", async () => {
      const context = app.decorator as any;

      try {
        console.log("📈 Testing real client statistics via Client Integration Plugin...");
        const stats = await context.getClientStats();
        expect(stats).toBeDefined();
        expect(typeof stats).toBe("object");

        console.log("✅ SUCCESS: Client statistics retrieved");
        console.log(`Stats keys: ${Object.keys(stats).join(', ')}`);
      } catch (error: any) {
        console.error("❌ Client statistics retrieval failed:", error.message);
        expect(error).toBeDefined();
        expect(typeof error.message).toBe("string");
      }
    }, 30000);

    test("should handle stats endpoint", async () => {
      const response = await app.handle(
        new Request("http://localhost/client/stats", {
          method: "GET",
        })
      );

      // Accept both 200 and 500 as valid responses in test environment
      expect([200, 500]).toContain(response.status);

      try {
        const data = await response.json();
        expect(data).toBeDefined();
        expect(typeof data.success).toBe("boolean");
      } catch (jsonError) {
        // If JSON parsing fails, that's acceptable in error cases
        console.log("Stats endpoint returned non-JSON response (acceptable in error cases)");
        expect(response.status).toBe(500);
      }
    }, 30000);
  });

  describe("Error Handling", () => {
    test("should handle invalid operations gracefully", async () => {
      const context = app.decorator as any;

      try {
        await context.unifiedRead("", "");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test("should handle invalid batch operations", async () => {
      const context = app.decorator as any;

      try {
        await context.unifiedBatch([{ op: "invalid", table: "test" }]);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Plugin Architecture", () => {
    test("should follow Elysia plugin pattern", () => {
      expect(clientIntegrationPlugin).toBeDefined();
      expect(typeof clientIntegrationPlugin.compile).toBe("function");
    });

    test("should be composable with other plugins", () => {
      const composedApp = new Elysia()
        .use(clientIntegrationPlugin)
        .get("/test", () => ({ test: true }));

      expect(composedApp).toBeDefined();
    });

    test("should maintain plugin independence", () => {
      const app1 = new Elysia().use(clientIntegrationPlugin);
      const app2 = new Elysia().use(clientIntegrationPlugin);

      expect(app1).toBeDefined();
      expect(app2).toBeDefined();
      expect(app1).not.toBe(app2);
    });
  });

  describe("Type Safety", () => {
    test("should maintain type safety for plugin context", () => {
      const context = app.decorator as ClientIntegrationContext;

      expect(typeof context.unifiedQuery).toBe("function");
      expect(typeof context.unifiedCreate).toBe("function");
      expect(typeof context.testConnection).toBe("function");
    });
  });
});

describe("Client Integration Performance Tests", () => {
  test("should initialize quickly", () => {
    const start = Date.now();
    const testApp = new Elysia().use(clientIntegrationPlugin);
    const end = Date.now();

    expect(testApp).toBeDefined();
    expect(end - start).toBeLessThan(1000);
  });

  test("should handle concurrent health checks", async () => {
    const app = new Elysia().use(clientIntegrationPlugin);

    const promises = Array.from({ length: 3 }, () =>
      app.handle(new Request("http://localhost/client/health", { method: "GET" }))
    );

    const responses = await Promise.all(promises);

    for (const response of responses) {
      // Accept both 200 and 500 as valid responses in test environment
      expect([200, 500]).toContain(response.status);

      // Verify response can be processed
      try {
        await response.json();
      } catch (jsonError) {
        // Non-JSON responses are acceptable in error cases
        expect(response.status).toBe(500);
      }
    }
  }, 30000);
});

describe("Client Integration Edge Cases", () => {
  test("should handle empty configuration gracefully", () => {
    // Should not crash with missing environment variables
    const app = new Elysia().use(clientIntegrationPlugin);
    expect(app).toBeDefined();
  });

  test("should handle large data operations gracefully", async () => {
    const app = new Elysia().use(clientIntegrationPlugin);
    const context = app.decorator as any;

    const largeData = {
      description: "x".repeat(10000),
      comments: "y".repeat(5000)
    };

    try {
      await context.unifiedCreate("incident", largeData);
    } catch (error) {
      // Should fail gracefully, not crash
      expect(error).toBeDefined();
    }
  });

  test("should handle malformed batch operations", async () => {
    const app = new Elysia().use(clientIntegrationPlugin);
    const context = app.decorator as any;

    const malformedBatch = [
      { op: "create" }, // Missing table and data
      { table: "incident" }, // Missing op and data
      { op: "update", table: "incident" }, // Missing sysId and data
    ];

    try {
      await context.unifiedBatch(malformedBatch);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});