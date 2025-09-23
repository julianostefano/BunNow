/**
 * Simple Test - ServiceNow with 45s timeout
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowQueryService } from "./src/services/auth/ServiceNowQueryService";

async function testTimeout() {
  console.log("🧪 Testing 45-second timeout fix...");

  try {
    const queryService = new ServiceNowQueryService();
    console.log("🔐 Authenticating...");
    await queryService.authenticate();

    console.log("🎫 Making request with 45s timeout...");
    const startTime = Date.now();

    const result = await queryService.makeRequest("incident", "GET", {
      sysparm_query: "assignment_group.nameCONTAINSIT Operations^state=3",
      sysparm_limit: "3",
      sysparm_display_value: "all",
    });

    const duration = Date.now() - startTime;
    console.log(`✅ SUCCESS in ${duration}ms!`);
    console.log(`📊 Records: ${result.result?.length || 0}`);

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Failed: ${errorMsg}`);

    if (errorMsg.includes("timeout") || errorMsg.includes("45000")) {
      console.log("🎯 Timeout after 45s - this is expected behavior");
    } else if (errorMsg.includes("socket connection was closed")) {
      console.log("🚨 Still getting 61s gateway timeout - need different approach");
    }
  }
}

testTimeout();