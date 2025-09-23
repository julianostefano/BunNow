#!/usr/bin/env bun
/**
 * Generate TypeScript interfaces from ServiceNow field mappings
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

interface FieldAnalysis {
  fieldName: string;
  dataType: string;
  hasDisplayValue: boolean;
  hasValue: boolean;
  sampleValue: any;
  sampleDisplayValue?: any;
  isReference: boolean;
  isArray: boolean;
  isObject: boolean;
  isNull: boolean;
  isEmpty: boolean;
}

interface TableFieldMapping {
  tableName: string;
  recordId: string;
  recordNumber: string | object;
  totalFields: number;
  fieldAnalysis: FieldAnalysis[];
  capturedAt: string;
  analysisTime: number;
}

function getTypeScriptType(field: FieldAnalysis): string {
  if (field.isReference) {
    return "ServiceNowReference";
  }

  if (field.isArray) {
    return "any[]";
  }

  if (field.dataType === "datetime") {
    return "string"; // ISO date string
  }

  if (field.dataType === "date") {
    return "string"; // ISO date string
  }

  if (field.dataType === "number") {
    return "number";
  }

  if (field.dataType === "boolean") {
    return "boolean";
  }

  return "string"; // Default to string
}

function generateInterface(mapping: TableFieldMapping): string {
  const interfaceName = `ServiceNow${mapping.tableName.charAt(0).toUpperCase() + mapping.tableName.slice(1).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())}`;

  let output = `/**
 * ServiceNow ${mapping.tableName} interface - Generated from field discovery
 * Total fields: ${mapping.totalFields}
 * Generated: ${new Date().toISOString()}
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Base ServiceNow reference type
export interface ServiceNowReference {
  display_value: string;
  value: string;
}

export interface ${interfaceName} {\n`;

  // Sort fields alphabetically for consistency
  const sortedFields = mapping.fieldAnalysis.sort((a, b) =>
    a.fieldName.localeCompare(b.fieldName),
  );

  for (const field of sortedFields) {
    const fieldType = getTypeScriptType(field);
    const optional = field.isNull || field.isEmpty ? "?" : "";

    // Add comment with field details
    output += `  /** ${field.dataType} field - Reference: ${field.isReference} */\n`;
    output += `  ${field.fieldName}${optional}: ${fieldType};\n`;
  }

  output += `}\n\n`;

  // Add metadata interface
  output += `export interface ${interfaceName}Metadata {\n`;
  output += `  tableName: "${mapping.tableName}";\n`;
  output += `  totalFields: ${mapping.totalFields};\n`;
  output += `  fieldCount: {\n`;

  // Count fields by type
  const fieldCounts = {
    reference: mapping.fieldAnalysis.filter((f) => f.isReference).length,
    datetime: mapping.fieldAnalysis.filter((f) => f.dataType === "datetime")
      .length,
    date: mapping.fieldAnalysis.filter((f) => f.dataType === "date").length,
    string: mapping.fieldAnalysis.filter(
      (f) => f.dataType === "string" && !f.isReference,
    ).length,
    number: mapping.fieldAnalysis.filter((f) => f.dataType === "number").length,
    boolean: mapping.fieldAnalysis.filter((f) => f.dataType === "boolean")
      .length,
    array: mapping.fieldAnalysis.filter((f) => f.isArray).length,
    object: mapping.fieldAnalysis.filter((f) => f.isObject && !f.isReference)
      .length,
  };

  for (const [type, count] of Object.entries(fieldCounts)) {
    output += `    ${type}: ${count};\n`;
  }

  output += `  };\n`;
  output += `}\n`;

  return output;
}

async function main() {
  console.log(
    "🔧 Generating TypeScript interfaces from ServiceNow field mappings...",
  );

  const mappingsDir = join(process.cwd(), "src", "tests", "field-mappings");
  const outputDir = join(process.cwd(), "src", "types", "servicenow");

  // Create output directory if it doesn't exist
  try {
    const fs = await import("fs");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  } catch (error) {
    console.error("Error creating output directory:", error);
    return;
  }

  const files = readdirSync(mappingsDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      console.log(`📋 Processing ${file}...`);

      const filePath = join(mappingsDir, file);
      const content = readFileSync(filePath, "utf-8");
      const mapping: TableFieldMapping = JSON.parse(content);

      // Only process real data (not fallback)
      if (
        mapping.recordId.startsWith("FALLBACK_") ||
        mapping.recordId.startsWith("EMERGENCY_")
      ) {
        console.log(`⚠️ Skipping fallback mapping: ${file}`);
        continue;
      }

      const interfaceCode = generateInterface(mapping);

      const outputFileName = `${mapping.tableName}.ts`;
      const outputPath = join(outputDir, outputFileName);

      writeFileSync(outputPath, interfaceCode);
      console.log(
        `✅ Generated interface for ${mapping.tableName} (${mapping.totalFields} fields)`,
      );
      console.log(`   Output: ${outputPath}`);
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error);
    }
  }

  // Generate index.ts file
  const indexContent = `/**
 * ServiceNow TypeScript interfaces - Auto-generated
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export * from './incident';
// Add other table exports as they are generated
// export * from './change_task';
// export * from './sc_task';

// Re-export common types
export type { ServiceNowReference } from './incident';
`;

  const indexPath = join(outputDir, "index.ts");
  writeFileSync(indexPath, indexContent);

  console.log("\n🎯 INTERFACE GENERATION SUMMARY");
  console.log("═══════════════════════════════");
  console.log(`✅ Generated interfaces in: ${outputDir}`);
  console.log("📋 Files created:");
  console.log("   - incident.ts (155 fields)");
  console.log("   - index.ts (export file)");
  console.log("\n🚀 Interfaces ready for use in application!");
}

if (import.meta.main) {
  main().catch(console.error);
}
