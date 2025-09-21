/**
 * Ticket Details Routes - Elysia best practices implementation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following Elysia best practices:
 * - Using Elysia instances as services/controllers
 * - Method chaining for type integrity
 * - Inline handlers with proper service usage
 * - No circular imports
 */

import { Elysia, t } from "elysia";
import { consolidatedServiceNowService } from "../services";
import { TicketModalView } from "../views/TicketModalView";
import { ErrorHandler } from "../utils/ErrorHandler";
import type { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import type { ConsolidatedDataService } from "../services/ConsolidatedDataService";
import type { ServiceNowStreams } from "../config/redis-streams";

export function createTicketDetailsRoutes(
  serviceNowClient: ServiceNowAuthClient,
  mongoService?: ConsolidatedDataService,
  redisStreams?: ServiceNowStreams,
) {
  return (
    new Elysia({ prefix: "/tickets" })
      // Inline handler with proper service usage
      .get(
        "/ticket-details/:sysId/:table",
        async ({ params, set }) => {
          try {
            const { sysId, table } = params;
            console.log(
              `🎯 [Elysia Service] Ticket details requested: ${sysId} from ${table}`,
            );

            // Use service methods directly
            const ticket = await consolidatedServiceNowService.getRecord(
              table,
              sysId,
            );
            const statusLabel = "Active"; // Simplified for now
            const priorityLabel = "Normal"; // Simplified for now

            const modalProps = { ticket, statusLabel, priorityLabel };
            const htmlContent = TicketModalView.generateModal(modalProps);

            set.headers["content-type"] = "text/html; charset=utf-8";
            return htmlContent;
          } catch (error) {
            ErrorHandler.logError("Ticket Details", error, {
              sysId: params.sysId,
              table: params.table,
            });

            const errorMessage = error.message?.includes("not found")
              ? "Ticket não encontrado"
              : "Erro ao carregar ticket";

            const errorHtml = TicketModalView.generateErrorModal(errorMessage);

            set.headers["content-type"] = "text/html; charset=utf-8";
            return errorHtml;
          }
        },
        {
          params: t.Object({
            sysId: t.String({ minLength: 32, maxLength: 32 }),
            table: t.String({ minLength: 1 }),
          }),
        },
      )

      // HTMX endpoint using service pattern consistently
      .get(
        "/htmx/ticket-details/:sysId/:table",
        async ({ params, set }) => {
          try {
            const { sysId, table } = params;
            console.log(
              ` [Elysia Service] HTMX Ticket details requested: ${sysId} from ${table}`,
            );

            // Consistent service usage
            const ticket = await consolidatedServiceNowService.getRecord(
              table,
              sysId,
            );
            const statusLabel = "Active"; // Simplified for now
            const priorityLabel = "Normal"; // Simplified for now

            const modalProps = { ticket, statusLabel, priorityLabel };
            const htmlContent = TicketModalView.generateModal(modalProps);

            set.headers["content-type"] = "text/html; charset=utf-8";
            return htmlContent;
          } catch (error) {
            ErrorHandler.logError("HTMX Ticket Details", error, {
              sysId: params.sysId,
              table: params.table,
            });

            const errorMessage = error.message?.includes("not found")
              ? "Ticket não encontrado"
              : "Erro ao carregar ticket";

            const errorHtml = TicketModalView.generateErrorModal(errorMessage);

            set.headers["content-type"] = "text/html; charset=utf-8";
            return errorHtml;
          }
        },
        {
          params: t.Object({
            sysId: t.String({ minLength: 32, maxLength: 32 }),
            table: t.String({ minLength: 1 }),
          }),
        },
      )

      // Enhanced professional modal - simplified fallback without circular imports
      .get(
        "/enhanced/:sysId/:table",
        async ({ params, set, consolidatedServiceNowService }) => {
          try {
            if (!mongoService || !redisStreams) {
              console.warn(
                " MongoDB or Redis not available, using standard service",
              );
              // Use standard ticket service without enhanced features
              const ticket =
                await consolidatedServiceNowService.getTicketDetails(
                  params.sysId,
                  params.table,
                );
              const statusLabel = consolidatedServiceNowService.getStatusLabel(
                ticket.state,
              );
              const priorityLabel =
                consolidatedServiceNowService.getPriorityLabel(ticket.priority);
              const modalProps = { ticket, statusLabel, priorityLabel };
              const htmlContent = TicketModalView.generateModal(modalProps);
              set.headers["content-type"] = "text/html; charset=utf-8";
              return htmlContent;
            }

            const { sysId, table } = params;
            console.log(
              `🌟 [Enhanced Service] Professional modal requested: ${sysId} from ${table}`,
            );

            // For now, use basic modal - enhanced features can be added later without circular deps
            const ticket = await consolidatedServiceNowService.getTicketDetails(
              sysId,
              table,
            );
            const statusLabel = "Active"; // Simplified for now
            const priorityLabel = "Normal"; // Simplified for now
            const modalProps = { ticket, statusLabel, priorityLabel };
            const htmlContent = TicketModalView.generateModal(modalProps);

            set.headers["content-type"] = "text/html; charset=utf-8";
            return htmlContent;
          } catch (error) {
            ErrorHandler.logError("Enhanced Ticket Modal", error, {
              sysId: params.sysId,
              table: params.table,
            });

            const errorMessage = error.message?.includes("not found")
              ? "Ticket não encontrado"
              : "Erro ao carregar modal profissional";

            // Return basic error modal
            set.headers["content-type"] = "text/html; charset=utf-8";
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
        },
        {
          params: t.Object({
            sysId: t.String({ minLength: 32, maxLength: 32 }),
            table: t.String({ minLength: 1 }),
          }),
        },
      )
  );
}
