/**
 * Test 600s Timeout - Verificar se conseguimos buscar tickets reais
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowQueryService } from "./src/services/auth/ServiceNowQueryService";

async function testTimeout600s() {
  console.log("Testing 600s Timeout - Buscar tickets reais do ServiceNow");
  console.log("=".repeat(60));

  try {
    const queryService = new ServiceNowQueryService();

    console.log("\nTesting Authentication...");
    await queryService.authenticate();

    console.log("\nTesting ticket request with 600s timeout...");
    const startTime = Date.now();

    // Request real tickets - mesmo que demorado, aguardar até 10 minutos
    const result = await queryService.makeRequest("incident", "GET", {
      sysparm_query: "assignment_group.nameCONTAINSIT Operations^state=3",
      sysparm_display_value: "all",
      sysparm_exclude_reference_link: "true",
      sysparm_limit: "5", // Poucos registros para teste
      sysparm_fields: "sys_id,number,state,short_description,assignment_group,priority,opened_by,sys_created_on,sys_updated_on",
    });

    const duration = Date.now() - startTime;
    const durationMinutes = Math.round(duration / 60000 * 100) / 100;

    console.log(`\n✅ SUCCESS! Request completed in ${duration}ms (${durationMinutes} minutes)`);
    console.log(`Records returned: ${result.result?.length || 0}`);

    if (result.result && result.result.length > 0) {
      console.log("\nFirst ticket details:");
      const ticket = result.result[0];
      console.log(`  - sys_id: ${ticket.sys_id}`);
      console.log(`  - number: ${ticket.number}`);
      console.log(`  - state: ${ticket.state}`);
      console.log(`  - description: ${ticket.short_description}`);
      console.log(`  - assignment_group: ${ticket.assignment_group?.display_value || 'N/A'}`);

      console.log("\n🎉 CONSEGUIMOS BUSCAR TICKETS REAIS DO SERVICENOW!");
      console.log(`Tempo necessário: ${durationMinutes} minutos`);
      console.log("Agora podemos implementar a sincronização completa!");
    }

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Test failed:", errorMsg);

    if (errorMsg.includes("socket connection was closed")) {
      console.log("Gateway timeout ainda presente - mesmo com 600s");
      console.log("Solução: Usar estratégia alternativa ou endpoints diferentes");
    } else if (errorMsg.includes("timeout")) {
      console.log("Request timeout - ServiceNow levou mais de 10 minutos");
      console.log("Solução: Pode precisar aumentar ainda mais ou usar chunks menores");
    } else if (errorMsg.includes("403")) {
      console.log("Forbidden - problema de autenticação");
      console.log("Solução: Verificar SAML auth ou credenciais");
    } else {
      console.log("Erro não identificado - analisar detalhes");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Test 600s timeout completed!");
}

// Run test if called directly
testTimeout600s().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});

export { testTimeout600s };