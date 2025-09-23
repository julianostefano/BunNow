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
  private authCore: ServiceNowAuthCore;
  private slaService: ServiceNowSLAService;
  private queryService: ServiceNowQueryService;

  constructor() {
    // Initialize all specialized services
    this.authCore = new ServiceNowAuthCore();
    this.slaService = new ServiceNowSLAService();
    this.queryService = new ServiceNowQueryService();

    // Pre-warm cache for critical data on startup
    this.queryService.preWarmCache().catch((error) => {
      console.warn("Cache pre-warming failed:", error.message);
    });

    console.log("ServiceNowAuthClient initialized with modular architecture");
  }

  // === Authentication Methods ===
  public isAuthValid(): boolean {
    return this.authCore.isAuthValid();
  }

  public getBaseUrl(): string {
    return this.authCore.getBaseUrl();
  }

  public getCache() {
    return this.authCore.getCache();
  }

  public getStreamManager() {
    return this.authCore.getStreamManager();
  }

  // === Query Methods ===
  async makeRequest(
    table: string,
    method: string = "GET",
    params: Record<string, unknown> = {},
  ): Promise<ServiceNowQueryResult> {
    return this.queryService.makeRequest(table, method, params);
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
    return this.queryService.makeRequestPaginated(
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
    return this.queryService.getWaitingIncidents(assignmentGroup);
  }

  async getWaitingChangeTasks(
    assignmentGroup: string,
  ): Promise<ServiceNowRecord[]> {
    return this.queryService.getWaitingChangeTasks(assignmentGroup);
  }

  async getWaitingServiceCatalogTasks(
    assignmentGroup: string,
  ): Promise<ServiceNowRecord[]> {
    return this.queryService.getWaitingServiceCatalogTasks(assignmentGroup);
  }

  async searchTickets(
    searchTerm: string,
    tables: string[] = ["incident", "change_task", "sc_task"],
    limit: number = 50,
  ): Promise<ServiceNowRecord[]> {
    return this.queryService.searchTickets(searchTerm, tables, limit);
  }

  // === SLA Methods ===
  async makeRequestFullFields(
    table: string,
    query: string,
    limit: number = 1,
  ): Promise<ServiceNowQueryResult> {
    return this.slaService.makeRequestFullFields(table, query, limit);
  }

  async getSLADataForTask(taskSysId: string): Promise<ServiceNowRecord[]> {
    return this.slaService.getSLADataForTask(taskSysId);
  }

  async getContractSLAData(
    company?: string,
    location?: string,
  ): Promise<ServiceNowRecord[]> {
    return this.slaService.getContractSLAData(company, location);
  }

  async getTicketSLABreakdown(
    ticketSysId: string,
  ): Promise<ServiceNowRecord[]> {
    return this.slaService.getTicketSLABreakdown(ticketSysId);
  }

  async getSLAPerformanceMetrics(
    startDate: string,
    endDate: string,
    slaType?: string,
  ): Promise<ServiceNowRecord[]> {
    return this.slaService.getSLAPerformanceMetrics(
      startDate,
      endDate,
      slaType,
    );
  }

  // === Legacy compatibility methods ===
  async preWarmCache(): Promise<void> {
    return this.queryService.preWarmCache();
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

// Create singleton instance for global use
export const serviceNowAuthClient = new ServiceNowAuthClient();

// Export types for compatibility
export type { ServiceNowRecord, ServiceNowQueryResult };
