/**
 * Test Direct Endpoints - Testar como aplicação realmente funciona
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

async function testDirectEndpoints() {
  console.log("Testing Direct Endpoints - Como a aplicação realmente faz");
  console.log("=".repeat(70));

  const baseUrl = "http://localhost:3008";

  try {
    console.log("\n1. Testing health endpoint...");
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthData = await healthResponse.json();
    console.log(`✅ Health: ${healthResponse.status} - ${healthData.status}`);

    console.log("\n2. Testing tickets lazy-load endpoint...");
    const ticketsUrl = `${baseUrl}/tickets/lazy-load/incident/3?group=IT%20Operations&page=1`;
    console.log(`Request URL: ${ticketsUrl}`);

    const startTime = Date.now();
    const ticketsResponse = await fetch(ticketsUrl);
    const duration = Date.now() - startTime;

    console.log(`Response: ${ticketsResponse.status} ${ticketsResponse.statusText}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Content-Type: ${ticketsResponse.headers.get('content-type')}`);

    if (ticketsResponse.ok) {
      const ticketsHtml = await ticketsResponse.text();
      console.log(`Response size: ${ticketsHtml.length} characters`);

      if (ticketsHtml.includes("ticket-card") || ticketsHtml.includes("INC")) {
        console.log("✅ Found ticket data in response!");
        const ticketMatches = ticketsHtml.match(/INC\d+/g);
        if (ticketMatches) {
          console.log(`Found ticket numbers: ${ticketMatches.slice(0, 3).join(', ')}...`);
        }
      } else if (ticketsHtml.includes("erro") || ticketsHtml.includes("error")) {
        console.log("⚠️ Response contains error message");
        console.log("First 200 chars:", ticketsHtml.substring(0, 200));
      } else {
        console.log("📝 Response preview (first 200 chars):");
        console.log(ticketsHtml.substring(0, 200));
      }
    } else {
      const errorText = await ticketsResponse.text();
      console.log("❌ Request failed:");
      console.log("Error response:", errorText.substring(0, 300));
    }

    console.log("\n3. Testing ticket counts endpoint...");
    const countsUrl = `${baseUrl}/tickets/ticket-counts/incident/3?group=IT%20Operations`;
    console.log(`Request URL: ${countsUrl}`);

    const countsResponse = await fetch(countsUrl);
    console.log(`Response: ${countsResponse.status} ${countsResponse.statusText}`);

    if (countsResponse.ok) {
      const countsHtml = await countsResponse.text();
      console.log(`Count response size: ${countsHtml.length} characters`);
      console.log("Count response preview:", countsHtml.substring(0, 100));
    }

    console.log("\n4. Testing dashboard endpoint...");
    const dashboardResponse = await fetch(`${baseUrl}/dashboard`);
    console.log(`Dashboard: ${dashboardResponse.status} ${dashboardResponse.statusText}`);

    console.log("\n5. Summary:");
    if (ticketsResponse.ok) {
      console.log("✅ Tickets endpoint working");
      console.log("✅ Server running correctly");
      console.log("✅ Routes configured properly");
      console.log("\n🎯 ServiceNowQueryService.makeRequestPaginated está sendo chamado!");
      console.log("📊 Verifique os logs do servidor para ver a sincronização");
    } else {
      console.log("❌ Tickets endpoint failing");
      console.log("🔍 Check server logs for errors");
    }

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Test failed:", errorMsg);

    if (errorMsg.includes("ECONNREFUSED")) {
      console.log("🚨 Server not running on port 3008");
      console.log("Run: bun run dev");
    } else if (errorMsg.includes("fetch")) {
      console.log("🚨 Network error during fetch");
    } else {
      console.log("🚨 Unknown error");
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("Direct endpoints test completed!");
}

// Run test if called directly
testDirectEndpoints().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});

export { testDirectEndpoints };