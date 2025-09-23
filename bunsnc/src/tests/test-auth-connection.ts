#!/usr/bin/env bun
/**
 * Test Auth Connection - Teste de conexão com dados armazenados
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Force correct ServiceNow proxy that actually works
process.env.SERVICENOW_PROXY =
  "http://AMER%5CE966380:Neoenergia%402026@10.219.77.12:8080";

import { ServiceNowFetchClient } from "../services/ServiceNowFetchClient";

async function testConnection() {
  console.log("🧪 Testing ServiceNow Connection with Stored Auth");
  console.log("================================================");

  const client = new ServiceNowFetchClient();

  try {
    console.log("1. Testing authentication...");
    await client.authenticate();

    if (!client.isAuthValid()) {
      throw new Error("Authentication failed");
    }

    console.log("✅ Authentication successful");
    console.log("2. Testing basic API access...");

    // Try a very simple API call with minimal timeout (test with incident first)
    console.log("   Testing with incident table (known working)...");
    let result = await client.makeRequestFullFields("incident", "", 1);

    if (result && result.result && result.result.length > 0) {
      console.log(
        `   ✅ Incident test successful: ${result.result.length} record(s)`,
      );
    }

    console.log("   Testing with sc_task table...");
    result = await client.makeRequestFullFields("sc_task", "", 1);

    if (result && result.result && result.result.length > 0) {
      console.log(
        `✅ Successfully retrieved ${result.result.length} sc_task record(s)`,
      );
      console.log(`📊 Record ID: ${result.result[0].sys_id}`);
      console.log(`📊 Record Number: ${result.result[0].number}`);
      console.log(`📊 Total fields: ${Object.keys(result.result[0]).length}`);
    } else {
      console.log("⚠️ No records found");
    }
  } catch (error) {
    console.error("❌ Connection test failed:", error.message);
    console.error("Stack:", error.stack);
  }
}

if (import.meta.main) {
  testConnection().catch(console.error);
}
