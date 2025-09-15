#!/usr/bin/env bun
/**
 * ServiceNow SLA/SLM Field Mapper
 * Maps ALL SLA-related fields from task_sla, contract_sla, and incident tables
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from '../services/ServiceNowAuthClient';

interface SLAFieldAnalysis {
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
  tableName: string;
}

interface SLAMapping {
  ticketId: string;
  ticketNumber: string;
  ticketTable: string;
  incidentSLAFields: SLAFieldAnalysis[];
  taskSLARecords: TaskSLARecord[];
  contractSLARecords: ContractSLARecord[];
  sctaskSLAFields?: SLAFieldAnalysis[];
  ctaskSLAFields?: SLAFieldAnalysis[];
  totalSLAFields: number;
  capturedAt: string;
  analysisTime: number;
}

interface TaskSLARecord {
  sys_id: string;
  taskNumber: string;
  slaDefinition: string;
  stage: string;
  state: string;
  percentage: string;
  hasBreached: boolean;
  actualElapsedTime: string;
  businessElapsedTime: string;
  planneEndTime: string;
  actualEndTime: string;
  fieldAnalysis: SLAFieldAnalysis[];
}

interface ContractSLARecord {
  sys_id: string;
  contractNumber: string;
  slaType: string;
  state: string;
  fieldAnalysis: SLAFieldAnalysis[];
}

class SLAFieldMapper {
  private serviceNowClient: ServiceNowAuthClient;

  constructor() {
    this.serviceNowClient = new ServiceNowAuthClient();
  }

  /**
   * Analyze SLA field structure and type
   */
  private analyzeField(fieldName: string, value: any, tableName: string): SLAFieldAnalysis {
    const analysis: SLAFieldAnalysis = {
      fieldName,
      tableName,
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
   * Map SLA fields from the incident record
   */
  private async mapIncidentSLAFields(ticketSysId: string): Promise<SLAFieldAnalysis[]> {
    console.log(` Mapping incident SLA fields for ${ticketSysId}`);
    
    // Get the incident with ALL fields to capture SLA-related ones
    const response = await this.serviceNowClient.makeRequestFullFields(
      'incident',
      `sys_id=${ticketSysId}`,
      1
    );

    if (!response.result || response.result.length === 0) {
      throw new Error(`No incident found for sys_id: ${ticketSysId}`);
    }

    const incident = response.result[0];
    const slaFields: SLAFieldAnalysis[] = [];

    // Filter SLA-related field names
    const slaFieldNames = Object.keys(incident).filter(field => 
      field.includes('sla') ||
      field.includes('stc') ||
      field.includes('resolve_time') ||
      field.includes('response_time') ||
      field.includes('business_') ||
      field.includes('calendar_') ||
      field.includes('breach') ||
      field.includes('escalation') ||
      field.includes('priority') ||
      field.includes('urgency') ||
      field.includes('impact') ||
      field.includes('due_date')
    );

    console.log(` Found ${slaFieldNames.length} SLA-related fields in incident`);

    slaFieldNames.forEach(fieldName => {
      const value = incident[fieldName];
      slaFields.push(this.analyzeField(fieldName, value, 'incident'));
    });

    return slaFields;
  }

  /**
   * Map task_sla records related to the incident
   */
  private async mapTaskSLARecords(ticketSysId: string): Promise<TaskSLARecord[]> {
    console.log(` Mapping task_sla records for ${ticketSysId}`);
    
    try {
      // Query task_sla table for this specific incident
      const response = await this.serviceNowClient.makeRequestFullFields(
        'task_sla',
        `task=${ticketSysId}`,
        50
      );

      const taskSLARecords: TaskSLARecord[] = [];

      if (response.result && response.result.length > 0) {
        console.log(` Found ${response.result.length} task_sla records`);

        for (const record of response.result) {
          const fieldAnalysis: SLAFieldAnalysis[] = [];
          
          // Analyze all fields in the task_sla record
          Object.keys(record).forEach(fieldName => {
            const value = record[fieldName];
            fieldAnalysis.push(this.analyzeField(fieldName, value, 'task_sla'));
          });

          taskSLARecords.push({
            sys_id: record.sys_id || '',
            taskNumber: record.number?.display_value || record.number || 'N/A',
            slaDefinition: record.sla?.display_value || record.sla || 'N/A',
            stage: record.stage?.display_value || record.stage || 'N/A',
            state: record.state?.display_value || record.state || 'N/A',
            percentage: record.percentage?.display_value || record.percentage || '0',
            hasBreached: record.has_breached?.display_value === 'true' || record.has_breached === 'true',
            actualElapsedTime: record.actual_elapsed_time?.display_value || record.actual_elapsed_time || 'N/A',
            businessElapsedTime: record.business_elapsed_time?.display_value || record.business_elapsed_time || 'N/A',
            planneEndTime: record.planned_end_time?.display_value || record.planned_end_time || 'N/A',
            actualEndTime: record.actual_end_time?.display_value || record.actual_end_time || 'N/A',
            fieldAnalysis
          });
        }
      } else {
        console.log(` No task_sla records found for incident ${ticketSysId}`);
      }

      return taskSLARecords;
    } catch (error: any) {
      console.warn(` Error fetching task_sla records: ${error.message}`);
      return [];
    }
  }

  /**
   * Map contract_sla records related to the incident
   */
  private async mapContractSLARecords(ticketSysId: string): Promise<ContractSLARecord[]> {
    console.log(` Mapping contract_sla records for ${ticketSysId}`);
    
    try {
      // First get the incident to find related contract information
      const incidentResponse = await this.serviceNowClient.makeRequestFullFields(
        'incident',
        `sys_id=${ticketSysId}`,
        1
      );

      if (!incidentResponse.result || incidentResponse.result.length === 0) {
        return [];
      }

      const incident = incidentResponse.result[0];
      const company = incident.company?.value;
      const location = incident.location?.value;
      
      let contractQuery = '';
      if (company) {
        contractQuery = `company=${company}`;
      } else if (location) {
        contractQuery = `location=${location}`;
      } else {
        // If no specific company/location, try to find any active contracts
        contractQuery = 'active=true';
      }

      const response = await this.serviceNowClient.makeRequestFullFields(
        'contract_sla',
        contractQuery,
        10
      );

      const contractSLARecords: ContractSLARecord[] = [];

      if (response.result && response.result.length > 0) {
        console.log(` Found ${response.result.length} contract_sla records`);

        for (const record of response.result) {
          const fieldAnalysis: SLAFieldAnalysis[] = [];
          
          // Analyze all fields in the contract_sla record
          Object.keys(record).forEach(fieldName => {
            const value = record[fieldName];
            fieldAnalysis.push(this.analyzeField(fieldName, value, 'contract_sla'));
          });

          contractSLARecords.push({
            sys_id: record.sys_id || '',
            contractNumber: record.number?.display_value || record.number || 'N/A',
            slaType: record.type?.display_value || record.type || 'N/A',
            state: record.state?.display_value || record.state || 'N/A',
            fieldAnalysis
          });
        }
      } else {
        console.log(` No contract_sla records found`);
      }

      return contractSLARecords;
    } catch (error: any) {
      console.warn(` Error fetching contract_sla records: ${error.message}`);
      return [];
    }
  }

  /**
   * Map SLA fields specific to sc_task (Catalog Task) table
   */
  private async mapSCTaskSLAFields(taskSysId: string): Promise<SLAFieldAnalysis[]> {
    console.log(`📋 Mapping sc_task SLA fields for ${taskSysId}`);
    
    try {
      const response = await this.serviceNowClient.makeRequestFullFields(
        'sc_task',
        `sys_id=${taskSysId}`,
        1
      );

      if (!response.result || response.result.length === 0) {
        console.log(` No sc_task found for ${taskSysId}`);
        return [];
      }

      const task = response.result[0];
      const fields: SLAFieldAnalysis[] = [];

      // SC Task specific SLA fields
      const slaFields = [
        'due_date', 'time_worked', 'escalation', 'calendar_integration',
        'delivery_plan', 'delivery_task', 'cat_item', 'sc_catalog',
        'request', 'request_item', 'variables', 'stage', 'delivery_date'
      ];

      Object.keys(task).forEach(fieldName => {
        if (slaFields.includes(fieldName) || 
            fieldName.includes('sla') || 
            fieldName.includes('time') ||
            fieldName.includes('due') ||
            fieldName.includes('delivery')) {
          fields.push(this.analyzeField(fieldName, task[fieldName], 'sc_task'));
        }
      });

      console.log(` Found ${fields.length} SLA-related fields in sc_task`);
      return fields;

    } catch (error: any) {
      console.error(` Error mapping sc_task SLA fields: ${error.message}`);
      return [];
    }
  }

  /**
   * Map SLA fields specific to change_task (Change Task) table
   */
  private async mapCTaskSLAFields(taskSysId: string): Promise<SLAFieldAnalysis[]> {
    console.log(` Mapping change_task SLA fields for ${taskSysId}`);
    
    try {
      const response = await this.serviceNowClient.makeRequestFullFields(
        'change_task',
        `sys_id=${taskSysId}`,
        1
      );

      if (!response.result || response.result.length === 0) {
        console.log(` No change_task found for ${taskSysId}`);
        return [];
      }

      const task = response.result[0];
      const fields: SLAFieldAnalysis[] = [];

      // Change Task specific SLA fields  
      const slaFields = [
        'change_request', 'change_request_status', 'planned_start_date', 
        'planned_end_date', 'work_start', 'work_end', 'on_hold_reason',
        'implementation_plan', 'test_plan', 'backout_plan', 'type',
        'risk', 'impact_description', 'change_type'
      ];

      Object.keys(task).forEach(fieldName => {
        if (slaFields.includes(fieldName) || 
            fieldName.includes('sla') || 
            fieldName.includes('time') ||
            fieldName.includes('due') ||
            fieldName.includes('plan') ||
            fieldName.includes('start') ||
            fieldName.includes('end')) {
          fields.push(this.analyzeField(fieldName, task[fieldName], 'change_task'));
        }
      });

      console.log(` Found ${fields.length} SLA-related fields in change_task`);
      return fields;

    } catch (error: any) {
      console.error(` Error mapping change_task SLA fields: ${error.message}`);
      return [];
    }
  }

  /**
   * Complete SLA mapping for a specific ticket
   */
  async mapAllSLAFields(ticketSysId: string, table: string = 'incident'): Promise<SLAMapping> {
    console.log(`🎯 Starting comprehensive SLA mapping for ${ticketSysId} from table ${table}`);
    const startTime = Date.now();

    try {
      // Get basic ticket info for the ticket number - support incident, sctask, ctask
      const ticketResponse = await this.serviceNowClient.makeRequestFullFields(
        table,
        `sys_id=${ticketSysId}`,
        1
      );

      if (!ticketResponse.result || ticketResponse.result.length === 0) {
        throw new Error(`No ${table} found for sys_id: ${ticketSysId}`);
      }

      const ticket = ticketResponse.result[0];
      const ticketNumber = ticket.number?.display_value || ticket.number || 'N/A';

      // Base operations - always run
      const basePromises = [
        this.mapIncidentSLAFields(ticketSysId),
        this.mapTaskSLARecords(ticketSysId),
        this.mapContractSLARecords(ticketSysId)
      ];

      // Add table-specific SLA mapping based on ticket type
      let sctaskSLAFields: SLAFieldAnalysis[] = [];
      let ctaskSLAFields: SLAFieldAnalysis[] = [];

      if (table === 'sc_task') {
        sctaskSLAFields = await this.mapSCTaskSLAFields(ticketSysId);
      } else if (table === 'change_task') {
        ctaskSLAFields = await this.mapCTaskSLAFields(ticketSysId);
      }

      // Run all SLA mapping operations in parallel for better performance
      const [incidentSLAFields, taskSLARecords, contractSLARecords] = await Promise.all(basePromises);

      const totalSLAFields = incidentSLAFields.length + 
        taskSLARecords.reduce((sum, record) => sum + record.fieldAnalysis.length, 0) +
        contractSLARecords.reduce((sum, record) => sum + record.fieldAnalysis.length, 0) +
        sctaskSLAFields.length +
        ctaskSLAFields.length;

      const analysisTime = Date.now() - startTime;

      const mapping: SLAMapping = {
        ticketId: ticketSysId,
        ticketNumber,
        ticketTable: table,
        incidentSLAFields,
        taskSLARecords,
        contractSLARecords,
        sctaskSLAFields: sctaskSLAFields.length > 0 ? sctaskSLAFields : undefined,
        ctaskSLAFields: ctaskSLAFields.length > 0 ? ctaskSLAFields : undefined,
        totalSLAFields,
        capturedAt: new Date().toISOString(),
        analysisTime
      };

      console.log(` SLA mapping completed in ${analysisTime}ms`);
      return mapping;

    } catch (error: any) {
      console.error(` Error in SLA mapping for ${ticketSysId}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate detailed SLA report
   */
  generateSLAReport(mapping: SLAMapping): void {
    console.log(`\n📋 SERVICENOW SLA/SLM COMPREHENSIVE MAPPING REPORT`);
    console.log(`═══════════════════════════════════════════════════`);
    console.log(`Ticket: ${mapping.ticketNumber} (${mapping.ticketId})`);
    console.log(`Total SLA Fields Mapped: ${mapping.totalSLAFields}`);
    console.log(`Analysis Time: ${mapping.analysisTime}ms`);
    console.log(`Captured: ${mapping.capturedAt}`);

    console.log(`\n🎯 SLA DATA BREAKDOWN:`);
    console.log(`   Incident SLA Fields: ${mapping.incidentSLAFields.length}`);
    console.log(`   Task SLA Records: ${mapping.taskSLARecords.length}`);
    console.log(`   Contract SLA Records: ${mapping.contractSLARecords.length}`);

    // Incident SLA Fields
    if (mapping.incidentSLAFields.length > 0) {
      console.log(`\n INCIDENT SLA FIELDS (${mapping.incidentSLAFields.length}):`);
      console.log(`════════════════════════════════════════`);
      mapping.incidentSLAFields.forEach((field, index) => {
        const num = String(index + 1).padStart(2, '0');
        const name = field.fieldName.padEnd(25, ' ');
        const type = field.dataType.padEnd(10, ' ');
        
        let valueDisplay = '';
        if (field.isReference && field.sampleDisplayValue) {
          valueDisplay = `"${field.sampleDisplayValue}" (${field.sampleValue})`;
        } else if (field.isNull) {
          valueDisplay = 'NULL';
        } else if (field.isEmpty) {
          valueDisplay = 'EMPTY';
        } else {
          valueDisplay = JSON.stringify(field.sampleValue);
        }

        console.log(`${num}. ${name} [${type}] = ${valueDisplay}`);
      });
    }

    // Task SLA Records
    if (mapping.taskSLARecords.length > 0) {
      console.log(`\n⏱️  TASK SLA RECORDS (${mapping.taskSLARecords.length}):`);
      console.log(`═══════════════════════════════════════════`);
      mapping.taskSLARecords.forEach((record, index) => {
        console.log(`${index + 1}. SLA Definition: ${record.slaDefinition}`);
        console.log(`   Stage: ${record.stage} | State: ${record.state}`);
        console.log(`   Progress: ${record.percentage}% | Breached: ${record.hasBreached}`);
        console.log(`   Business Time: ${record.businessElapsedTime}`);
        console.log(`   Planned End: ${record.planneEndTime}`);
        console.log(`   Fields Mapped: ${record.fieldAnalysis.length}`);
        console.log('');
      });
    }

    // Contract SLA Records
    if (mapping.contractSLARecords.length > 0) {
      console.log(`\n📋 CONTRACT SLA RECORDS (${mapping.contractSLARecords.length}):`);
      console.log(`═══════════════════════════════════════════════`);
      mapping.contractSLARecords.forEach((record, index) => {
        console.log(`${index + 1}. Contract: ${record.contractNumber}`);
        console.log(`   Type: ${record.slaType} | State: ${record.state}`);
        console.log(`   Fields Mapped: ${record.fieldAnalysis.length}`);
        console.log('');
      });
    }

    console.log(`\n SLA SUMMARY:`);
    console.log(`══════════════`);
    console.log(` Successfully mapped ${mapping.totalSLAFields} SLA-related fields`);
    console.log(`🎯 Found ${mapping.taskSLARecords.length} active SLA definitions`);
    console.log(`📋 Found ${mapping.contractSLARecords.length} contract SLA configurations`);
    
    const breachedSLAs = mapping.taskSLARecords.filter(sla => sla.hasBreached).length;
    if (breachedSLAs > 0) {
      console.log(`  ${breachedSLAs} SLA(s) have been breached`);
    }
  }

  /**
   * Save SLA mapping to JSON file
   */
  async saveToFile(mapping: SLAMapping, filename?: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    if (!filename) {
      filename = `servicenow-sla-mapping-${mapping.ticketNumber}-${Date.now()}.json`;
    }

    const outputDir = path.join(process.cwd(), 'src', 'tests', 'sla-mappings');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(mapping, null, 2));
    console.log(`💾 SLA mapping saved to: ${filepath}`);
  }
}

// Main execution
async function main() {
  const slaMapper = new SLAFieldMapper();
  
  // Known ticket IDs from previous mapping
  const knownTickets = [
    { sysId: '465ab6a183f7aa90f6658698beaad3e9', number: 'INC4503943' },
    { sysId: 'b6b08181c33b2250c70bdffb050131a6', number: 'INC4499465' }
  ];

  for (const ticket of knownTickets) {
    try {
      console.log(`\n🎯 Mapping SLA data for ${ticket.number} (${ticket.sysId})`);
      
      const slaMapping = await slaMapper.mapAllSLAFields(ticket.sysId);
      
      slaMapper.generateSLAReport(slaMapping);
      
      await slaMapper.saveToFile(slaMapping);
      
      console.log(`\n Completed SLA mapping for ${ticket.number}`);
      
    } catch (error: any) {
      console.error(` Failed to map SLA for ${ticket.number}:`, error.message);
    }
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(console.error);
}

export { SLAFieldMapper, type SLAMapping, type TaskSLARecord, type ContractSLARecord, type SLAFieldAnalysis };