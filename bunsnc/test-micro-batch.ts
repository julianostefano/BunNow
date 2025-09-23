/**
 * Test Micro-Batch Sync - Ultra-fast 2 record batches to work within 61s gateway limit
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowQueryService } from "./src/services/auth/ServiceNowQueryService";

async function testMicroBatchSync() {
  console.log("Testing Micro-Batch Sync - 2 records per batch, minimal fields");
  console.log("=".repeat(60));

  try {
    const queryService = new ServiceNowQueryService();

    console.log("\nTesting Authentication...");
    await queryService.authenticate();

    console.log("\nTesting Micro-Batch Sync (2 records, sys_id only)...");
    const startTime = Date.now();

    // Use micro-batch strategy designed to work within 61s gateway limit
    const result = await queryService.syncTicketsInChunks(
      "incident",
      "3", // Estado "Em Espera"
      2   // Micro-batches: 2 registros com campo sys_id apenas
    );

    const duration = Date.now() - startTime;

    console.log(`\nMicro-batch sync completed in ${duration}ms`);
    console.log(`Results:`);
    console.log(`   - Total processed: ${result.totalProcessed}`);
    console.log(`   - Successful micro-batches: ${result.successfulChunks}`);
    console.log(`   - Failed micro-batches: ${result.failedChunks}`);

    if (result.errors.length > 0) {
      console.log(`Errors:`);
      result.errors.forEach(error => console.log(`   - ${error}`));
    }

    console.log("\nMicro-Batch Strategy Summary:");
    console.log(`   - Micro-batches: 2 registros por request`);
    console.log(`   - Delay entre micro-batches: 500ms`);
    console.log(`   - Fields: sys_id apenas (velocidade maxima)`);
    console.log(`   - No date filtering (evita operacoes lentas)`);
    console.log(`   - Target: Completar requests em <45s cada`);

    console.log("\nDiagnostico:");
    if (result.totalProcessed > 0 && result.failedChunks === 0) {
      console.log("   - SUCCESS: Micro-batch strategy funcionou");
      console.log("   - Gateway timeout contornado com requests ultra-rapidos");
    } else if (result.failedChunks > 0) {
      console.log("   - PARTIAL: Alguns micro-batches falharam");
      console.log("   - Analisar erros para otimizar ainda mais");
    } else {
      console.log("   - FAILED: Micro-batch strategy nao conseguiu sync");
      console.log("   - Gateway limit ainda muito restritivo");
    }

  } catch (error: unknown) {
    console.error("\nMicro-batch test failed:", error instanceof Error ? error.message : String(error));

    if (error instanceof Error) {
      if (error.message.includes("502")) {
        console.log("502 Error - gateway timeout ainda presente mesmo com micro-batches");
      } else if (error.message.includes("timeout")) {
        console.log("Timeout detected - micro-batch strategy precisa ser ainda mais rapida");
      } else if (error.message.includes("socket connection was closed")) {
        console.log("Socket closed - gateway infrastructure limitation confirmada");
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Micro-batch test completed!");
}

// Run test if called directly
testMicroBatchSync().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});

export { testMicroBatchSync };