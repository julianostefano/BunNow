#!/usr/bin/env bun
/**
 * Complete ServiceNow Field Mapper
 * Captures ALL fields available in ServiceNow without limitations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from '../services/ServiceNowAuthClient';

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
  recordNumber: string;
  totalFields: number;
  fieldAnalysis: FieldAnalysis[];
  capturedAt: string;
  analysisTime: number;
}

class FullFieldMapper {
  private serviceNowClient: ServiceNowAuthClient;

  constructor() {
    this.serviceNowClient = new ServiceNowAuthClient();
  }

  /**
   * Analyze data type and structure of a field value
   */
  private analyzeField(fieldName: string, value: any): FieldAnalysis {
    const analysis: FieldAnalysis = {
      fieldName,
      dataType: typeof value,
      hasDisplayValue: false,
      hasValue: false,
      sampleValue: value,
      isReference: false,
      isArray: Array.isArray(value),
      isObject: false,
      isNull: value === null || value === undefined,
      isEmpty: value === '' || value === null || value === undefined
    };

    // Check if it's a reference object with display_value and value
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      analysis.isObject = true;
      
      if ('display_value' in value && 'value' in value) {
        analysis.isReference = true;
        analysis.hasDisplayValue = true;
        analysis.hasValue = true;
        analysis.sampleDisplayValue = value.display_value;
        analysis.sampleValue = value.value;
      }
    }

    // Override data type for better classification
    if (analysis.isReference) {
      analysis.dataType = 'reference';
    } else if (analysis.isArray) {
      analysis.dataType = 'array';
    } else if (analysis.isObject) {
      analysis.dataType = 'object';
    } else if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      analysis.dataType = 'datetime';
    } else if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
      analysis.dataType = 'date';
    }

    return analysis;
  }

  /**
   * Map all fields for a specific ticket
   */
  async mapAllFields(table: string, sysId: string): Promise<TableFieldMapping> {
    console.log(` Starting complete field mapping for ${table}:${sysId}`);
    const startTime = Date.now();

    try {
      // Use the new makeRequestFullFields method to get ALL fields
      const response = await this.serviceNowClient.makeRequestFullFields(
        table,
        `sys_id=${sysId}`,
        1
      );

      if (!response.result || response.result.length === 0) {
        throw new Error(`No record found for sys_id: ${sysId}`);
      }

      const record = response.result[0];
      const fieldNames = Object.keys(record);

      console.log(` Found ${fieldNames.length} fields in ${table} record`);

      // Analyze each field
      const fieldAnalysis: FieldAnalysis[] = fieldNames.map(fieldName => {
        const value = record[fieldName];
        return this.analyzeField(fieldName, value);
      });

      const analysisTime = Date.now() - startTime;

      const mapping: TableFieldMapping = {
        tableName: table,
        recordId: sysId,
        recordNumber: record.number || 'N/A',
        totalFields: fieldNames.length,
        fieldAnalysis,
        capturedAt: new Date().toISOString(),
        analysisTime
      };

      return mapping;

    } catch (error: any) {
      console.error(` Error mapping fields for ${table}:${sysId}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate detailed report of field mapping
   */
  generateReport(mapping: TableFieldMapping): void {
    console.log(`\n📋 COMPLETE SERVICENOW FIELD MAPPING REPORT`);
    console.log(`════════════════════════════════════════════`);
    console.log(`Table: ${mapping.tableName}`);
    console.log(`Record: ${mapping.recordNumber} (${mapping.recordId})`);
    console.log(`Total Fields: ${mapping.totalFields}`);
    console.log(`Analysis Time: ${mapping.analysisTime}ms`);
    console.log(`Captured: ${mapping.capturedAt}`);

    // Group fields by type
    const fieldsByType = {
      reference: mapping.fieldAnalysis.filter(f => f.isReference),
      datetime: mapping.fieldAnalysis.filter(f => f.dataType === 'datetime'),
      date: mapping.fieldAnalysis.filter(f => f.dataType === 'date'),
      string: mapping.fieldAnalysis.filter(f => f.dataType === 'string' && !f.isReference),
      number: mapping.fieldAnalysis.filter(f => f.dataType === 'number'),
      boolean: mapping.fieldAnalysis.filter(f => f.dataType === 'boolean'),
      object: mapping.fieldAnalysis.filter(f => f.isObject && !f.isReference),
      array: mapping.fieldAnalysis.filter(f => f.isArray),
      null: mapping.fieldAnalysis.filter(f => f.isNull)
    };

    console.log(`\n🏷️  FIELD CATEGORIES:`);
    console.log(`   Reference Fields: ${fieldsByType.reference.length}`);
    console.log(`   Date/Time Fields: ${fieldsByType.datetime.length + fieldsByType.date.length}`);
    console.log(`   String Fields: ${fieldsByType.string.length}`);
    console.log(`   Number Fields: ${fieldsByType.number.length}`);
    console.log(`   Boolean Fields: ${fieldsByType.boolean.length}`);
    console.log(`   Object Fields: ${fieldsByType.object.length}`);
    console.log(`   Array Fields: ${fieldsByType.array.length}`);
    console.log(`   Null/Empty Fields: ${fieldsByType.null.length}`);

    // Detailed field listing
    console.log(`\n📄 COMPLETE FIELD LISTING:`);
    console.log(`════════════════════════════`);

    mapping.fieldAnalysis
      .sort((a, b) => a.fieldName.localeCompare(b.fieldName))
      .forEach((field, index) => {
        const num = String(index + 1).padStart(2, '0');
        const name = field.fieldName.padEnd(30, ' ');
        const type = field.dataType.padEnd(12, ' ');
        
        let valueDisplay = '';
        if (field.isReference) {
          valueDisplay = `"${field.sampleDisplayValue}" (${field.sampleValue})`;
        } else if (field.isNull) {
          valueDisplay = 'NULL';
        } else if (field.isEmpty) {
          valueDisplay = 'EMPTY';
        } else if (typeof field.sampleValue === 'string' && field.sampleValue.length > 50) {
          valueDisplay = `"${field.sampleValue.substring(0, 50)}..."`;
        } else {
          valueDisplay = JSON.stringify(field.sampleValue);
        }

        console.log(`${num}. ${name} [${type}] = ${valueDisplay}`);
      });

    console.log(`\n🔗 REFERENCE FIELDS DETAIL:`);
    console.log(`══════════════════════════════`);
    fieldsByType.reference.forEach((field, index) => {
      console.log(`${index + 1}. ${field.fieldName}:`);
      console.log(`   Display: "${field.sampleDisplayValue}"`);
      console.log(`   Value: "${field.sampleValue}"`);
    });

    console.log(`\n SUMMARY:`);
    console.log(`══════════`);
    console.log(` Successfully mapped ${mapping.totalFields} fields`);
    console.log(`🔗 Found ${fieldsByType.reference.length} reference fields`);
    console.log(`📅 Found ${fieldsByType.datetime.length + fieldsByType.date.length} date/time fields`);
    console.log(` Found ${fieldsByType.string.length} text fields`);
    console.log(`🔢 Found ${fieldsByType.number.length} numeric fields`);
  }

  /**
   * Save mapping to JSON file
   */
  async saveToFile(mapping: TableFieldMapping, filename?: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    if (!filename) {
      filename = `servicenow-field-mapping-${mapping.tableName}-${Date.now()}.json`;
    }

    const outputDir = path.join(process.cwd(), 'src', 'tests', 'field-mappings');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(mapping, null, 2));
    console.log(`💾 Field mapping saved to: ${filepath}`);
  }
}

// Main execution
async function main() {
  const mapper = new FullFieldMapper();
  
  // Known ticket IDs from logs
  const knownTickets = [
    { table: 'incident', sysId: '465ab6a183f7aa90f6658698beaad3e9', number: 'INC4503943' },
    { table: 'incident', sysId: 'b6b08181c33b2250c70bdffb050131a6', number: 'INC4499465' }
  ];

  for (const ticket of knownTickets) {
    try {
      console.log(`\n🎯 Mapping fields for ${ticket.number} (${ticket.sysId})`);
      
      const mapping = await mapper.mapAllFields(ticket.table, ticket.sysId);
      
      mapper.generateReport(mapping);
      
      await mapper.saveToFile(mapping);
      
      console.log(`\n Completed mapping for ${ticket.number}`);
      
    } catch (error: any) {
      console.error(` Failed to map ${ticket.number}:`, error.message);
    }
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(console.error);
}

export { FullFieldMapper, type TableFieldMapping, type FieldAnalysis };