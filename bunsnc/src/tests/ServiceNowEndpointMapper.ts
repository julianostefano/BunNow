/**
 * ServiceNow Endpoint Mapper and Data Structure Analyzer
 * Maps all ServiceNow table endpoints and analyzes their data structures
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowService } from '../services/servicenow.service';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface FieldAnalysis {
  fieldName: string;
  dataType: string;
  isRequired: boolean;
  frequency: number;
  sampleValues: any[];
  minLength?: number;
  maxLength?: number;
  uniqueValues?: number;
  nullCount: number;
  description?: string;
}

export interface TableSchema {
  tableName: string;
  totalRecords: number;
  analyzedRecords: number;
  fields: FieldAnalysis[];
  relationships: string[];
  indexes?: string[];
  performance: {
    queryTime: number;
    avgResponseSize: number;
  };
}

export interface EndpointTestResult {
  endpoint: string;
  status: 'success' | 'error' | 'timeout';
  statusCode?: number;
  responseTime: number;
  error?: string;
  recordCount: number;
  sampleData?: any[];
}

export class ServiceNowEndpointMapper {
  private serviceNowService: ServiceNowService;
  private outputDir: string;
  private testResults: EndpointTestResult[] = [];
  private schemas: TableSchema[] = [];

  constructor(instanceUrl: string, authToken: string) {
    this.serviceNowService = new ServiceNowService(instanceUrl, authToken);
    this.outputDir = join(process.cwd(), 'src', 'tests', 'data-schemas');
    
    // Create output directory if it doesn't exist
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Test a single ServiceNow endpoint with various filters and limits
   */
  async testEndpoint(
    table: string, 
    filters?: string, 
    limit: number = 100,
    fields?: string[]
  ): Promise<EndpointTestResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Testing endpoint: ${table}`);
      
      const queryOptions = {
        table,
        filter: filters,
        limit,
        fields,
        orderBy: 'sys_created_on'
      };

      const records = await this.serviceNowService.query(queryOptions);
      const responseTime = Date.now() - startTime;
      
      const result: EndpointTestResult = {
        endpoint: `/api/now/table/${table}`,
        status: 'success',
        responseTime,
        recordCount: records.length,
        sampleData: records.slice(0, 5) // Store first 5 records as samples
      };

      this.testResults.push(result);
      console.log(`✅ ${table}: ${records.length} records in ${responseTime}ms`);
      
      return result;

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const result: EndpointTestResult = {
        endpoint: `/api/now/table/${table}`,
        status: 'error',
        responseTime,
        recordCount: 0,
        error: error.message
      };

      this.testResults.push(result);
      console.error(`❌ ${table}: ${error.message}`);
      
      return result;
    }
  }

  /**
   * Map complete data structure of a table
   */
  async mapDataStructure(table: string, sampleSize: number = 100): Promise<TableSchema> {
    console.log(`📊 Mapping data structure for table: ${table}`);
    
    try {
      const records = await this.serviceNowService.query({
        table,
        limit: sampleSize,
        orderBy: 'sys_created_on'
      });

      if (records.length === 0) {
        throw new Error(`No records found in table ${table}`);
      }

      const fieldMap = new Map<string, FieldAnalysis>();
      
      // Initialize field analysis
      const sampleRecord = records[0];
      Object.keys(sampleRecord).forEach(fieldName => {
        fieldMap.set(fieldName, {
          fieldName,
          dataType: this.inferDataType(sampleRecord[fieldName]),
          isRequired: false,
          frequency: 0,
          sampleValues: [],
          nullCount: 0,
          uniqueValues: 0
        });
      });

      // Analyze all records
      const uniqueValues = new Map<string, Set<any>>();
      
      records.forEach(record => {
        Object.keys(record).forEach(fieldName => {
          const fieldAnalysis = fieldMap.get(fieldName);
          if (!fieldAnalysis) return;

          const value = record[fieldName];
          
          // Track frequency
          fieldAnalysis.frequency++;
          
          // Track null values
          if (value === null || value === undefined || value === '') {
            fieldAnalysis.nullCount++;
          } else {
            // Track unique values
            if (!uniqueValues.has(fieldName)) {
              uniqueValues.set(fieldName, new Set());
            }
            uniqueValues.get(fieldName)?.add(value);
            
            // Track sample values (first 10)
            if (fieldAnalysis.sampleValues.length < 10) {
              fieldAnalysis.sampleValues.push(value);
            }
            
            // Track string lengths
            if (typeof value === 'string') {
              const length = value.length;
              fieldAnalysis.minLength = Math.min(fieldAnalysis.minLength || length, length);
              fieldAnalysis.maxLength = Math.max(fieldAnalysis.maxLength || length, length);
            }
          }
        });
      });

      // Finalize field analysis
      fieldMap.forEach((analysis, fieldName) => {
        analysis.isRequired = analysis.nullCount === 0;
        analysis.uniqueValues = uniqueValues.get(fieldName)?.size || 0;
        analysis.frequency = (analysis.frequency / records.length) * 100; // Convert to percentage
      });

      const schema: TableSchema = {
        tableName: table,
        totalRecords: records.length,
        analyzedRecords: records.length,
        fields: Array.from(fieldMap.values()),
        relationships: this.findRelationships(Array.from(fieldMap.keys())),
        performance: {
          queryTime: 0, // Will be filled by testEndpoint
          avgResponseSize: JSON.stringify(records).length / records.length
        }
      };

      this.schemas.push(schema);
      console.log(`📋 Mapped ${schema.fields.length} fields for ${table}`);
      
      return schema;

    } catch (error: any) {
      console.error(`❌ Error mapping structure for ${table}:`, error.message);
      throw error;
    }
  }

  /**
   * Analyze field types and patterns
   */
  async analyzeFieldTypes(records: any[]): Promise<FieldAnalysis[]> {
    if (records.length === 0) return [];

    const fieldAnalyses: FieldAnalysis[] = [];
    const allFields = new Set<string>();
    
    // Get all possible fields
    records.forEach(record => {
      Object.keys(record).forEach(field => allFields.add(field));
    });

    // Analyze each field
    allFields.forEach(fieldName => {
      const analysis: FieldAnalysis = {
        fieldName,
        dataType: 'unknown',
        isRequired: true,
        frequency: 0,
        sampleValues: [],
        nullCount: 0,
        uniqueValues: 0
      };

      const values: any[] = [];
      let nullCount = 0;

      records.forEach(record => {
        const value = record[fieldName];
        if (value === null || value === undefined || value === '') {
          nullCount++;
        } else {
          values.push(value);
        }
      });

      analysis.nullCount = nullCount;
      analysis.isRequired = nullCount === 0;
      analysis.frequency = ((records.length - nullCount) / records.length) * 100;
      analysis.dataType = this.inferDataType(values[0]);
      analysis.sampleValues = values.slice(0, 10);
      analysis.uniqueValues = new Set(values).size;

      if (typeof values[0] === 'string') {
        const lengths = values.map(v => v.length);
        analysis.minLength = Math.min(...lengths);
        analysis.maxLength = Math.max(...lengths);
      }

      fieldAnalyses.push(analysis);
    });

    return fieldAnalyses.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Test performance limits of endpoints
   */
  async testPerformanceLimits(table: string): Promise<{
    maxLimit: number;
    avgResponseTime: number;
    recommendedLimit: number;
  }> {
    console.log(`⚡ Testing performance limits for ${table}`);
    
    const limits = [10, 50, 100, 250, 500, 1000];
    const results: { limit: number; time: number; success: boolean }[] = [];
    
    for (const limit of limits) {
      try {
        const startTime = Date.now();
        await this.serviceNowService.query({ table, limit });
        const time = Date.now() - startTime;
        
        results.push({ limit, time, success: true });
        console.log(`  ✅ Limit ${limit}: ${time}ms`);
        
        // If response time exceeds 30 seconds, stop testing
        if (time > 30000) {
          console.log(`  ⚠️ Stopping at limit ${limit} due to slow response`);
          break;
        }
        
      } catch (error) {
        results.push({ limit, time: 0, success: false });
        console.log(`  ❌ Limit ${limit}: Failed`);
        break;
      }
    }
    
    const successfulResults = results.filter(r => r.success);
    const maxLimit = Math.max(...successfulResults.map(r => r.limit));
    const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.time, 0) / successfulResults.length;
    
    // Recommend limit that keeps response time under 5 seconds
    const recommendedLimit = successfulResults.find(r => r.time > 5000)?.limit || maxLimit;
    
    return { maxLimit, avgResponseTime, recommendedLimit };
  }

  /**
   * Test all critical ServiceNow tables
   */
  async testAllCriticalTables(): Promise<void> {
    const criticalTables = [
      'incident',
      'change_task', 
      'sc_task',
      'sys_user_group',
      'task_sla',
      'sys_user',
      'cmdb_ci',
      'kb_knowledge',
      'sc_request',
      'change_request'
    ];

    console.log(`🚀 Testing ${criticalTables.length} critical tables...`);
    
    for (const table of criticalTables) {
      try {
        // Test endpoint
        await this.testEndpoint(table, undefined, 50);
        
        // Map data structure
        await this.mapDataStructure(table, 100);
        
        // Test performance
        const performance = await this.testPerformanceLimits(table);
        
        // Update schema with performance data
        const schema = this.schemas.find(s => s.tableName === table);
        if (schema) {
          schema.performance = {
            queryTime: performance.avgResponseTime,
            avgResponseSize: schema.performance.avgResponseSize
          };
        }
        
      } catch (error: any) {
        console.error(`❌ Failed to test table ${table}:`, error.message);
      }
    }
  }

  /**
   * Export all results to JSON files
   */
  async exportResults(): Promise<void> {
    console.log(`💾 Exporting results to ${this.outputDir}`);
    
    // Export test results
    const testResultsFile = join(this.outputDir, 'endpoint-test-results.json');
    writeFileSync(testResultsFile, JSON.stringify(this.testResults, null, 2));
    
    // Export schemas
    const schemasFile = join(this.outputDir, 'table-schemas.json');
    writeFileSync(schemasFile, JSON.stringify(this.schemas, null, 2));
    
    // Export individual schema files
    for (const schema of this.schemas) {
      const schemaFile = join(this.outputDir, `${schema.tableName}-schema.json`);
      writeFileSync(schemaFile, JSON.stringify(schema, null, 2));
    }
    
    // Export summary report
    const summary = {
      totalTables: this.schemas.length,
      totalFields: this.schemas.reduce((sum, s) => sum + s.fields.length, 0),
      tablesWithErrors: this.testResults.filter(r => r.status === 'error').length,
      avgResponseTime: this.testResults.reduce((sum, r) => sum + r.responseTime, 0) / this.testResults.length,
      generatedAt: new Date().toISOString()
    };
    
    const summaryFile = join(this.outputDir, 'mapping-summary.json');
    writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    
    console.log(`✅ Results exported:`);
    console.log(`  - Test results: ${testResultsFile}`);
    console.log(`  - Schemas: ${schemasFile}`);
    console.log(`  - Summary: ${summaryFile}`);
    console.log(`  - Individual schemas: ${this.schemas.length} files`);
  }

  /**
   * Generate TypeScript interfaces from discovered schemas
   */
  async generateTypeScriptInterfaces(): Promise<void> {
    console.log(`🔧 Generating TypeScript interfaces...`);
    
    let interfaceContent = `/**
 * ServiceNow Table Interfaces - Auto-generated from API mapping
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * Generated on: ${new Date().toISOString()}
 */

`;

    for (const schema of this.schemas) {
      const interfaceName = this.toPascalCase(schema.tableName);
      interfaceContent += `export interface ${interfaceName}Record {\n`;
      
      schema.fields.forEach(field => {
        const optional = field.isRequired ? '' : '?';
        const tsType = this.mapToTypeScriptType(field.dataType);
        interfaceContent += `  ${field.fieldName}${optional}: ${tsType};\n`;
      });
      
      interfaceContent += `}\n\n`;
    }

    const interfacesFile = join(this.outputDir, 'servicenow-interfaces.ts');
    writeFileSync(interfacesFile, interfaceContent);
    console.log(`✅ TypeScript interfaces generated: ${interfacesFile}`);
  }

  // Helper methods
  private inferDataType(value: any): string {
    if (value === null || value === undefined) return 'unknown';
    
    const type = typeof value;
    if (type === 'string') {
      // Check if it's a date
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
      // Check if it's a GUID
      if (/^[0-9a-f]{32}$/.test(value)) return 'guid';
      // Check if it's a reference
      if (value.includes('.do?sys_id=')) return 'reference';
      return 'string';
    }
    if (type === 'number') {
      return Number.isInteger(value) ? 'integer' : 'float';
    }
    if (type === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (type === 'object') return 'object';
    
    return 'unknown';
  }

  private findRelationships(fieldNames: string[]): string[] {
    const relationships: string[] = [];
    
    fieldNames.forEach(field => {
      // Common reference field patterns
      if (field.includes('sys_id') || field.includes('_id')) {
        relationships.push(`${field} -> Reference field`);
      }
      if (field.includes('assigned_to')) {
        relationships.push(`${field} -> sys_user.sys_id`);
      }
      if (field.includes('assignment_group')) {
        relationships.push(`${field} -> sys_user_group.sys_id`);
      }
      if (field.includes('caller')) {
        relationships.push(`${field} -> sys_user.sys_id`);
      }
      if (field.includes('cmdb_ci')) {
        relationships.push(`${field} -> cmdb_ci.sys_id`);
      }
    });
    
    return relationships;
  }

  private toPascalCase(str: string): string {
    return str.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join('');
  }

  private mapToTypeScriptType(dataType: string): string {
    const typeMap: { [key: string]: string } = {
      'string': 'string',
      'integer': 'number',
      'float': 'number',
      'boolean': 'boolean',
      'date': 'string',
      'guid': 'string',
      'reference': 'string',
      'array': 'any[]',
      'object': 'any',
      'unknown': 'any'
    };
    
    return typeMap[dataType] || 'any';
  }

  // Getters for accessing results
  getTestResults(): EndpointTestResult[] {
    return this.testResults;
  }

  getSchemas(): TableSchema[] {
    return this.schemas;
  }

  getSummary() {
    return {
      totalTables: this.schemas.length,
      totalFields: this.schemas.reduce((sum, s) => sum + s.fields.length, 0),
      tablesWithErrors: this.testResults.filter(r => r.status === 'error').length,
      avgResponseTime: this.testResults.reduce((sum, r) => sum + r.responseTime, 0) / this.testResults.length || 0
    };
  }
}