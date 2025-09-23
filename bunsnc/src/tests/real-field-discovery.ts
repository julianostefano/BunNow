#!/usr/bin/env bun
/**
 * Real Field Discovery using existing SAML auth and MongoDB infrastructure
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketSyncService } from "../services/ticket/TicketSyncService";
import { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import { MongoClient } from "mongodb";

interface FieldAnalysis {
  fieldName: string;
  dataType: string;
  sampleValues: any[];
  isReference: boolean;
  isArray: boolean;
  isNull: boolean;
  frequency: number;
}

interface TableAnalysis {
  tableName: string;
  totalDocuments: number;
  totalUniqueFields: number;
  fieldAnalysis: FieldAnalysis[];
  sampleDocument: any;
  analysisDate: string;
}

class RealFieldDiscovery {
  private serviceNowClient: ServiceNowAuthClient;
  private ticketSyncService: TicketSyncService;
  private mongoClient: MongoClient;

  constructor() {
    this.serviceNowClient = new ServiceNowAuthClient();
    this.ticketSyncService = new TicketSyncService(this.serviceNowClient);

    const mongoUrl =
      process.env.MONGODB_URL ||
      "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin";
    this.mongoClient = new MongoClient(mongoUrl);
  }

  /**
   * Execute full ticket synchronization using existing service
   */
  async executeSync(): Promise<void> {
    console.log(
      "🔄 [SYNC] Starting ticket synchronization using existing TicketSyncService...",
    );

    try {
      const result = await this.ticketSyncService.syncCurrentMonthTickets();

      console.log("✅ [SYNC] Synchronization completed:");
      console.log(
        `  Incidents: ${result.stats.incidents.synced} synced, ${result.stats.incidents.errors} errors`,
      );
      console.log(
        `  Change Tasks: ${result.stats.change_tasks.synced} synced, ${result.stats.change_tasks.errors} errors`,
      );
      console.log(
        `  SC Tasks: ${result.stats.sc_tasks.synced} synced, ${result.stats.sc_tasks.errors} errors`,
      );
      console.log(
        `  Groups: ${result.stats.groups.synced} synced, ${result.stats.groups.errors} errors`,
      );
    } catch (error) {
      console.error("❌ [SYNC] Synchronization failed:", error.message);
      throw error;
    }
  }

  /**
   * Analyze MongoDB collection to discover real fields
   */
  async analyzeCollection(collectionName: string): Promise<TableAnalysis> {
    try {
      await this.mongoClient.connect();
      const db = this.mongoClient.db("bunsnc");
      const collection = db.collection(collectionName);

      console.log(`🔍 [ANALYSIS] Analyzing collection: ${collectionName}`);

      // Get total document count
      const totalDocuments = await collection.countDocuments();
      console.log(`  Total documents: ${totalDocuments}`);

      if (totalDocuments === 0) {
        throw new Error(
          `Collection ${collectionName} is empty. Run sync first.`,
        );
      }

      // Get sample documents for field analysis
      const sampleSize = Math.min(100, totalDocuments);
      const sampleDocuments = await collection
        .find({})
        .limit(sampleSize)
        .toArray();

      // Analyze fields across all sample documents
      const fieldMap = new Map<string, FieldAnalysis>();

      for (const doc of sampleDocuments) {
        this.analyzeDocumentFields(doc, fieldMap);
      }

      // Convert map to array and sort by field name
      const fieldAnalysis = Array.from(fieldMap.values()).sort((a, b) =>
        a.fieldName.localeCompare(b.fieldName),
      );

      const analysis: TableAnalysis = {
        tableName: collectionName,
        totalDocuments,
        totalUniqueFields: fieldAnalysis.length,
        fieldAnalysis,
        sampleDocument: sampleDocuments[0],
        analysisDate: new Date().toISOString(),
      };

      console.log(`  Unique fields discovered: ${fieldAnalysis.length}`);
      return analysis;
    } catch (error) {
      console.error(
        `❌ [ANALYSIS] Failed to analyze ${collectionName}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Recursively analyze fields in a document
   */
  private analyzeDocumentFields(
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
          frequency: 0,
        });
      }

      const fieldAnalysis = fieldMap.get(fullFieldName)!;
      fieldAnalysis.frequency++;

      // Add unique sample values (max 5)
      if (
        fieldAnalysis.sampleValues.length < 5 &&
        !fieldAnalysis.sampleValues.includes(value)
      ) {
        fieldAnalysis.sampleValues.push(value);
      }

      // Recursively analyze nested objects
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        this.analyzeDocumentFields(value, fieldMap, fullFieldName);
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
      if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
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
      `\n📋 REAL FIELD ANALYSIS REPORT - ${analysis.tableName.toUpperCase()}`,
    );
    console.log(`════════════════════════════════════════════`);
    console.log(`Collection: ${analysis.tableName}`);
    console.log(`Total Documents: ${analysis.totalDocuments}`);
    console.log(`Unique Fields: ${analysis.totalUniqueFields}`);
    console.log(`Analysis Date: ${analysis.analysisDate}`);

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

    console.log(`\n📄 TOP-LEVEL FIELDS (non-nested):`);
    const topLevelFields = analysis.fieldAnalysis.filter(
      (f) => !f.fieldName.includes("."),
    );
    console.log(`   Count: ${topLevelFields.length}`);

    topLevelFields.slice(0, 20).forEach((field, index) => {
      const num = String(index + 1).padStart(2, "0");
      const name = field.fieldName.padEnd(30);
      const type = field.dataType.padEnd(12);
      const freq = `(${field.frequency}x)`;
      console.log(`${num}. ${name} [${type}] ${freq}`);
    });

    console.log(`\n🔗 REFERENCE FIELDS:`);
    fieldsByType.reference.slice(0, 15).forEach((field, index) => {
      console.log(`${index + 1}. ${field.fieldName}`);
      if (field.sampleValues.length > 0) {
        const sample = field.sampleValues[0];
        console.log(`   Display: "${sample.display_value}"`);
        console.log(`   Value: "${sample.value}"`);
      }
    });

    console.log(`\n✅ SUMMARY:`);
    console.log(
      `📊 Successfully analyzed ${analysis.totalDocuments} real documents`,
    );
    console.log(`🔍 Discovered ${analysis.totalUniqueFields} unique fields`);
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
      "real-field-mappings",
    );

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `real-field-analysis-${analysis.tableName}-${Date.now()}.json`;
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
  const discovery = new RealFieldDiscovery();

  try {
    console.log("🚀 REAL FIELD DISCOVERY - Using Existing Infrastructure");
    console.log("════════════════════════════════════════════════════════");

    // Step 1: Execute synchronization
    console.log("\n📋 STEP 1: Execute ticket synchronization");
    await discovery.executeSync();

    // Step 2: Analyze MongoDB collections for real field data
    console.log("\n📋 STEP 2: Analyze MongoDB collections");

    const collections = ["incidents", "change_tasks", "service_request_tasks"];
    const analyses: TableAnalysis[] = [];

    for (const collectionName of collections) {
      try {
        const analysis = await discovery.analyzeCollection(collectionName);
        discovery.generateReport(analysis);
        await discovery.saveAnalysis(analysis);
        analyses.push(analysis);

        console.log(`\n✅ Completed analysis for ${collectionName}`);
      } catch (error) {
        console.error(`❌ Failed to analyze ${collectionName}:`, error.message);
      }
    }

    // Step 3: Summary
    console.log("\n🎯 DISCOVERY SUMMARY");
    console.log("════════════════════");
    analyses.forEach((analysis) => {
      console.log(
        `✅ ${analysis.tableName}: ${analysis.totalUniqueFields} real fields discovered`,
      );
    });

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

export { RealFieldDiscovery, type TableAnalysis, type FieldAnalysis };
