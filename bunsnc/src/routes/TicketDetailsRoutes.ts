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
import { EnhancedTicketController } from '../controllers/EnhancedTicketController';
import { TicketModalView } from '../views/TicketModalView';
import { ErrorHandler } from '../utils/ErrorHandler';
import { ServiceNowAuthClient } from '../services/ServiceNowAuthClient';
import { EnhancedTicketStorageService } from '../services/EnhancedTicketStorageService';
import { ServiceNowStreams } from '../config/redis-streams';

export function createTicketDetailsRoutes(
  serviceNowClient: ServiceNowAuthClient,
  mongoService?: EnhancedTicketStorageService,
  redisStreams?: ServiceNowStreams
) {
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
    })

    // HTMX endpoint for modal ticket details (MVC pattern)
    .get('/htmx/ticket-details/:sysId/:table', async ({ params, set }) => {
      try {
        const { sysId, table } = params;
        console.log(`🔍 [MVC] HTMX Ticket details requested: ${sysId} from ${table}`);
        
        const ticketController = new TicketController(serviceNowClient);
        
        const ticket = await ticketController.getTicketDetails(sysId, table);
        const statusLabel = ticketController.getStatusLabel(ticket.state);
        const priorityLabel = ticketController.getPriorityLabel(ticket.priority);
        
        const modalProps = { ticket, statusLabel, priorityLabel };
        const htmlContent = TicketModalView.generateModal(modalProps);
        
        set.headers['content-type'] = 'text/html; charset=utf-8';
        return htmlContent;
        
      } catch (error) {
        ErrorHandler.logError('HTMX Ticket Details', error, { sysId: params.sysId, table: params.table });
        
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
    })

    // Enhanced professional modal endpoint with tabs and SLA
    .get('/enhanced/:sysId/:table', async ({ params, set }) => {
      try {
        if (!mongoService || !redisStreams) {
          console.warn('⚠️ MongoDB or Redis not available, falling back to basic modal');
          // Fallback to basic modal if enhanced services not available
          const ticketController = new TicketController(serviceNowClient);
          const ticket = await ticketController.getTicketDetails(params.sysId, params.table);
          const statusLabel = ticketController.getStatusLabel(ticket.state);
          const priorityLabel = ticketController.getPriorityLabel(ticket.priority);
          const modalProps = { ticket, statusLabel, priorityLabel };
          const htmlContent = TicketModalView.generateModal(modalProps);
          set.headers['content-type'] = 'text/html; charset=utf-8';
          return htmlContent;
        }

        const { sysId, table } = params;
        console.log(`🌟 [Enhanced] Professional modal requested: ${sysId} from ${table}`);
        
        const enhancedController = new EnhancedTicketController(
          serviceNowClient, 
          mongoService, 
          redisStreams
        );
        
        const htmlContent = await enhancedController.getEnhancedModal(sysId, table);
        
        set.headers['content-type'] = 'text/html; charset=utf-8';
        return htmlContent;
        
      } catch (error) {
        ErrorHandler.logError('Enhanced Ticket Modal', error, { sysId: params.sysId, table: params.table });
        
        const errorMessage = error.message?.includes('not found') 
          ? 'Ticket não encontrado'
          : 'Erro ao carregar modal profissional';
          
        // Return basic error modal
        set.headers['content-type'] = 'text/html; charset=utf-8';
        return `
          <div id="ticketModal" class="fixed inset-0 z-50 overflow-y-auto bg-black/50">
            <div class="flex items-center justify-center min-h-screen p-4">
              <div class="relative w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg shadow-2xl">
                <div class="p-6 text-center">
                  <h3 class="text-lg font-medium text-white mb-2">Erro</h3>
                  <p class="text-gray-400 mb-6">${errorMessage}</p>
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
    }, {
      params: t.Object({
        sysId: t.String({ minLength: 32, maxLength: 32 }),
        table: t.String({ minLength: 1 })
      })
    });
}