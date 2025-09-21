/**
 * Ticket Controller - Business logic for ticket operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import type { TicketData, TicketResponse } from "../types/TicketTypes";
import type { ConsolidatedDataService } from "../services/ConsolidatedDataService";
import type { ServiceNowStreams } from "../config/redis-streams";

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

  constructor(
    private serviceNowAuthClient: ServiceNowAuthClient,
    private mongoService?: ConsolidatedDataService,
    private redisStreams?: ServiceNowStreams,
  ) {
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
    } catch (error) {
      console.warn(
        "Could not initialize ConsolidatedDataService:",
        error.message,
      );
    }
  }

  /**
   * Retrieve ticket details from ServiceNow
   * @param sysId - Ticket system ID
   * @param table - ServiceNow table name
   * @returns Promise resolving to ticket data
   * @throws Error when ticket not found or API call fails
   */
  async getTicketDetails(sysId: string, table: string): Promise<TicketData> {
    try {
      console.log(`Fetching ticket details: ${sysId} from ${table}`);

      const ticketResponse =
        await this.serviceNowAuthClient.makeRequestFullFields(
          table,
          `sys_id=${sysId}`,
          1,
        );

      const ticket = ticketResponse?.result?.[0];

      if (!ticket) {
        throw new Error(`Ticket not found: ${sysId}`);
      }

      return this.processTicketData(ticket);
    } catch (error) {
      console.error("Error fetching ticket details:", error);
      throw new Error(`Failed to load ticket: ${error.message}`);
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
      } catch (error) {
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
}
