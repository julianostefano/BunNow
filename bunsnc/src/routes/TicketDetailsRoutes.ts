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

// Helper functions for status and priority labels
function getStatusLabel(state: string): string {
  const statusMap: Record<string, string> = {
    "1": "Novo",
    "2": "Em Progresso",
    "6": "Resolvido",
    "7": "Fechado",
    "18": "Designado",
    "3": "Em Espera",
    "8": "Cancelado",
  };
  return statusMap[state] || `Status ${state}`;
}

function getPriorityLabel(priority: string): string {
  const priorityMap: Record<string, string> = {
    "1": "Crítica",
    "2": "Alta",
    "3": "Moderada",
    "4": "Baixa",
    "5": "Planejamento",
  };
  return priorityMap[priority] || `Prioridade ${priority}`;
}

function formatDate(dateString: string): string {
  if (!dateString) return "N/A";

  try {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("pt-BR", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch (error: unknown) {
    return dateString.slice(0, 16);
  }

  return dateString.slice(0, 16);
}

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

            // Get ticket directly from MongoDB (same pattern as APIController)
            const { MongoClient } = await import("mongodb");
            const mongoUrl =
              process.env.MONGODB_URL ||
              "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin";
            const mongoClient = new MongoClient(mongoUrl);

            let ticket = null;
            try {
              await mongoClient.connect();
              const db = mongoClient.db("bunsnc");

              // Map ticket types to collection names (correct collections with data)
              const collectionMap = {
                incident: "incidents_complete",
                change_task: "change_tasks_complete",
                sc_task: "sc_tasks_complete",
              };

              const collectionName = collectionMap[table];
              if (!collectionName) {
                throw new Error(`Invalid table type: ${table}`);
              }

              const collection = db.collection(collectionName);
              // Try multiple search patterns for sys_id (can be object or string)
              const ticketDoc = await collection.findOne({
                $or: [
                  { "raw_data.sys_id.value": sysId },
                  { "raw_data.sys_id": sysId },
                  { sys_id: sysId },
                ],
              });

              if (!ticketDoc) {
                throw new Error(`Ticket not found: ${sysId}`);
              }

              // Transform ticket data to match TicketData interface
              const rawData = ticketDoc.raw_data;
              ticket = {
                sysId:
                  rawData.sys_id?.value || rawData.sys_id || ticketDoc.sys_id,
                number:
                  rawData.number?.value || rawData.number || ticketDoc.number,
                shortDescription:
                  rawData.short_description?.value ||
                  rawData.short_description ||
                  "Sem descrição",
                description:
                  rawData.description?.value ||
                  rawData.description ||
                  "Sem descrição detalhada",
                state: rawData.state?.value || rawData.state || "1",
                priority: rawData.priority?.value || rawData.priority || "3",
                assignedTo:
                  rawData.assigned_to?.display_value ||
                  rawData.assigned_to ||
                  "Não atribuído",
                assignmentGroup:
                  rawData.assignment_group?.display_value ||
                  rawData.assignment_group ||
                  "Não atribuído",
                caller:
                  rawData.caller_id?.display_value ||
                  rawData.opened_by?.display_value ||
                  rawData.caller_id ||
                  "N/A",
                createdOn: formatDate(
                  rawData.sys_created_on?.value || rawData.sys_created_on || "",
                ),
                table: table,
                slaDue: rawData.sla_due?.value || rawData.sla_due || null,
                businessStc:
                  rawData.business_stc?.value || rawData.business_stc || null,
                resolveTime:
                  rawData.resolve_time?.value || rawData.resolve_time || null,
                updatedOn: formatDate(
                  rawData.sys_updated_on?.value || rawData.sys_updated_on || "",
                ),
                category:
                  rawData.category?.display_value || rawData.category || "N/A",
                subcategory:
                  rawData.subcategory?.display_value ||
                  rawData.subcategory ||
                  "N/A",
                urgency: rawData.urgency?.value || rawData.urgency || "3",
                impact: rawData.impact?.value || rawData.impact || "3",
              };
            } finally {
              await mongoClient.close();
            }

            // Map status and priority labels
            const statusLabel = getStatusLabel(
              ticket.state?.value || ticket.state || "1",
            );
            const priorityLabel = getPriorityLabel(
              ticket.priority?.value || ticket.priority || "3",
            );

            const modalProps = { ticket, statusLabel, priorityLabel };
            const htmlContent = TicketModalView.generateModal(modalProps);

            set.headers["content-type"] = "text/html; charset=utf-8";
            return htmlContent;
          } catch (error: unknown) {
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

            // Get ticket directly from MongoDB (same pattern as above)
            const { MongoClient } = await import("mongodb");
            const mongoUrl =
              process.env.MONGODB_URL ||
              "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin";
            const mongoClient = new MongoClient(mongoUrl);

            let ticket = null;
            try {
              await mongoClient.connect();
              const db = mongoClient.db("bunsnc");

              // Map ticket types to collection names (correct collections with data)
              const collectionMap = {
                incident: "incidents_complete",
                change_task: "change_tasks_complete",
                sc_task: "sc_tasks_complete",
              };

              const collectionName = collectionMap[table];
              if (!collectionName) {
                throw new Error(`Invalid table type: ${table}`);
              }

              const collection = db.collection(collectionName);
              // Try multiple search patterns for sys_id (can be object or string)
              const ticketDoc = await collection.findOne({
                $or: [
                  { "raw_data.sys_id.value": sysId },
                  { "raw_data.sys_id": sysId },
                  { sys_id: sysId },
                ],
              });

              if (!ticketDoc) {
                throw new Error(`Ticket not found: ${sysId}`);
              }

              // Transform ticket data to match TicketData interface
              const rawData = ticketDoc.raw_data;
              ticket = {
                sysId:
                  rawData.sys_id?.value || rawData.sys_id || ticketDoc.sys_id,
                number:
                  rawData.number?.value || rawData.number || ticketDoc.number,
                shortDescription:
                  rawData.short_description?.value ||
                  rawData.short_description ||
                  "Sem descrição",
                description:
                  rawData.description?.value ||
                  rawData.description ||
                  "Sem descrição detalhada",
                state: rawData.state?.value || rawData.state || "1",
                priority: rawData.priority?.value || rawData.priority || "3",
                assignedTo:
                  rawData.assigned_to?.display_value ||
                  rawData.assigned_to ||
                  "Não atribuído",
                assignmentGroup:
                  rawData.assignment_group?.display_value ||
                  rawData.assignment_group ||
                  "Não atribuído",
                caller:
                  rawData.caller_id?.display_value ||
                  rawData.opened_by?.display_value ||
                  rawData.caller_id ||
                  "N/A",
                createdOn: formatDate(
                  rawData.sys_created_on?.value || rawData.sys_created_on || "",
                ),
                table: table,
                slaDue: rawData.sla_due?.value || rawData.sla_due || null,
                businessStc:
                  rawData.business_stc?.value || rawData.business_stc || null,
                resolveTime:
                  rawData.resolve_time?.value || rawData.resolve_time || null,
                updatedOn: formatDate(
                  rawData.sys_updated_on?.value || rawData.sys_updated_on || "",
                ),
                category:
                  rawData.category?.display_value || rawData.category || "N/A",
                subcategory:
                  rawData.subcategory?.display_value ||
                  rawData.subcategory ||
                  "N/A",
                urgency: rawData.urgency?.value || rawData.urgency || "3",
                impact: rawData.impact?.value || rawData.impact || "3",
              };
            } finally {
              await mongoClient.close();
            }

            // Map status and priority labels
            const statusLabel = getStatusLabel(
              ticket.state?.value || ticket.state || "1",
            );
            const priorityLabel = getPriorityLabel(
              ticket.priority?.value || ticket.priority || "3",
            );

            const modalProps = { ticket, statusLabel, priorityLabel };
            const htmlContent = TicketModalView.generateModal(modalProps);

            set.headers["content-type"] = "text/html; charset=utf-8";
            return htmlContent;
          } catch (error: unknown) {
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
          } catch (error: unknown) {
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
