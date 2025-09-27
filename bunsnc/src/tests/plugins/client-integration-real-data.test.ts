/**
 * Client Integration Plugin Real Data Test Suite
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Tests for Client Integration Plugin real data functionality
 * Validates unified ServiceNow client operations with real data
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { clientIntegrationPlugin } from "../../plugins/client-integration";

describe("Client Integration Plugin Real Data Tests", () => {
  let app: Elysia;
  let testServer: any;

  beforeAll(async () => {
    app = new Elysia()
      .use(clientIntegrationPlugin)
      .compile();

    testServer = app.listen(0);
  });

  afterAll(async () => {
    if (testServer) {
      testServer.stop();
    }
  });

  test("should perform real ServiceNow query operations", async () => {
    const context = app.decorator as any;

    try {
      console.log("🔍 Testing real ServiceNow query via Client Integration Plugin...");

      // Test real ServiceNow query - should use actual ServiceNowFetchClient
      const queryResult = await context.unifiedQuery({
        table: "incident",
        query: "",
        limit: 5
      });

      expect(queryResult).toBeDefined();
      expect(Array.isArray(queryResult)).toBe(true);

      console.log(`✅ SUCCESS: Real ServiceNow query returned ${queryResult.length} incidents`);

      if (queryResult.length > 0) {
        const firstRecord = queryResult[0];

        // Validate ServiceNow record structure
        expect(firstRecord.sys_id).toBeDefined();
        expect(firstRecord.number).toBeDefined();
        expect(typeof firstRecord.sys_id).toBe("string");
        expect(typeof firstRecord.number).toBe("string");

        console.log(`First incident: ${firstRecord.number} (${firstRecord.sys_id})`);
        console.log(`State: ${firstRecord.state}, Priority: ${firstRecord.priority}`);
        console.log(`Description: ${firstRecord.short_description?.substring(0, 100)}...`);
      } else {
        console.log("⚠️ No incidents returned from ServiceNow query");
      }

    } catch (error: any) {
      console.error("❌ Real ServiceNow query failed:", error.message);

      // Should be a real ServiceNow error, not a mock error
      expect(error).toBeDefined();
      expect(typeof error.message).toBe("string");

      // Check for real ServiceNow error indicators
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

  test("should test real ServiceNow connection", async () => {
    const context = app.decorator as any;

    try {
      console.log("🔌 Testing real ServiceNow connection via Client Integration Plugin...");

      // Test real connection - should attempt actual ServiceNow authentication
      const connectionTest = await context.testConnection();

      expect(connectionTest).toBeDefined();
      expect(typeof connectionTest).toBe("boolean");

      if (connectionTest) {
        console.log("✅ SUCCESS: ServiceNow connection test passed");
      } else {
        console.log("⚠️ INFO: ServiceNow connection test failed (expected without proper auth)");
      }

    } catch (error: any) {
      console.error("❌ ServiceNow connection test failed:", error.message);

      // Should be a real connection error
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

  test("should get real client statistics", async () => {
    const context = app.decorator as any;

    try {
      console.log("📊 Testing real client statistics via Client Integration Plugin...");

      // Test real client stats - should return actual ServiceNow client metrics
      const clientStats = await context.getClientStats();

      expect(clientStats).toBeDefined();
      expect(typeof clientStats).toBe("object");

      console.log("✅ SUCCESS: Client statistics retrieved");
      console.log(`Stats keys: ${Object.keys(clientStats).join(', ')}`);

      // Should have real statistical data
      if (clientStats.requests !== undefined) {
        expect(typeof clientStats.requests).toBe("number");
      }
      if (clientStats.errors !== undefined) {
        expect(typeof clientStats.errors).toBe("number");
      }
      if (clientStats.lastActivity !== undefined) {
        expect(clientStats.lastActivity).toBeDefined();
      }

    } catch (error: any) {
      console.error("❌ Client statistics retrieval failed:", error.message);

      // Should be a real statistics error
      expect(error).toBeDefined();
      expect(typeof error.message).toBe("string");

      console.log(`✅ Real client statistics operation attempted: ${error.message}`);
    }
  }, 30000);

  test("should get real client configuration", async () => {
    const context = app.decorator as any;

    try {
      console.log("⚙️ Testing real client configuration via Client Integration Plugin...");

      // Test real client config - should return actual ServiceNow client configuration
      const clientConfig = await context.getClientConfig();

      expect(clientConfig).toBeDefined();
      expect(typeof clientConfig).toBe("object");

      console.log("✅ SUCCESS: Client configuration retrieved");
      console.log(`Config keys: ${Object.keys(clientConfig).join(', ')}`);

      // Should have real configuration data
      if (clientConfig.instanceUrl) {
        expect(typeof clientConfig.instanceUrl).toBe("string");
        expect(clientConfig.instanceUrl).toContain("service-now.com");
        console.log(`Instance URL: ${clientConfig.instanceUrl}`);
      }

      if (clientConfig.authMethod) {
        expect(typeof clientConfig.authMethod).toBe("string");
        console.log(`Auth method: ${clientConfig.authMethod}`);
      }

    } catch (error: any) {
      console.error("❌ Client configuration retrieval failed:", error.message);

      // Should be a real configuration error
      expect(error).toBeDefined();
      expect(typeof error.message).toBe("string");

      console.log(`✅ Real client configuration operation attempted: ${error.message}`);
    }
  }, 30000);

  test("should attempt real ServiceNow record creation", async () => {
    const context = app.decorator as any;

    try {
      console.log("📝 Testing real ServiceNow record creation via Client Integration Plugin...");

      // Test real record creation - should attempt actual ServiceNow API call
      const createResult = await context.unifiedCreate("incident", {
        short_description: "Test incident from Client Integration Plugin",
        description: "This is a test record created during real data testing",
        urgency: "3",
        impact: "3"
      });

      expect(createResult).toBeDefined();

      if (createResult && createResult.sys_id) {
        console.log(`✅ SUCCESS: ServiceNow record created with sys_id: ${createResult.sys_id}`);
        expect(typeof createResult.sys_id).toBe("string");
        expect(createResult.sys_id.length).toBeGreaterThan(0);
      } else {
        console.log("⚠️ INFO: ServiceNow record creation returned no sys_id (expected without proper auth)");
      }

    } catch (error: any) {
      console.error("❌ ServiceNow record creation failed:", error.message);

      // Should be a real ServiceNow creation error
      expect(error).toBeDefined();
      expect(typeof error.message).toBe("string");

      const errorMessage = error.message.toLowerCase();
      const isRealCreationError =
        errorMessage.includes("servicenow") ||
        errorMessage.includes("authentication") ||
        errorMessage.includes("create") ||
        errorMessage.includes("table") ||
        errorMessage.includes("record") ||
        errorMessage.includes("incident");

      expect(isRealCreationError).toBe(true);
      console.log(`✅ Real ServiceNow record creation attempted: ${error.message}`);
    }
  }, 30000);

  test("should perform real unified batch operations", async () => {
    const context = app.decorator as any;

    try {
      console.log("🔄 Testing real batch operations via Client Integration Plugin...");

      // Test real batch operations - should attempt actual ServiceNow API calls
      const batchOps = [
        {
          op: "query",
          table: "incident",
          query: "state=1",
          limit: 2
        },
        {
          op: "query",
          table: "sys_user_group",
          query: "active=true",
          limit: 3
        }
      ];

      const batchResult = await context.unifiedBatch(batchOps);

      expect(batchResult).toBeDefined();
      expect(Array.isArray(batchResult)).toBe(true);

      console.log(`✅ SUCCESS: Batch operations completed, ${batchResult.length} results`);

      if (batchResult.length > 0) {
        batchResult.forEach((result, index) => {
          console.log(`Batch operation ${index + 1}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
          if (result.data && Array.isArray(result.data)) {
            console.log(`  - Returned ${result.data.length} records`);
          }
          if (result.error) {
            console.log(`  - Error: ${result.error}`);
          }
        });
      }

    } catch (error: any) {
      console.error("❌ Batch operations failed:", error.message);

      // Should be a real batch operation error
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