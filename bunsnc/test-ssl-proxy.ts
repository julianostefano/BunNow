/**
 * Test SSL/Proxy Configuration - Diagnóstico certificado inválido
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowQueryService } from "./src/services/auth/ServiceNowQueryService";

async function testSSLProxyConfig() {
  console.log("Testing SSL/Proxy Configuration - Certificado inválido");
  console.log("=".repeat(60));

  try {
    const queryService = new ServiceNowQueryService();

    console.log("\nTesting Authentication with SSL bypass...");
    await queryService.authenticate();

    console.log("\nTesting MINIMAL request with SSL/Proxy config...");
    const startTime = Date.now();

    // Test com endpoint mais simples possível
    const result = await queryService.makeRequest("incident", "GET", {
      sysparm_limit: "1",
      sysparm_fields: "sys_id",
      sysparm_display_value: "false",
    });

    const duration = Date.now() - startTime;

    console.log(`\nSSL/Proxy test completed in ${duration}ms`);
    console.log(`Records returned: ${result.result?.length || 0}`);

    if (result.result && result.result.length > 0) {
      console.log(`First record sys_id: ${result.result[0].sys_id}`);
      console.log("SUCCESS: SSL/Proxy configuration working!");
    }

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("\nSSL/Proxy test failed:", errorMsg);

    // Diagnóstico específico do erro
    if (errorMsg.includes("certificate")) {
      console.log("CERTIFICATE ERROR: SSL certificate issue persists");
      console.log("Solução: Verificar configuração TLS no Bun fetch");
    } else if (errorMsg.includes("proxy")) {
      console.log("PROXY ERROR: Proxy authentication failing");
      console.log("Solução: Verificar credenciais proxy");
    } else if (errorMsg.includes("socket connection was closed")) {
      console.log("GATEWAY TIMEOUT: 61s limit still active");
      console.log("Solução: Problema estrutural confirmado");
    } else if (errorMsg.includes("ECONNREFUSED")) {
      console.log("CONNECTION REFUSED: Proxy rejecting connection");
      console.log("Solução: Verificar proxy host/port");
    } else {
      console.log("UNKNOWN ERROR: New error type detected");
      console.log("Details:", errorMsg);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SSL/Proxy test completed!");
}

// Run test if called directly
testSSLProxyConfig().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});

export { testSSLProxyConfig };