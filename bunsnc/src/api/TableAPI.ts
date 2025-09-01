/**
 * TableAPI - Dedicated API for ServiceNow Table operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { handleServiceNowError, createExceptionFromResponse } from '../exceptions';
import type { ServiceNowRecord, QueryOptions } from '../types/servicenow';

export interface ITableAPI {
  get(table: string, sysId: string): Promise<ServiceNowRecord | null>;
  create(table: string, data: ServiceNowRecord): Promise<ServiceNowRecord>;
  update(table: string, sysId: string, data: Partial<ServiceNowRecord>): Promise<ServiceNowRecord>;
  delete(table: string, sysId: string): Promise<boolean>;
  query(options: QueryOptions): Promise<ServiceNowRecord[]>;
  list(table: string, params?: Record<string, any>): Promise<ServiceNowRecord[]>;
  patch(table: string, sysId: string, data: Partial<ServiceNowRecord>): Promise<ServiceNowRecord>;
}

export class TableAPI implements ITableAPI {
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

  /**
   * Get a single record by sys_id
   */
  async get(table: string, sysId: string): Promise<ServiceNowRecord | null> {
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
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      const result = await response.json();
      return result.result || result;
    } catch (error) {
      handleServiceNowError(error, 'get record');
    }
  }

  /**
   * Create a new record
   */
  async create(table: string, data: ServiceNowRecord): Promise<ServiceNowRecord> {
    try {
      const response = await fetch(`${this.baseUrl}/${table}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      const result = await response.json();
      return result.result || result;
    } catch (error) {
      handleServiceNowError(error, 'create record');
    }
  }

  /**
   * Update an existing record (PUT)
   */
  async update(table: string, sysId: string, data: Partial<ServiceNowRecord>): Promise<ServiceNowRecord> {
    try {
      const response = await fetch(`${this.baseUrl}/${table}/${sysId}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      const result = await response.json();
      return result.result || result;
    } catch (error) {
      handleServiceNowError(error, 'update record');
    }
  }

  /**
   * Patch an existing record (PATCH)
   */
  async patch(table: string, sysId: string, data: Partial<ServiceNowRecord>): Promise<ServiceNowRecord> {
    try {
      const response = await fetch(`${this.baseUrl}/${table}/${sysId}`, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      const result = await response.json();
      return result.result || result;
    } catch (error) {
      handleServiceNowError(error, 'patch record');
    }
  }

  /**
   * Delete a record
   */
  async delete(table: string, sysId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/${table}/${sysId}`, {
        method: 'DELETE',
        headers: this.headers
      });

      if (response.status === 404) {
        return false; // Record doesn't exist
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      return response.status === 204;
    } catch (error) {
      handleServiceNowError(error, 'delete record');
    }
  }

  /**
   * Query records with options
   */
  async query(options: QueryOptions): Promise<ServiceNowRecord[]> {
    try {
      const params = new URLSearchParams();
      
      if (options.query) {
        params.append('sysparm_query', options.query);
      }
      
      if (options.fields && options.fields.length > 0) {
        params.append('sysparm_fields', options.fields.join(','));
      }
      
      if (options.limit) {
        params.append('sysparm_limit', options.limit.toString());
      }
      
      if (options.offset) {
        params.append('sysparm_offset', options.offset.toString());
      }

      // Default display value to 'all' for complete data
      params.append('sysparm_display_value', 'all');
      params.append('sysparm_exclude_reference_link', 'false');

      const url = `${this.baseUrl}/${options.table}?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Check for transaction timeout
        if (response.status === 400 && errorText.includes('Transaction cancelled: maximum execution time exceeded')) {
          throw createExceptionFromResponse(400, 'Query timeout: reduce batch size or add more specific filters', response);
        }
        
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      const result = await response.json();
      return result.result || [];
    } catch (error) {
      handleServiceNowError(error, 'query records');
    }
  }

  /**
   * List records with simple parameters
   */
  async list(table: string, params: Record<string, any> = {}): Promise<ServiceNowRecord[]> {
    const options: QueryOptions = {
      table,
      ...params
    };
    
    return this.query(options);
  }

  /**
   * Get total count for a query
   */
  async getCount(table: string, query?: string): Promise<number> {
    try {
      const params = new URLSearchParams();
      params.append('sysparm_count', 'true');
      
      if (query) {
        params.append('sysparm_query', query);
      }

      const url = `${this.baseUrl}/${table}?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      const totalCount = response.headers.get('X-Total-Count');
      return totalCount ? parseInt(totalCount, 10) : 0;
    } catch (error) {
      handleServiceNowError(error, 'get record count');
    }
  }

  /**
   * Execute multiple operations in a batch (if supported by instance)
   */
  async batch(operations: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    table: string;
    sysId?: string;
    data?: ServiceNowRecord;
  }>): Promise<ServiceNowRecord[]> {
    // This would require ServiceNow Batch API support
    // For now, execute sequentially
    const results: ServiceNowRecord[] = [];
    
    for (const op of operations) {
      try {
        let result: any;
        
        switch (op.method) {
          case 'GET':
            result = op.sysId ? await this.get(op.table, op.sysId) : await this.list(op.table);
            break;
          case 'POST':
            result = await this.create(op.table, op.data!);
            break;
          case 'PUT':
            result = await this.update(op.table, op.sysId!, op.data!);
            break;
          case 'PATCH':
            result = await this.patch(op.table, op.sysId!, op.data!);
            break;
          case 'DELETE':
            result = { deleted: await this.delete(op.table, op.sysId!) };
            break;
        }
        
        results.push(result);
      } catch (error) {
        // Include error in results for batch processing
        results.push({ error: error.message, operation: op });
      }
    }
    
    return results;
  }

  /**
   * Get API statistics and health
   */
  async getStats(): Promise<{ status: string; instance: string; version?: string }> {
    try {
      // Try to get instance info
      const response = await fetch(`${this.instanceUrl}/api/now/table/sys_properties?sysparm_query=name=glide.war&sysparm_fields=name,value&sysparm_limit=1`, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        return { status: 'error', instance: this.instanceUrl };
      }

      const result = await response.json();
      const version = result.result?.[0]?.value;
      
      return {
        status: 'connected',
        instance: this.instanceUrl,
        version: version || 'unknown'
      };
    } catch (error) {
      return { status: 'error', instance: this.instanceUrl };
    }
  }
}