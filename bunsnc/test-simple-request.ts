/**
 * Test Simple ServiceNow Request - Diagnóstico gateway timeout
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowQueryService } from "./src/services/auth/ServiceNowQueryService";

async function testSimpleRequest() {
  console.log("Testing Simple ServiceNow Request - Diagnostico gateway timeout");
  console.log("=".repeat(60));

  try {
    const queryService = new ServiceNowQueryService();

    console.log("\nTesting Authentication...");
    await queryService.authenticate();

    console.log("\nTesting MINIMAL request (1 record, sys_id only)...");
    const startTime = Date.now();

    // Request absolutamente minimal
    const result = await queryService.makeRequest("incident", "GET", {
      sysparm_limit: "1",
      sysparm_fields: "sys_id",
      sysparm_display_value: "false",
    });

    const duration = Date.now() - startTime;

    console.log(`\nSimple request completed in ${duration}ms`);
    console.log(`Records returned: ${result.result?.length || 0}`);

    if (result.result && result.result.length > 0) {
      console.log(`First record sys_id: ${result.result[0].sys_id}`);
    }

    console.log("\nDiagnostico:");
    if (duration < 30000) {
      console.log("   - Request rapido: Gateway timeout NAO eh o problema");
      console.log("   - Problema: Query complexa ou filtros especificos");
    } else if (duration > 60000) {
      console.log("   - Request lento: Confirma gateway timeout estrutural");
      console.log("   - Problema: Limitacao de infraestrutura");
    } else {
      console.log("   - Request moderado: Gateway funcionando");
      console.log("   - Problema: Otimizacao de query necessaria");
    }

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("\nSimple request failed:", errorMsg);

    if (errorMsg.includes("socket connection was closed")) {
      console.log("CONFIRMADO: Gateway timeout estrutural");
      console.log("Solucao: Usar diferente estrategia de sincronizacao");
    } else if (errorMsg.includes("502")) {
      console.log("CONFIRMADO: Gateway/Proxy timeout");
      console.log("Solucao: Request ainda mais simples ou conexao direta");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Diagnostico completed!");
}

// Run test if called directly
testSimpleRequest().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});

export { testSimpleRequest };