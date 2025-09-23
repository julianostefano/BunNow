#!/usr/bin/env bun
/**
 * Generate TypeScript interfaces from real ServiceNow field mappings
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "fs";
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
  capturedAt?: string;
  analysisTime?: number;
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

  // Default to string for all other types
  return "string";
}

function generateInterface(mapping: TableFieldMapping): string {
  const interfaceName = `ServiceNow${mapping.tableName.charAt(0).toUpperCase() + mapping.tableName.slice(1).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())}`;

  let output = `/**
 * ServiceNow ${mapping.tableName} interface - Generated from REAL field discovery
 * Total fields: ${mapping.totalFields}
 * Record ID: ${mapping.recordId}
 * Record Number: ${typeof mapping.recordNumber === "object" ? mapping.recordNumber.display_value || mapping.recordNumber.value : mapping.recordNumber}
 * Generated: ${new Date().toISOString()}
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Base ServiceNow reference type
export interface ServiceNowReference {
  display_value: string;
  value: string;
  link?: string;
}

export interface ${interfaceName} {\n`;

  // Sort fields alphabetically for consistency
  const sortedFields = mapping.fieldAnalysis.sort((a, b) =>
    a.fieldName.localeCompare(b.fieldName),
  );

  for (const field of sortedFields) {
    const fieldType = getTypeScriptType(field);
    const optional = field.isNull || field.isEmpty ? "?" : "";

    // Add comment with field details and sample value
    let comment = `/** ${field.dataType} field`;
    if (field.isReference) {
      comment += ` - Reference`;
    }
    if (field.sampleDisplayValue && field.sampleDisplayValue !== "") {
      comment += ` - Sample: "${field.sampleDisplayValue}"`;
    } else if (
      field.sampleValue &&
      field.sampleValue !== "" &&
      !field.isReference
    ) {
      comment += ` - Sample: "${field.sampleValue}"`;
    }
    comment += ` */`;

    output += `  ${comment}\n`;
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
  output += `  originalRecord: {\n`;
  output += `    recordId: "${mapping.recordId}";\n`;
  output += `    recordNumber: "${typeof mapping.recordNumber === "object" ? mapping.recordNumber.display_value || mapping.recordNumber.value : mapping.recordNumber}";\n`;
  if (mapping.capturedAt) {
    output += `    capturedAt: "${mapping.capturedAt}";\n`;
  }
  output += `  };\n`;
  output += `}\n`;

  return output;
}

function generateTableSummary(mappings: TableFieldMapping[]): string {
  let output = `/**
 * ServiceNow Tables Summary - Real Field Counts
 * Generated: ${new Date().toISOString()}
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface ServiceNowTablesSummary {\n`;

  mappings.forEach((mapping) => {
    const tableName = mapping.tableName.toUpperCase();
    output += `  ${tableName}: {\n`;
    output += `    totalFields: ${mapping.totalFields};\n`;
    output += `    tableName: "${mapping.tableName}";\n`;
    output += `    interface: "ServiceNow${mapping.tableName.charAt(0).toUpperCase() + mapping.tableName.slice(1).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())}";\n`;
    output += `  };\n`;
  });

  output += `}\n\n`;

  output += `export const SERVICENOW_FIELD_COUNTS = {\n`;
  mappings.forEach((mapping) => {
    const tableName = mapping.tableName.toUpperCase();
    output += `  ${tableName}: ${mapping.totalFields},\n`;
  });
  output += `} as const;\n`;

  return output;
}

async function main() {
  console.log(
    "🔧 Generating TypeScript interfaces from REAL ServiceNow field mappings...",
  );

  const mappingsDir = join(process.cwd(), "src", "tests", "field-mappings");
  const outputDir = join(process.cwd(), "src", "types", "servicenow");

  // Create output directory if it doesn't exist
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const files = readdirSync(mappingsDir).filter((f) => f.endsWith(".json"));
  const processedMappings: TableFieldMapping[] = [];

  for (const file of files) {
    try {
      console.log(`📋 Processing ${file}...`);

      const filePath = join(mappingsDir, file);
      const content = readFileSync(filePath, "utf-8");
      const mapping: TableFieldMapping = JSON.parse(content);

      // Skip fallback mappings - only process real data
      if (
        mapping.recordId.startsWith("FALLBACK_") ||
        mapping.recordId.startsWith("EMERGENCY_")
      ) {
        console.log(`⚠️ Skipping fallback mapping: ${file}`);
        continue;
      }

      // Skip if contains fallback data
      const hasFallbackData = mapping.fieldAnalysis.some(
        (field) =>
          field.sampleValue === "FALLBACK_VALUE" ||
          field.sampleDisplayValue === "Fallback Display Value",
      );

      if (hasFallbackData) {
        console.log(`⚠️ Skipping fallback data mapping: ${file}`);
        continue;
      }

      // Only process mappings with significant field counts (real data)
      if (mapping.totalFields < 50) {
        console.log(
          `⚠️ Skipping small mapping (${mapping.totalFields} fields): ${file}`,
        );
        continue;
      }

      const interfaceCode = generateInterface(mapping);

      const outputFileName = `${mapping.tableName}.ts`;
      const outputPath = join(outputDir, outputFileName);

      writeFileSync(outputPath, interfaceCode);
      console.log(
        `✅ Generated interface for ${mapping.tableName} (${mapping.totalFields} REAL fields)`,
      );
      console.log(`   Output: ${outputPath}`);

      processedMappings.push(mapping);
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error);
    }
  }

  // Generate summary file
  if (processedMappings.length > 0) {
    const summaryContent = generateTableSummary(processedMappings);
    const summaryPath = join(outputDir, "summary.ts");
    writeFileSync(summaryPath, summaryContent);
    console.log(`📊 Generated summary file: ${summaryPath}`);
  }

  // Generate index.ts file
  const indexContent = `/**
 * ServiceNow TypeScript interfaces - Auto-generated from REAL data
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

${processedMappings.map((m) => `export * from './${m.tableName}';`).join("\n")}
export * from './summary';

// Re-export common types
export type { ServiceNowReference } from './incident';
`;

  const indexPath = join(outputDir, "index.ts");
  writeFileSync(indexPath, indexContent);

  console.log("\n🎯 REAL INTERFACE GENERATION SUMMARY");
  console.log("═══════════════════════════════════════");
  console.log(`✅ Generated interfaces in: ${outputDir}`);
  console.log("📋 Real data interfaces created:");
  processedMappings.forEach((mapping) => {
    console.log(`   - ${mapping.tableName}.ts (${mapping.totalFields} fields)`);
  });
  console.log(`   - summary.ts (field counts comparison)`);
  console.log(`   - index.ts (export file)`);

  console.log("\n📊 FIELD COUNT SUMMARY:");
  processedMappings.forEach((mapping) => {
    const referenceFields = mapping.fieldAnalysis.filter(
      (f) => f.isReference,
    ).length;
    const dateFields = mapping.fieldAnalysis.filter(
      (f) => f.dataType === "datetime" || f.dataType === "date",
    ).length;
    console.log(
      `   ${mapping.tableName}: ${mapping.totalFields} total (${referenceFields} references, ${dateFields} dates)`,
    );
  });

  console.log("\n🚀 Real TypeScript interfaces ready for use!");
  console.log(
    "🎯 No more fallback mappings - all interfaces based on production data!",
  );
}

if (import.meta.main) {
  main().catch(console.error);
}
