/**
 * Record controller with QueryBuilder integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { consolidatedServiceNowService } from "../services/ConsolidatedServiceNowService";
import { QueryBuilder } from "../query/QueryBuilder";
import type { QueryOptions, ServiceNowRecord } from "../types/servicenow";

export class RecordController {
  private service = consolidatedServiceNowService;

  constructor(instanceUrl?: string, authToken?: string) {
    // Using consolidated service singleton - parameters kept for compatibility
  }

  async create(table: string, data: ServiceNowRecord) {
    return this.service.create(table, data);
  }

  async read(table: string, sysId: string) {
    return this.service.read(table, sysId);
  }

  async update(table: string, sysId: string, data: Partial<ServiceNowRecord>) {
    return this.service.update(table, sysId, data);
  }

  async delete(table: string, sysId: string) {
    return this.service.delete(table, sysId);
  }

  async query(options: QueryOptions) {
    return this.service.query(options);
  }

  /**
   * Create a QueryBuilder for advanced query construction
   */
  createQueryBuilder(table: string): QueryBuilder {
    return new QueryBuilder(table);
  }

  /**
   * Execute a query using QueryBuilder
   */
  async queryWithBuilder(table: string, queryBuilder: QueryBuilder) {
    const encodedQuery = queryBuilder.generateQuery();
    return this.service.query({
      table,
      filter: encodedQuery
    });
  }
}
