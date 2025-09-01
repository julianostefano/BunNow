/**
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * ServiceNow CRUD and query service - Production implementation
 */
import type { QueryOptions, ServiceNowRecord } from "../types/servicenow";

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
}