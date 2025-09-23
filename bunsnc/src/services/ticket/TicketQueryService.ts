/**
 * Ticket Query Service - Hybrid query operations and data retrieval
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketDataCore } from "./TicketDataCore";
import { ServiceNowAuthClient } from "../ServiceNowAuthClient";
import { mongoCollectionManager } from "../../config/mongodb-collections";
import { logger } from "../../utils/Logger";

export interface HybridQueryParams {
  table: string;
  group: string;
  state: string;
  page: number;
  limit: number;
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

export class TicketQueryService extends TicketDataCore {
  private serviceNowClient: ServiceNowAuthClient;

  constructor(serviceNowClient: ServiceNowAuthClient) {
    super();
    this.serviceNowClient = serviceNowClient;
  }

  /**
   * Get ticket details with hybrid strategy
   */
  async getTicketDetails(sysId: string, table: string): Promise<any> {
    try {
      logger.info(
        `[TICKET-QUERY] Fetching ticket details: ${sysId} from ${table}`,
      );

      // Try MongoDB first (hybrid strategy)
      const mongoResult = await this.getTicketFromMongoDB(sysId, table);
      if (mongoResult) {
        logger.info(`[TICKET-QUERY] Ticket found in MongoDB: ${sysId}`);
        return mongoResult;
      }

      // Fallback to ServiceNow
      const ticketResponse = await this.serviceNowClient.makeRequestFullFields(
        table,
        `sys_id=${sysId}`,
        1,
      );

      const ticket = ticketResponse?.result?.[0];

      if (!ticket) {
        throw new Error(`Ticket not found: ${sysId}`);
      }

      const processedTicket = this.processTicketData(ticket);

      // Store in MongoDB for future queries
      await this.storeTicketInMongoDB(processedTicket, table);

      return processedTicket;
    } catch (error: unknown) {
      logger.error(`[TICKET-QUERY] Error fetching ticket details:`, error);
      throw new Error(`Failed to load ticket: ${error.message}`);
    }
  }

  /**
   * Hybrid query with MongoDB-first strategy
   */
  async hybridQuery(params: HybridQueryParams): Promise<HybridQueryResult> {
    try {
      logger.info(`[TICKET-QUERY] Executing hybrid query:`, params);

      // Try MongoDB first
      const mongoResult = await this.queryFromMongoDB(params);
      if (mongoResult && mongoResult.data.length > 0) {
        logger.info(
          `[TICKET-QUERY] Query satisfied by MongoDB: ${mongoResult.data.length} records`,
        );
        return mongoResult;
      }

      // Fallback to ServiceNow
      const serviceNowResult = await this.queryFromServiceNow(params);
      if (serviceNowResult && serviceNowResult.data.length > 0) {
        logger.info(
          `[TICKET-QUERY] Query satisfied by ServiceNow: ${serviceNowResult.data.length} records`,
        );

        // Cache results in MongoDB
        await this.cacheServiceNowResults(serviceNowResult.data, params.table);

        return serviceNowResult;
      }

      // Return empty result
      return {
        data: [],
        hasMore: false,
        total: 0,
        currentPage: params.page,
        totalPages: 0,
        source: "hybrid",
      };
    } catch (error: unknown) {
      logger.error(`[TICKET-QUERY] Error in hybrid query:`, error);
      throw error;
    }
  }

  /**
   * Query from MongoDB
   */
  async queryFromMongoDB(
    params: HybridQueryParams,
  ): Promise<HybridQueryResult | null> {
    await this.ensureConnected();

    try {
      const { table, group, state, page, limit } = params;

      const filter: any = {};

      // State filter
      if (state !== "all" && state !== "active") {
        const stateMapping: Record<string, string> = {
          new: "1",
          in_progress: "2",
          awaiting: "3",
          assigned: "18",
          resolved: "6",
          closed: "10",
          cancelled: "8",
        };

        const serviceNowState = stateMapping[state] || state;
        filter["raw_data.state.value"] = serviceNowState;
      } else if (state === "active") {
        filter["raw_data.state.value"] = { $in: ["1", "2", "3", "18", "-5"] };
      }

      // Group filter
      if (group !== "all") {
        filter["raw_data.assignment_group.display_value"] = group;
      }

      // Get collection
      let collection;
      switch (table) {
        case "incident":
          collection = mongoCollectionManager.getIncidentsCollection();
          break;
        case "change_task":
          collection = mongoCollectionManager.getChangeTasksCollection();
          break;
        case "sc_task":
          collection = mongoCollectionManager.getSCTasksCollection();
          break;
        default:
          return null;
      }

      const skip = (page - 1) * limit;
      const cursor = collection
        .find(filter)
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limit);

      const documents = await cursor.toArray();
      const total = await collection.countDocuments(filter);

      if (documents.length === 0) return null;

      const convertedData = documents.map((doc) =>
        this.convertMongoDocumentToServiceNowFormat(doc, table),
      );

      return {
        data: convertedData,
        hasMore: skip + documents.length < total,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        source: "mongodb",
      };
    } catch (error: unknown) {
      logger.error(`[TICKET-QUERY] Error querying MongoDB:`, error);
      return null;
    }
  }

  /**
   * Query from ServiceNow
   */
  async queryFromServiceNow(
    params: HybridQueryParams,
  ): Promise<HybridQueryResult | null> {
    try {
      const { table, group, state, page, limit } = params;

      // Build ServiceNow query
      let query = "";

      if (state !== "all" && state !== "active") {
        const stateMapping: Record<string, string> = {
          new: "1",
          in_progress: "2",
          awaiting: "3",
          assigned: "18",
          resolved: "6",
          closed: "10",
          cancelled: "8",
        };
        const serviceNowState = stateMapping[state] || state;
        query = `state=${serviceNowState}`;
      } else if (state === "active") {
        query = "stateIN1,2,3,18,-5";
      }

      if (group !== "all") {
        query += query
          ? `^assignment_group.name=${group}`
          : `assignment_group.name=${group}`;
      }

      const offset = (page - 1) * limit;
      const response = await this.serviceNowClient.makeRequestFullFields(
        table,
        query,
        limit,
        offset,
      );

      if (!response?.result) return null;

      return {
        data: response.result,
        hasMore: response.result.length === limit,
        total: response.result.length,
        currentPage: page,
        totalPages: Math.ceil(response.result.length / limit),
        source: "servicenow",
      };
    } catch (error: unknown) {
      logger.error(`[TICKET-QUERY] Error querying ServiceNow:`, error);
      return null;
    }
  }

  /**
   * Cache ServiceNow results in MongoDB
   */
  async cacheServiceNowResults(data: any[], table: string): Promise<void> {
    try {
      await Promise.all(
        data.map(async (ticket) => {
          const processedTicket = this.processTicketData(ticket);
          await this.storeTicketInMongoDB(processedTicket, table);
        }),
      );
    } catch (error: unknown) {
      logger.error(`[TICKET-QUERY] Error caching ServiceNow results:`, error);
    }
  }
}
