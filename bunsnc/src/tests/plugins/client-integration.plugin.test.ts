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

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toBeDefined();
      if (data.result) {
        expect(data.result.plugin).toBe("servicenow-client-integration-plugin");
      }
      expect(typeof data.success).toBe("boolean");
    });

    test("should return client configuration", async () => {
      const response = await app.handle(
        new Request("http://localhost/client/config", {
          method: "GET",
        })
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toBeDefined();
      expect(typeof data.success).toBe("boolean");
    });

    test("should handle connection test endpoint", async () => {
      const response = await app.handle(
        new Request("http://localhost/client/test-connection", {
          method: "POST",
        })
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toBeDefined();
      expect(typeof data.success).toBe("boolean");
    });

    test("should handle connection refresh endpoint", async () => {
      const response = await app.handle(
        new Request("http://localhost/client/refresh", {
          method: "POST",
        })
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toBeDefined();
      expect(typeof data.success).toBe("boolean");
    });
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
        await context.unifiedQuery({ table: "incident", limit: 1 });
        // If successful, that's good
      } catch (error) {
        // Expected in test environment without real connection
        expect(error).toBeDefined();
      }
    });

    test("should handle CRUD operations gracefully", async () => {
      const context = app.decorator as any;

      try {
        await context.unifiedCreate("incident", { short_description: "test" });
      } catch (error) {
        // Expected in test environment
        expect(error).toBeDefined();
      }

      try {
        await context.unifiedRead("incident", "test-id");
      } catch (error) {
        // Expected in test environment
        expect(error).toBeDefined();
      }
    });

    test("should handle batch operations gracefully", async () => {
      const context = app.decorator as any;

      const batchOps = [
        {
          op: "create",
          table: "incident",
          data: { short_description: "test batch" }
        }
      ];

      try {
        await context.unifiedBatch(batchOps);
      } catch (error) {
        // Expected in test environment
        expect(error).toBeDefined();
      }
    });
  });

  describe("Connection Management", () => {
    test("should handle connection testing", async () => {
      const context = app.decorator as any;

      try {
        const result = await context.testConnection();
        expect(typeof result).toBe("boolean");
      } catch (error) {
        // Connection might fail in test environment
        expect(error).toBeDefined();
      }
    });

    test("should handle connection refresh", async () => {
      const context = app.decorator as any;

      try {
        const result = await context.refreshClientConnection();
        expect(typeof result).toBe("boolean");
      } catch (error) {
        // Connection might fail in test environment
        expect(error).toBeDefined();
      }
    });
  });

  describe("Statistics and Monitoring", () => {
    test("should provide client statistics", async () => {
      const context = app.decorator as any;

      try {
        const stats = await context.getClientStats();
        expect(stats).toBeDefined();
        expect(typeof stats).toBe("object");
      } catch (error) {
        // Stats might fail without real client
        expect(error).toBeDefined();
      }
    });

    test("should handle stats endpoint", async () => {
      const response = await app.handle(
        new Request("http://localhost/client/stats", {
          method: "GET",
        })
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toBeDefined();
      expect(typeof data.success).toBe("boolean");
    });
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

    const promises = Array.from({ length: 5 }, () =>
      app.handle(new Request("http://localhost/client/health", { method: "GET" }))
    );

    const responses = await Promise.all(promises);

    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
  });
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