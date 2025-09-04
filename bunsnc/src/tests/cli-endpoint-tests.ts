#!/usr/bin/env bun
/**
 * CLI Endpoint Tests for ServiceNow Data Mapping
 * Uses bunsnc CLI client to test and map ServiceNow endpoints
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Command } from "commander";
import { ServiceNowEndpointMapper } from "./ServiceNowEndpointMapper";
import * as dotenv from "dotenv";

dotenv.config();

const program = new Command();
program.name("cli-endpoint-tests").description("CLI para testar e mapear endpoints ServiceNow").version("1.0.0");

const getEnv = (key: string, fallback = "") => process.env[key] || fallback;

function validateEnvironment(): { instanceUrl: string; token: string } {
  // Try both naming conventions for compatibility
  const instanceUrl = getEnv("SERVICENOW_INSTANCE_URL") || getEnv("SNC_INSTANCE_URL");
  let token = getEnv("SNC_AUTH_TOKEN");
  
  // If no explicit token, try to construct from username/password
  if (!token) {
    const username = getEnv("SERVICENOW_USERNAME");
    const password = getEnv("SERVICENOW_PASSWORD");
    
    if (username && password) {
      const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
      token = `Basic ${basicAuth}`;
    }
  }
  
  if (!instanceUrl) {
    console.error("❌ Error: SERVICENOW_INSTANCE_URL or SNC_INSTANCE_URL environment variable is required");
    console.error("💡 Copy .env.example to .env and configure your ServiceNow credentials");
    process.exit(1);
  }
  
  if (!token) {
    console.error("❌ Error: ServiceNow authentication is required");
    console.error("💡 Set SNC_AUTH_TOKEN or (SERVICENOW_USERNAME + SERVICENOW_PASSWORD)");
    process.exit(1);
  }
  
  console.log(`🔗 Using ServiceNow instance: ${instanceUrl}`);
  return { instanceUrl, token };
}

async function createMapper(): Promise<ServiceNowEndpointMapper> {
  const { instanceUrl, token } = validateEnvironment();
  return new ServiceNowEndpointMapper(instanceUrl, token);
}

program
  .command("test-table")
  .description("Test a specific ServiceNow table endpoint")
  .requiredOption("-t, --table <table>", "Table name to test (e.g., incident, change_task)")
  .option("-l, --limit <number>", "Limit number of records", "100")
  .option("-f, --filter <filter>", "ServiceNow query filter")
  .option("--fields <fields>", "Comma-separated list of fields to retrieve")
  .action(async (opts) => {
    try {
      console.log(`🧪 Testing table: ${opts.table}`);
      
      const mapper = await createMapper();
      const fields = opts.fields ? opts.fields.split(',') : undefined;
      
      const result = await mapper.testEndpoint(
        opts.table, 
        opts.filter, 
        parseInt(opts.limit),
        fields
      );
      
      console.log("\n📊 Test Results:");
      console.log(`   Status: ${result.status}`);
      console.log(`   Response Time: ${result.responseTime}ms`);
      console.log(`   Record Count: ${result.recordCount}`);
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      
      if (result.sampleData && result.sampleData.length > 0) {
        console.log("\n🔬 Sample Data Structure:");
        const sample = result.sampleData[0];
        const fields = Object.keys(sample).slice(0, 10); // Show first 10 fields
        fields.forEach(field => {
          const value = sample[field];
          const type = typeof value;
          const preview = type === 'string' && value.length > 50 
            ? value.substring(0, 50) + '...' 
            : value;
          console.log(`   ${field} (${type}): ${preview}`);
        });
        
        if (Object.keys(sample).length > 10) {
          console.log(`   ... and ${Object.keys(sample).length - 10} more fields`);
        }
      }
      
    } catch (error: any) {
      console.error("❌ Test failed:", error.message);
      process.exit(1);
    }
  });

program
  .command("map-structure")
  .description("Map complete data structure of a table")
  .requiredOption("-t, --table <table>", "Table name to map")
  .option("-s, --sample-size <number>", "Number of records to analyze", "100")
  .option("--export", "Export results to JSON file")
  .action(async (opts) => {
    try {
      console.log(`📊 Mapping structure for table: ${opts.table}`);
      
      const mapper = await createMapper();
      const schema = await mapper.mapDataStructure(opts.table, parseInt(opts.sampleSize));
      
      console.log("\n🏗️ Table Schema:");
      console.log(`   Table: ${schema.tableName}`);
      console.log(`   Total Records: ${schema.totalRecords}`);
      console.log(`   Fields Count: ${schema.fields.length}`);
      console.log(`   Avg Response Size: ${schema.performance.avgResponseSize} bytes`);
      
      console.log("\n🔍 Field Analysis:");
      schema.fields
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 15) // Show top 15 fields
        .forEach(field => {
          const required = field.isRequired ? "Required" : "Optional";
          const unique = field.uniqueValues || 0;
          console.log(`   ${field.fieldName.padEnd(25)} | ${field.dataType.padEnd(8)} | ${required.padEnd(8)} | ${field.frequency.toFixed(1)}% | ${unique} unique`);
        });
      
      if (schema.fields.length > 15) {
        console.log(`   ... and ${schema.fields.length - 15} more fields`);
      }
      
      console.log("\n🔗 Detected Relationships:");
      schema.relationships.forEach(rel => {
        console.log(`   ${rel}`);
      });
      
      if (opts.export) {
        await mapper.exportResults();
      }
      
    } catch (error: any) {
      console.error("❌ Mapping failed:", error.message);
      process.exit(1);
    }
  });

program
  .command("performance-test")
  .description("Test performance limits of a table endpoint")
  .requiredOption("-t, --table <table>", "Table name to test")
  .action(async (opts) => {
    try {
      console.log(`⚡ Testing performance limits for table: ${opts.table}`);
      
      const mapper = await createMapper();
      const performance = await mapper.testPerformanceLimits(opts.table);
      
      console.log("\n⚡ Performance Results:");
      console.log(`   Max Limit: ${performance.maxLimit} records`);
      console.log(`   Avg Response Time: ${performance.avgResponseTime.toFixed(2)}ms`);
      console.log(`   Recommended Limit: ${performance.recommendedLimit} records`);
      
      if (performance.avgResponseTime > 10000) {
        console.log("   ⚠️  Warning: High response times detected");
      }
      
      if (performance.recommendedLimit < 100) {
        console.log("   ⚠️  Warning: Low recommended limit suggests performance issues");
      }
      
    } catch (error: any) {
      console.error("❌ Performance test failed:", error.message);
      process.exit(1);
    }
  });

program
  .command("analyze-all")
  .description("Analyze all critical ServiceNow tables")
  .option("--output <path>", "Output directory for results", "src/tests/data-schemas")
  .option("--generate-interfaces", "Generate TypeScript interfaces")
  .action(async (opts) => {
    try {
      console.log("🚀 Starting comprehensive analysis of all critical tables...");
      
      const mapper = await createMapper();
      
      // Test all critical tables
      await mapper.testAllCriticalTables();
      
      // Export results
      await mapper.exportResults();
      
      // Generate TypeScript interfaces if requested
      if (opts.generateInterfaces) {
        await mapper.generateTypeScriptInterfaces();
      }
      
      // Show summary
      const summary = mapper.getSummary();
      console.log("\n📈 Final Summary:");
      console.log(`   Tables Analyzed: ${summary.totalTables}`);
      console.log(`   Total Fields Mapped: ${summary.totalFields}`);
      console.log(`   Tables with Errors: ${summary.tablesWithErrors}`);
      console.log(`   Avg Response Time: ${summary.avgResponseTime.toFixed(2)}ms`);
      
      console.log("\n✅ Complete analysis finished!");
      console.log("📁 Check the data-schemas directory for detailed results");
      
    } catch (error: any) {
      console.error("❌ Analysis failed:", error.message);
      process.exit(1);
    }
  });

program
  .command("compare-tables")
  .description("Compare field structures between multiple tables")
  .requiredOption("-t, --tables <tables>", "Comma-separated list of tables to compare")
  .action(async (opts) => {
    try {
      const tables = opts.tables.split(',').map((t: string) => t.trim());
      console.log(`🔍 Comparing field structures across ${tables.length} tables...`);
      
      const mapper = await createMapper();
      const schemas = [];
      
      // Map each table
      for (const table of tables) {
        try {
          const schema = await mapper.mapDataStructure(table, 50);
          schemas.push(schema);
        } catch (error: any) {
          console.error(`❌ Failed to map ${table}:`, error.message);
        }
      }
      
      if (schemas.length < 2) {
        console.error("❌ Need at least 2 tables to compare");
        return;
      }
      
      // Find common fields
      const allFields = new Map<string, number>();
      schemas.forEach(schema => {
        schema.fields.forEach(field => {
          const count = allFields.get(field.fieldName) || 0;
          allFields.set(field.fieldName, count + 1);
        });
      });
      
      const commonFields = Array.from(allFields.entries())
        .filter(([, count]) => count === schemas.length)
        .map(([fieldName]) => fieldName);
      
      const partialFields = Array.from(allFields.entries())
        .filter(([, count]) => count > 1 && count < schemas.length)
        .sort((a, b) => b[1] - a[1]);
      
      console.log("\n📊 Comparison Results:");
      console.log(`   Common Fields (${commonFields.length}): ${commonFields.slice(0, 10).join(', ')}${commonFields.length > 10 ? '...' : ''}`);
      
      console.log(`\n   Partially Common Fields:`);
      partialFields.slice(0, 10).forEach(([field, count]) => {
        console.log(`     ${field}: appears in ${count}/${schemas.length} tables`);
      });
      
      // Show field counts per table
      console.log(`\n   Field Counts:`);
      schemas.forEach(schema => {
        console.log(`     ${schema.tableName}: ${schema.fields.length} fields`);
      });
      
    } catch (error: any) {
      console.error("❌ Comparison failed:", error.message);
      process.exit(1);
    }
  });

program
  .command("field-analysis")
  .description("Deep analysis of specific fields across tables")
  .requiredOption("-f, --field <field>", "Field name to analyze")
  .option("-t, --tables <tables>", "Comma-separated list of tables (default: critical tables)")
  .action(async (opts) => {
    try {
      const fieldName = opts.field;
      const tables = opts.tables 
        ? opts.tables.split(',').map((t: string) => t.trim())
        : ['incident', 'change_task', 'sc_task', 'sys_user_group'];
        
      console.log(`🔬 Deep analysis of field '${fieldName}' across ${tables.length} tables...`);
      
      const mapper = await createMapper();
      const fieldAnalyses = [];
      
      for (const table of tables) {
        try {
          const schema = await mapper.mapDataStructure(table, 100);
          const field = schema.fields.find(f => f.fieldName === fieldName);
          
          if (field) {
            fieldAnalyses.push({
              table,
              ...field
            });
          }
        } catch (error: any) {
          console.error(`❌ Failed to analyze ${table}:`, error.message);
        }
      }
      
      if (fieldAnalyses.length === 0) {
        console.log(`❌ Field '${fieldName}' not found in any of the specified tables`);
        return;
      }
      
      console.log(`\n📊 Field Analysis Results for '${fieldName}':`);
      console.log(`   Found in: ${fieldAnalyses.length}/${tables.length} tables`);
      
      fieldAnalyses.forEach(analysis => {
        console.log(`\n   📋 ${analysis.table}:`);
        console.log(`      Data Type: ${analysis.dataType}`);
        console.log(`      Required: ${analysis.isRequired ? 'Yes' : 'No'}`);
        console.log(`      Frequency: ${analysis.frequency.toFixed(1)}%`);
        console.log(`      Unique Values: ${analysis.uniqueValues}`);
        console.log(`      Null Count: ${analysis.nullCount}`);
        
        if (analysis.minLength !== undefined) {
          console.log(`      String Length: ${analysis.minLength} - ${analysis.maxLength}`);
        }
        
        if (analysis.sampleValues.length > 0) {
          const samples = analysis.sampleValues.slice(0, 3).map(v => 
            typeof v === 'string' && v.length > 30 ? v.substring(0, 30) + '...' : v
          );
          console.log(`      Sample Values: ${samples.join(', ')}`);
        }
      });
      
    } catch (error: any) {
      console.error("❌ Field analysis failed:", error.message);
      process.exit(1);
    }
  });

program
  .command("quick-test")
  .description("Quick test of bunsnc CLI functionality with ServiceNow endpoints")
  .option("-t, --table <table>", "Table to test", "incident")
  .option("-l, --limit <number>", "Limit records", "5")
  .action(async (opts) => {
    try {
      console.log("🚀 Running quick test of ServiceNow connectivity...");
      
      const { instanceUrl, token } = validateEnvironment();
      const mapper = await createMapper();
      
      // Test basic connectivity
      const result = await mapper.testEndpoint(opts.table, undefined, parseInt(opts.limit));
      
      if (result.status === 'success') {
        console.log("✅ ServiceNow connectivity: OK");
        console.log(`✅ Table '${opts.table}': ${result.recordCount} records retrieved in ${result.responseTime}ms`);
        
        if (result.sampleData && result.sampleData.length > 0) {
          const sample = result.sampleData[0];
          console.log(`✅ Sample record has ${Object.keys(sample).length} fields`);
          console.log("🔍 First few fields:", Object.keys(sample).slice(0, 5).join(', '));
        }
        
        console.log("\n🎉 Quick test completed successfully!");
        console.log("💡 Ready to run full analysis with 'analyze-all' command");
        
      } else {
        console.error("❌ ServiceNow connectivity: FAILED");
        console.error(`❌ Error: ${result.error}`);
        process.exit(1);
      }
      
    } catch (error: any) {
      console.error("❌ Quick test failed:", error.message);
      process.exit(1);
    }
  });

// Show help by default
if (process.argv.length <= 2) {
  program.help();
}

program.parseAsync(process.argv);