#!/usr/bin/env bun
/**
 * Real Field Discovery using ServiceNowFetchClient (Native Fetch)
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowFetchClient } from "../services/ServiceNowFetchClient";
import { MongoClient } from "mongodb";

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

class RealFieldDiscoveryFetch {
  private serviceNowClient: ServiceNowFetchClient;
  private mongoClient: MongoClient;

  constructor() {
    this.serviceNowClient = new ServiceNowFetchClient();

    const mongoUrl =
      process.env.MONGODB_URL ||
      "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin";
    this.mongoClient = new MongoClient(mongoUrl);
  }

  /**
   * Discover fields for a specific table using ServiceNow API
   */
  async discoverTableFields(tableName: string): Promise<TableAnalysis | null> {
    console.log(
      `🔍 [DISCOVERY] Starting field discovery for table: ${tableName}`,
    );

    try {
      // Try different queries to find records
      const queries = [
        "state=3^assignment_group.nameCONTAINSIT Operations",
        "state=3^assignment_group.nameCONTAINSDatabase Administration",
        "state=3^assignment_group.nameCONTAINSNetwork Support",
        "state=3", // Simple state query
        "", // Get any record
      ];

      let result = null;
      let usedQuery = "";

      for (const query of queries) {
        try {
          console.log(`   🎯 Trying query: ${query || "(no filter)"}`);
          result = await this.serviceNowClient.makeRequestFullFields(
            tableName,
            query,
            1,
          );

          if (result.result && result.result.length > 0) {
            usedQuery = query;
            console.log(
              `   ✅ Found ${result.result.length} record(s) with query: ${query || "(no filter)"}`,
            );
            break;
          }
        } catch (error) {
          console.log(`   ⚠️ Query failed: ${error.message}`);
        }
      }

      if (!result || !result.result || result.result.length === 0) {
        console.log(`   ❌ No records found for table ${tableName}`);
        return null;
      }

      const record = result.result[0];
      const startTime = Date.now();

      // Analyze all fields in the record
      const fieldMap = new Map<string, FieldAnalysis>();
      this.analyzeRecordFields(record, fieldMap);

      // Convert to array and sort by field name
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

      console.log(
        `   📊 Analyzed ${fieldAnalysis.length} fields from ${tableName}`,
      );
      return analysis;
    } catch (error) {
      console.error(
        `❌ [DISCOVERY] Failed to discover fields for ${tableName}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Analyze fields in a record (recursive for nested objects)
   */
  private analyzeRecordFields(
    obj: any,
    fieldMap: Map<string, FieldAnalysis>,
    prefix = "",
  ): void {
    if (!obj || typeof obj !== "object") {
      return;
    }

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

      // Recursively analyze nested objects (limit depth to avoid deep nesting)
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
   * Determine data type of a value
   */
  private getDataType(value: any): string {
    if (value === null || value === undefined) {
      return "null";
    }

    if (this.isServiceNowReference(value)) {
      return "reference";
    }

    if (Array.isArray(value)) {
      return "array";
    }

    const type = typeof value;

    if (type === "string") {
      // Check for date patterns
      if (
        value.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/) ||
        value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      ) {
        return "datetime";
      }
      if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return "date";
      }
    }

    return type;
  }

  /**
   * Check if value is a ServiceNow reference object
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
   * Generate detailed report
   */
  generateReport(analysis: TableAnalysis): void {
    console.log(
      `\n📋 REAL FIELD DISCOVERY REPORT - ${analysis.tableName.toUpperCase()}`,
    );
    console.log(
      `════════════════════════════════════════════════════════════════`,
    );
    console.log(`Table: ${analysis.tableName}`);
    console.log(`Record ID: ${analysis.recordId}`);
    console.log(`Record Number: ${analysis.recordNumber}`);
    console.log(`Total Fields: ${analysis.totalFields}`);
    console.log(`Analysis Time: ${analysis.analysisTime}ms`);
    console.log(`Captured At: ${analysis.capturedAt}`);

    // Group fields by type
    const fieldsByType = {
      reference: analysis.fieldAnalysis.filter((f) => f.isReference),
      datetime: analysis.fieldAnalysis.filter((f) => f.dataType === "datetime"),
      date: analysis.fieldAnalysis.filter((f) => f.dataType === "date"),
      string: analysis.fieldAnalysis.filter(
        (f) => f.dataType === "string" && !f.isReference,
      ),
      number: analysis.fieldAnalysis.filter((f) => f.dataType === "number"),
      boolean: analysis.fieldAnalysis.filter((f) => f.dataType === "boolean"),
      array: analysis.fieldAnalysis.filter((f) => f.isArray),
      object: analysis.fieldAnalysis.filter(
        (f) => f.dataType === "object" && !f.isReference,
      ),
      null: analysis.fieldAnalysis.filter((f) => f.isNull),
    };

    console.log(`\n🏷️  FIELD TYPE DISTRIBUTION:`);
    Object.entries(fieldsByType).forEach(([type, fields]) => {
      console.log(`   ${type.padEnd(12)}: ${fields.length} fields`);
    });

    console.log(`\n📄 TOP-LEVEL FIELDS:`);
    const topLevelFields = analysis.fieldAnalysis.filter(
      (f) => !f.fieldName.includes("."),
    );
    console.log(`   Count: ${topLevelFields.length}`);

    topLevelFields.slice(0, 25).forEach((field, index) => {
      const num = String(index + 1).padStart(2, "0");
      const name = field.fieldName.padEnd(35);
      const type = field.dataType.padEnd(12);
      console.log(`${num}. ${name} [${type}]`);
    });

    console.log(`\n🔗 REFERENCE FIELDS SAMPLE:`);
    fieldsByType.reference.slice(0, 10).forEach((field, index) => {
      console.log(`${index + 1}. ${field.fieldName}`);
      if (field.sampleValues.length > 0) {
        const sample = field.sampleValues[0];
        console.log(`   Display: "${sample.display_value}"`);
        console.log(`   Value: "${sample.value}"`);
      }
    });

    console.log(`\n✅ DISCOVERY SUMMARY:`);
    console.log(
      `📊 Discovered ${analysis.totalFields} real fields from ServiceNow`,
    );
    console.log(`🔗 Found ${fieldsByType.reference.length} reference fields`);
    console.log(
      `📅 Found ${fieldsByType.datetime.length + fieldsByType.date.length} date/time fields`,
    );
    console.log(`📝 Found ${fieldsByType.string.length} text fields`);
    console.log(`🔢 Found ${fieldsByType.number.length} numeric fields`);
  }

  /**
   * Save analysis to JSON file
   */
  async saveAnalysis(analysis: TableAnalysis): Promise<void> {
    const fs = await import("fs");
    const path = await import("path");

    const outputDir = path.join(
      process.cwd(),
      "src",
      "tests",
      "field-mappings",
    );

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `servicenow-field-mapping-${analysis.tableName}-${Date.now()}.json`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(analysis, null, 2));
    console.log(`💾 Real field analysis saved to: ${filepath}`);
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    try {
      await this.mongoClient.close();
      console.log("🔐 MongoDB connection closed");
    } catch (error) {
      console.warn(
        "Warning: Failed to close MongoDB connection:",
        error.message,
      );
    }
  }
}

// Main execution
async function main() {
  const discovery = new RealFieldDiscoveryFetch();

  try {
    console.log(
      "🚀 REAL FIELD DISCOVERY - ServiceNowFetchClient (Native Fetch)",
    );
    console.log(
      "════════════════════════════════════════════════════════════════",
    );

    // Discover fields for all three tables
    const tablesToDiscover = ["incident", "change_task", "sc_task"];
    const analyses: TableAnalysis[] = [];

    for (const tableName of tablesToDiscover) {
      try {
        console.log(`\n📋 DISCOVERING: ${tableName}`);
        const analysis = await discovery.discoverTableFields(tableName);

        if (analysis) {
          discovery.generateReport(analysis);
          await discovery.saveAnalysis(analysis);
          analyses.push(analysis);

          console.log(`\n✅ Completed field discovery for ${tableName}`);
        } else {
          console.log(`\n⚠️ No data found for ${tableName}`);
        }
      } catch (error) {
        console.error(
          `❌ Failed to discover fields for ${tableName}:`,
          error.message,
        );
      }
    }

    // Final summary
    console.log("\n🎯 FIELD DISCOVERY SUMMARY");
    console.log("═══════════════════════════");
    analyses.forEach((analysis) => {
      console.log(
        `✅ ${analysis.tableName}: ${analysis.totalFields} real fields discovered`,
      );
    });

    // Performance metrics
    const metrics = discovery.serviceNowClient.getMetrics();
    console.log(`\n📊 PERFORMANCE METRICS:`);
    console.log(`   Total requests: ${metrics.totalRequests}`);
    console.log(`   Successful requests: ${metrics.successfulRequests}`);
    console.log(`   Failed requests: ${metrics.failedRequests}`);
    console.log(`   Average response time: ${metrics.averageResponseTime}ms`);

    console.log("\n🚀 Real field discovery completed!");
    console.log("📋 Next step: Generate TypeScript interfaces from real data");
  } catch (error) {
    console.error("💥 Discovery failed:", error.message);
    process.exit(1);
  } finally {
    await discovery.close();
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(console.error);
}

export { RealFieldDiscoveryFetch, type TableAnalysis, type FieldAnalysis };
