/**
 * E2E Mock-Aware Consolidated Ticket Service
 * Provides ConsolidatedServiceNowService functionality without MongoDB dependencies
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { ServiceNowClient } from "../../../types/servicenow";

// Mock interfaces that match the original ConsolidatedServiceNowService
export interface HybridQueryParams {
  table: string;
  query?: string;
  useCache?: boolean;
  fallbackToServiceNow?: boolean;
  group?: string;
  state?: string;
  page?: number;
  limit?: number;
}

export interface HybridQueryResult {
  data: any[];
  hasMore: boolean;
  total: number;
  currentPage: number;
  totalPages: number;
  source: "mongodb" | "servicenow" | "hybrid";
  cached?: boolean;
}

export interface BatchOperation {
  operation: "create" | "update" | "delete";
  table: string;
  sysId?: string;
  data: any;
}

export interface BatchResults {
  results: Array<{
    operation: string;
    table: string;
    success: boolean;
    result?: any;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    duration: number;
  };
}

export interface TicketCollectionParams {
  table: string;
  filters?: any;
  limit?: number;
  includeRelated?: boolean;
}

export interface TicketCollectionResult {
  tickets: any[];
  metadata: {
    total: number;
    filtered: number;
    limit: number;
    hasMore: boolean;
  };
}

export class E2EConsolidatedServiceNowService {
  private serviceNowClient: ServiceNowClient;

  constructor(serviceNowClient: ServiceNowClient) {
    this.serviceNowClient = serviceNowClient;
  }

  /**
   * Create a ticket using ServiceNow API
   */
  async createTicket(table: string, data: any): Promise<any> {
    try {
      const result = await this.serviceNowClient.createRecord(table, data);
      return result.result;
    } catch (error: unknown) {
      throw new Error(`Failed to create ${table} ticket: ${error}`);
    }
  }

  /**
   * Get ticket details from ServiceNow
   */
  async getTicketDetails(sysId: string, table: string): Promise<any> {
    try {
      const result = await this.serviceNowClient.makeRequestFullFields(
        table,
        `sys_id=${sysId}`,
        1,
      );

      if (!result.result || result.result.length === 0) {
        throw new Error(`Ticket not found: ${sysId}`);
      }

      return {
        sysId: result.result[0].sys_id,
        number: result.result[0].number,
        shortDescription: result.result[0].short_description,
        description: result.result[0].description,
        state: result.result[0].state,
        priority: result.result[0].priority,
        assignedTo: result.result[0].assigned_to,
        caller: result.result[0].caller_id,
        category: result.result[0].category,
        subcategory: result.result[0].subcategory,
        createdOn: result.result[0].sys_created_on,
        updatedOn: result.result[0].sys_updated_on,
      };
    } catch (error: unknown) {
      throw new Error(`Failed to get ticket details: ${error}`);
    }
  }

  /**
   * Update a ticket in ServiceNow
   */
  async updateTicket(table: string, sysId: string, data: any): Promise<any> {
    try {
      const result = await this.serviceNowClient.updateRecord(
        table,
        sysId,
        data,
      );
      return result.result;
    } catch (error: unknown) {
      throw new Error(`Failed to update ${table} ticket: ${error}`);
    }
  }

  /**
   * Delete a ticket from ServiceNow
   */
  async deleteTicket(table: string, sysId: string): Promise<boolean> {
    try {
      await this.serviceNowClient.deleteRecord(table, sysId);
      return true;
    } catch (error: unknown) {
      throw new Error(`Failed to delete ${table} ticket: ${error}`);
    }
  }

  /**
   * Hybrid query with mock fallback behavior
   */
  async hybridQuery(params: HybridQueryParams): Promise<HybridQueryResult> {
    try {
      // Simulate hybrid query logic
      const useServiceNow = params.fallbackToServiceNow !== false;
      const useCache = params.useCache === true;

      let source: "mongodb" | "servicenow" | "hybrid" = "servicenow";

      if (useCache && Math.random() > 0.5) {
        source = "mongodb";
      } else if (useServiceNow && useCache) {
        source = "hybrid";
      }

      const limit = params.limit || 10;
      const page = params.page || 1;

      // Mock data retrieval
      const result = await this.serviceNowClient.makeRequest(
        params.table,
        params.query,
        limit,
      );

      return {
        data: result.result || [],
        hasMore: result.result?.length === limit,
        total: result.result?.length || 0,
        currentPage: page,
        totalPages: Math.ceil((result.result?.length || 0) / limit),
        source,
        cached: source === "mongodb" || source === "hybrid",
      };
    } catch (error: unknown) {
      throw new Error(`Hybrid query failed: ${error}`);
    }
  }

  /**
   * Process batch operations
   */
  async processBatch(operations: BatchOperation[]): Promise<BatchResults> {
    const startTime = performance.now();
    const results = [];
    let successful = 0;
    let failed = 0;

    for (const operation of operations) {
      try {
        let result;

        switch (operation.operation) {
          case "create":
            result = await this.createTicket(operation.table, operation.data);
            break;
          case "update":
            if (!operation.sysId) {
              throw new Error("sysId required for update operation");
            }
            result = await this.updateTicket(
              operation.table,
              operation.sysId,
              operation.data,
            );
            break;
          case "delete":
            if (!operation.sysId) {
              throw new Error("sysId required for delete operation");
            }
            result = await this.deleteTicket(operation.table, operation.sysId);
            break;
          default:
            throw new Error(`Unknown operation: ${operation.operation}`);
        }

        results.push({
          operation: operation.operation,
          table: operation.table,
          success: true,
          result,
        });
        successful++;
      } catch (error: unknown) {
        results.push({
          operation: operation.operation,
          table: operation.table,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    const endTime = performance.now();

    return {
      results,
      summary: {
        total: operations.length,
        successful,
        failed,
        duration: endTime - startTime,
      },
    };
  }

  /**
   * Get ticket collection with filters
   */
  async getTicketCollection(
    params: TicketCollectionParams,
  ): Promise<TicketCollectionResult> {
    try {
      const limit = params.limit || 50;
      const filterQuery = this.buildFilterQuery(params.filters);

      const result = await this.serviceNowClient.makeRequest(
        params.table,
        filterQuery,
        limit,
      );

      const tickets = result.result || [];

      // If includeRelated is true, simulate related data
      if (params.includeRelated) {
        for (const ticket of tickets) {
          ticket.related = {
            comments: [],
            attachments: [],
            workNotes: [],
          };
        }
      }

      return {
        tickets,
        metadata: {
          total: tickets.length,
          filtered: tickets.length,
          limit,
          hasMore: tickets.length === limit,
        },
      };
    } catch (error: unknown) {
      throw new Error(`Failed to get ticket collection: ${error}`);
    }
  }

  /**
   * Build filter query string from filters object
   */
  private buildFilterQuery(filters?: any): string {
    if (!filters) return "";

    const conditions = [];

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        conditions.push(`${key}=${value}`);
      }
    }

    return conditions.join("^");
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
    };
  }
}
