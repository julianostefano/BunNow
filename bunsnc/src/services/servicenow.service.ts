/**
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * ServiceNow CRUD and query service - Production implementation
 */
import type { 
  QueryOptions, 
  ServiceNowRecord, 
  SLMRecord, 
  TaskSLAQueryOptions, 
  TaskSLAResponse,
  SLABreachInfo,
  TicketSLASummary
} from "../types/servicenow";

export class ServiceNowService {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor(private instanceUrl: string, private authToken: string) {
    this.baseUrl = `${instanceUrl}/api/now/table`;
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`
    };
  }

  async create(table: string, data: ServiceNowRecord): Promise<ServiceNowRecord> {
    try {
      const response = await fetch(`${this.baseUrl}/${table}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      return result.result || result;
    } catch (error) {
      console.error(`Error creating record in ${table}:`, error);
      throw error;
    }
  }

  async read(table: string, sysId: string): Promise<ServiceNowRecord | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${table}/${sysId}`, {
        method: 'GET',
        headers: this.headers
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      return result.result || result;
    } catch (error) {
      console.error(`Error reading record ${sysId} from ${table}:`, error);
      throw error;
    }
  }

  async update(table: string, sysId: string, data: Partial<ServiceNowRecord>): Promise<ServiceNowRecord> {
    try {
      const response = await fetch(`${this.baseUrl}/${table}/${sysId}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      return result.result || result;
    } catch (error) {
      console.error(`Error updating record ${sysId} in ${table}:`, error);
      throw error;
    }
  }

  async delete(table: string, sysId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/${table}/${sysId}`, {
        method: 'DELETE',
        headers: this.headers
      });

      if (response.status === 404) {
        return false; // Record not found
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      return true;
    } catch (error) {
      console.error(`Error deleting record ${sysId} from ${table}:`, error);
      throw error;
    }
  }

  async query(options: QueryOptions): Promise<ServiceNowRecord[]> {
    try {
      const params = new URLSearchParams();
      
      if (options.filter) {
        params.append('sysparm_query', options.filter);
      }
      
      if (options.limit) {
        params.append('sysparm_limit', options.limit.toString());
      }
      
      if (options.offset) {
        params.append('sysparm_offset', options.offset.toString());
      }
      
      if (options.fields) {
        params.append('sysparm_fields', options.fields.join(','));
      }
      
      if (options.orderBy) {
        params.append('sysparm_order_by', options.orderBy);
      }

      const url = `${this.baseUrl}/${options.table}?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      return result.result || [];
    } catch (error) {
      console.error(`Error querying ${options.table}:`, error);
      throw error;
    }
  }

  // SLA/SLM Collection Methods
  async getTaskSLAs(options: TaskSLAQueryOptions): Promise<TaskSLAResponse> {
    try {
      console.log(`🔍 Getting SLAs for task: ${options.taskNumber}`);
      
      const params = new URLSearchParams();
      params.append('sysparm_query', `task.number=${options.taskNumber}`);
      params.append('sysparm_display_value', options.includeDisplayValues ? 'all' : 'false');
      
      if (options.limit) {
        params.append('sysparm_limit', options.limit.toString());
      }
      
      const url = `${this.baseUrl}/task_sla?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ServiceNow API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const slaRecords = result.result || [];
      
      const slmRecords: SLMRecord[] = slaRecords.map((sla: ServiceNowRecord) => ({
        sys_id: this.extractValue(sla.sys_id),
        task_number: this.extractValue(sla['task.number']),
        taskslatable_business_percentage: this.extractValue(sla.business_percentage),
        taskslatable_start_time: this.extractValue(sla.start_time),
        taskslatable_end_time: this.extractValue(sla.end_time),
        taskslatable_sla: this.extractValue(sla.sla),
        taskslatable_stage: this.extractValue(sla.stage),
        taskslatable_has_breached: this.extractValue(sla.has_breached),
        task_assignment_group: this.extractValue(sla['task.assignment_group']),
        raw_data: sla
      }));

      console.log(`✅ Found ${slmRecords.length} SLAs for task ${options.taskNumber}`);
      
      return {
        result: slmRecords,
        totalCount: slmRecords.length,
        hasMore: false
      };
    } catch (error) {
      console.error(`❌ Error getting SLAs for task ${options.taskNumber}:`, error);
      throw error;
    }
  }

  async getTaskSLASummary(taskNumber: string): Promise<TicketSLASummary> {
    try {
      const slaResponse = await this.getTaskSLAs({ 
        taskNumber, 
        includeDisplayValues: true 
      });
      
      const slas = slaResponse.result;
      const breachedCount = slas.filter(sla => this.parseBoolean(sla.taskslatable_has_breached)).length;
      const activeCount = slas.filter(sla => sla.taskslatable_stage && sla.taskslatable_stage !== 'completed').length;
      
      const slaBreachInfos: SLABreachInfo[] = slas.map(sla => ({
        sla_name: sla.taskslatable_sla || 'Unknown SLA',
        has_breached: this.parseBoolean(sla.taskslatable_has_breached),
        business_percentage: this.parsePercentage(sla.taskslatable_business_percentage),
        start_time: sla.taskslatable_start_time,
        end_time: sla.taskslatable_end_time,
        stage: sla.taskslatable_stage || 'unknown',
        breach_time: this.parseBoolean(sla.taskslatable_has_breached) ? sla.taskslatable_end_time : undefined
      }));

      const worstSla = slaBreachInfos
        .filter(sla => sla.has_breached)
        .sort((a, b) => b.business_percentage - a.business_percentage)[0] || null;

      return {
        ticket_number: taskNumber,
        total_slas: slas.length,
        active_slas: activeCount,
        breached_slas: breachedCount,
        breach_percentage: slas.length > 0 ? (breachedCount / slas.length) * 100 : 0,
        worst_sla: worstSla,
        all_slas: slaBreachInfos
      };
    } catch (error) {
      console.error(`Error getting SLA summary for task ${taskNumber}:`, error);
      throw error;
    }
  }

  async getMultipleTaskSLAs(taskNumbers: string[]): Promise<Record<string, SLMRecord[]>> {
    try {
      console.log(`🔍 Getting SLAs for ${taskNumbers.length} tasks`);
      
      const result: Record<string, SLMRecord[]> = {};
      
      // Process in batches to avoid URL length limits
      const batchSize = 10;
      for (let i = 0; i < taskNumbers.length; i += batchSize) {
        const batch = taskNumbers.slice(i, i + batchSize);
        const batchQuery = batch.map(num => `task.number=${num}`).join('^OR');
        
        const batchResults = await this.query({
          table: 'task_sla',
          filter: batchQuery,
          fields: [
            'sys_id', 'task.number', 'business_percentage', 
            'start_time', 'end_time', 'sla', 'stage', 
            'has_breached', 'task.assignment_group'
          ]
        });
        
        // Group results by task number
        for (const sla of batchResults) {
          const taskNumber = this.extractValue(sla['task.number']);
          if (!result[taskNumber]) {
            result[taskNumber] = [];
          }
          
          result[taskNumber].push({
            sys_id: this.extractValue(sla.sys_id),
            task_number: taskNumber,
            taskslatable_business_percentage: this.extractValue(sla.business_percentage),
            taskslatable_start_time: this.extractValue(sla.start_time),
            taskslatable_end_time: this.extractValue(sla.end_time),
            taskslatable_sla: this.extractValue(sla.sla),
            taskslatable_stage: this.extractValue(sla.stage),
            taskslatable_has_breached: this.extractValue(sla.has_breached),
            task_assignment_group: this.extractValue(sla['task.assignment_group']),
            raw_data: sla
          });
        }
      }
      
      console.log(`✅ Retrieved SLAs for ${Object.keys(result).length} tasks`);
      return result;
    } catch (error) {
      console.error('Error getting multiple task SLAs:', error);
      throw error;
    }
  }

  // Helper methods for SLA data processing
  private extractValue(field: any): string {
    if (typeof field === 'string') return field;
    if (field && typeof field === 'object') {
      return field.display_value || field.value || '';
    }
    return '';
  }

  private parseBoolean(value: string | boolean): boolean {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  }

  private parsePercentage(value: string | null): number {
    if (!value) return 0;
    const cleaned = value.replace('%', '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
}