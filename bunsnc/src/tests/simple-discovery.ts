#!/usr/bin/env bun
/**
 * Simple Discovery - Uso direto da ServiceNowFetchClient para descobrir sc_task e change_task
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Force correct ServiceNow proxy from environment variables
process.env.SERVICENOW_PROXY =
  `http://${process.env.CORPORATE_PROXY_USER}:${process.env.CORPORATE_PROXY_PASSWORD}@10.219.77.12:8080`;

import { ServiceNowFetchClient } from "../services/ServiceNowFetchClient";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { MongoClient } from "mongodb";

async function getGroupsFromMongoDB(): Promise<string[]> {
  const mongoUrl =
    process.env.MONGODB_URL ||
    "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin";
  const mongoClient = new MongoClient(mongoUrl);

  try {
    await mongoClient.connect();
    const db = mongoClient.db("bunsnc");
    const collection = db.collection("sn_groups");

    const groups = await collection.find({}).toArray();
    console.log(
      `   📋 Found ${groups.length} groups in MongoDB sn_groups collection`,
    );

    return groups
      .map(
        (group: any) =>
          group.data?.nome || group.name || group.display_value || group._id,
      )
      .filter(Boolean);
  } catch (error) {
    console.error(`   ⚠️ Failed to read groups from MongoDB: ${error.message}`);
    // Fallback to hardcoded groups if MongoDB fails
    return [
      "L2-NE-IT APP AND DATABASE",
      "L2-NE-IT SAP BASIS",
      "L2-NE-IT APP AND SERVICES",
      "L2-NE-IT PROCESSING",
      "L2-NE-IT NETWORK",
    ];
  } finally {
    await mongoClient.close();
  }
}

async function discoverTable(tableName: string) {
  console.log(`🔍 Discovering ${tableName}...`);

  const client = new ServiceNowFetchClient();

  try {
    await client.authenticate();

    // Use current month period (September 2025)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");

    const startDate = `${currentYear}-${currentMonth}-01`;
    const endDate = `${currentYear}-${currentMonth}-31`;

    console.log(
      `   📅 Using period: Current month (${startDate} to ${endDate})`,
    );

    // Get groups from MongoDB sn_groups collection
    const testGroups = await getGroupsFromMongoDB();

    let result = null;
    for (const group of testGroups) {
      console.log(`   🎯 Trying group: ${group}`);

      try {
        // Build query like Python: assignment_group.name CONTAINS group + sys_updated_on filter
        const query = `assignment_group.name CONTAINS ${group}^sys_updated_on>=${startDate} 00:00:00`;
        const tempResult = await client.makeRequestFullFields(
          tableName,
          query,
          1,
          true,
        ); // Skip period filter

        if (tempResult && tempResult.result && tempResult.result.length > 0) {
          result = tempResult;
          console.log(`   ✅ Found data in group: ${group}`);
          break;
        } else {
          console.log(`   ⚠️ No data in group: ${group}`);
        }
      } catch (error) {
        console.log(`   ❌ Error in group ${group}: ${error.message}`);
        if (error.message.includes("aborted")) {
          console.log(`   ⏰ Timeout - trying next group...`);
          continue;
        }
      }
    }

    if (result && result.result && result.result.length > 0) {
      const record = result.result[0];
      const fieldCount = Object.keys(record).length;

      console.log(`✅ ${tableName}: Found ${fieldCount} fields`);
      console.log(`📊 Record ID: ${record.sys_id}`);
      console.log(`📊 Record Number: ${record.number || "N/A"}`);

      // Save to file for interface generation
      const outputDir = join(process.cwd(), "src", "tests", "field-mappings");
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const filename = `servicenow-field-mapping-${tableName}-${Date.now()}.json`;
      const filepath = join(outputDir, filename);

      const analysis = {
        tableName,
        recordId: record.sys_id || "unknown",
        recordNumber: record.number || "unknown",
        totalFields: fieldCount,
        sampleDocument: record,
        analysisDate: new Date().toISOString(),
        capturedAt: new Date().toISOString(),
      };

      writeFileSync(filepath, JSON.stringify(analysis, null, 2));
      console.log(`💾 Saved: ${filepath}`);

      return true;
    } else {
      console.log(`❌ ${tableName}: No records found`);
      return false;
    }
  } catch (error) {
    console.error(`❌ ${tableName}: Error -`, error.message);
    return false;
  }
}

async function main() {
  console.log("🚀 SIMPLE DISCOVERY - SC_Task & Change_Task");
  console.log("==========================================");

  const tables = ["sc_task", "change_task"];
  let discovered = 0;

  for (const table of tables) {
    const success = await discoverTable(table);
    if (success) discovered++;
    console.log(""); // Add spacing
  }

  console.log(
    `🎯 Discovery complete: ${discovered}/${tables.length} tables found`,
  );
}

if (import.meta.main) {
  main().catch(console.error);
}
