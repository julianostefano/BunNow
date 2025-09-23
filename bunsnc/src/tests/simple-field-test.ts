#!/usr/bin/env bun
/**
 * Simple Field Test - Teste simples de descoberta de campos
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowFetchClient } from "../services/ServiceNowFetchClient";

async function main() {
  console.log("🧪 Simple Field Discovery Test");
  console.log("=============================");

  const client = new ServiceNowFetchClient();

  try {
    console.log("\n📋 Testing incident table with simple query...");

    // Query mais simples sem filtros complexos
    const result = await client.makeRequestFullFields("incident", "", 1);

    if (result.result && result.result.length > 0) {
      const record = result.result[0];
      const fieldCount = Object.keys(record).length;

      console.log(`✅ Success! Found ${fieldCount} fields in incident record`);
      console.log(`📝 Record ID: ${record.sys_id}`);
      console.log(`📝 Record Number: ${record.number}`);

      // Mostrar alguns campos para verificar
      const sampleFields = Object.keys(record).slice(0, 10);
      console.log(`🔍 Sample fields: ${sampleFields.join(", ")}`);

      return { success: true, fieldCount, recordId: record.sys_id };
    } else {
      console.log("❌ No records found");
      return { success: false };
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return { success: false, error: error.message };
  }
}

if (import.meta.main) {
  main().then((result) => {
    console.log("\n🎯 Result:", result);
    process.exit(result.success ? 0 : 1);
  });
}
