/**
 * Ticket Search Service - Independent search functionality without circular dependencies
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient, Db, Collection } from "mongodb";
import { logger } from "../utils/Logger";
import { ErrorHandler } from "../utils/ErrorHandler";
import { synonymService } from "./SynonymService";

export interface SearchQuery {
  query: string;
  limit?: number;
  tables?: string[];
}

export interface SearchResult {
  sys_id: string;
  number: string;
  short_description: string;
  state: string;
  assigned_to: string;
  created_on: string;
  table: string;
  priority?: string;
  urgency?: string;
}

export interface SearchFilters {
  table?: string;
  state?: string;
  priority?: string;
  assignmentGroup?: string;
}

export interface SearchOptions {
  enableSynonymExpansion?: boolean;
  maxSynonymExpansions?: number;
  synonymCategories?: Array<"technical" | "status" | "priority" | "general">;
}

export class TicketSearchService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnected = false;

  constructor(
    private mongoUrl: string = process.env.MONGO_URI ||
      "mongodb://localhost:27017",
    private dbName: string = process.env.MONGO_DB_NAME || "bunsnc",
  ) {}

  async connect(): Promise<void> {
    try {
      if (this.isConnected && this.client) {
        return;
      }

      this.client = new MongoClient(this.mongoUrl);
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.isConnected = true;

      logger.info(
        `🔍 [TicketSearchService] Connected to MongoDB: ${this.dbName}`,
      );
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("TicketSearchService.connect", error);
      throw new Error(
        `Failed to connect to MongoDB: ${ErrorHandler.getErrorMessage(error)}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
        this.isConnected = false;
        logger.info("🔍 [TicketSearchService] Disconnected from MongoDB");
      }
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("TicketSearchService.disconnect", error);
    }
  }

  private getCollectionName(table: string): string {
    const collectionMap: Record<string, string> = {
      incident: "incidents_complete",
      change_task: "change_tasks_complete",
      sc_task: "sc_tasks_complete",
    };
    return collectionMap[table] || table;
  }

  private detectTicketType(ticketNumber: string): string | null {
    const upperNumber = ticketNumber.toUpperCase();
    if (upperNumber.startsWith("INC")) return "incident";
    if (upperNumber.startsWith("CTASK")) return "change_task";
    if (upperNumber.startsWith("SCTASK")) return "sc_task";
    return null;
  }

  private buildMongoFilter(
    searchQuery: SearchQuery,
    filters?: SearchFilters,
    options?: SearchOptions,
  ): any {
    const { query } = searchQuery;

    let mongoFilter: any = {};

    // Check if query looks like a ticket number
    const ticketType = this.detectTicketType(query);
    if (ticketType) {
      mongoFilter["raw_data.number.value"] = { $regex: query, $options: "i" };
    } else if (/^[a-f0-9]{32}$/i.test(query)) {
      // Check if query is sys_id
      mongoFilter["raw_data.sys_id.value"] = query;
    } else {
      // Build search terms with optional synonym expansion
      const searchTerms = this.buildSearchTerms(query, options);

      // Create OR conditions for each search term
      const orConditions: any[] = [];

      for (const term of searchTerms) {
        orConditions.push(
          {
            "raw_data.short_description.value": { $regex: term, $options: "i" },
          },
          { "raw_data.description.value": { $regex: term, $options: "i" } },
          { "raw_data.number.value": { $regex: term, $options: "i" } },
        );
      }

      if (orConditions.length > 0) {
        mongoFilter.$or = orConditions;
      }
    }

    // Apply additional filters
    if (filters?.state) {
      mongoFilter["raw_data.state.value"] = filters.state;
    }
    if (filters?.priority) {
      mongoFilter["raw_data.priority.value"] = filters.priority;
    }
    if (filters?.assignmentGroup) {
      mongoFilter["raw_data.assignment_group.display_value"] = {
        $regex: filters.assignmentGroup,
        $options: "i",
      };
    }

    return mongoFilter;
  }

  private buildSearchTerms(query: string, options?: SearchOptions): string[] {
    const terms = [query]; // Always include original query

    // Add synonym expansion if enabled
    if (options?.enableSynonymExpansion !== false) {
      try {
        const expansion = synonymService.expandQuery(query, {
          maxExpansions: options?.maxSynonymExpansions || 5,
          includeCategories: options?.synonymCategories || [
            "technical",
            "status",
            "priority",
            "general",
          ],
          minScore: 0.7,
        });

        // Add expanded terms
        terms.push(...expansion.expandedTerms);

        logger.debug(
          `🔍 [TicketSearchService] Expanded "${query}" with ${expansion.expandedTerms.length} synonyms`,
        );
      } catch (error: unknown) {
        logger.warn(
          `Failed to expand query with synonyms: ${ErrorHandler.getErrorMessage(error)}`,
        );
      }
    }

    return terms;
  }

  private transformDocument(doc: any, tableName: string): SearchResult {
    const rawData = doc.raw_data || {};

    return {
      sys_id: rawData.sys_id?.value || rawData.sys_id || doc.sys_id || "",
      number: rawData.number?.value || rawData.number || doc.number || "",
      short_description:
        rawData.short_description?.value ||
        rawData.short_description ||
        "Sem descrição",
      state: rawData.state?.value || rawData.state || "unknown",
      assigned_to:
        rawData.assigned_to?.display_value ||
        rawData.assigned_to ||
        "Não atribuído",
      created_on:
        rawData.sys_created_on?.value ||
        rawData.sys_created_on ||
        doc.created_at ||
        new Date().toISOString(),
      table: tableName,
      priority: rawData.priority?.value || rawData.priority,
      urgency: rawData.urgency?.value || rawData.urgency,
    };
  }

  async searchTickets(
    searchQuery: SearchQuery,
    filters?: SearchFilters,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    try {
      await this.connect();

      if (!this.db) {
        throw new Error("Database not connected");
      }

      const results: SearchResult[] = [];
      const limit = searchQuery.limit || 20;

      // Determine which tables to search
      let tablesToSearch = searchQuery.tables || [
        "incident",
        "change_task",
        "sc_task",
      ];

      // If we have a specific ticket type detected, search only that table
      const detectedType = this.detectTicketType(searchQuery.query);
      if (detectedType) {
        tablesToSearch = [detectedType];
      }

      // If table filter is specified, use only that table
      if (filters?.table) {
        tablesToSearch = [filters.table];
      }

      // Search in each table
      for (const table of tablesToSearch) {
        try {
          const collectionName = this.getCollectionName(table);
          const collection: Collection = this.db.collection(collectionName);

          const mongoFilter = this.buildMongoFilter(
            searchQuery,
            filters,
            options,
          );
          const docs = await collection
            .find(mongoFilter)
            .limit(Math.min(limit, 50))
            .sort({ "raw_data.sys_updated_on.value": -1 })
            .toArray();

          for (const doc of docs) {
            results.push(this.transformDocument(doc, table));
          }

          if (results.length >= limit) {
            break;
          }
        } catch (error: unknown) {
          ErrorHandler.logUnknownError(
            `TicketSearchService.searchTickets.${table}`,
            error,
          );
          // Continue with other tables even if one fails
        }
      }

      logger.debug(
        `🔍 [TicketSearchService] Found ${results.length} results for query: "${searchQuery.query}"`,
      );

      return results.slice(0, limit);
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("TicketSearchService.searchTickets", error);
      throw new Error(`Search failed: ${ErrorHandler.getErrorMessage(error)}`);
    }
  }

  async searchByNumber(ticketNumber: string): Promise<SearchResult | null> {
    try {
      const results = await this.searchTickets({
        query: ticketNumber,
        limit: 1,
      });

      return results.length > 0 ? results[0] : null;
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("TicketSearchService.searchByNumber", error);
      return null;
    }
  }

  async searchBySysId(sysId: string): Promise<SearchResult | null> {
    try {
      const results = await this.searchTickets({
        query: sysId,
        limit: 1,
      });

      return results.length > 0 ? results[0] : null;
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("TicketSearchService.searchBySysId", error);
      return null;
    }
  }

  async searchWithSynonyms(
    searchQuery: SearchQuery,
    filters?: SearchFilters,
    maxSynonymExpansions: number = 5,
  ): Promise<SearchResult[]> {
    return this.searchTickets(searchQuery, filters, {
      enableSynonymExpansion: true,
      maxSynonymExpansions,
      synonymCategories: ["technical", "status", "priority", "general"],
    });
  }

  async getSearchSuggestions(
    partialQuery: string,
    limit: number = 10,
  ): Promise<string[]> {
    try {
      return synonymService.getAutocompleteSuggestions(partialQuery, limit);
    } catch (error: unknown) {
      ErrorHandler.logUnknownError(
        "TicketSearchService.getSearchSuggestions",
        error,
      );
      return [];
    }
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    message: string;
    collections: Record<string, number>;
  }> {
    try {
      await this.connect();

      if (!this.db) {
        return {
          healthy: false,
          message: "Database not connected",
          collections: {},
        };
      }

      const collections = {
        incidents_complete: 0,
        change_tasks_complete: 0,
        sc_tasks_complete: 0,
      };

      for (const [name, count] of Object.entries(collections)) {
        try {
          const collection = this.db.collection(name);
          collections[name as keyof typeof collections] =
            await collection.countDocuments();
        } catch (error: unknown) {
          logger.warn(
            `Failed to count documents in ${name}:`,
            ErrorHandler.getErrorMessage(error),
          );
        }
      }

      const totalDocuments = Object.values(collections).reduce(
        (sum, count) => sum + count,
        0,
      );

      return {
        healthy: totalDocuments > 0,
        message:
          totalDocuments > 0
            ? `${totalDocuments} documents available`
            : "No documents found",
        collections,
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError(
        "TicketSearchService.getHealthStatus",
        error,
      );
      return {
        healthy: false,
        message: ErrorHandler.getErrorMessage(error),
        collections: {},
      };
    }
  }

  async updateTicket(
    collection: string,
    filter: any,
    updateData: any,
  ): Promise<any> {
    try {
      const db = await mongoClient.db();
      const result = await db
        .collection(collection)
        .updateOne(filter, updateData);
      return result;
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("TicketSearchService.updateTicket", error);
      return null;
    }
  }
}

// Export singleton instance
export const ticketSearchService = new TicketSearchService();
