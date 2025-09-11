/**
 * Ticket Service - Elysia instance for ticket business logic
 * Following Elysia best practices: service as Elysia instance for request-dependent logic
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import type { ServiceNowAuthClient } from './ServiceNowAuthClient';
import type { TicketData } from '../types/TicketTypes';

export const createTicketService = (serviceNowClient: ServiceNowAuthClient) => {
  return new Elysia({ name: 'Service.Ticket' })
    .derive({ as: 'scoped' }, () => ({
      TicketService: {
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
            
            const ticketResponse = await serviceNowClient.makeRequestFullFields(
              table,
              `sys_id=${sysId}`,
              1
            );
            
            const ticket = ticketResponse?.result?.[0];
            
            if (!ticket) {
              throw new Error(`Ticket not found: ${sysId}`);
            }
            
            return processTicketData(ticket);
            
          } catch (error) {
            console.error('Error fetching ticket details:', error);
            throw new Error(`Failed to load ticket: ${error.message}`);
          }
        },

        /**
         * Map status codes to readable labels
         * @param state - Status code
         * @returns Status label
         */
        getStatusLabel(state: string): string {
          const statusMap: Record<string, string> = {
            '1': 'Novo',
            '2': 'Em Progresso', 
            '6': 'Resolvido',
            '7': 'Fechado'
          };
          return statusMap[state] || 'Desconhecido';
        },

        /**
         * Map priority codes to readable labels
         * @param priority - Priority code
         * @returns Priority label
         */
        getPriorityLabel(priority: string): string {
          const priorityMap: Record<string, string> = {
            '1': 'Crítica',
            '2': 'Alta',
            '3': 'Moderada',
            '4': 'Baixa',
            '5': 'Planejamento'
          };
          return priorityMap[priority] || 'N/A';
        }
      }
    }))
    .macro(({ onBeforeHandle }) => ({
      requireTicket: {
        sysId: t.String({ minLength: 32, maxLength: 32 }),
        table: t.String({ minLength: 1 })
      }
    }));
};

/**
 * Extract value from ServiceNow field (handles both objects and strings)
 * @param field - ServiceNow field data
 * @returns Normalized string value
 */
function extractValue(field: any): string {
  if (!field) return 'N/A';
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field.display_value !== undefined) 
    return String(field.display_value);
  if (typeof field === 'object' && field.value !== undefined) 
    return String(field.value);
  return String(field);
}

/**
 * Process raw ticket data from ServiceNow
 * @param rawTicket - Raw ticket data from API
 * @returns Processed ticket data
 */
function processTicketData(rawTicket: any): TicketData {
  // Format created date
  let formattedCreatedOn = 'N/A';
  const createdOnRaw = rawTicket.sys_created_on?.display_value || rawTicket.sys_created_on || '';
  if (createdOnRaw) {
    try {
      const date = new Date(createdOnRaw);
      if (!isNaN(date.getTime())) {
        formattedCreatedOn = date.toLocaleDateString('pt-BR', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (error) {
      formattedCreatedOn = createdOnRaw.slice(0, 16);
    }
  }

  return {
    sysId: extractValue(rawTicket.sys_id),
    number: extractValue(rawTicket.number),
    shortDescription: extractValue(rawTicket.short_description) || 'Sem descrição',
    description: extractValue(rawTicket.description) || 'Sem descrição detalhada',
    state: extractValue(rawTicket.state) || '1',
    priority: extractValue(rawTicket.priority) || '3',
    assignedTo: extractValue(rawTicket.assigned_to) || 'Não atribuído',
    assignmentGroup: extractValue(rawTicket.assignment_group) || 'Não atribuído',
    caller: extractValue(rawTicket.caller_id) || extractValue(rawTicket.opened_by) || 'N/A',
    createdOn: formattedCreatedOn,
    table: extractValue(rawTicket.sys_class_name) || 'incident',
    slaDue: extractValue(rawTicket.sla_due) === 'N/A' ? null : extractValue(rawTicket.sla_due),
    businessStc: extractValue(rawTicket.business_stc) === 'N/A' ? null : extractValue(rawTicket.business_stc),
    resolveTime: extractValue(rawTicket.resolve_time) === 'N/A' ? null : extractValue(rawTicket.resolve_time),
    updatedOn: extractValue(rawTicket.sys_updated_on),
    category: extractValue(rawTicket.category),
    subcategory: extractValue(rawTicket.subcategory),
    urgency: extractValue(rawTicket.urgency) || '3',
    impact: extractValue(rawTicket.impact) || '3'
  };
}