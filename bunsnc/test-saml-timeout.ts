/**
 * Test SAML Auth + 600s Timeout - Teste com autenticação SAML
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Force SAML authentication
process.env.SERVICENOW_AUTH_TYPE = "saml";

import { ServiceNowQueryService } from "./src/services/auth/ServiceNowQueryService";

async function testSAMLTimeout() {
  console.log("Testing SAML Auth + 600s Timeout - Buscar tickets reais");
  console.log("=".repeat(60));

  try {
    const queryService = new ServiceNowQueryService();

    console.log("\nTesting SAML Authentication...");
    await queryService.authenticate();

    console.log("\nTesting ticket request with SAML + 600s timeout...");
    const startTime = Date.now();

    // Request com SAML auth - deve funcionar
    const result = await queryService.makeRequest("incident", "GET", {
      sysparm_query: "state=3", // Simples: só estado 3
      sysparm_display_value: "all",
      sysparm_exclude_reference_link: "true",
      sysparm_limit: "3", // Apenas 3 registros
      sysparm_fields: "sys_id,number,state,short_description",
    });

    const duration = Date.now() - startTime;
    const durationMinutes = Math.round(duration / 60000 * 100) / 100;

    console.log(`\n✅ SUCCESS! SAML request completed in ${duration}ms (${durationMinutes} minutes)`);
    console.log(`Records returned: ${result.result?.length || 0}`);

    if (result.result && result.result.length > 0) {
      console.log("\n📋 Tickets encontrados:");
      result.result.forEach((ticket, index) => {
        console.log(`  ${index + 1}. ${ticket.number} - ${ticket.short_description}`);
        console.log(`     sys_id: ${ticket.sys_id}`);
        console.log(`     state: ${ticket.state}`);
      });

      console.log("\n🎉 SUCESSO TOTAL! CONSEGUIMOS TICKETS REAIS COM SAML!");
      console.log(`✅ Autenticação SAML funcionando`);
      console.log(`✅ Timeout 600s suficiente`);
      console.log(`✅ Proxy configurado corretamente`);
      console.log(`✅ SSL bypass funcionando`);

      console.log("\n🚀 PRÓXIMOS PASSOS:");
      console.log("1. Implementar sincronização MongoDB com estes dados reais");
      console.log("2. Configurar Redis Streams para notificações");
      console.log("3. Conectar dashboard HTMX aos dados sincronizados");
    }

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("\n❌ SAML Test failed:", errorMsg);

    if (errorMsg.includes("socket connection was closed")) {
      console.log("Gateway timeout ainda presente mesmo com SAML");
    } else if (errorMsg.includes("timeout")) {
      console.log("SAML request timeout - ServiceNow muito lento");
    } else if (errorMsg.includes("401") || errorMsg.includes("403")) {
      console.log("SAML authentication failing - verificar credenciais");
    } else {
      console.log("Erro SAML não identificado");
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SAML timeout test completed!");
}

// Run test if called directly
testSAMLTimeout().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});

export { testSAMLTimeout };