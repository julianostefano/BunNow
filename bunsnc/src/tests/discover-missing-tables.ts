#!/usr/bin/env bun
/**
 * Discover Missing Tables - Descoberta de campos para sc_task e change_task
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowFetchClient } from "../services/ServiceNowFetchClient";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

interface FieldAnalysis {
  fieldName: string;
  dataType: string;
  sampleValues: any[];
  isReference: boolean;
  isArray: boolean;
  isNull: boolean;
  frequency: number;
  percentage: number;
}

interface TableAnalysis {
  tableName: string;
  recordId: string;
  recordNumber: string;
  totalFields: number;
  fieldAnalysis: FieldAnalysis[];
  sampleDocument: any;
  analysisDate: string;
  capturedAt: string;
  analysisTime: number;
}

class MissingTablesDiscovery {
  private client: ServiceNowFetchClient;

  constructor() {
    this.client = new ServiceNowFetchClient();
  }

  /**
   * Discover fields for a table with simple queries
   */
  async discoverTable(tableName: string): Promise<TableAnalysis | null> {
    console.log(`🔍 Discovering fields for table: ${tableName}`);

    try {
      // Try simple queries first
      const queries = [
        "", // Get any record - simplest query
        "state=3", // Active state
        "active=true", // Active records
      ];

      let result = null;
      let usedQuery = "";

      for (const query of queries) {
        try {
          console.log(`   🎯 Trying query: ${query || "(no filter)"}`);
          result = await this.client.makeRequestFullFields(tableName, query, 1);

          if (result.result && result.result.length > 0) {
            usedQuery = query;
            console.log(`   ✅ Found ${result.result.length} record(s)`);
            break;
          }
        } catch (error) {
          console.log(`   ⚠️ Query failed: ${error.message}`);
          continue; // Try next query
        }
      }

      if (!result || !result.result || result.result.length === 0) {
        console.log(`   ❌ No records found for table ${tableName}`);
        return null;
      }

      const record = result.result[0];
      const startTime = Date.now();

      // Analyze all fields
      const fieldMap = new Map<string, FieldAnalysis>();
      this.analyzeRecordFields(record, fieldMap);

      const fieldAnalysis = Array.from(fieldMap.values()).sort((a, b) =>
        a.fieldName.localeCompare(b.fieldName),
      );

      const analysis: TableAnalysis = {
        tableName,
        recordId: record.sys_id || "unknown",
        recordNumber: record.number || "unknown",
        totalFields: fieldAnalysis.length,
        fieldAnalysis,
        sampleDocument: record,
        analysisDate: new Date().toISOString(),
        capturedAt: new Date().toISOString(),
        analysisTime: Date.now() - startTime,
      };

      console.log(`   📊 Analyzed ${fieldAnalysis.length} fields`);
      return analysis;
    } catch (error) {
      console.error(
        `❌ Failed to discover fields for ${tableName}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Analyze fields in a record
   */
  private analyzeRecordFields(
    obj: any,
    fieldMap: Map<string, FieldAnalysis>,
    prefix = "",
  ): void {
    if (!obj || typeof obj !== "object") return;

    for (const [key, value] of Object.entries(obj)) {
      const fullFieldName = prefix ? `${prefix}.${key}` : key;

      if (!fieldMap.has(fullFieldName)) {
        fieldMap.set(fullFieldName, {
          fieldName: fullFieldName,
          dataType: this.getDataType(value),
          sampleValues: [],
          isReference: this.isServiceNowReference(value),
          isArray: Array.isArray(value),
          isNull: value === null || value === undefined,
          frequency: 1,
          percentage: 100,
        });
      }

      const fieldAnalysis = fieldMap.get(fullFieldName)!;

      // Add sample value (max 3)
      if (fieldAnalysis.sampleValues.length < 3) {
        const valueToStore = this.isServiceNowReference(value)
          ? { display_value: value.display_value, value: value.value }
          : value;

        if (
          !fieldAnalysis.sampleValues.some(
            (v) => JSON.stringify(v) === JSON.stringify(valueToStore),
          )
        ) {
          fieldAnalysis.sampleValues.push(valueToStore);
        }
      }

      // Recursively analyze nested objects (limit depth)
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        !prefix.includes(".")
      ) {
        this.analyzeRecordFields(value, fieldMap, fullFieldName);
      }
    }
  }

  /**
   * Determine data type
   */
  private getDataType(value: any): string {
    if (value === null || value === undefined) return "null";
    if (this.isServiceNowReference(value)) return "reference";
    if (Array.isArray(value)) return "array";

    const type = typeof value;
    if (type === "string") {
      if (
        value.match(/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/) ||
        value.match(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}/)
      ) {
        return "datetime";
      }
      if (value.match(/^\\d{4}-\\d{2}-\\d{2}$/)) {
        return "date";
      }
    }
    return type;
  }

  /**
   * Check if value is ServiceNow reference
   */
  private isServiceNowReference(value: any): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof value.display_value !== "undefined" &&
      typeof value.value !== "undefined"
    );
  }

  /**
   * Save analysis to JSON file
   */
  async saveAnalysis(analysis: TableAnalysis): Promise<void> {
    const outputDir = join(process.cwd(), "src", "tests", "field-mappings");

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const filename = `servicenow-field-mapping-${analysis.tableName}-${Date.now()}.json`;
    const filepath = join(outputDir, filename);

    writeFileSync(filepath, JSON.stringify(analysis, null, 2));
    console.log(`💾 Real field mapping saved: ${filepath}`);
  }
}

async function main() {
  console.log("🚀 MISSING TABLES DISCOVERY - SC_Task & Change_Task");
  console.log("==================================================");

  const discovery = new MissingTablesDiscovery();
  const tablesToDiscover = ["sc_task", "change_task"];
  const results: TableAnalysis[] = [];

  for (const tableName of tablesToDiscover) {
    try {
      console.log(`\\n📋 DISCOVERING: ${tableName}`);
      const analysis = await discovery.discoverTable(tableName);

      if (analysis) {
        await discovery.saveAnalysis(analysis);
        results.push(analysis);
        console.log(
          `✅ ${tableName}: ${analysis.totalFields} real fields discovered`,
        );
      } else {
        console.log(`⚠️ ${tableName}: No data found`);
      }
    } catch (error) {
      console.error(`❌ ${tableName}: Discovery failed -`, error.message);
    }
  }

  console.log("\\n🎯 DISCOVERY SUMMARY");
  console.log("==================");
  results.forEach((analysis) => {
    console.log(`✅ ${analysis.tableName}: ${analysis.totalFields} fields`);
  });

  console.log(
    `\\n🚀 Discovery completed! Found ${results.length} real table mappings.`,
  );
}

if (import.meta.main) {
  main().catch(console.error);
}
