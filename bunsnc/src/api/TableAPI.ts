/**
 * TableAPI - Dedicated API for ServiceNow Table operations
 * Refactored to use ServiceNow Bridge Service directly (no self-referencing HTTP calls)
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import {
  handleServiceNowError,
  createExceptionFromResponse,
} from "../exceptions";
import type { ServiceNowRecord, QueryOptions } from "../types/servicenow";
import { ServiceNowBridgeService, BridgeResponse } from "../services/ServiceNowBridgeService";

export interface ITableAPI {
  get(table: string, sysId: string): Promise<ServiceNowRecord | null>;
  create(table: string, data: ServiceNowRecord): Promise<ServiceNowRecord>;
  update(
    table: string,
    sysId: string,
    data: Partial<ServiceNowRecord>,
  ): Promise<ServiceNowRecord>;
  delete(table: string, sysId: string): Promise<boolean>;
  query(options: QueryOptions): Promise<ServiceNowRecord[]>;
  list(
    table: string,
    params?: Record<string, any>,
  ): Promise<ServiceNowRecord[]>;
  patch(
    table: string,
    sysId: string,
    data: Partial<ServiceNowRecord>,
  ): Promise<ServiceNowRecord>;
}

export class TableAPI implements ITableAPI {
  private bridgeService: ServiceNowBridgeService;

  constructor(
    private instanceUrl: string,
    private authToken: string,
  ) {
    // Use ServiceNow Bridge Service directly - NO MORE HTTP SELF-REFERENCING CALLS
    this.bridgeService = new ServiceNowBridgeService();
    console.log('🔌 TableAPI using bridge service directly - self-referencing calls eliminated');
  }

  /**
   * Get a single record by sys_id using bridge service directly
   */
  async get(table: string, sysId: string): Promise<ServiceNowRecord | null> {
    try {
      const response = await this.bridgeService.getRecord(table, sysId);

      if (!response.success) {
        if (response.error?.includes('not found') || response.error?.includes('404')) {
          return null;
        }
        throw new Error(response.error || 'Failed to get record');
      }

      return response.result || null;
    } catch (error: unknown) {
      handleServiceNowError(error, "get record");
    }
  }

  /**
   * Create a new record using bridge service directly
   */
  async create(
    table: string,
    data: ServiceNowRecord,
  ): Promise<ServiceNowRecord> {
    try {
      const response = await this.bridgeService.createRecord(table, data);

      if (!response.success) {
        throw new Error(response.error || 'Failed to create record');
      }

      return response.result!;
    } catch (error: unknown) {
      handleServiceNowError(error, "create record");
    }
  }

  /**
   * Update an existing record (PUT) using bridge service directly
   */
  async update(
    table: string,
    sysId: string,
    data: Partial<ServiceNowRecord>,
  ): Promise<ServiceNowRecord> {
    try {
      const response = await this.bridgeService.updateRecord(table, sysId, data);

      if (!response.success) {
        throw new Error(response.error || 'Failed to update record');
      }

      return response.result!;
    } catch (error: unknown) {
      handleServiceNowError(error, "update record");
    }
  }

  /**
   * Patch an existing record (PATCH) using bridge service directly
   */
  async patch(
    table: string,
    sysId: string,
    data: Partial<ServiceNowRecord>,
  ): Promise<ServiceNowRecord> {
    try {
      // Use update method for PATCH operations (bridge service handles this)
      const response = await this.bridgeService.updateRecord(table, sysId, data);

      if (!response.success) {
        throw new Error(response.error || 'Failed to patch record');
      }

      return response.result!;
    } catch (error: unknown) {
      handleServiceNowError(error, "patch record");
    }
  }

  /**
   * Delete a record using bridge service directly
   */
  async delete(table: string, sysId: string): Promise<boolean> {
    try {
      const response = await this.bridgeService.deleteRecord(table, sysId);

      if (!response.success) {
        if (response.error?.includes('not found') || response.error?.includes('404')) {
          return false; // Record doesn't exist
        }
        throw new Error(response.error || 'Failed to delete record');
      }

      return true;
    } catch (error: unknown) {
      handleServiceNowError(error, "delete record");
    }
  }

  /**
   * Query records with options using bridge service directly
   */
  async query(options: QueryOptions): Promise<ServiceNowRecord[]> {
    try {
      const params: Record<string, any> = {};

      if (options.filter) {
        params.sysparm_query = options.filter;
      }

      if (options.fields && options.fields.length > 0) {
        params.sysparm_fields = options.fields.join(",");
      }

      if (options.limit) {
        params.sysparm_limit = options.limit.toString();
      }

      if (options.offset) {
        params.sysparm_offset = options.offset.toString();
      }

      // Default display value to 'all' for complete data
      params.sysparm_display_value = "all";
      params.sysparm_exclude_reference_link = "false";

      const response = await this.bridgeService.queryTable(options.table, params);

      if (!response.success) {
        // Check for transaction timeout
        if (response.error?.includes("maximum execution time exceeded")) {
          throw new Error("Query timeout: reduce batch size or add more specific filters");
        }
        throw new Error(response.error || 'Failed to query records');
      }

      return response.result || [];
    } catch (error: unknown) {
      handleServiceNowError(error, "query records");
    }
  }

  /**
   * List records from a table using bridge service directly
   */
  async list(
    table: string,
    params: Record<string, any> = {},
  ): Promise<ServiceNowRecord[]> {
    try {
      // Set default parameters
      const defaultParams = {
        sysparm_display_value: "all",
        sysparm_exclude_reference_link: "false",
        sysparm_limit: "100",
        ...params,
      };

      const response = await this.bridgeService.queryTable(table, defaultParams);

      if (!response.success) {
        throw new Error(response.error || 'Failed to list records');
      }

      return response.result || [];
    } catch (error: unknown) {
      handleServiceNowError(error, "list records");
    }
  }
}