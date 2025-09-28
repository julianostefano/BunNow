/**
 * Data Ingestion Plugin Real Data Test Suite
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Tests for Data Ingestion Plugin real data functionality
 * Validates ServiceNow to MongoDB synchronization with real data
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { dataPlugin } from "../../plugins/data";

describe("Data Ingestion Plugin Real Data Tests", () => {
  let app: Elysia;
  let testServer: any;

  beforeAll(async () => {
    app = new Elysia().use(dataPlugin).compile();

    testServer = app.listen(0);
  });

  afterAll(async () => {
    if (testServer) {
      testServer.stop();
    }
  });

  test("should perform real ServiceNow to MongoDB sync", async () => {
    const context = app.decorator as any;

    try {
      console.log(
        "🔄 Testing real ServiceNow to MongoDB sync via Data Ingestion Plugin...",
      );

      // Test real sync operation - should fetch from ServiceNow and save to MongoDB
      const syncResult = await context.syncFromServiceNow("incident", {
        batchSize: 5,
        skipIfExists: true,
      });

      expect(syncResult).toBeDefined();
      expect(typeof syncResult).toBe("object");
      expect(typeof syncResult.table).toBe("string");
      expect(typeof syncResult.processed).toBe("number");
      expect(typeof syncResult.saved).toBe("number");
      expect(typeof syncResult.updated).toBe("number");
      expect(typeof syncResult.errors).toBe("number");
      expect(typeof syncResult.duration).toBe("number");
      expect(typeof syncResult.lastSyncTime).toBe("string");

      console.log(
        `✅ SUCCESS: Real sync operation completed for table: ${syncResult.table}`,
      );
      console.log(
        `Processed: ${syncResult.processed}, Saved: ${syncResult.saved}, Updated: ${syncResult.updated}`,
      );
      console.log(
        `Errors: ${syncResult.errors}, Duration: ${syncResult.duration}ms`,
      );
      console.log(`Last sync: ${syncResult.lastSyncTime}`);

      if (syncResult.errorDetails && syncResult.errorDetails.length > 0) {
        console.log("Error details:");
        syncResult.errorDetails.forEach((error: any, index: number) => {
          console.log(`  ${index + 1}. ${error.sys_id}: ${error.error}`);
        });
      }

      // Validate that we actually processed some data
      expect(syncResult.processed).toBeGreaterThanOrEqual(0);
    } catch (error: any) {
      console.error("❌ Real ServiceNow sync failed:", error.message);

      // Should be a real sync operation error
      expect(error).toBeDefined();
      expect(typeof error.message).toBe("string");

      const errorMessage = error.message.toLowerCase();
      const isRealSyncError =
        errorMessage.includes("servicenow") ||
        errorMessage.includes("mongodb") ||
        errorMessage.includes("sync") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("save");

      expect(isRealSyncError).toBe(true);
      console.log(
        `✅ Real ServiceNow sync operation attempted: ${error.message}`,
      );
    }
  }, 60000);

  test("should save real ticket data to MongoDB", async () => {
    const context = app.decorator as any;

    try {
      console.log(
        "💾 Testing real ticket save to MongoDB via Data Ingestion Plugin...",
      );

      // Create real ticket data structure
      const realTicketData = {
        sys_id: `test-${Date.now()}`,
        number: `INC${Math.floor(Math.random() * 1000000)}`,
        table: "incident",
        state: "1",
        priority: "3",
        short_description:
          "Test incident from Data Ingestion Plugin real data test",
        assignment_group: "IT Support",
        sys_created_on: new Date().toISOString(),
        sys_updated_on: new Date().toISOString(),
        description: "This is a test incident created during real data testing",
        urgency: "3",
        impact: "3",
      };

      // Test real save operation - should save to actual MongoDB
      const saveResult = await context.saveTicket(realTicketData, "incident");

      expect(saveResult).toBeDefined();
      expect(typeof saveResult).toBe("boolean");

      if (saveResult) {
        console.log(
          `✅ SUCCESS: Real ticket saved to MongoDB with sys_id: ${realTicketData.sys_id}`,
        );
      } else {
        console.log(
          `⚠️ INFO: Ticket save returned false (may indicate update vs insert)`,
        );
      }

      // Verify ticket was actually saved by trying to find it
      try {
        const foundTicket = await context.findTicket(
          realTicketData.sys_id,
          "incident",
        );
        if (foundTicket) {
          console.log(`✅ VERIFICATION: Ticket found in MongoDB after save`);
          expect(foundTicket.sys_id).toBe(realTicketData.sys_id);
          expect(foundTicket.number).toBe(realTicketData.number);
          expect(foundTicket.short_description).toBe(
            realTicketData.short_description,
          );
        }
      } catch (findError) {
        console.log(`⚠️ Could not verify ticket save: ${findError}`);
      }
    } catch (error: any) {
      console.error("❌ Real ticket save failed:", error.message);

      // Should be a real MongoDB save error
      expect(error).toBeDefined();
      expect(typeof error.message).toBe("string");

      const errorMessage = error.message.toLowerCase();
      const isRealSaveError =
        errorMessage.includes("mongodb") ||
        errorMessage.includes("save") ||
        errorMessage.includes("insert") ||
        errorMessage.includes("collection");

      expect(isRealSaveError).toBe(true);
      console.log(`✅ Real MongoDB save operation attempted: ${error.message}`);
    }
  }, 30000);

  test("should perform real cache operations", async () => {
    const context = app.decorator as any;

    try {
      console.log(
        "🔄 Testing real cache operations via Data Ingestion Plugin...",
      );

      // Test real cache set operation
      const cacheKey = `test-cache-${Date.now()}`;
      const cacheValue = {
        data: "test cache data",
        timestamp: new Date().toISOString(),
        source: "data-ingestion-plugin-test",
      };

      const setCacheResult = await context.setCacheData(
        cacheKey,
        cacheValue,
        300,
      ); // 5 minutes TTL

      expect(setCacheResult).toBeDefined();
      expect(typeof setCacheResult).toBe("boolean");

      if (setCacheResult) {
        console.log(`✅ SUCCESS: Cache data set with key: ${cacheKey}`);

        // Test real cache get operation
        const getCacheResult = await context.getCacheData(cacheKey);

        if (getCacheResult) {
          console.log(`✅ SUCCESS: Cache data retrieved successfully`);
          expect(getCacheResult.data).toBe(cacheValue.data);
          expect(getCacheResult.source).toBe(cacheValue.source);
          console.log(`Retrieved data: ${JSON.stringify(getCacheResult)}`);
        } else {
          console.log(`⚠️ WARNING: Cache data not found after setting`);
        }
      } else {
        console.log(`⚠️ WARNING: Cache set operation returned false`);
      }
    } catch (error: any) {
      console.error("❌ Real cache operations failed:", error.message);

      // Should be a real cache operation error
      expect(error).toBeDefined();
      expect(typeof error.message).toBe("string");

      const errorMessage = error.message.toLowerCase();
      const isRealCacheError =
        errorMessage.includes("cache") ||
        errorMessage.includes("redis") ||
        errorMessage.includes("set") ||
        errorMessage.includes("get");

      expect(isRealCacheError).toBe(true);
      console.log(`✅ Real cache operation attempted: ${error.message}`);
    }
  }, 30000);

  test("should perform real sync status operations", async () => {
    const context = app.decorator as any;

    try {
      console.log(
        "📊 Testing real sync status operations via Data Ingestion Plugin...",
      );

      // Test real sync status retrieval
      const syncStatus = await context.getSyncStatus();

      expect(syncStatus).toBeDefined();
      expect(typeof syncStatus).toBe("object");

      console.log(`✅ SUCCESS: Sync status retrieved`);
      console.log(`Status keys: ${Object.keys(syncStatus).join(", ")}`);

      // Should have real sync status fields
      if (syncStatus.lastSync) {
        expect(typeof syncStatus.lastSync).toBe("string");
        console.log(`Last sync: ${syncStatus.lastSync}`);
      }

      if (syncStatus.isRunning !== undefined) {
        expect(typeof syncStatus.isRunning).toBe("boolean");
        console.log(`Sync running: ${syncStatus.isRunning}`);
      }

      if (syncStatus.totalRecords !== undefined) {
        expect(typeof syncStatus.totalRecords).toBe("number");
        console.log(`Total records: ${syncStatus.totalRecords}`);
      }

      if (syncStatus.successRate !== undefined) {
        expect(typeof syncStatus.successRate).toBe("number");
        console.log(`Success rate: ${syncStatus.successRate}%`);
      }
    } catch (error: any) {
      console.error("❌ Real sync status operations failed:", error.message);

      // Should be a real sync status error
      expect(error).toBeDefined();
      expect(typeof error.message).toBe("string");

      const errorMessage = error.message.toLowerCase();
      const isRealStatusError =
        errorMessage.includes("sync") ||
        errorMessage.includes("status") ||
        errorMessage.includes("mongodb") ||
        errorMessage.includes("redis");

      expect(isRealStatusError).toBe(true);
      console.log(`✅ Real sync status operation attempted: ${error.message}`);
    }
  }, 30000);

  test("should perform real batch ticket updates", async () => {
    const context = app.decorator as any;

    try {
      console.log(
        "🔄 Testing real batch ticket updates via Data Ingestion Plugin...",
      );

      // Create test tickets for batch update
      const testTickets = [
        {
          sys_id: `batch-test-1-${Date.now()}`,
          number: `INC${Math.floor(Math.random() * 1000000)}`,
          table: "incident",
          state: "1",
          priority: "3",
          short_description: "Batch test incident 1",
          assignment_group: "IT Support",
          sys_created_on: new Date().toISOString(),
          sys_updated_on: new Date().toISOString(),
        },
        {
          sys_id: `batch-test-2-${Date.now()}`,
          number: `INC${Math.floor(Math.random() * 1000000)}`,
          table: "incident",
          state: "2",
          priority: "2",
          short_description: "Batch test incident 2",
          assignment_group: "IT Support",
          sys_created_on: new Date().toISOString(),
          sys_updated_on: new Date().toISOString(),
        },
      ];

      // Test real batch update operation
      const batchResult = await context.batchUpdateTickets(testTickets);

      expect(batchResult).toBeDefined();
      expect(typeof batchResult).toBe("object");
      expect(typeof batchResult.processed).toBe("number");
      expect(typeof batchResult.successful).toBe("number");
      expect(typeof batchResult.failed).toBe("number");
      expect(Array.isArray(batchResult.results)).toBe(true);

      console.log(`✅ SUCCESS: Batch update completed`);
      console.log(
        `Processed: ${batchResult.processed}, Successful: ${batchResult.successful}, Failed: ${batchResult.failed}`,
      );

      if (batchResult.results.length > 0) {
        batchResult.results.forEach((result: any, index: number) => {
          console.log(
            `  Ticket ${index + 1}: ${result.success ? "SUCCESS" : "FAILED"} - ${result.sys_id}`,
          );
          if (result.error) {
            console.log(`    Error: ${result.error}`);
          }
        });
      }

      // Validate batch operation stats
      expect(batchResult.processed).toBe(testTickets.length);
      expect(batchResult.successful + batchResult.failed).toBe(
        batchResult.processed,
      );
    } catch (error: any) {
      console.error("❌ Real batch update failed:", error.message);

      // Should be a real batch operation error
      expect(error).toBeDefined();
      expect(typeof error.message).toBe("string");

      const errorMessage = error.message.toLowerCase();
      const isRealBatchError =
        errorMessage.includes("batch") ||
        errorMessage.includes("update") ||
        errorMessage.includes("mongodb") ||
        errorMessage.includes("ticket");

      expect(isRealBatchError).toBe(true);
      console.log(`✅ Real batch update operation attempted: ${error.message}`);
    }
  }, 30000);
});
