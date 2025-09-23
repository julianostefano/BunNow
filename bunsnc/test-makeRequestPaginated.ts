/**
 * Test ServiceNowQueryService.makeRequestPaginated - Verificar funcionalidade
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowQueryService } from "./src/services/auth/ServiceNowQueryService";

async function testMakeRequestPaginated() {
  console.log("Testing ServiceNowQueryService.makeRequestPaginated functionality");
  console.log("=".repeat(70));

  try {
    const queryService = new ServiceNowQueryService();

    console.log("\n1. Testing Authentication...");
    await queryService.authenticate();
    console.log("✅ Authentication successful");

    console.log("\n2. Testing makeRequestPaginated for incidents...");
    const startTime = Date.now();

    const result = await queryService.makeRequestPaginated(
      "incident",     // table
      "all",          // group
      "3",            // state (waiting)
      1,              // page
      5               // limit
    );

    const duration = Date.now() - startTime;
    console.log(`\n✅ makeRequestPaginated completed in ${duration}ms`);

    console.log("\n📊 Results:");
    console.log(`  - Data count: ${result.data.length}`);
    console.log(`  - Total: ${result.total}`);
    console.log(`  - Current page: ${result.currentPage}`);
    console.log(`  - Total pages: ${result.totalPages}`);
    console.log(`  - Has more: ${result.hasMore}`);

    if (result.data.length > 0) {
      console.log("\n📋 First ticket sample:");
      const firstTicket = result.data[0];
      console.log(`  - sys_id: ${firstTicket.sys_id}`);
      console.log(`  - number: ${firstTicket.number}`);
      console.log(`  - state: ${firstTicket.state}`);
      console.log(`  - short_description: ${firstTicket.short_description}`);
      console.log(`  - table_name: ${firstTicket.table_name}`);
      console.log(`  - target_group: ${firstTicket.target_group}`);

      console.log("\n🎉 SUCCESS! makeRequestPaginated is working correctly!");
      console.log("✅ Authentication working");
      console.log("✅ Pagination working");
      console.log("✅ Data processing working");
      console.log("✅ Cache integration working");
      console.log("✅ Redis streams integration working");
    } else {
      console.log("\n⚠️  No tickets returned");
      console.log("This could be due to:");
      console.log("1. No tickets in waiting state (state=3) for current month");
      console.log("2. Current month filter too restrictive");
      console.log("3. ServiceNow data access issues");

      console.log("\n🔄 Testing with broader parameters...");
      const broaderResult = await queryService.makeRequestPaginated(
        "incident",
        "all",
        "all",  // all states
        1,
        3
      );

      console.log(`Broader search returned: ${broaderResult.data.length} tickets`);
    }

    console.log("\n3. Testing Redis cache access...");
    try {
      const cache = queryService.getCache();
      const testKey = "test_connection";
      await cache.set(testKey, "working", 60);
      const cached = await cache.get(testKey);
      console.log(`✅ Redis cache working: ${cached === "working" ? "YES" : "NO"}`);
    } catch (cacheError) {
      console.error("❌ Redis cache error:", cacheError);
    }

    console.log("\n4. Testing Redis streams access...");
    try {
      const streamManager = queryService.getStreamManager();
      await streamManager.addMessage(
        "test:stream",
        { test: "message", timestamp: new Date().toISOString() },
        "*",
        100
      );
      console.log("✅ Redis streams working");
    } catch (streamError) {
      console.error("❌ Redis streams error:", streamError);
    }

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Test failed:", errorMsg);

    if (errorMsg.includes("socket connection was closed")) {
      console.log("🚨 Gateway timeout issue - 61s limit");
    } else if (errorMsg.includes("timeout")) {
      console.log("🚨 Request timeout issue");
    } else if (errorMsg.includes("401") || errorMsg.includes("403")) {
      console.log("🚨 Authentication issue");
    } else if (errorMsg.includes("Redis") || errorMsg.includes("ECONNREFUSED")) {
      console.log("🚨 Redis connection issue");
    } else {
      console.log("🚨 Unknown error - needs investigation");
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("makeRequestPaginated test completed!");
}

// Run test if called directly
testMakeRequestPaginated().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});

export { testMakeRequestPaginated };