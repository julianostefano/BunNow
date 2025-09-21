/**
 * HTMX Dashboard Routes - Modular Clean Architecture
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Refactored dashboard using modular MVC components following Development Guidelines.
 * This file demonstrates the proper MVC structure with files under 500 lines.
 */

import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { htmx } from "@gtramontina.com/elysia-htmx";
import { serviceNowAuthClient } from "../services/ServiceNowAuthClient";

// Import modular components following MVC architecture
import { generateDashboardLayout } from "../views/templates/DashboardLayout";
import { handleMetricsRequest } from "../controllers/web/MetricsController";
import { handleSearchRequest } from "../controllers/web/SearchController";
import { createDashboardData } from "../models/TicketFilters";

/**
 * Helper function to initialize services safely
 * TODO: Remove when circular dependencies are resolved
 */
async function initializeModularServices() {
  try {
    // Services initialization will be moved to proper dependency injection
    return { error: null };
  } catch (error) {
    console.error(" Modular Dashboard Services initialization error:", error);
    return { error };
  }
}

/**
 * Modular HTMX Dashboard - following MVC Architecture
 * Files under 500 lines, proper separation of concerns
 */
export const htmxDashboardModular = new Elysia({ prefix: "/modular" })
  .use(html())
  .use(htmx())
  .decorate("serviceNowAuthClient", serviceNowAuthClient)

  // Global error handler to prevent Elysia bugs
  .onError({ as: "global" }, (context) => {
    const { code, error, set } = context;

    console.error(
      `🚨 [MODULAR ERROR HANDLER] Code: ${code}, Error: ${error?.message || "Unknown"}`,
    );

    // Handle NOT_FOUND errors
    if (code === "NOT_FOUND") {
      set.status = 404;
      set.headers["content-type"] = "text/html; charset=utf-8";

      return generateDashboardLayout({
        title: "404 - Página não encontrada",
        showServiceStatus: false,
        enableAutoRefresh: false,
      }).replace(
        '<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">',
        `<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div class="text-center py-16">
            <h1 class="text-4xl font-bold mb-4">404 - Página não encontrada</h1>
            <p class="text-gray-400 mb-6">A página solicitada não foi encontrada.</p>
            <a href="/modular/" class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg">
              Voltar ao Dashboard
            </a>
          </div>`,
      );
    }

    // Handle other errors safely
    set.status = error?.status || 500;
    set.headers["content-type"] = "text/html; charset=utf-8";

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <title>Erro - BunSNC Modular Dashboard</title>
          <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-900 text-white">
          <div class="min-h-screen flex items-center justify-center">
              <div class="text-center">
                  <h1 class="text-2xl font-bold mb-4">Erro no Sistema</h1>
                  <p class="text-gray-400 mb-4">Ocorreu um erro interno. Tente novamente.</p>
                  <button onclick="window.location.reload()" 
                          class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg">
                      Recarregar
                  </button>
              </div>
          </div>
      </body>
      </html>
    `;
  })

  // Static CSS endpoint
  .get("/styles.css", () => {
    return Bun.file(
      "/storage/enviroments/integrations/nex/BunNow/bunsnc/public/styles.css",
    );
  })

  /**
   * Main dashboard page - Using modular template
   */
  .get("/", async ({ hx, set }) => {
    try {
      // Initialize services safely
      const services = await initializeModularServices();
      if (services.error && !hx.isHTMX) {
        // Return error page for full page loads when services fail
        return generateDashboardLayout({
          title: "BunSNC Dashboard - Service Error",
          showServiceStatus: true,
          enableAutoRefresh: false,
        }).replace(
          "<!-- Main Content -->",
          `<!-- Service Error Notice -->
          <div class="max-w-2xl mx-auto mt-8 p-6 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
            <i data-lucide="alert-triangle" class="w-12 h-12 mx-auto mb-4 text-red-400"></i>
            <h2 class="text-xl font-bold text-red-400 mb-2">Serviços Indisponíveis</h2>
            <p class="text-red-300">Alguns serviços estão temporariamente indisponíveis.</p>
            <button onclick="window.location.reload()" 
                    class="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
              Tentar Novamente
            </button>
          </div>
          <!-- Main Content -->`,
        );
      }

      // Return complete dashboard layout with proper Alpine.js integration
      const dashboardHTML = generateDashboardLayout({
        title: "BunSNC Dashboard - Modular Architecture",
        showServiceStatus: true,
        enableAutoRefresh: true,
      });

      // Replace the Alpine.js dashboard data with our modular implementation
      const dashboardData = createDashboardData({
        activeTab: "incident",
        state: "in_progress",
      });

      return dashboardHTML.replace(
        'x-data="dashboardData()"',
        `x-data='${JSON.stringify(dashboardData)}'`,
      );
    } catch (error: any) {
      console.error(" Dashboard route error:", error);
      set.status = 500;
      return generateDashboardLayout({
        title: "BunSNC Dashboard - Error",
        showServiceStatus: false,
        enableAutoRefresh: false,
      });
    }
  })

  /**
   * Metrics endpoint - Using modular controller
   */
  .get("/metrics", async (context) => {
    return handleMetricsRequest(context);
  })

  /**
   * Search endpoint - Using modular controller
   */
  .get("/search", async (context) => {
    return handleSearchRequest(context);
  })

  /**
   * Tickets lazy loading endpoint
   * TODO: Implement with ConsolidatedDataService when circular dependency is resolved
   */
  .get("/tickets-lazy", async ({ query }) => {
    const { ticketType, group, state, page, limit } = query as any;

    console.log(`📋 Loading ${ticketType} tickets with filters:`, {
      group,
      state,
      page,
      limit,
    });

    // Mock response for now - replace with actual data loading
    return `
      <div class="text-center py-8 text-gray-400">
        <i data-lucide="loader" class="w-8 h-8 animate-spin mx-auto mb-4"></i>
        <p>Carregando ${ticketType} tickets...</p>
        <p class="text-sm mt-2">Group: ${group}, State: ${state}</p>
        <div class="mt-4 text-xs text-gray-500">
          <p>🚧 Integration with ConsolidatedDataService pending</p>
          <p> Modular architecture implementation in progress</p>
        </div>
      </div>
    `;
  })

  /**
   * Ticket details modal endpoint
   * TODO: Implement with proper modal template
   */
  .get("/ticket-details/:sysId/:table", async ({ params }) => {
    const { sysId, table } = params;

    console.log(` Loading ticket details: ${sysId} from ${table}`);

    // Mock modal response - replace with actual modal template
    return `
      <div class="fixed inset-0 z-50 overflow-y-auto" 
           x-data="{ open: true }" 
           x-show="open" 
           x-transition:enter="ease-out duration-300"
           x-transition:enter-start="opacity-0"
           x-transition:enter-end="opacity-100"
           x-transition:leave="ease-in duration-200"
           x-transition:leave-start="opacity-100"
           x-transition:leave-end="opacity-0">
        
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div class="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity" 
               @click="open = false"></div>
          
          <div class="inline-block align-bottom bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div class="bg-gray-800 px-6 pt-6 pb-4">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-medium text-white">Ticket Details</h3>
                <button @click="open = false" class="text-gray-400 hover:text-white">
                  <i data-lucide="x" class="w-6 h-6"></i>
                </button>
              </div>
              
              <div class="space-y-4">
                <div>
                  <label class="text-sm text-gray-400">Ticket ID</label>
                  <p class="text-white">${sysId}</p>
                </div>
                <div>
                  <label class="text-sm text-gray-400">Table</label>
                  <p class="text-white">${table}</p>
                </div>
                <div class="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded">
                  <p class="text-yellow-400 text-sm">
                    🚧 Modal template implementation pending
                  </p>
                </div>
              </div>
            </div>
            
            <div class="bg-gray-700 px-6 py-3 flex justify-end space-x-3">
              <button @click="open = false" 
                      class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500">
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <script>
        // Initialize Lucide icons for modal
        lucide.createIcons();
      </script>
    `;
  });

export default htmxDashboardModular;
