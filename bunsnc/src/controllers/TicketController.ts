/**
 * Ticket Controller - Business logic for ticket operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import type { TicketData, TicketResponse } from "../types/TicketTypes";
import type { ConsolidatedDataService } from "../services/ConsolidatedDataService";
import type { ServiceNowStreams } from "../config/redis-streams";
import { ServiceNowQueryService } from "../services/auth/ServiceNowQueryService";

// ServiceNow field type for proper typing
type ServiceNowField =
  | string
  | number
  | { display_value: string; value: string }
  | null
  | undefined;

// Raw ServiceNow record interface
interface RawServiceNowRecord {
  [key: string]: ServiceNowField;
}

export class TicketController {
  private hybridDataService?: ConsolidatedDataService;
  private queryService: ServiceNowQueryService;

  constructor(
    private serviceNowAuthClient: ServiceNowAuthClient,
    private mongoService?: ConsolidatedDataService,
    private redisStreams?: ServiceNowStreams,
  ) {
    // Initialize ServiceNow Query Service for hybrid data access
    this.queryService = new ServiceNowQueryService();

    // Initialize ConsolidatedDataService only if all dependencies are available
    if (this.mongoService && this.redisStreams) {
      this.initializeConsolidatedDataService();
    }
  }

  private async initializeConsolidatedDataService() {
    try {
      const { ConsolidatedDataService } = await import(
        "../services/ConsolidatedDataService"
      );
      if (this.mongoService && this.redisStreams) {
        this.hybridDataService = new ConsolidatedDataService(
          this.mongoService,
          this.serviceNowAuthClient,
          this.redisStreams,
        );
      }
    } catch (error: unknown) {
      console.warn(
        "Could not initialize ConsolidatedDataService:",
        (error as Error).message,
      );
    }
  }

  /**
   * Retrieve ticket details using hybrid data architecture
   * Automatically chooses between MongoDB cache and ServiceNow based on data freshness
   * @param sysId - Ticket system ID
   * @param table - ServiceNow table name
   * @returns Promise resolving to ticket data
   * @throws Error when ticket not found or data access fails
   */
  async getTicketDetails(sysId: string, table: string): Promise<TicketData> {
    try {
      console.log(
        `[TicketController] Fetching ticket details: ${sysId} from ${table}`,
      );

      // First try to use ConsolidatedDataService for hybrid data access
      if (this.hybridDataService) {
        try {
          console.log(
            `[TicketController] Using hybrid data service for ${sysId}`,
          );

          const hybridTicket = await this.hybridDataService.getTicket(sysId, {
            includeSLMs: true,
            includeNotes: true,
          });

          if (hybridTicket) {
            console.log(
              `[TicketController] Hybrid data hit for ticket: ${sysId}`,
            );
            return hybridTicket;
          }
        } catch (hybridError) {
          console.warn(
            `[TicketController] Hybrid data service failed, falling back to direct ServiceNow:`,
            hybridError,
          );
        }
      }

      // Fallback to direct ServiceNow query using QueryService
      console.log(
        `[TicketController] Using direct ServiceNow query for ${sysId}`,
      );

      const ticketResponse = await this.queryService.makeRequest(table, "GET", {
        sysparm_query: `sys_id=${sysId}`,
        sysparm_fields:
          "sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,opened_by,sys_created_on,sys_updated_on",
        sysparm_display_value: "all",
        sysparm_exclude_reference_link: "true",
        sysparm_limit: "1",
      });

      const ticket = ticketResponse?.result?.[0];

      if (!ticket) {
        throw new Error(`Ticket not found: ${sysId}`);
      }

      console.log(
        `[TicketController] Direct ServiceNow query successful for: ${sysId}`,
      );
      return this.processTicketData(ticket);
    } catch (error: unknown) {
      console.error(
        `[TicketController] Error fetching ticket details for ${sysId}:`,
        error,
      );
      throw new Error(
        `Failed to load ticket ${sysId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Extract value from ServiceNow field (handles both objects and strings)
   * @param field - ServiceNow field data
   * @returns Normalized string value
   */
  private extractValue(field: ServiceNowField): string {
    if (!field) return "N/A";
    if (typeof field === "string") return field;
    if (typeof field === "object" && field.display_value !== undefined)
      return String(field.display_value);
    if (typeof field === "object" && field.value !== undefined)
      return String(field.value);
    return String(field);
  }

  /**
   * Process raw ticket data from ServiceNow
   * @param rawTicket - Raw ticket data from API
   * @returns Processed ticket data
   */
  private processTicketData(rawTicket: RawServiceNowRecord): TicketData {
    // Format created date
    let formattedCreatedOn = "N/A";
    const createdOnRaw =
      rawTicket.sys_created_on?.display_value || rawTicket.sys_created_on || "";
    if (createdOnRaw) {
      try {
        const date = new Date(createdOnRaw);
        if (!isNaN(date.getTime())) {
          formattedCreatedOn = date.toLocaleDateString("pt-BR", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch (error: unknown) {
        formattedCreatedOn = createdOnRaw.slice(0, 16);
      }
    }

    return {
      sysId: this.extractValue(rawTicket.sys_id),
      number: this.extractValue(rawTicket.number),
      shortDescription:
        this.extractValue(rawTicket.short_description) || "Sem descrição",
      description:
        this.extractValue(rawTicket.description) || "Sem descrição detalhada",
      state: this.extractValue(rawTicket.state) || "1",
      priority: this.extractValue(rawTicket.priority) || "3",
      assignedTo: this.extractValue(rawTicket.assigned_to) || "Não atribuído",
      assignmentGroup:
        this.extractValue(rawTicket.assignment_group) || "Não atribuído",
      caller:
        this.extractValue(rawTicket.caller_id) ||
        this.extractValue(rawTicket.opened_by) ||
        "N/A",
      createdOn: formattedCreatedOn,
      table: this.extractValue(rawTicket.sys_class_name) || "incident",
      slaDue:
        this.extractValue(rawTicket.sla_due) === "N/A"
          ? null
          : this.extractValue(rawTicket.sla_due),
      businessStc:
        this.extractValue(rawTicket.business_stc) === "N/A"
          ? null
          : this.extractValue(rawTicket.business_stc),
      resolveTime:
        this.extractValue(rawTicket.resolve_time) === "N/A"
          ? null
          : this.extractValue(rawTicket.resolve_time),
      updatedOn: this.extractValue(rawTicket.sys_updated_on),
      category: this.extractValue(rawTicket.category),
      subcategory: this.extractValue(rawTicket.subcategory),
      urgency: this.extractValue(rawTicket.urgency) || "3",
      impact: this.extractValue(rawTicket.impact) || "3",
    };
  }

  /**
   * Map status codes to readable labels
   * @param state - Status code
   * @returns Status label
   */
  getStatusLabel(state: string): string {
    const statusMap: Record<string, string> = {
      "1": "Novo",
      "2": "Em Progresso",
      "6": "Resolvido",
      "7": "Fechado",
    };
    return statusMap[state] || "Desconhecido";
  }

  /**
   * Map priority codes to readable labels
   * @param priority - Priority code
   * @returns Priority label
   */
  getPriorityLabel(priority: string): string {
    const priorityMap: Record<string, string> = {
      "1": "Crítica",
      "2": "Alta",
      "3": "Moderada",
      "4": "Baixa",
      "5": "Planejamento",
    };
    return priorityMap[priority] || "N/A";
  }

  /**
   * Get tickets for lazy loading with pagination using hybrid data architecture
   * Uses ConsolidatedDataService for transparent MongoDB/ServiceNow data sourcing
   * @param type - Ticket type (incident, change_task, sc_task)
   * @param state - Ticket state
   * @param group - Assignment group filter (optional)
   * @param page - Page number for pagination
   * @returns Promise resolving to processed ticket data
   */
  async getLazyLoadTickets(
    type: string,
    state: string,
    group: string = "all",
    page: number = 1,
  ): Promise<TicketData[]> {
    try {
      console.log(
        `[TicketController] Loading tickets: type=${type}, state=${state}, group=${group}, page=${page}`,
      );

      const pageSize = 10; // 10 tickets per page

      // Use ServiceNowQueryService for paginated requests with hybrid caching
      const paginatedResponse = await this.queryService.makeRequestPaginated(
        type,
        group,
        state,
        page,
        pageSize,
      );

      const tickets = paginatedResponse.data || [];
      console.log(
        `[TicketController] Found ${tickets.length} tickets for ${type} state ${state} (page ${page})`,
      );

      // Process each ticket using existing processTicketData method
      const processedTickets = tickets.map((ticket) =>
        this.processTicketData(ticket),
      );

      // Log hybrid data source for transparency
      if (tickets.length > 0) {
        console.log(
          `[TicketController] Processed ${processedTickets.length} tickets with hybrid data architecture`,
        );
      }

      return processedTickets;
    } catch (error: unknown) {
      console.error(
        `[TicketController] Error loading tickets for ${type}:`,
        error,
      );

      // Fallback to empty array for graceful degradation
      if (error instanceof Error && error.message.includes("timeout")) {
        console.warn(
          `[TicketController] ServiceNow timeout, returning empty result for UI stability`,
        );
        return [];
      }

      throw new Error(
        `Failed to load ${type} tickets: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get ticket count for a specific type/state/group using smart estimation
   * Uses Redis cache and intelligent counting based on current month data
   * @param type - Ticket type (incident, change_task, sc_task)
   * @param state - Ticket state
   * @param group - Assignment group filter (optional)
   * @returns Promise resolving to ticket count
   */
  async getTicketCount(
    type: string,
    state: string,
    group: string = "all",
  ): Promise<number> {
    try {
      console.log(
        `[TicketController] Counting tickets: type=${type}, state=${state}, group=${group}`,
      );

      // Use cache-optimized approach with Redis and smart estimation
      const cacheKey = `ticket_count:${type}:${state}:${group}:${new Date().getMonth()}`;

      // Try to get cached count first
      try {
        const cached = await this.queryService.getCache().get(cacheKey);
        if (cached && typeof cached === "number") {
          console.log(
            `[TicketController] Cache hit for count: ${cached} tickets`,
          );
          return cached;
        }
      } catch (cacheError) {
        console.warn(
          `[TicketController] Cache access failed, proceeding with estimation`,
        );
      }

      // Get sample data to estimate count (much faster than full count)
      const sampleResponse = await this.queryService.makeRequestPaginated(
        type,
        group,
        state,
        1, // First page only for estimation
        10, // Small sample size
      );

      // Intelligent count estimation based on current month
      let estimatedCount = sampleResponse.total || 0;

      // If we got data, apply smart estimation based on group/state patterns
      if (sampleResponse.data && sampleResponse.data.length > 0) {
        // Base estimation on sample size and typical patterns
        const sampleSize = sampleResponse.data.length;

        // Apply estimation multipliers based on state and group
        if (state === "3") {
          // Waiting state typically has more tickets
          estimatedCount = Math.max(estimatedCount, sampleSize * 3);
        } else if (state === "2") {
          // In progress state
          estimatedCount = Math.max(estimatedCount, sampleSize * 2);
        } else if (state === "1") {
          // New tickets
          estimatedCount = Math.max(estimatedCount, sampleSize * 1.5);
        }

        // Group-based adjustments
        if (group !== "all") {
          estimatedCount = Math.max(estimatedCount, sampleSize * 2);
        }

        // Ensure reasonable bounds (5-200 tickets typical for monthly data)
        estimatedCount = Math.max(5, Math.min(200, Math.floor(estimatedCount)));
      } else {
        // No data found, use conservative estimate
        estimatedCount = 0;
      }

      // Cache the count for 5 minutes
      try {
        await this.queryService.getCache().set(cacheKey, estimatedCount, 300);
      } catch (cacheError) {
        console.warn(`[TicketController] Failed to cache count estimation`);
      }

      console.log(
        `[TicketController] Estimated count for ${type} state ${state}: ${estimatedCount} tickets`,
      );
      return estimatedCount;
    } catch (error: unknown) {
      console.error(
        `[TicketController] Error counting tickets for ${type}:`,
        error,
      );

      // Return conservative estimate on error to maintain UI functionality
      const fallbackCount = state === "3" ? 15 : state === "2" ? 8 : 5;
      console.log(
        `[TicketController] Using fallback count: ${fallbackCount} tickets`,
      );
      return fallbackCount;
    }
  }
}
