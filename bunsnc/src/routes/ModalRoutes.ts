/**
 * Modal Routes - Enhanced Ticket Modal with Real-time Updates
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { dataService } from "../services/ConsolidatedDataService";
import { EnhancedTicketModalView } from "../web/EnhancedTicketModal";
import { serviceNowStreams } from "../config/redis-streams";
import { logger } from "../utils/Logger";
import { systemService } from "../services/SystemService";

export const createModalRoutes = () => {
  return (
    new Elysia({ prefix: "/modal" })
      // Get ticket modal with all data
      .get(
        "/ticket/:table/:sysId",
        async ({ params, query, set }) => {
          const startTime = Date.now();

          try {
            logger.info(`📋 Loading modal for ${params.table}/${params.sysId}`);

            // Get ticket details with SLA and notes
            const ticket = await dataService.getTicketDetails(
              params.sysId,
              params.table,
              {
                includeSLMs: true,
                includeNotes: true,
              },
            );

            if (!ticket) {
              set.status = 404;
              return { error: "Ticket not found" };
            }

            // Generate modal HTML
            const modalHtml = EnhancedTicketModalView.generateModal({
              ticket: ticket,
              slaData: ticket.slms || [],
              notes: ticket.notes || [],
              history: [], // TODO: Implement history
              showRealTime: query.realtime !== "false",
            });

            await systemService.recordMetric({
              operation: "modal_load",
              endpoint: `/modal/ticket/${params.table}/${params.sysId}`,
              response_time_ms: Date.now() - startTime,
            });

            set.headers["Content-Type"] = "text/html";
            return modalHtml;
          } catch (error) {
            logger.error(
              ` Error loading modal for ${params.table}/${params.sysId}:`,
              error,
            );
            set.status = 500;
            return { error: "Internal server error" };
          }
        },
        {
          params: t.Object({
            table: t.String(),
            sysId: t.String(),
          }),
          query: t.Optional(
            t.Object({
              realtime: t.Optional(t.String()),
            }),
          ),
        },
      )

      // Get ticket modal data (JSON)
      .get(
        "/data/:table/:sysId",
        async ({ params, query }) => {
          const startTime = Date.now();

          try {
            logger.info(
              ` Loading modal data for ${params.table}/${params.sysId}`,
            );

            const ticket = await dataService.getTicketDetails(
              params.sysId,
              params.table,
              {
                includeSLMs: query.includeSLA === "true",
                includeNotes: query.includeNotes === "true",
              },
            );

            if (!ticket) {
              return { error: "Ticket not found" };
            }

            await systemService.recordMetric({
              operation: "modal_data",
              endpoint: `/modal/data/${params.table}/${params.sysId}`,
              response_time_ms: Date.now() - startTime,
            });

            return {
              success: true,
              data: {
                ticket: ticket,
                slaData: ticket.slms || [],
                notes: ticket.notes || [],
                history: [], // TODO: Implement history
                lastUpdate: new Date().toISOString(),
              },
            };
          } catch (error) {
            logger.error(
              ` Error loading modal data for ${params.table}/${params.sysId}:`,
              error,
            );
            return { error: "Internal server error" };
          }
        },
        {
          params: t.Object({
            table: t.String(),
            sysId: t.String(),
          }),
          query: t.Optional(
            t.Object({
              includeSLA: t.Optional(t.String()),
              includeNotes: t.Optional(t.String()),
            }),
          ),
        },
      )

      // Refresh specific modal section (HTMX endpoint)
      .get(
        "/refresh/:section/:table/:sysId",
        async ({ params, set }) => {
          try {
            logger.info(
              ` Refreshing ${params.section} for ${params.table}/${params.sysId}`,
            );

            const ticket = await dataService.getTicketDetails(
              params.sysId,
              params.table,
              {
                forceServiceNow: true, // Force fresh data
                includeSLMs: params.section === "sla",
                includeNotes: params.section === "notes",
              },
            );

            if (!ticket) {
              set.status = 404;
              set.headers["Content-Type"] = "text/html";
              return '<div class="text-red-500">Ticket não encontrado</div>';
            }

            let sectionHtml = "";

            switch (params.section) {
              case "header":
                // Return updated header content
                sectionHtml = this.generateHeaderUpdate(ticket);
                break;

              case "details":
                // Return updated details tab
                sectionHtml = this.generateDetailsUpdate(ticket);
                break;

              case "sla":
                // Return updated SLA tab
                sectionHtml = this.generateSLAUpdate(ticket.slms || []);
                break;

              case "notes":
                // Return updated notes tab
                sectionHtml = this.generateNotesUpdate(
                  ticket.notes || [],
                  ticket,
                );
                break;

              default:
                set.status = 400;
                set.headers["Content-Type"] = "text/html";
                return '<div class="text-red-500">Seção inválida</div>';
            }

            set.headers["Content-Type"] = "text/html";
            return sectionHtml;
          } catch (error) {
            logger.error(
              ` Error refreshing ${params.section} for ${params.table}/${params.sysId}:`,
              error,
            );
            set.status = 500;
            set.headers["Content-Type"] = "text/html";
            return '<div class="text-red-500">Erro interno do servidor</div>';
          }
        },
        {
          params: t.Object({
            section: t.String(),
            table: t.String(),
            sysId: t.String(),
          }),
        },
      )
  );
};

export const createSSERoutes = () => {
  return (
    new Elysia({ prefix: "/events" })
      // Server-Sent Events for real-time ticket updates
      .get(
        "/ticket-updates/:sysId",
        async ({ params, set }) => {
          try {
            logger.info(
              `📡 SSE connection established for ticket ${params.sysId}`,
            );

            // Set SSE headers
            set.headers = {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "Cache-Control",
            };

            // Create readable stream for SSE
            let isConnected = true;

            const stream = new ReadableStream({
              start(controller) {
                // Send initial connection message
                const initialMessage = `data: ${JSON.stringify({
                  type: "connection",
                  message: "Real-time updates connected",
                  timestamp: new Date().toISOString(),
                  sys_id: params.sysId,
                })}\n\n`;

                controller.enqueue(new TextEncoder().encode(initialMessage));

                // Subscribe to Redis Streams for this ticket
                const subscribeToUpdates = async () => {
                  try {
                    // Set up Redis subscription (simplified for demo)
                    const intervalId = setInterval(async () => {
                      if (!isConnected) {
                        clearInterval(intervalId);
                        return;
                      }

                      try {
                        // Check for updates (in real implementation, use Redis Streams consumer)
                        const updateMessage = `data: ${JSON.stringify({
                          type: "heartbeat",
                          timestamp: new Date().toISOString(),
                          sys_id: params.sysId,
                        })}\n\n`;

                        controller.enqueue(
                          new TextEncoder().encode(updateMessage),
                        );
                      } catch (error) {
                        logger.error("SSE heartbeat error:", error);
                      }
                    }, 30000); // Heartbeat every 30 seconds

                    // Listen for actual ticket updates from Redis Streams
                    serviceNowStreams.subscribeToChanges((change) => {
                      if (change.sys_id === params.sysId && isConnected) {
                        const updateMessage = `data: ${JSON.stringify({
                          type: "ticket-updated",
                          change: change,
                          timestamp: new Date().toISOString(),
                          sys_id: params.sysId,
                        })}\n\n`;

                        controller.enqueue(
                          new TextEncoder().encode(updateMessage),
                        );
                        logger.info(
                          `📡 SSE update sent for ${params.sysId}:`,
                          change.action,
                        );
                      }
                    }, `modal-${params.sysId}`);
                  } catch (error) {
                    logger.error("Error setting up SSE subscription:", error);
                  }
                };

                subscribeToUpdates();
              },

              cancel() {
                isConnected = false;
                logger.info(
                  `📡 SSE connection closed for ticket ${params.sysId}`,
                );
              },
            });

            return new Response(stream, { headers: set.headers });
          } catch (error) {
            logger.error(` Error setting up SSE for ${params.sysId}:`, error);
            set.status = 500;
            return { error: "Failed to establish SSE connection" };
          }
        },
        {
          params: t.Object({
            sysId: t.String(),
          }),
        },
      )

      // Performance metrics SSE stream
      .get("/performance", async ({ set }) => {
        try {
          logger.info(" Performance monitoring SSE connection established");

          set.headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
          };

          let isConnected = true;

          const stream = new ReadableStream({
            start(controller) {
              const intervalId = setInterval(async () => {
                if (!isConnected) {
                  clearInterval(intervalId);
                  return;
                }

                try {
                  const stats = await systemService.getPerformanceStats(1);
                  const memoryUsage = systemService.getMemoryUsage();

                  const message = `data: ${JSON.stringify({
                    type: "performance-update",
                    stats: stats,
                    memory: memoryUsage,
                    timestamp: new Date().toISOString(),
                  })}\n\n`;

                  controller.enqueue(new TextEncoder().encode(message));
                } catch (error) {
                  logger.error("Performance SSE error:", error);
                }
              }, 5000); // Update every 5 seconds

              // Initial message
              const initialMessage = `data: ${JSON.stringify({
                type: "performance-connected",
                message: "Performance monitoring connected",
                timestamp: new Date().toISOString(),
              })}\n\n`;

              controller.enqueue(new TextEncoder().encode(initialMessage));
            },

            cancel() {
              isConnected = false;
              logger.info(" Performance SSE connection closed");
            },
          });

          return new Response(stream, { headers: set.headers });
        } catch (error) {
          logger.error(" Error setting up performance SSE:", error);
          set.status = 500;
          return { error: "Failed to establish performance SSE connection" };
        }
      })
  );
};

// Helper functions for HTMX partial updates
function generateHeaderUpdate(ticket: any): string {
  const priorityColor = getPriorityColor(ticket.priority);
  const stateColor = getStateColor(ticket.state);
  const stateText = getStateText(ticket.state);

  return `
    <div class="flex items-center space-x-4" hx-swap-oob="true" id="modal-header-info">
      <div class="flex items-center space-x-2">
        <div class="w-3 h-3 rounded-full bg-${priorityColor}-500"></div>
        <h2 class="text-xl font-bold text-gray-800">${ticket.number}</h2>
      </div>
      
      <div class="flex items-center space-x-2">
        <span class="px-3 py-1 text-xs font-medium bg-${stateColor}-100 text-${stateColor}-800 rounded-full">
          ${stateText}
        </span>
        <span class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
          P${ticket.priority}
        </span>
      </div>
    </div>
  `;
}

function generateDetailsUpdate(ticket: any): string {
  return EnhancedTicketModalView.generateDetailsTab(ticket);
}

function generateSLAUpdate(slaData: any[]): string {
  return EnhancedTicketModalView.generateSLATab(slaData);
}

function generateNotesUpdate(notes: any[], ticket: any): string {
  return EnhancedTicketModalView.generateNotesTab(notes, ticket);
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "1":
      return "red";
    case "2":
      return "yellow";
    case "3":
      return "blue";
    case "4":
      return "green";
    default:
      return "gray";
  }
}

function getStateColor(state: string): string {
  switch (state) {
    case "1":
      return "blue";
    case "2":
      return "yellow";
    case "3":
      return "orange";
    case "6":
      return "green";
    case "7":
      return "gray";
    default:
      return "gray";
  }
}

function getStateText(state: string): string {
  switch (state) {
    case "1":
      return "Novo";
    case "2":
      return "Em Andamento";
    case "3":
      return "Em Espera";
    case "6":
      return "Resolvido";
    case "7":
      return "Fechado";
    default:
      return `Estado ${state}`;
  }
}
