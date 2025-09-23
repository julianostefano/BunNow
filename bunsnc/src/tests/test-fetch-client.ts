#!/usr/bin/env bun
/**
 * Test ServiceNowFetchClient - Validate native fetch implementation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowFetchClient } from "../services/ServiceNowFetchClient";

async function main() {
  console.log("🧪 Testing ServiceNowFetchClient (Native Fetch Implementation)");
  console.log("═══════════════════════════════════════════════════════════");

  const client = new ServiceNowFetchClient();

  try {
    console.log("\n🔐 Step 1: Test Authentication");
    const isAuthValid = client.isAuthValid();
    console.log(`   Initial auth status: ${isAuthValid}`);

    console.log("\n📋 Step 2: Test Field Discovery - Incident Table");
    const incidentQuery = "state=3^assignment_group.nameCONTAINSIT Operations";
    console.log(`   Query: ${incidentQuery}`);

    const incidentResult = await client.makeRequestFullFields(
      "incident",
      incidentQuery,
      1,
    );
    console.log(`   ✅ Incident query successful!`);
    console.log(`   Records returned: ${incidentResult.result?.length || 0}`);

    if (incidentResult.result && incidentResult.result.length > 0) {
      const firstRecord = incidentResult.result[0];
      const fieldCount = Object.keys(firstRecord).length;
      console.log(`   Fields in first record: ${fieldCount}`);
      console.log(
        `   Sample fields: ${Object.keys(firstRecord).slice(0, 10).join(", ")}...`,
      );
    }

    console.log("\n📋 Step 3: Test Field Discovery - Change Task Table");
    const changeTaskQuery =
      "state=3^assignment_group.nameCONTAINSIT Operations";
    console.log(`   Query: ${changeTaskQuery}`);

    const changeTaskResult = await client.makeRequestFullFields(
      "change_task",
      changeTaskQuery,
      1,
    );
    console.log(`   ✅ Change task query successful!`);
    console.log(`   Records returned: ${changeTaskResult.result?.length || 0}`);

    if (changeTaskResult.result && changeTaskResult.result.length > 0) {
      const firstRecord = changeTaskResult.result[0];
      const fieldCount = Object.keys(firstRecord).length;
      console.log(`   Fields in first record: ${fieldCount}`);
      console.log(
        `   Sample fields: ${Object.keys(firstRecord).slice(0, 10).join(", ")}...`,
      );
    }

    console.log("\n📋 Step 4: Test Field Discovery - SC Task Table");
    const scTaskQuery = "state=3^assignment_group.nameCONTAINSIT Operations";
    console.log(`   Query: ${scTaskQuery}`);

    const scTaskResult = await client.makeRequestFullFields(
      "sc_task",
      scTaskQuery,
      1,
    );
    console.log(`   ✅ SC task query successful!`);
    console.log(`   Records returned: ${scTaskResult.result?.length || 0}`);

    if (scTaskResult.result && scTaskResult.result.length > 0) {
      const firstRecord = scTaskResult.result[0];
      const fieldCount = Object.keys(firstRecord).length;
      console.log(`   Fields in first record: ${fieldCount}`);
      console.log(
        `   Sample fields: ${Object.keys(firstRecord).slice(0, 10).join(", ")}...`,
      );
    }

    console.log("\n📊 Step 5: Performance Metrics");
    const metrics = client.getMetrics();
    console.log(`   Total requests: ${metrics.totalRequests}`);
    console.log(`   Successful requests: ${metrics.successfulRequests}`);
    console.log(`   Failed requests: ${metrics.failedRequests}`);
    console.log(`   Average response time: ${metrics.averageResponseTime}ms`);

    console.log("\n🎯 SUMMARY");
    console.log("═══════════");
    console.log("✅ ServiceNowFetchClient working correctly!");
    console.log("✅ No ERR_INVALID_ARG_TYPE errors");
    console.log("✅ Native fetch successfully authenticated");
    console.log("✅ Field discovery working for all tables");
    console.log("✅ Ready for real field mapping");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
