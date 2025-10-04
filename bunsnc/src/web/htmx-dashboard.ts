/**
 * HTMX Dashboard Routes for Ultra-Fast ServiceNow UI
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { htmx } from "@gtramontina.com/elysia-htmx";
import { serviceNowAuthClient } from "../services";

import { htmxSearchRoutes } from "./routes/HtmxSearchRoutes";
import { htmxTicketRoutes } from "./routes/HtmxTicketRoutes";
import { htmxStatisticsRoutes } from "./routes/HtmxStatisticsRoutes";

export const htmxDashboard = new Elysia({ prefix: "/htmx" })
  .use(html())
  .use(htmx())

  /**
   * Main dashboard page with ServiceNow ticket search
   */
  .get("/", ({ hx, set }) => {
    if (!hx.isHTMX) {
      // Full page for direct access
      return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BunSNC - ServiceNow Dashboard</title>
            <script src="/ui/js/htmx.min.js"></script>
            <script src="/ui/js/htmx/ext/ws.js"></script>
            <!-- AlpineJS removed - using HTMX only -->
            <link href="/ui/styles/tailwind.css" rel="stylesheet">
            <link href="/htmx/styles" rel="stylesheet">
            <style>
                body { 
                  background: linear-gradient(135deg, var(--elysia-bg-primary), var(--elysia-bg-secondary));
                  min-height: 100vh;
                  font-family: 'Inter', system-ui, -apple-system, sans-serif;
                }
                
                .elysia-card {
                  background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(51, 65, 85, 0.6) 100%);
                  border: 1px solid rgba(255, 255, 255, 0.1);
                  backdrop-filter: blur(8px);
                }
                
                .loading-skeleton { 
                  background: linear-gradient(90deg, var(--elysia-bg-secondary) 25%, var(--elysia-bg-tertiary) 50%, var(--elysia-bg-secondary) 75%);
                  background-size: 200% 100%;
                  animation: loading 1.5s infinite;
                }
                
                @keyframes loading {
                  0% { background-position: 200% 0; }
                  100% { background-position: -200% 0; }
                }
                
                .spinner {
                  border: 2px solid transparent;
                  border-top: 2px solid var(--elysia-primary);
                  border-radius: 50%;
                  width: 20px;
                  height: 20px;
                  animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body class="font-sans text-gray-900">
            <div class="min-h-screen">
                <!-- Header -->
                <header class="header-gradient shadow-lg border-b border-white/10">
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-4">
                                <div class="flex items-center space-x-3">
                                    <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                                        <span class="text-xl font-bold text-white"></span>
                                    </div>
                                    <div>
                                        <h1 class="text-2xl font-bold text-white">BunSNC Dashboard</h1>
                                        <p class="text-blue-100 text-sm">ServiceNow Ultra-Fast Interface</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="flex items-center space-x-4">
                                <div id="health-status" 
                                     hx-get="/htmx/health" 
                                     hx-trigger="load, every 30s" 
                                     class="loading-skeleton h-8 w-48 rounded">
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Main Content -->
                <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <!-- Metrics Section -->
                    <section id="metrics-section" 
                             hx-get="/htmx/metrics" 
                             hx-trigger="load, every 60s" 
                             class="mb-8">
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div class="loading-skeleton h-24 rounded-lg"></div>
                            <div class="loading-skeleton h-24 rounded-lg"></div>
                            <div class="loading-skeleton h-24 rounded-lg"></div>
                            <div class="loading-skeleton h-24 rounded-lg"></div>
                        </div>
                    </section>

                    <!-- Search Section -->
                    <section class="mb-8">
                        <div id="search-form-container" 
                             hx-get="/htmx/search-form" 
                             hx-trigger="load" 
                             class="elysia-card rounded-xl p-6">
                            <div class="loading-skeleton h-32 rounded"></div>
                        </div>
                    </section>

                    <!-- Active Tickets Section -->
                    <section>
                        <div class="flex items-center justify-between mb-6">
                            <h2 class="text-xl font-semibold text-white">Tickets Ativos</h2>
                            <div class="flex space-x-2">
                                <button class="btn-animated px-4 py-2 bg-blue-600 text-white rounded-lg"
                                        hx-get="/htmx/tickets?type=active" 
                                        hx-target="#tickets-list">
                                    Ativos
                                </button>
                                <button class="btn-animated px-4 py-2 bg-gray-600 text-white rounded-lg"
                                        hx-get="/htmx/tickets?type=all" 
                                        hx-target="#tickets-list">
                                    Todos
                                </button>
                                <button class="btn-animated px-4 py-2 bg-purple-600 text-white rounded-lg"
                                        hx-get="/htmx/statistics" 
                                        hx-target="#tickets-list">
                                    Estatísticas
                                </button>
                            </div>
                        </div>
                        
                        <div id="tickets-list" 
                             hx-get="/htmx/tickets?type=active" 
                             hx-trigger="load"
                             class="space-y-4">
                            <div class="loading-skeleton h-32 rounded-lg"></div>
                            <div class="loading-skeleton h-32 rounded-lg"></div>
                            <div class="loading-skeleton h-32 rounded-lg"></div>
                        </div>
                    </section>
                </main>
                
                <!-- Modals -->
                <div id="ticket-modal" class="modal-backdrop hidden fixed inset-0 z-50 flex items-center justify-center">
                    <div class="modal-content max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto rounded-xl">
                        <!-- Modal content will be loaded here -->
                    </div>
                </div>
            </div>

            <!-- WebSocket Connection for Real-time Updates -->
            <div hx-ext="ws" ws-connect="/ws/dashboard">
                <div id="ws-status" class="hidden"></div>
            </div>

            <script>
                // BunSNC Global Object
                window.BunSNC = {
                    openModal: function(modalId) {
                        document.getElementById(modalId).classList.remove('hidden');
                    },
                    
                    closeModal: function(modalId) {
                        document.getElementById(modalId).classList.add('hidden');
                    },
                    
                    refreshMetrics: function() {
                        htmx.trigger('#metrics-section', 'refresh');
                    }
                };

                // WebSocket Message Handling
                document.addEventListener('htmx:wsMessage', function(evt) {
                    const data = JSON.parse(evt.detail.message);
                    
                    if (data.type === 'metrics_updated') {
                        htmx.trigger('#metrics-section', 'refresh');
                    }
                    
                    if (data.type === 'ticket_updated') {
                        htmx.trigger('#tickets-list', 'refresh');
                        htmx.trigger('#metrics-section', 'refresh');
                    }
                });

                // Global Error Handler
                document.addEventListener('htmx:responseError', function(evt) {
                    console.error('HTMX Error:', evt.detail);
                    
                    if (evt.detail.xhr.status === 401) {
                        window.location.href = '/login';
                    }
                });

                // Modal Close on Background Click
                document.addEventListener('click', function(evt) {
                    if (evt.target.classList.contains('modal-backdrop')) {
                        BunSNC.closeModal(evt.target.id);
                    }
                });
            </script>
        </body>
        </html>
      `;
    }

    // HTMX partial response
    return "<div>Dashboard updated via HTMX</div>";
  })

  /**
   * Health status component
   */
  .get("/health", async () => {
    const dbHealth = { connected: true, queries: 0, performance: "good" };
    const streamHealth = {
      status: "connected",
      streams: ["incident", "problem", "change"],
    };
    const rateLimitHealth = { status: "healthy" }; // Rate limiting now handled internally: getHealthStatus();

    const overallStatus =
      streamHealth.status === "connected" &&
      rateLimitHealth.status === "healthy"
        ? "healthy"
        : "degraded";

    const statusColor = overallStatus === "healthy" ? "green" : "yellow";

    return `
      <div class="flex items-center space-x-4 p-3 bg-${statusColor}-50 border border-${statusColor}-200 rounded-lg">
        <div class="flex-shrink-0">
          <div class="h-2 w-2 bg-${statusColor}-500 rounded-full"></div>
        </div>
        <div class="flex-1">
          <div class="text-sm font-medium text-${statusColor}-800">
            Sistema: ${overallStatus === "healthy" ? "Operacional" : "Degradado"}
          </div>
          <div class="text-xs text-${statusColor}-600">
            Streams: ${streamHealth.status} | 
            Rate Limit: ${rateLimitHealth.details.metrics.currentConcurrentRequests}/${rateLimitHealth.details.config.maxConcurrentRequests} conexões
          </div>
        </div>
        <div class="text-xs text-${statusColor}-600">
          ${new Date().toLocaleTimeString("pt-BR")}
        </div>
      </div>
    `;
  })

  // Route to serve CSS styles
  .get("/styles", () => {
    return new Response(
      require("fs").readFileSync(
        "/storage/enviroments/integrations/nex/BunNow/bunsnc/src/web/styles/htmx-dashboard.css",
        "utf8",
      ),
      { headers: { "Content-Type": "text/css" } },
    );
  })

  // Mount modular routes
  .use(htmxSearchRoutes)
  .use(htmxTicketRoutes)
  .use(htmxStatisticsRoutes);

export default htmxDashboard;
