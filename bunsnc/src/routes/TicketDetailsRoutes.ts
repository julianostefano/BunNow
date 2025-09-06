/**
 * Ticket Details Routes - Modular endpoints following Development Guidelines
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following guidelines:
 * - Maximum 300-500 lines per file
 * - MVC separation of concerns
 * - Extract HTML generation to separate functions
 */

import { Elysia, t } from 'elysia';
import { TicketController } from '../controllers/TicketController';
import { TicketModalView } from '../views/TicketModalView';
import { ErrorHandler } from '../utils/ErrorHandler';
import { ServiceNowAuthClient } from '../services/ServiceNowAuthClient';

export function createTicketDetailsRoutes(serviceNowClient: ServiceNowAuthClient) {
  return new Elysia({ prefix: '/tickets' })
    // Simple MVC endpoint following guidelines
    .get('/ticket-details/:sysId/:table', async ({ params, set }) => {
      try {
        const { sysId, table } = params;
        console.log(`🎯 [MVC] Ticket details requested: ${sysId} from ${table}`);
        
        const ticketController = new TicketController(serviceNowClient);
        
        const ticket = await ticketController.getTicketDetails(sysId, table);
        const statusLabel = ticketController.getStatusLabel(ticket.state);
        const priorityLabel = ticketController.getPriorityLabel(ticket.priority);
        
        const modalProps = { ticket, statusLabel, priorityLabel };
        const htmlContent = TicketModalView.generateModal(modalProps);
        
        set.headers['content-type'] = 'text/html; charset=utf-8';
        return htmlContent;
        
      } catch (error) {
        ErrorHandler.logError('Ticket Details', error, { sysId: params.sysId, table: params.table });
        
        const errorMessage = error.message?.includes('not found') 
          ? 'Ticket não encontrado'
          : 'Erro ao carregar ticket';
          
        const errorHtml = TicketModalView.generateErrorModal(errorMessage);
        
        set.headers['content-type'] = 'text/html; charset=utf-8';
        return errorHtml;
      }
    }, {
      params: t.Object({
        sysId: t.String({ minLength: 32, maxLength: 32 }),
        table: t.String({ minLength: 1 })
      })
    });
}