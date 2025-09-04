#!/usr/bin/env bun
/**
 * Ticket Data Analysis - Specialized analysis for ServiceNow ticket tables
 * Focuses on incident, change_task, and sc_task data structures
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowEndpointMapper, TableSchema, FieldAnalysis } from "./ServiceNowEndpointMapper";
import * as dotenv from "dotenv";
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

dotenv.config();

interface TicketAnalysis {
  tableName: string;
  ticketType: 'incident' | 'change_task' | 'sc_task';
  totalRecords: number;
  statusValues: string[];
  priorityValues: string[];
  stateValues: string[];
  assignmentGroups: string[];
  commonFields: string[];
  uniqueFields: string[];
  slaFields: string[];
  dateFields: string[];
  referenceFields: string[];
  businessFields: string[];
}

interface TicketComparison {
  commonToAll: string[];
  commonToSome: { field: string; tables: string[] }[];
  uniquePerTable: { table: string; fields: string[] }[];
  businessLogicFields: { field: string; purpose: string; tables: string[] }[];
  storageRecommendations: {
    sharedSchema: string[];
    tableSpecific: { table: string; fields: string[] }[];
    indexes: string[];
  };
}

class TicketDataAnalyzer {
  private mapper: ServiceNowEndpointMapper;
  private outputDir: string;
  private ticketAnalyses: TicketAnalysis[] = [];

  constructor(instanceUrl: string, authToken: string) {
    this.mapper = new ServiceNowEndpointMapper(instanceUrl, authToken);
    this.outputDir = join(process.cwd(), 'src', 'tests', 'ticket-analysis');
    
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Analyze a specific ticket table comprehensively
   */
  async analyzeTicketTable(
    tableName: string, 
    ticketType: 'incident' | 'change_task' | 'sc_task',
    sampleSize: number = 200
  ): Promise<TicketAnalysis> {
    console.log(`🎫 Analyzing ${ticketType} table: ${tableName}`);
    
    try {
      // Get comprehensive data structure
      const schema = await this.mapper.mapDataStructure(tableName, sampleSize);
      
      // Get some actual data for value analysis
      const testResult = await this.mapper.testEndpoint(tableName, undefined, 100);
      const records = testResult.sampleData || [];
      
      // Analyze ticket-specific data
      const analysis: TicketAnalysis = {
        tableName,
        ticketType,
        totalRecords: schema.totalRecords,
        statusValues: this.extractUniqueValues(records, ['status', 'state', 'incident_state']),
        priorityValues: this.extractUniqueValues(records, ['priority', 'urgency', 'impact']),
        stateValues: this.extractUniqueValues(records, ['state', 'ticket_state', 'work_state']),
        assignmentGroups: this.extractUniqueValues(records, ['assignment_group']).slice(0, 20), // Limit to top 20
        commonFields: this.identifyCommonTicketFields(schema.fields),
        uniqueFields: this.identifyUniqueFields(schema.fields, ticketType),
        slaFields: this.identifySLAFields(schema.fields),
        dateFields: this.identifyDateFields(schema.fields),
        referenceFields: this.identifyReferenceFields(schema.fields),
        businessFields: this.identifyBusinessFields(schema.fields, ticketType)
      };

      this.ticketAnalyses.push(analysis);
      
      console.log(`✅ ${ticketType} analysis complete:`);
      console.log(`   Total Fields: ${schema.fields.length}`);
      console.log(`   Common Fields: ${analysis.commonFields.length}`);
      console.log(`   Unique Fields: ${analysis.uniqueFields.length}`);
      console.log(`   SLA Fields: ${analysis.slaFields.length}`);
      console.log(`   Status Values: ${analysis.statusValues.length}`);
      
      return analysis;

    } catch (error: any) {
      console.error(`❌ Failed to analyze ${tableName}:`, error.message);
      throw error;
    }
  }

  /**
   * Compare all ticket tables and provide storage recommendations
   */
  async compareTicketTables(): Promise<TicketComparison> {
    if (this.ticketAnalyses.length < 2) {
      throw new Error("Need at least 2 ticket table analyses to compare");
    }

    console.log(`🔍 Comparing ${this.ticketAnalyses.length} ticket tables...`);

    // Get all unique fields from all tables
    const allFieldsMap = new Map<string, string[]>();
    
    this.ticketAnalyses.forEach(analysis => {
      const allFields = [
        ...analysis.commonFields,
        ...analysis.uniqueFields,
        ...analysis.slaFields,
        ...analysis.dateFields,
        ...analysis.referenceFields,
        ...analysis.businessFields
      ];
      
      allFields.forEach(field => {
        if (!allFieldsMap.has(field)) {
          allFieldsMap.set(field, []);
        }
        allFieldsMap.get(field)?.push(analysis.tableName);
      });
    });

    // Classify fields
    const commonToAll: string[] = [];
    const commonToSome: { field: string; tables: string[] }[] = [];
    const uniquePerTable: { table: string; fields: string[] }[] = [];

    Array.from(allFieldsMap.entries()).forEach(([field, tables]) => {
      if (tables.length === this.ticketAnalyses.length) {
        commonToAll.push(field);
      } else if (tables.length > 1) {
        commonToSome.push({ field, tables });
      }
    });

    // Find unique fields per table
    this.ticketAnalyses.forEach(analysis => {
      const uniqueFields = Array.from(allFieldsMap.entries())
        .filter(([field, tables]) => tables.length === 1 && tables[0] === analysis.tableName)
        .map(([field]) => field);
      
      if (uniqueFields.length > 0) {
        uniquePerTable.push({
          table: analysis.tableName,
          fields: uniqueFields
        });
      }
    });

    // Identify business logic fields
    const businessLogicFields = this.identifyBusinessLogicFields();

    // Generate storage recommendations
    const storageRecommendations = this.generateStorageRecommendations(
      commonToAll,
      commonToSome,
      uniquePerTable
    );

    const comparison: TicketComparison = {
      commonToAll,
      commonToSome: commonToSome.sort((a, b) => b.tables.length - a.tables.length),
      uniquePerTable,
      businessLogicFields,
      storageRecommendations
    };

    console.log("📊 Comparison Results:");
    console.log(`   Common to All: ${commonToAll.length} fields`);
    console.log(`   Common to Some: ${commonToSome.length} fields`);
    console.log(`   Table-Specific: ${uniquePerTable.length} table groups`);
    console.log(`   Business Logic Fields: ${businessLogicFields.length} fields`);

    return comparison;
  }

  /**
   * Run complete ticket analysis workflow
   */
  async runCompleteAnalysis(): Promise<{
    analyses: TicketAnalysis[];
    comparison: TicketComparison;
    recommendations: string[];
  }> {
    console.log("🚀 Starting complete ticket data analysis...");

    // Analyze each ticket table
    const ticketTables = [
      { table: 'incident', type: 'incident' as const },
      { table: 'change_task', type: 'change_task' as const },
      { table: 'sc_task', type: 'sc_task' as const }
    ];

    for (const { table, type } of ticketTables) {
      try {
        await this.analyzeTicketTable(table, type, 250);
      } catch (error: any) {
        console.error(`❌ Failed to analyze ${table}:`, error.message);
      }
    }

    // Compare tables if we have enough data
    let comparison: TicketComparison | null = null;
    if (this.ticketAnalyses.length >= 2) {
      comparison = await this.compareTicketTables();
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations();

    return {
      analyses: this.ticketAnalyses,
      comparison: comparison!,
      recommendations
    };
  }

  /**
   * Export all analysis results
   */
  async exportAnalysisResults(results: {
    analyses: TicketAnalysis[];
    comparison: TicketComparison;
    recommendations: string[];
  }): Promise<void> {
    console.log(`💾 Exporting ticket analysis results to ${this.outputDir}`);

    // Export individual analyses
    results.analyses.forEach(analysis => {
      const file = join(this.outputDir, `${analysis.tableName}-analysis.json`);
      writeFileSync(file, JSON.stringify(analysis, null, 2));
    });

    // Export comparison
    if (results.comparison) {
      const comparisonFile = join(this.outputDir, 'ticket-tables-comparison.json');
      writeFileSync(comparisonFile, JSON.stringify(results.comparison, null, 2));
    }

    // Export recommendations
    const recommendationsFile = join(this.outputDir, 'storage-recommendations.json');
    writeFileSync(recommendationsFile, JSON.stringify({
      recommendations: results.recommendations,
      timestamp: new Date().toISOString(),
      summary: {
        tablesAnalyzed: results.analyses.length,
        totalUniqueFields: new Set([
          ...results.analyses.flatMap(a => [
            ...a.commonFields, ...a.uniqueFields, ...a.businessFields
          ])
        ]).size,
        storageStrategy: results.comparison?.storageRecommendations
      }
    }, null, 2));

    // Generate MongoDB schema suggestions
    await this.generateMongoDBSchemas(results);

    console.log("✅ Analysis results exported:");
    console.log(`   Individual analyses: ${results.analyses.length} files`);
    console.log(`   Comparison: ticket-tables-comparison.json`);
    console.log(`   Recommendations: storage-recommendations.json`);
    console.log(`   MongoDB schemas: Generated in schemas/ subdirectory`);
  }

  // Helper methods
  private extractUniqueValues(records: any[], fields: string[]): string[] {
    const values = new Set<string>();
    
    records.forEach(record => {
      fields.forEach(field => {
        const value = record[field];
        if (value !== null && value !== undefined && value !== '') {
          values.add(String(value));
        }
      });
    });
    
    return Array.from(values).sort();
  }

  private identifyCommonTicketFields(fields: FieldAnalysis[]): string[] {
    const commonPatterns = [
      'sys_id', 'number', 'short_description', 'description', 
      'state', 'priority', 'assignment_group', 'assigned_to',
      'caller_id', 'opened_at', 'closed_at', 'resolved_at',
      'sys_created_on', 'sys_updated_on', 'sys_created_by',
      'active', 'category', 'subcategory'
    ];
    
    return fields
      .filter(f => commonPatterns.some(pattern => f.fieldName.includes(pattern)))
      .map(f => f.fieldName);
  }

  private identifyUniqueFields(fields: FieldAnalysis[], ticketType: string): string[] {
    const typeSpecificPatterns: { [key: string]: string[] } = {
      'incident': ['incident_state', 'severity', 'urgency', 'impact', 'problem_id'],
      'change_task': ['change_request', 'change_task_type', 'planned_start_date', 'planned_end_date'],
      'sc_task': ['request', 'request_item', 'catalog_item', 'price']
    };
    
    const patterns = typeSpecificPatterns[ticketType] || [];
    
    return fields
      .filter(f => patterns.some(pattern => f.fieldName.includes(pattern)))
      .map(f => f.fieldName);
  }

  private identifySLAFields(fields: FieldAnalysis[]): string[] {
    const slaPatterns = ['sla', 'due_date', 'response_time', 'resolution_time', 'business_duration'];
    
    return fields
      .filter(f => slaPatterns.some(pattern => f.fieldName.toLowerCase().includes(pattern)))
      .map(f => f.fieldName);
  }

  private identifyDateFields(fields: FieldAnalysis[]): string[] {
    return fields
      .filter(f => f.dataType === 'date' || f.fieldName.includes('_at') || f.fieldName.includes('_date'))
      .map(f => f.fieldName);
  }

  private identifyReferenceFields(fields: FieldAnalysis[]): string[] {
    return fields
      .filter(f => f.dataType === 'reference' || f.fieldName.includes('_id') || f.fieldName.includes('sys_id'))
      .map(f => f.fieldName);
  }

  private identifyBusinessFields(fields: FieldAnalysis[], ticketType: string): string[] {
    const businessPatterns: { [key: string]: string[] } = {
      'incident': ['business_service', 'cmdb_ci', 'location', 'company'],
      'change_task': ['business_service', 'cmdb_ci', 'implementation_plan', 'test_plan'],
      'sc_task': ['business_service', 'location', 'requested_for', 'price', 'quantity']
    };
    
    const patterns = businessPatterns[ticketType] || [];
    
    return fields
      .filter(f => patterns.some(pattern => f.fieldName.includes(pattern)))
      .map(f => f.fieldName);
  }

  private identifyBusinessLogicFields(): { field: string; purpose: string; tables: string[] }[] {
    const businessLogic = [
      { field: 'state', purpose: 'Workflow state management', tables: ['incident', 'change_task', 'sc_task'] },
      { field: 'assignment_group', purpose: 'Team assignment and routing', tables: ['incident', 'change_task', 'sc_task'] },
      { field: 'priority', purpose: 'Priority-based processing', tables: ['incident', 'change_task', 'sc_task'] },
      { field: 'sla_due', purpose: 'SLA compliance monitoring', tables: ['incident', 'change_task'] },
      { field: 'approval_history', purpose: 'Approval workflow tracking', tables: ['change_task', 'sc_task'] },
      { field: 'business_service', purpose: 'Service impact assessment', tables: ['incident', 'change_task'] }
    ];
    
    return businessLogic;
  }

  private generateStorageRecommendations(
    commonToAll: string[],
    commonToSome: { field: string; tables: string[] }[],
    uniquePerTable: { table: string; fields: string[] }[]
  ) {
    return {
      sharedSchema: commonToAll.filter(field => 
        !field.includes('sys_') || ['sys_id', 'sys_created_on', 'sys_updated_on'].includes(field)
      ),
      tableSpecific: uniquePerTable.map(item => ({
        table: item.table,
        fields: item.fields.filter(field => !field.startsWith('sys_'))
      })),
      indexes: [
        'sys_id',
        'number',
        'state',
        'assignment_group',
        'assigned_to',
        'sys_created_on',
        'opened_at',
        'priority',
        'caller_id'
      ]
    };
  }

  private generateRecommendations(): string[] {
    return [
      "Implement a base TicketDocument schema with common fields for all ticket types",
      "Use MongoDB collection inheritance or discriminator pattern for ticket types",
      "Create compound indexes on [state, assignment_group] for queue queries",
      "Index sys_created_on and opened_at for time-based queries",
      "Store SLA data in separate sub-documents for complex SLA logic",
      "Implement field-level encryption for sensitive caller information",
      "Use MongoDB aggregation pipelines for complex reporting queries",
      "Consider sharding strategy based on assignment_group for large datasets",
      "Implement proper field validation using MongoDB schema validation",
      "Create TTL indexes for closed tickets based on retention policies"
    ];
  }

  private async generateMongoDBSchemas(results: {
    analyses: TicketAnalysis[];
    comparison: TicketComparison;
  }): Promise<void> {
    const schemasDir = join(this.outputDir, 'mongodb-schemas');
    if (!existsSync(schemasDir)) {
      mkdirSync(schemasDir, { recursive: true });
    }

    // Generate base schema
    const baseSchema = {
      bsonType: "object",
      required: results.comparison.storageRecommendations.sharedSchema.slice(0, 10),
      properties: results.comparison.storageRecommendations.sharedSchema.reduce((props: any, field) => {
        props[field] = this.getMongoFieldType(field);
        return props;
      }, {})
    };

    writeFileSync(
      join(schemasDir, 'base-ticket-schema.json'),
      JSON.stringify(baseSchema, null, 2)
    );

    // Generate specific schemas
    results.analyses.forEach(analysis => {
      const specificFields = results.comparison.storageRecommendations.tableSpecific
        .find(ts => ts.table === analysis.tableName)?.fields || [];

      const schema = {
        bsonType: "object",
        required: [...baseSchema.required, ...specificFields.slice(0, 5)],
        properties: {
          ...baseSchema.properties,
          ticketType: { bsonType: "string", enum: [analysis.ticketType] },
          ...specificFields.reduce((props: any, field) => {
            props[field] = this.getMongoFieldType(field);
            return props;
          }, {})
        }
      };

      writeFileSync(
        join(schemasDir, `${analysis.tableName}-schema.json`),
        JSON.stringify(schema, null, 2)
      );
    });
  }

  private getMongoFieldType(fieldName: string): any {
    if (fieldName.includes('date') || fieldName.includes('_at')) {
      return { bsonType: "date" };
    }
    if (fieldName.includes('_id') || fieldName === 'sys_id') {
      return { bsonType: "string", pattern: "^[a-f0-9]{32}$" };
    }
    if (fieldName.includes('priority') || fieldName.includes('state')) {
      return { bsonType: "int" };
    }
    if (fieldName.includes('active')) {
      return { bsonType: "bool" };
    }
    return { bsonType: "string" };
  }
}

// Main execution function
async function main() {
  const instanceUrl = process.env.SERVICENOW_INSTANCE_URL || process.env.SNC_INSTANCE_URL;
  let token = process.env.SNC_AUTH_TOKEN;
  
  // If no explicit token, try to construct from username/password
  if (!token) {
    const username = process.env.SERVICENOW_USERNAME;
    const password = process.env.SERVICENOW_PASSWORD;
    
    if (username && password) {
      const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
      token = `Basic ${basicAuth}`;
    }
  }

  if (!instanceUrl || !token) {
    console.error("❌ Please set SERVICENOW_INSTANCE_URL and authentication credentials");
    console.error("💡 Copy .env.example to .env and configure your ServiceNow credentials");
    process.exit(1);
  }

  try {
    console.log("🎫 Starting comprehensive ticket data analysis...");
    
    const analyzer = new TicketDataAnalyzer(instanceUrl, token);
    const results = await analyzer.runCompleteAnalysis();
    
    await analyzer.exportAnalysisResults(results);
    
    console.log("\n🎉 Ticket analysis completed successfully!");
    console.log("📁 Check src/tests/ticket-analysis/ for detailed results");
    
    // Print summary
    console.log("\n📊 Analysis Summary:");
    results.analyses.forEach(analysis => {
      console.log(`   ${analysis.tableName}: ${analysis.totalRecords} records, ${analysis.commonFields.length + analysis.uniqueFields.length} fields`);
    });
    
    if (results.comparison) {
      console.log(`\n🔍 Field Distribution:`);
      console.log(`   Common to all tables: ${results.comparison.commonToAll.length}`);
      console.log(`   Partially shared: ${results.comparison.commonToSome.length}`);
      console.log(`   Table-specific: ${results.comparison.uniquePerTable.reduce((sum, t) => sum + t.fields.length, 0)}`);
    }
    
  } catch (error: any) {
    console.error("❌ Analysis failed:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main();
}

export { TicketDataAnalyzer, TicketAnalysis, TicketComparison };