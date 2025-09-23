/**
 * Test Chunked Sync - Paginação 100 registros ServiceNow com timeout 240s
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowQueryService } from "./src/services/auth/ServiceNowQueryService";

async function testChunkedSync() {
  console.log("Testing Chunked Sync - Paginacao 100 registros, timeout 240s");
  console.log("=".repeat(60));

  try {
    const queryService = new ServiceNowQueryService();

    console.log("\nTesting Authentication...");
    await queryService.authenticate();

    console.log("\nTesting Chunked Sync (incidents, state=3, 100 records per page)...");
    const startTime = Date.now();

    const result = await queryService.syncTicketsInChunks(
      "incident",
      "3", // Estado "Em Espera"
      5   // Paginação 5 registros + campos mínimos para evitar gateway timeout
    );

    const duration = Date.now() - startTime;

    console.log(`\nChunked sync completed in ${duration}ms`);
    console.log(`Results:`);
    console.log(`   - Total processed: ${result.totalProcessed}`);
    console.log(`   - Successful chunks: ${result.successfulChunks}`);
    console.log(`   - Failed chunks: ${result.failedChunks}`);

    if (result.errors.length > 0) {
      console.log(`Errors:`);
      result.errors.forEach(error => console.log(`   - ${error}`));
    }

    console.log("\nSummary:");
    console.log(`   - Paginacao: 5 registros por request + campos minimos`);
    console.log(`   - Delay entre chunks: 2s`);
    console.log(`   - Warning limit: 30s (gateway fecha aos 60s)`);
    console.log(`   - Fields: sys_id,number,state apenas (evita processamento pesado)`);

  } catch (error: unknown) {
    console.error("\nTest failed:", error instanceof Error ? error.message : String(error));

    if (error instanceof Error) {
      if (error.message.includes("502")) {
        console.log("502 Error detected - gateway timeout ainda presente");
      } else if (error.message.includes("timeout")) {
        console.log("Timeout detected - mas agora usando 240s conforme ServiceNow");
      } else if (error.message.includes("proxy")) {
        console.log("Proxy configuration issue");
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Test completed!");
}

// Run test if called directly
testChunkedSync().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});

export { testChunkedSync };