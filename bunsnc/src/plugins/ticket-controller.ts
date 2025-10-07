/**
 * Ticket Controller Plugin - Unified ticket operations for ServiceNow integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.6.1: Singleton Lazy Loading Pattern (ElysiaJS Key Concepts #5 + #7)
 * Root cause: PluginTicketController instanciado a cada request via .derive()
 * Solution: Singleton instance com lazy initialization na primeira request
 * Reference: docs/ELYSIA_BEST_PRACTICES.md - "Plugin Deduplication Mechanism"
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Singleton Lazy Loading (v5.6.1)
 * - Global lifecycle scope (.as("global"))
 * - Implements unified ticket management following Elysia "1 controller = 1 instância" best practice
 * - Merges TicketController and EnhancedTicketController into a single plugin architecture
 *
 * Features:
 * - Hybrid data access (MongoDB cache + ServiceNow API)
 * - Paginated ticket loading with intelligent caching
 * - Enhanced modal generation with SLA tabs and notes
 * - Smart ticket counting and estimation
 * - Graceful degradation on service failures
 * - TypeBox validation for all REST endpoints
 */

import { Elysia, t } from "elysia";
import { logger } from "../utils/Logger";
import type { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import type { TicketData, TicketResponse } from "../types/TicketTypes";
import type { ConsolidatedDataService } from "../services/ConsolidatedDataService";
import type { ServiceNowStreams } from "../config/redis-streams";
import { ServiceNowQueryService } from "../services/auth/ServiceNowQueryService";
import { EnhancedTicketModalView } from "../views/EnhancedTicketModalView";

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

/**
 * Unified Ticket Controller implementation
 * Combines regular ticket operations with enhanced modal functionality
 */
class PluginTicketController {
  private hybridDataService?: ConsolidatedDataService;
  private queryService: ServiceNowQueryService;

  constructor(
    private serviceLocator: any,
    private config: any,
    private serviceNowAuthClient?: ServiceNowAuthClient,
    private mongoService?: ConsolidatedDataService,
    private redisStreams?: ServiceNowStreams,
  ) {
    // Initialize ServiceNow Query Service for hybrid data access
    this.queryService = new ServiceNowQueryService();

    // Initialize ConsolidatedDataService only if all dependencies are available
    if (this.mongoService && this.redisStreams && this.serviceNowAuthClient) {
      this.initializeConsolidatedDataService();
    }

    logger.info("🎫 Plugin Ticket Controller initialized", "TicketController", {
      hasHybridService: !!this.hybridDataService,
      hasQueryService: !!this.queryService,
      hasMongoService: !!this.mongoService,
      hasRedisStreams: !!this.redisStreams,
    });
  }

  private async initializeConsolidatedDataService() {
    try {
      const { ConsolidatedDataService } = await import(
        "../services/ConsolidatedDataService"
      );
      if (this.mongoService && this.redisStreams && this.serviceNowAuthClient) {
        this.hybridDataService = new ConsolidatedDataService(
          this.mongoService,
          this.serviceNowAuthClient,
          this.redisStreams,
        );
        logger.info(
          "✅ ConsolidatedDataService initialized for ticket operations",
          "TicketController",
        );
      }
    } catch (error: unknown) {
      logger.warn(
        "⚠️ Could not initialize ConsolidatedDataService",
        "TicketController",
        {
          error: (error as Error).message,
        },
      );
    }
  }

  /**
   * Retrieve ticket details using hybrid data architecture
   * Automatically chooses between MongoDB cache and ServiceNow based on data freshness
   */
  async getTicketDetails(sysId: string, table: string): Promise<TicketData> {
    try {
      logger.info("🔍 Fetching ticket details", "TicketController", {
        sysId,
        table,
        hasHybridService: !!this.hybridDataService,
      });

      // First try to use ConsolidatedDataService for hybrid data access
      if (this.hybridDataService) {
        try {
          const hybridTicket = await this.hybridDataService.getTicket(sysId, {
            includeSLMs: true,
            includeNotes: true,
          });

          if (hybridTicket) {
            logger.info("✅ Hybrid data hit for ticket", "TicketController", {
              sysId,
            });
            return hybridTicket;
          }
        } catch (hybridError) {
          logger.warn(
            "⚠️ Hybrid data service failed, falling back to direct ServiceNow",
            "TicketController",
            {
              error: hybridError,
            },
          );
        }
      }

      // Fallback to direct ServiceNow query using QueryService
      logger.info("🔄 Using direct ServiceNow query", "TicketController", {
        sysId,
      });

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

      logger.info("✅ Direct ServiceNow query successful", "TicketController", {
        sysId,
      });
      return this.processTicketData(ticket);
    } catch (error: unknown) {
      logger.error("❌ Error fetching ticket details", "TicketController", {
        sysId,
        error: (error as Error).message,
      });
      throw new Error(
        `Failed to load ticket ${sysId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get enhanced modal HTML with tabs and SLA data
   * Uses ConsolidatedDataService for transparent data access
   */
  async getEnhancedModal(sysId: string, table: string): Promise<string> {
    try {
      logger.info("🎯 Getting enhanced modal", "TicketController", {
        sysId,
        table,
        hasHybridService: !!this.hybridDataService,
      });

      // Get ticket data with SLMs and Notes using ConsolidatedDataService
      if (this.hybridDataService) {
        const ticketData = await this.hybridDataService.getTicketDetails(
          sysId,
          table,
          {
            includeSLMs: true,
            includeNotes: true,
          },
        );

        if (ticketData) {
          // Generate enhanced modal with SLA tabs and Notes
          return EnhancedTicketModalView.generateModal({
            ticket: ticketData,
            slaData: ticketData.slms || [],
            notes: ticketData.notes || [],
            history: [],
            isRealTime: true,
          });
        }
      }

      // Fallback to basic ticket data
      const basicTicketData = await this.getTicketDetails(sysId, table);
      return EnhancedTicketModalView.generateModal({
        ticket: basicTicketData,
        slaData: [],
        notes: [],
        history: [],
        isRealTime: false,
      });
    } catch (error: unknown) {
      logger.error("❌ Error generating enhanced modal", "TicketController", {
        sysId,
        table,
        error: (error as Error).message,
      });
      return this.generateErrorModal(
        `Erro ao carregar ticket: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get tickets for lazy loading with pagination using hybrid data architecture
   */
  async getLazyLoadTickets(
    type: string,
    state: string,
    group: string = "all",
    page: number = 1,
  ): Promise<TicketData[]> {
    try {
      logger.info("📄 Loading tickets with pagination", "TicketController", {
        type,
        state,
        group,
        page,
      });

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
      logger.info("📊 Found tickets", "TicketController", {
        count: tickets.length,
        type,
        state,
        page,
      });

      // Process each ticket using existing processTicketData method
      const processedTickets = tickets.map((ticket) =>
        this.processTicketData(ticket),
      );

      return processedTickets;
    } catch (error: unknown) {
      logger.error("❌ Error loading tickets", "TicketController", {
        type,
        error: (error as Error).message,
      });

      // Fallback to empty array for graceful degradation
      if (error instanceof Error && error.message.includes("timeout")) {
        logger.warn(
          "⏰ ServiceNow timeout, returning empty result for UI stability",
          "TicketController",
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
   */
  async getTicketCount(
    type: string,
    state: string,
    group: string = "all",
  ): Promise<number> {
    try {
      logger.info("🔢 Counting tickets", "TicketController", {
        type,
        state,
        group,
      });

      // Use cache-optimized approach with Redis and smart estimation
      const cacheKey = `ticket_count:${type}:${state}:${group}:${new Date().getMonth()}`;

      // Try to get cached count first
      try {
        const cached = await this.queryService.getCache().get(cacheKey);
        if (cached && typeof cached === "number") {
          logger.info("💾 Cache hit for count", "TicketController", {
            count: cached,
          });
          return cached;
        }
      } catch (cacheError) {
        logger.warn(
          "⚠️ Cache access failed, proceeding with estimation",
          "TicketController",
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
        logger.warn("⚠️ Failed to cache count estimation", "TicketController");
      }

      logger.info("📊 Estimated count", "TicketController", {
        type,
        state,
        count: estimatedCount,
      });
      return estimatedCount;
    } catch (error: unknown) {
      logger.error("❌ Error counting tickets", "TicketController", {
        type,
        error: (error as Error).message,
      });

      // Return conservative estimate on error to maintain UI functionality
      const fallbackCount = state === "3" ? 15 : state === "2" ? 8 : 5;
      logger.info("🔄 Using fallback count", "TicketController", {
        count: fallbackCount,
      });
      return fallbackCount;
    }
  }

  /**
   * Extract value from ServiceNow field (handles both objects and strings)
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
   * Generate error modal
   */
  private generateErrorModal(message: string): string {
    return `
      <div id="ticketModal" class="fixed inset-0 z-50 overflow-y-auto bg-black/50">
        <div class="flex items-center justify-center min-h-screen p-4">
          <div class="relative w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg shadow-2xl">
            <div class="p-6 text-center">
              <svg class="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 18.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
              <h3 class="text-lg font-medium text-white mb-2">Erro</h3>
              <p class="text-gray-400 mb-6">${message}</p>
              <button onclick="window.closeModal()"
                      class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Health check for ticket controller
   */
  async healthCheck(): Promise<boolean> {
    try {
      const hasQueryService = !!this.queryService;
      const hasHybridService = !!this.hybridDataService;

      logger.info("🏥 Ticket Controller health check", "TicketController", {
        hasQueryService,
        hasHybridService,
      });

      return hasQueryService;
    } catch (error: unknown) {
      logger.error(
        "❌ Ticket Controller health check failed",
        "TicketController",
        {
          error: (error as Error).message,
        },
      );
      return false;
    }
  }

  /**
   * Get ticket controller statistics
   */
  async getStats(): Promise<any> {
    try {
      return {
        hasQueryService: !!this.queryService,
        hasHybridDataService: !!this.hybridDataService,
        hasMongoService: !!this.mongoService,
        hasRedisStreams: !!this.redisStreams,
        uptime: Date.now() - (this.queryService ? 0 : Date.now()),
      };
    } catch (error: unknown) {
      return {
        error: (error as Error).message,
        hasQueryService: !!this.queryService,
        hasHybridDataService: !!this.hybridDataService,
      };
    }
  }
}

// TypeBox schemas for validation
const TicketParamsSchema = t.Object({
  sysId: t.String({ minLength: 1, description: "ServiceNow sys_id" }),
  table: t.String({ minLength: 1, description: "ServiceNow table name" }),
});

const TicketQuerySchema = t.Object({
  type: t.String({ default: "incident", description: "Ticket type" }),
  state: t.String({ default: "1", description: "Ticket state" }),
  group: t.Optional(
    t.String({ default: "all", description: "Assignment group" }),
  ),
  page: t.Optional(
    t.Numeric({ default: 1, minimum: 1, description: "Page number" }),
  ),
});

const TicketCountQuerySchema = t.Object({
  type: t.String({ default: "incident", description: "Ticket type" }),
  state: t.String({ default: "1", description: "Ticket state" }),
  group: t.Optional(
    t.String({ default: "all", description: "Assignment group" }),
  ),
});

// FIX v5.6.1: Singleton Lazy Loading Pattern
let _ticketControllerSingleton: PluginTicketController | null = null;

const getTicketController = async (
  serviceLocator: any,
  config: any,
  serviceNowAuthClient: any,
  mongoService: any,
  redisStreams: any,
) => {
  if (_ticketControllerSingleton) {
    return { ticketController: _ticketControllerSingleton };
  }

  console.log(
    "📦 Creating PluginTicketController (SINGLETON - first initialization)",
  );
  _ticketControllerSingleton = new PluginTicketController(
    serviceLocator,
    config,
    serviceNowAuthClient,
    mongoService,
    redisStreams,
  );
  console.log(
    "✅ PluginTicketController created (SINGLETON - reused across all requests)",
  );

  return { ticketController: _ticketControllerSingleton };
};

/**
 * Ticket Controller Plugin
 * Provides unified ticket management with REST endpoints and TypeBox validation
 *
 * Endpoints:
 * - GET /api/tickets/:table/:sysId - Get ticket details
 * - GET /api/tickets/:table/:sysId/modal - Get enhanced modal HTML
 * - GET /api/tickets - Get paginated tickets list
 * - GET /api/tickets/count - Get ticket count with smart estimation
 * - GET /api/tickets/health - Health check
 * - GET /api/tickets/stats - Controller statistics
 */
export const ticketControllerPlugin = new Elysia({ name: "ticket-controller" })
  .onStart(() =>
    console.log(
      "🔧 Ticket Controller Plugin starting - Singleton Lazy Loading pattern",
    ),
  )
  .derive(async ({ config, services, ...serviceLocator }) => {
    try {
      // Get required services from service locator
      const serviceNowAuthClient = serviceLocator.auth || services?.get("auth");
      const mongoService = serviceLocator.mongo || services?.get("mongo");
      const redisStreams =
        serviceLocator.cache?.getRedisStreams?.() ||
        services?.get("redisStreams");

      // Create ticket controller instance (singleton)
      const { ticketController } = await getTicketController(
        serviceLocator,
        config,
        serviceNowAuthClient,
        mongoService,
        redisStreams,
      );

      logger.info(
        "✅ Ticket Controller Plugin ready",
        "TicketControllerPlugin",
        {
          hasServiceLocator: !!serviceLocator,
          hasConfig: !!config,
          hasServices: !!services,
        },
      );

      return {
        ticketController,
        // Bind methods for direct access
        getTicketDetails:
          ticketController.getTicketDetails.bind(ticketController),
        getEnhancedModal:
          ticketController.getEnhancedModal.bind(ticketController),
        getLazyLoadTickets:
          ticketController.getLazyLoadTickets.bind(ticketController),
        getTicketCount: ticketController.getTicketCount.bind(ticketController),
        getStatusLabel: ticketController.getStatusLabel.bind(ticketController),
        getPriorityLabel:
          ticketController.getPriorityLabel.bind(ticketController),
        ticketHealthCheck: ticketController.healthCheck.bind(ticketController),
        getTicketStats: ticketController.getStats.bind(ticketController),
      };
    } catch (error: unknown) {
      logger.error(
        "❌ Failed to initialize Ticket Controller Plugin",
        "TicketControllerPlugin",
        {
          error: (error as Error).message,
        },
      );

      // Return fallback methods
      return {
        ticketController: null,
        getTicketDetails: async () => {
          throw new Error("Ticket service unavailable");
        },
        getEnhancedModal: async () => `<div>Ticket service unavailable</div>`,
        getLazyLoadTickets: async () => [],
        getTicketCount: async () => 0,
        getStatusLabel: (state: string) => "Unknown",
        getPriorityLabel: (priority: string) => "Unknown",
        ticketHealthCheck: async () => false,
        getTicketStats: async () => ({ error: "Service unavailable" }),
      };
    }
  })

  // Get ticket details
  .get(
    "/api/tickets/:table/:sysId",
    async ({ params: { table, sysId }, getTicketDetails }) => {
      try {
        const ticket = await getTicketDetails(sysId, table);
        return {
          success: true,
          ticket,
        };
      } catch (error: unknown) {
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    },
    {
      params: TicketParamsSchema,
      detail: {
        summary: "Get ticket details",
        description:
          "Retrieve detailed information for a specific ServiceNow ticket",
        tags: ["Tickets"],
      },
    },
  )

  // Get enhanced modal HTML
  .get(
    "/api/tickets/:table/:sysId/modal",
    async ({ params: { table, sysId }, getEnhancedModal }) => {
      try {
        const modalHtml = await getEnhancedModal(sysId, table);
        return modalHtml;
      } catch (error: unknown) {
        return `<div>Error: ${(error as Error).message}</div>`;
      }
    },
    {
      params: TicketParamsSchema,
      detail: {
        summary: "Get enhanced ticket modal",
        description:
          "Generate enhanced HTML modal with SLA tabs and notes for a ticket",
        tags: ["Tickets", "UI"],
      },
    },
  )

  // Get paginated tickets list
  .get(
    "/api/tickets",
    async ({ query, getLazyLoadTickets }) => {
      try {
        const { type, state, group = "all", page = 1 } = query;
        const tickets = await getLazyLoadTickets(type, state, group, page);
        return {
          success: true,
          tickets,
          page,
          count: tickets.length,
        };
      } catch (error: unknown) {
        return {
          success: false,
          error: (error as Error).message,
          tickets: [],
        };
      }
    },
    {
      query: TicketQuerySchema,
      detail: {
        summary: "Get paginated tickets",
        description:
          "Retrieve a paginated list of tickets with filtering options",
        tags: ["Tickets"],
      },
    },
  )

  // Get ticket count
  .get(
    "/api/tickets/count",
    async ({ query, getTicketCount }) => {
      try {
        const { type, state, group = "all" } = query;
        const count = await getTicketCount(type, state, group);
        return {
          success: true,
          count,
          type,
          state,
          group,
        };
      } catch (error: unknown) {
        return {
          success: false,
          error: (error as Error).message,
          count: 0,
        };
      }
    },
    {
      query: TicketCountQuerySchema,
      detail: {
        summary: "Get ticket count",
        description: "Get estimated count of tickets with smart caching",
        tags: ["Tickets"],
      },
    },
  )

  // Health check endpoint
  .get(
    "/api/tickets/health",
    async ({ ticketHealthCheck }) => {
      try {
        const isHealthy = await ticketHealthCheck();
        return {
          status: isHealthy ? "healthy" : "unhealthy",
          timestamp: new Date().toISOString(),
          service: "ticket-controller",
        };
      } catch (error: unknown) {
        return {
          status: "error",
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
          service: "ticket-controller",
        };
      }
    },
    {
      detail: {
        summary: "Ticket controller health check",
        description: "Check the health status of the ticket controller service",
        tags: ["Health"],
      },
    },
  )

  // Statistics endpoint
  .get(
    "/api/tickets/stats",
    async ({ getTicketStats }) => {
      try {
        const stats = await getTicketStats();
        return {
          success: true,
          stats,
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        return {
          success: false,
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Ticket controller statistics",
        description: "Get operational statistics for the ticket controller",
        tags: ["Statistics"],
      },
    },
  )

  .as("global"); // ✅ Global lifecycle scope for plugin deduplication

// Export types for service locator integration
export interface TicketControllerContext {
  ticketController: PluginTicketController | null;
  getTicketDetails: (sysId: string, table: string) => Promise<TicketData>;
  getEnhancedModal: (sysId: string, table: string) => Promise<string>;
  getLazyLoadTickets: (
    type: string,
    state: string,
    group?: string,
    page?: number,
  ) => Promise<TicketData[]>;
  getTicketCount: (
    type: string,
    state: string,
    group?: string,
  ) => Promise<number>;
  getStatusLabel: (state: string) => string;
  getPriorityLabel: (priority: string) => string;
  ticketHealthCheck: () => Promise<boolean>;
  getTicketStats: () => Promise<any>;
}

export default ticketControllerPlugin;
