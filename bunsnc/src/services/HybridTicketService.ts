/**
 * Hybrid Ticket Service - MongoDB first with ServiceNow fallback
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * This service implements a hybrid data access pattern:
 * 1. Try MongoDB cache first (fast)
 * 2. Fallback to ServiceNow on cache miss (slower but always fresh)
 */

import { ServiceNowAuthClient } from "./ServiceNowAuthClient";
import { ConsolidatedDataService } from "./ConsolidatedDataService";
import { consolidatedServiceNowService } from "./index";
import type { TicketData } from "../types/TicketTypes";

interface QueryPaginatedParams {
  table: string;
  group?: string;
  state?: string;
  page: number;
  limit: number;
}

interface PaginatedResult {
  data: TicketData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class HybridTicketService {
  private mongoService: ConsolidatedDataService;
  private serviceNowClient: ServiceNowAuthClient;
  private initialized: boolean = false;

  constructor(serviceNowClient: ServiceNowAuthClient) {
    this.serviceNowClient = serviceNowClient;
    this.mongoService = new ConsolidatedDataService();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // MongoDB is initialized automatically in constructor
      this.initialized = true;
    } catch (error) {
      console.error("HybridTicketService initialization error:", error);
      throw error;
    }
  }

  /**
   * Query tickets with pagination - ServiceNow only (MongoDB cache not implemented for queries)
   */
  async queryTicketsPaginated(
    params: QueryPaginatedParams,
  ): Promise<PaginatedResult> {
    const { table, group, state, page, limit } = params;

    try {
      let query = "";
      if (group) {
        query += `assignment_group.nameCONTAINS${group}`;
      }
      if (state) {
        query += query ? `^state=${state}` : `state=${state}`;
      }

      const serviceNowResult = await consolidatedServiceNowService.query(
        table,
        {
          sysparm_query: query,
          sysparm_limit: String(limit),
          sysparm_offset: String((page - 1) * limit),
          sysparm_display_value: "all",
        },
      );

      const tickets = Array.isArray(serviceNowResult) ? serviceNowResult : [];

      return {
        data: tickets as TicketData[],
        total: tickets.length,
        page,
        limit,
        totalPages: Math.ceil(tickets.length / limit),
      };
    } catch (serviceNowError) {
      console.error("ServiceNow query failed:", serviceNowError);
      throw serviceNowError;
    }
  }

  /**
   * Get ticket details by sys_id - MongoDB first, ServiceNow fallback
   */
  async getTicketDetails(
    table: string,
    sysId: string,
  ): Promise<TicketData | null> {
    try {
      // Try MongoDB first
      const mongoTicket = await this.mongoService.getTicket(sysId, {
        forceServiceNow: false,
      });
      if (mongoTicket) {
        return mongoTicket;
      }
    } catch (mongoError) {
      console.warn(
        "MongoDB getTicket failed, falling back to ServiceNow:",
        mongoError,
      );
    }

    // Fallback to ServiceNow
    try {
      const serviceNowTicket = await consolidatedServiceNowService.get(
        table,
        sysId,
        {
          sysparm_display_value: "all",
        },
      );

      return serviceNowTicket as TicketData;
    } catch (serviceNowError) {
      console.error("ServiceNow getTicket failed:", serviceNowError);
      return null;
    }
  }

  /**
   * Perform action on ticket (always goes to ServiceNow)
   */
  async performAction(
    table: string,
    sysId: string,
    action: string,
    data: Record<string, any>,
  ): Promise<any> {
    try {
      // Actions always go to ServiceNow
      const result = await consolidatedServiceNowService.update(
        table,
        sysId,
        data,
      );
      return result;
    } catch (error) {
      console.error("performAction failed:", error);
      throw error;
    }
  }

  /**
   * Get available assignment groups (hardcoded common groups)
   */
  async getAvailableGroups(): Promise<string[]> {
    // Return common assignment groups
    // TODO: Implement dynamic group discovery via ServiceNow API
    return [
      "IT Operations",
      "Database Administration",
      "Network Support",
      "Application Support",
      "Security Team",
      "Service Desk",
    ];
  }
}
