/**
 * ServiceNow Authentication Client - Unified interface with modular architecture
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  ServiceNowAuthCore,
  ServiceNowRecord,
  ServiceNowQueryResult,
} from "./auth/ServiceNowAuthCore";
import { ServiceNowSLAService } from "./auth/ServiceNowSLAService";
import { ServiceNowQueryService } from "./auth/ServiceNowQueryService";

export class ServiceNowAuthClient {
  private authCore?: ServiceNowAuthCore;
  private slaService?: ServiceNowSLAService;
  private queryService?: ServiceNowQueryService;
  private cacheWarmingInitialized = false;

  // FIX v5.5.20: Use lazy loading to break circular dependency
  // Services created on-demand instead of in constructor
  constructor() {
    console.log(
      "ServiceNowAuthClient initialized with lazy loading (circular dependency fix)",
    );
    console.log("⏳ Cache warming deferred until server is ready");
  }

  private getAuthCore(): ServiceNowAuthCore {
    if (!this.authCore) {
      this.authCore = new ServiceNowAuthCore();
    }
    return this.authCore;
  }

  private getSlaService(): ServiceNowSLAService {
    if (!this.slaService) {
      this.slaService = new ServiceNowSLAService();
    }
    return this.slaService;
  }

  private getQueryService(): ServiceNowQueryService {
    if (!this.queryService) {
      this.queryService = new ServiceNowQueryService();
    }
    return this.queryService;
  }

  /**
   * Initialize cache warming after server is ready
   * Should be called after Elysia server is fully started
   */
  async initializeCacheWarming(): Promise<void> {
    if (this.cacheWarmingInitialized) {
      console.log("🔥 Cache warming already initialized, skipping...");
      return;
    }

    console.log("🚀 Starting deferred cache warming - server is ready");
    this.cacheWarmingInitialized = true;

    try {
      // Pre-warm cache for critical data after server startup
      await this.getQueryService().preWarmCache();
      console.log("✅ Deferred cache warming completed successfully");
    } catch (error) {
      console.warn("⚠️ Deferred cache warming failed:", error.message);
    }
  }

  // === Authentication Methods ===
  public isAuthValid(): boolean {
    return this.getAuthCore().isAuthValid();
  }

  public getBaseUrl(): string {
    return this.getAuthCore().getBaseUrl();
  }

  public getCache() {
    return this.getAuthCore().getCache();
  }

  public getStreamManager() {
    return this.getAuthCore().getStreamManager();
  }

  // === Query Methods ===
  async makeRequest(
    table: string,
    method: string = "GET",
    params: Record<string, unknown> = {},
  ): Promise<ServiceNowQueryResult> {
    return this.getQueryService().makeRequest(table, method, params);
  }

  async makeRequestPaginated(
    table: string,
    group: string,
    state: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: ServiceNowRecord[];
    hasMore: boolean;
    total: number;
    currentPage: number;
    totalPages: number;
  }> {
    return this.getQueryService().makeRequestPaginated(
      table,
      group,
      state,
      page,
      limit,
    );
  }

  async getWaitingIncidents(
    assignmentGroup: string,
  ): Promise<ServiceNowRecord[]> {
    return this.getQueryService().getWaitingIncidents(assignmentGroup);
  }

  async getWaitingChangeTasks(
    assignmentGroup: string,
  ): Promise<ServiceNowRecord[]> {
    return this.getQueryService().getWaitingChangeTasks(assignmentGroup);
  }

  async getWaitingServiceCatalogTasks(
    assignmentGroup: string,
  ): Promise<ServiceNowRecord[]> {
    return this.getQueryService().getWaitingServiceCatalogTasks(
      assignmentGroup,
    );
  }

  async searchTickets(
    searchTerm: string,
    tables: string[] = ["incident", "change_task", "sc_task"],
    limit: number = 50,
  ): Promise<ServiceNowRecord[]> {
    return this.getQueryService().searchTickets(searchTerm, tables, limit);
  }

  // === SLA Methods ===
  async makeRequestFullFields(
    table: string,
    query: string,
    limit: number = 1,
  ): Promise<ServiceNowQueryResult> {
    return this.getSlaService().makeRequestFullFields(table, query, limit);
  }

  async getSLADataForTask(taskSysId: string): Promise<ServiceNowRecord[]> {
    return this.getSlaService().getSLADataForTask(taskSysId);
  }

  async getContractSLAData(
    company?: string,
    location?: string,
  ): Promise<ServiceNowRecord[]> {
    return this.getSlaService().getContractSLAData(company, location);
  }

  async getTicketSLABreakdown(
    ticketSysId: string,
  ): Promise<ServiceNowRecord[]> {
    return this.getSlaService().getTicketSLABreakdown(ticketSysId);
  }

  async getSLAPerformanceMetrics(
    startDate: string,
    endDate: string,
    slaType?: string,
  ): Promise<ServiceNowRecord[]> {
    return this.getSlaService().getSLAPerformanceMetrics(
      startDate,
      endDate,
      slaType,
    );
  }

  // === Legacy compatibility methods ===
  async preWarmCache(): Promise<void> {
    return this.getQueryService().preWarmCache();
  }

  // === Waiting Tickets Analysis Methods ===
  async getWaitingTicketsSummary(groups: string[]): Promise<any> {
    const summary = {
      totalIncidents: 0,
      totalChangeTasks: 0,
      totalServiceCatalogTasks: 0,
      groupBreakdown: {} as Record<string, any>,
    };

    for (const group of groups) {
      try {
        const incidents = await this.getWaitingIncidents(group);
        const changeTasks = await this.getWaitingChangeTasks(group);
        const scTasks = await this.getWaitingServiceCatalogTasks(group);

        summary.totalIncidents += incidents.length;
        summary.totalChangeTasks += changeTasks.length;
        summary.totalServiceCatalogTasks += scTasks.length;

        summary.groupBreakdown[group] = {
          incidents: incidents.length,
          changeTasks: changeTasks.length,
          serviceCatalogTasks: scTasks.length,
        };
      } catch (error) {
        console.error(
          `Error getting waiting tickets for ${group}:`,
          error.message,
        );
        summary.groupBreakdown[group] = {
          incidents: 0,
          changeTasks: 0,
          serviceCatalogTasks: 0,
          error: error.message,
        };
      }
    }

    return summary;
  }

  async getWaitingTicketsDetails(groups: string[]): Promise<any[]> {
    const allTickets = [];

    for (const group of groups) {
      try {
        const incidents = await this.getWaitingIncidents(group);
        const changeTasks = await this.getWaitingChangeTasks(group);
        const scTasks = await this.getWaitingServiceCatalogTasks(group);

        // Add type information to tickets
        incidents.forEach((ticket) => {
          allTickets.push({
            ...ticket,
            ticketType: "incident",
            assignmentGroup: group,
          });
        });

        changeTasks.forEach((ticket) => {
          allTickets.push({
            ...ticket,
            ticketType: "change_task",
            assignmentGroup: group,
          });
        });

        scTasks.forEach((ticket) => {
          allTickets.push({
            ...ticket,
            ticketType: "sc_task",
            assignmentGroup: group,
          });
        });
      } catch (error) {
        console.error(
          `Error getting waiting ticket details for ${group}:`,
          error.message,
        );
      }
    }

    return allTickets;
  }

  getCacheMetrics(): any {
    const cache = this.getCache();
    return {
      cacheHits: 0,
      cacheMisses: 0,
      cacheSize: 0,
      uptime: Date.now(),
      // Basic cache metrics - can be enhanced later
    };
  }
}

// FIX v5.5.19: Removed top-level instantiation to prevent startup hang
// Root cause: new ServiceNowAuthClient() executes during import
// Violates ElysiaJS best practice: Services should NOT be instantiated at module scope
// Use ServiceNowAuthClient class directly with getInstance() pattern in handlers
// See: docs/reports/ELYSIA_COMPLIANCE_REPORT_v5.5.19.md - CRITICAL-1
// export const serviceNowAuthClient = new ServiceNowAuthClient();

// Export types for compatibility
export type { ServiceNowRecord, ServiceNowQueryResult };
