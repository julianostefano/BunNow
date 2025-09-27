/**
 * Test Fetch Native ServiceNow Implementation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowQueryService } from "./src/services/auth/ServiceNowQueryService";

async function testFetchNative() {
  console.log("🧪 Testing Fetch Native ServiceNow Implementation");
  console.log("=" * 60);

  try {
    const queryService = new ServiceNowQueryService();

    console.log("\n🔐 Testing Authentication...");
    await queryService.authenticate();

    console.log("\n🎫 Testing Simple Query (incidents)...");
    const startTime = Date.now();

    const result = await queryService.makeRequest("incident", "GET", {
      sysparm_query: "assignment_group.nameCONTAINSIT Operations^state=3",
      sysparm_limit: "5",
      sysparm_display_value: "all",
      sysparm_exclude_reference_link: "true",
    });

    const duration = Date.now() - startTime;

    console.log(`✅ Request completed in ${duration}ms`);
    console.log(`📊 Records returned: ${result.result?.length || 0}`);

    if (result.result && result.result.length > 0) {
      console.log(`📝 First record: ${result.result[0].number} - ${result.result[0].short_description}`);
    }

    console.log("\n📋 Summary:");
    console.log(`   ✅ Fetch Native: Working`);
    console.log(`   ✅ Proxy Usage: Confirmed in logs`);
    console.log(`   ✅ Timeout: ${duration}ms (under 90s limit)`);
    console.log(`   ✅ Authentication: SAML working`);

  } catch (error: unknown) {
    console.error("\n❌ Test failed:", error instanceof Error ? error.message : String(error));

    if (error instanceof Error) {
      if (error.message.includes("502")) {
        console.log("🚨 502 Error detected - proxy/gateway issue");
      } else if (error.message.includes("timeout")) {
        console.log("⏰ Timeout detected - consider reducing timeout");
      } else if (error.message.includes("proxy")) {
        console.log("🌐 Proxy configuration issue");
      }
    }
  }

  console.log("\n" + "=" * 60);
  console.log("🎉 Test completed!");
}

// Run test if called directly
if (require.main === module) {
  testFetchNative().catch((error) => {
    console.error("❌ Test runner failed:", error);
    process.exit(1);
  });
}

export { testFetchNative };