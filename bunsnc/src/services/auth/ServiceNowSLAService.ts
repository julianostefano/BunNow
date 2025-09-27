/**
 * ServiceNow SLA Service - Handles SLA-related operations
 * Refactored to use ServiceNow Bridge Service directly (no self-referencing HTTP calls)
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthCore, ServiceNowRecord } from "./ServiceNowAuthCore";
import { serviceNowRateLimiter } from "../ServiceNowRateLimit";
import {
  ServiceNowBridgeService,
  BridgeResponse,
} from "../ServiceNowBridgeService";

export interface SLATaskRecord extends ServiceNowRecord {
  task?: {
    value: string;
    display_value: string;
  };
  sla?: {
    value: string;
    display_value: string;
  };
  has_breached?: {
    value: string;
    display_value: string;
  };
  percentage?: {
    value: string;
    display_value: string;
  };
  business_percentage?: {
    value: string;
    display_value: string;
  };
}

export interface SLADefinitionRecord extends ServiceNowRecord {
  name?: {
    value: string;
    display_value: string;
  };
  duration_type?: {
    value: string;
    display_value: string;
  };
  duration?: {
    value: string;
    display_value: string;
  };
}

export interface ContractSLARecord extends ServiceNowRecord {
  company?: {
    value: string;
    display_value: string;
  };
  location?: {
    value: string;
    display_value: string;
  };
  active?: {
    value: string;
    display_value: string;
  };
}

export interface SLADataResponse {
  task_slas: SLATaskRecord[];
  contract_slas: ContractSLARecord[];
  sla_definitions: SLADefinitionRecord[];
}

export interface TicketSLABreakdown {
  ticket: {
    sys_id: string;
    number: string;
    priority: string;
    urgency: string;
    impact: string;
  };
  sla_data: SLADataResponse;
  contract_sla_data: ContractSLARecord[];
  summary: {
    active_slas: number;
    breached_slas: number;
    contract_slas: number;
  };
}

export interface SLATypeMetrics {
  total: number;
  breached: number;
  met: number;
  percentage: number;
}

export interface SLAPerformanceMetrics {
  total_slas: number;
  breached_slas: number;
  met_slas: number;
  average_percentage: number;
  sla_types: Record<string, SLATypeMetrics>;
}

export class ServiceNowSLAService extends ServiceNowAuthCore {
  private bridgeService: ServiceNowBridgeService;

  constructor() {
    super();
    // Use ServiceNow Bridge Service directly - NO MORE HTTP SELF-REFERENCING CALLS
    this.bridgeService = new ServiceNowBridgeService();
    console.log(
      "🔌 ServiceNowSLAService using bridge service directly - self-referencing calls eliminated",
    );
  }

  /**
   * Execute ServiceNow SLA query using bridge service directly (eliminates self-referencing HTTP calls)
   */
  private async executeSLABridgeQuery(
    table: string,
    params: Record<string, any> = {},
  ): Promise<BridgeResponse<ServiceNowRecord[]>> {
    const startTime = Date.now();

    try {
      console.log(`🔍 SLA Bridge query: ${table}`, params);

      // Use bridge service directly - NO HTTP CALL to self
      const response = await this.bridgeService.queryTable(table, params);

      const duration = Date.now() - startTime;
      console.log(`✅ SLA Bridge query completed in ${duration}ms`);

      return response;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(
        `❌ SLA Bridge query error after ${duration}ms:`,
        error.message,
      );
      throw error;
    }
  }
  /**
   * Get comprehensive SLA data for a specific task/incident
   * Fetches data from task_sla, contract_sla, and sla_definition tables
   */
  async getSLADataForTask(taskSysId: string): Promise<SLADataResponse> {
    await this.authenticate();

    return serviceNowRateLimiter.executeRequest(async () => {
      try {
        const slaData: SLADataResponse = {
          task_slas: [],
          contract_slas: [],
          sla_definitions: [],
        };

        // Get task_sla records for this specific task using bridge service directly
        const taskSLAResponse = await this.executeSLABridgeQuery("task_sla", {
          sysparm_query: `task=${taskSysId}`,
          sysparm_display_value: "all",
          sysparm_exclude_reference_link: "true",
          sysparm_limit: "50",
        });

        if (!taskSLAResponse.success) {
          throw new Error(
            taskSLAResponse.error || "Failed to retrieve task SLA data",
          );
        }

        slaData.task_slas = taskSLAResponse.result || [];

        // Get SLA definitions referenced by task_slas
        const slaDefinitionIds = slaData.task_slas
          .map((sla: SLATaskRecord) => sla.sla?.value)
          .filter((id: string | undefined): id is string => !!id);

        if (slaDefinitionIds.length > 0) {
          const slaDefResponse = await this.executeSLABridgeQuery(
            "sla_definition",
            {
              sysparm_query: `sys_idIN${slaDefinitionIds.join(",")}`,
              sysparm_display_value: "all",
              sysparm_exclude_reference_link: "true",
            },
          );

          if (!slaDefResponse.success) {
            throw new Error(
              slaDefResponse.error || "Failed to retrieve SLA definition data",
            );
          }

          slaData.sla_definitions = slaDefResponse.result || [];
        }

        return slaData;
      } catch (error: unknown) {
        console.error(`ServiceNow SLA data error:`, error);
        throw error;
      }
    });
  }

  /**
   * Get contract SLA data for a company/location
   */
  async getContractSLAData(
    company?: string,
    location?: string,
  ): Promise<{ result: ContractSLARecord[] }> {
    await this.authenticate();

    return serviceNowRateLimiter.executeRequest(async () => {
      try {
        let query = "active=true";

        if (company) {
          query += `^company=${company}`;
        } else if (location) {
          query += `^location=${location}`;
        }

        const response = await this.executeSLABridgeQuery("contract_sla", {
          sysparm_query: query,
          sysparm_display_value: "all",
          sysparm_exclude_reference_link: "true",
          sysparm_limit: "20",
        });

        if (!response.success) {
          throw new Error(
            response.error || "Failed to retrieve contract SLA data",
          );
        }

        return { result: response.result || [] };
      } catch (error: unknown) {
        console.error(`ServiceNow contract SLA error:`, error);
        throw error;
      }
    });
  }

  /**
   * Get SLA breakdown data for a specific ticket (combines all SLA sources)
   */
  async getTicketSLABreakdown(
    ticketSysId: string,
  ): Promise<TicketSLABreakdown> {
    await this.authenticate();

    try {
      // Get basic ticket info first using makeRequestFullFields method
      const ticketResponse = await this.makeRequestFullFields(
        "incident",
        `sys_id=${ticketSysId}`,
        1,
      );
      const ticket = ticketResponse?.result?.[0];

      if (!ticket) {
        throw new Error(`Ticket ${ticketSysId} not found`);
      }

      // Run SLA queries in parallel for better performance
      const [slaData, contractSLAData] = await Promise.all([
        this.getSLADataForTask(ticketSysId),
        this.getContractSLAData(ticket.company?.value, ticket.location?.value),
      ]);

      return {
        ticket: {
          sys_id: ticketSysId,
          number: ticket.number?.display_value || ticket.number,
          priority: ticket.priority?.display_value || ticket.priority,
          urgency: ticket.urgency?.display_value || ticket.urgency,
          impact: ticket.impact?.display_value || ticket.impact,
        },
        sla_data: slaData,
        contract_sla_data: contractSLAData?.result || [],
        summary: {
          active_slas: slaData.task_slas?.length || 0,
          breached_slas:
            slaData.task_slas?.filter(
              (sla: SLATaskRecord) =>
                sla.has_breached?.display_value === "true",
            ).length || 0,
          contract_slas: contractSLAData?.result?.length || 0,
        },
      };
    } catch (error: unknown) {
      console.error(`ServiceNow ticket SLA breakdown error:`, error);
      throw error;
    }
  }

  /**
   * Make request with ALL fields (no sysparm_fields limitation)
   * Used for complete field mapping and analysis
   */
  async makeRequestFullFields(
    table: string,
    query: string,
    limit: number = 1,
  ): Promise<{ result: ServiceNowRecord[] }> {
    await this.authenticate();

    return serviceNowRateLimiter.executeRequest(async () => {
      try {
        const response = await this.executeSLABridgeQuery(table, {
          sysparm_query: query,
          sysparm_display_value: "all",
          sysparm_exclude_reference_link: "true",
          sysparm_limit: limit.toString(),
        });

        if (!response.success) {
          throw new Error(response.error || `Failed to retrieve ${table} data`);
        }

        return { result: response.result || [] };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`ServiceNow ${table} full fields error:`, errorMessage);
        throw error;
      }
    });
  }

  /**
   * Get SLA performance metrics for a given period
   */
  async getSLAPerformanceMetrics(
    startDate: string,
    endDate: string,
    slaType?: string,
  ): Promise<SLAPerformanceMetrics> {
    await this.authenticate();

    return serviceNowRateLimiter.executeRequest(async () => {
      try {
        let query = `sys_created_onBETWEENjavascript:gs.dateGenerate('${startDate}','00:00:00')@javascript:gs.dateGenerate('${endDate}','23:59:59')`;

        if (slaType) {
          query += `^sla.name=${slaType}`;
        }

        const response = await this.executeSLABridgeQuery("task_sla", {
          sysparm_query: query,
          sysparm_display_value: "all",
          sysparm_exclude_reference_link: "true",
          sysparm_limit: "1000",
        });

        if (!response.success) {
          throw new Error(
            response.error || "Failed to retrieve SLA performance data",
          );
        }

        const slaRecords = response.result || [];

        // Calculate metrics
        const metrics = {
          total_slas: slaRecords.length,
          breached_slas: slaRecords.filter(
            (sla: any) => sla.has_breached?.display_value === "true",
          ).length,
          met_slas: slaRecords.filter(
            (sla: any) => sla.has_breached?.display_value === "false",
          ).length,
          average_percentage: 0,
          sla_types: {} as Record<string, SLATypeMetrics>,
        };

        // Calculate breach percentage
        if (metrics.total_slas > 0) {
          metrics.average_percentage =
            (metrics.met_slas / metrics.total_slas) * 100;
        }

        // Group by SLA type
        slaRecords.forEach((sla: SLATaskRecord) => {
          const slaName = sla.sla?.display_value || "Unknown";
          if (!metrics.sla_types[slaName]) {
            metrics.sla_types[slaName] = {
              total: 0,
              breached: 0,
              met: 0,
              percentage: 0,
            };
          }

          metrics.sla_types[slaName].total++;
          if (sla.has_breached?.display_value === "true") {
            metrics.sla_types[slaName].breached++;
          } else {
            metrics.sla_types[slaName].met++;
          }

          metrics.sla_types[slaName].percentage =
            (metrics.sla_types[slaName].met /
              metrics.sla_types[slaName].total) *
            100;
        });

        return metrics;
      } catch (error: unknown) {
        console.error(`ServiceNow SLA performance metrics error:`, error);
        throw error;
      }
    });
  }
}
