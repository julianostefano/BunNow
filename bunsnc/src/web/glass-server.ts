/**
 * Unified Glass Design Server - Modern HTMX ServiceNow Interface
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { htmx } from "@gtramontina.com/elysia-htmx";
// Plugin System Integration - replacing direct service imports
import {
  createSharedPluginsComposition,
  type ConsolidatedPluginContext,
} from "../plugins";
import { htmxAIRoutes } from "./routes/HtmxAIRoutes";
import { htmxAIChatRoutes } from "./routes/HtmxAIChatRoutes";
import { workflowGuidanceRoutes } from "./routes/HtmxWorkflowGuidanceRoutes";
import { neuralSearchRoutes } from "./routes/HtmxNeuralSearchRoutes";
import { intelligenceDashboardRoutes } from "./routes/HtmxIntelligenceDashboardRoutes";
import { knowledgeVisualizationRoutes } from "./routes/HtmxKnowledgeVisualizationRoutes";
import { synonymsApiRoutes } from "./routes/api/synonyms";
import { streamingApiRoutes } from "./routes/api/streaming";
import { systemHealthApiRoutes } from "./routes/api/system-health";

// Type definitions for better type safety
interface ServiceNowRecord {
  sys_id: string;
  number: string;
  short_description: string;
  description?: string;
  state: string;
  priority: string;
  assignment_group?: string | { display_value: string; value: string };
  assigned_to?: string | { display_value: string; value: string };
  caller_id?: string | { display_value: string; value: string };
  sys_created_on: string;
  sys_updated_on: string;
  resolved_at?: string;
  opened_at?: string;
  [key: string]: any; // For additional fields
}

interface SearchResult {
  sys_id: string;
  number: string;
  title: string;
  description: string;
  state: string;
  priority: string;
  confidence: number;
  tableType: "incident" | "problem" | "change_request";
  created: string;
  updated: string;
  assignedTo?: string;
  url: string;
}

interface BulkOperationResult {
  ticketId: string;
  success: boolean;
  error?: string;
  message?: string;
}

interface DashboardStats {
  incident_count: number;
  problem_count: number;
  change_count: number;
  timestamp: string;
  source: string;
  sla_compliance: string | number;
  avg_resolution_time: number;
}

interface NotificationData {
  type: string;
  severity: string;
  title: string;
  message: string;
  action: string;
  icon: string;
  record_id?: string;
  number?: string;
}

interface SearchQuery {
  q?: string;
}

interface TicketFilters {
  states?: string;
  priority?: string;
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface TicketParams {
  type: string;
  sys_id?: string;
}

interface BulkUpdateData {
  tickets: Array<{
    sys_id: string;
    table: string;
    data: Record<string, unknown>;
  }>;
}

// Standalone functions for SSE streaming (replaced private methods)
async function getDashboardData(): Promise<any> {
  try {
    const supportGroups = [
      "IT Operations",
      "Database Administration",
      "Network Support",
      "Application Support",
    ];

    const results = await Promise.allSettled(
      supportGroups.map(async (group) => {
        const [incidents, changeTasks, scTasks] = await Promise.all([
          consolidatedServiceNowService.getWaitingTickets("incident", group),
          consolidatedServiceNowService.getWaitingTickets("change_task", group),
          consolidatedServiceNowService.getWaitingTickets("sc_task", group),
        ]);

        return {
          group,
          incident_count: incidents.length,
          change_task_count: changeTasks.length,
          sc_task_count: scTasks.length,
          total_count: incidents.length + changeTasks.length + scTasks.length,
        };
      }),
    );

    const groupData = results
      .filter(
        (result): result is PromiseFulfilledResult<any> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);

    const totalIncidents = groupData.reduce(
      (sum, group) => sum + group.incident_count,
      0,
    );
    const totalChangeTasks = groupData.reduce(
      (sum, group) => sum + group.change_task_count,
      0,
    );
    const totalScTasks = groupData.reduce(
      (sum, group) => sum + group.sc_task_count,
      0,
    );

    return {
      incident_count: totalIncidents,
      problem_count: 0,
      change_count: totalChangeTasks + totalScTasks,
      timestamp: new Date().toISOString(),
      source: "ServiceNow API",
      sla_compliance: "95%",
      avg_resolution_time: 4.2,
      support_groups: groupData,
    };
  } catch (error: unknown) {
    console.error("Error getting dashboard data:", error);

    return {
      incident_count: 0,
      problem_count: 0,
      change_count: 0,
      timestamp: new Date().toISOString(),
      source: "Fallback Data",
      sla_compliance: "N/A",
      avg_resolution_time: 0,
      support_groups: [],
    };
  }
}

async function generateRealtimeNotification(): Promise<any | null> {
  try {
    const recentIncidents = await consolidatedServiceNowService.query({
      table: "incident",
      query: "sys_created_onRELATIVEGT@minute@ago@30^priority<=2^ORstate=1",
      limit: 5,
    });

    const recentProblems = await consolidatedServiceNowService.query({
      table: "problem",
      query: "sys_created_onRELATIVEGT@minute@ago@30^state!=6",
      limit: 3,
    });

    const recentChanges = await consolidatedServiceNowService.query({
      table: "change_request",
      query: "sys_updated_onRELATIVEGT@minute@ago@10^state=3",
      limit: 2,
    });

    const allRecentRecords = [
      ...recentIncidents.map((inc: any) => ({
        type: "incident",
        severity:
          inc.priority === "1"
            ? "critical"
            : inc.priority === "2"
              ? "high"
              : "medium",
        title: `New ${inc.priority === "1" ? "Critical" : "High Priority"} Incident`,
        message: inc.short_description,
        action: `View incident ${inc.number}`,
        icon: "🚨",
        record_id: inc.sys_id,
        number: inc.number,
      })),
      ...recentProblems.map((prob: any) => ({
        type: "problem",
        severity: "medium",
        title: "Problem Updated",
        message: prob.short_description,
        action: `View problem ${prob.number}`,
        icon: "",
        record_id: prob.sys_id,
        number: prob.number,
      })),
      ...recentChanges.map((change: any) => ({
        type: "change",
        severity: "low",
        title: "Change Implemented",
        message: change.short_description,
        action: `Review change ${change.number}`,
        icon: "",
        record_id: change.sys_id,
        number: change.number,
      })),
    ];

    if (allRecentRecords.length === 0) {
      return null;
    }

    const notification = allRecentRecords[0];

    return {
      ...notification,
      id: `notif_${Date.now()}_${notification.record_id.substr(-5)}`,
      timestamp: new Date().toISOString(),
    };
  } catch (error: unknown) {
    console.error("Error generating real-time notification:", error);
    return null;
  }
}

/**
 * Main server class with glass design and HTMX integration
 */
export class GlassDesignServer {
  private app: Elysia;
  private port: number;

  constructor(port: number = 3010) {
    this.port = port;
    this.app = this.createApp();
  }

  private createApp(): Elysia {
    return (
      new Elysia()
        .use(html())
        .use(htmx())

        // Plugin System Integration - Shared Plugins Pattern
        .use(
          createSharedPluginsComposition({
            enableHealthChecks: true,
            enableMetrics: true,
            pluginConfig: {
              serviceNow: {
                instanceUrl:
                  process.env.SNC_INSTANCE_URL ||
                  "https://iberdrola.service-now.com",
                username: process.env.SNC_USERNAME || "",
                password: process.env.SNC_PASSWORD || "",
              },
              redis: {
                host: process.env.REDIS_HOST || "10.219.8.210",
                port: parseInt(process.env.REDIS_PORT || "6380"),
                password: process.env.REDIS_PASSWORD || "nexcdc2025",
              },
              mongodb: {
                host: process.env.MONGODB_HOST || "10.219.8.210",
                port: parseInt(process.env.MONGODB_PORT || "27018"),
                database: process.env.MONGODB_DATABASE || "bunsnc",
              },
            },
          }),
        )

        // CORS configuration
        .use(
          cors({
            origin: true,
            credentials: true,
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowedHeaders: [
              "Content-Type",
              "Authorization",
              "X-Requested-With",
              "HX-Request",
              "HX-Target",
              "HX-Current-URL",
            ],
          }),
        )

        // Static files
        .use(
          staticPlugin({
            assets: "src/web/public",
            prefix: "/public",
            headers: {
              "Cache-Control": "public, max-age=31536000",
              "X-Content-Type-Options": "nosniff",
            },
          }),
        )

        // Swagger documentation
        .use(
          swagger({
            documentation: {
              info: {
                title: "ServiceNow Analytics API",
                version: "2.0.0",
                description:
                  "Modern glass design HTMX interface for ServiceNow analytics and management",
              },
              tags: [
                { name: "Pages", description: "HTML page endpoints" },
                { name: "API", description: "HTMX API endpoints" },
                { name: "Events", description: "Real-time event streams" },
                { name: "Components", description: "Reusable HTMX components" },
              ],
            },
            path: "/docs",
          }),
        )

        // Security headers
        .onBeforeHandle(({ set }) => {
          set.headers = {
            ...set.headers,
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          };
        })

        // HTMX detection middleware
        .derive(({ headers }) => ({
          isHtmx: headers["hx-request"] === "true",
          htmxTarget: headers["hx-target"] || null,
          htmxCurrentUrl: headers["hx-current-url"] || null,
        }))

        // Main dashboard route
        .get("/", ({ isHtmx }) => {
          return this.createLayout({
            title: "Dashboard",
            currentPath: "/",
            children: this.createDashboard(),
            isHtmx,
          });
        })

        // Unified tickets page
        .get("/tickets", ({ isHtmx }) => {
          return this.createLayout({
            title: "Tickets",
            currentPath: "/tickets",
            children: this.createTicketsPage(),
            isHtmx,
          });
        })

        // Health check
        .get("/health", () => ({
          status: "healthy",
          timestamp: new Date().toISOString(),
          version: "2.0.0",
          server: "glass-design-server",
          features: [
            "htmx",
            "sse",
            "glass-design",
            "real-time-analytics",
            "responsive-ui",
            "accessibility",
          ],
        }))

        // API Routes
        .get("/api/search", ({ query }) => {
          const searchQuery = (query as SearchQuery)?.q || "";
          return this.createSearchResults(searchQuery);
        })

        .get("/api/metrics", () => {
          return this.createMetricsCards();
        })

        .get("/api/statistics", () => {
          return this.createStatisticsPage();
        })

        .get("/api/neural-search", async ({ query }) => {
          const searchQuery = (query as SearchQuery)?.q || "";
          return await this.executeNeuralSearch(searchQuery);
        })

        .get("/api/tickets/:type", async ({ params, query }) => {
          const type = params.type;
          const states = (query as TicketFilters)?.states || "";
          return await this.createTicketList(type, states);
        })

        .get("/api/tickets-content/:type", async ({ params, query }) => {
          const type = params.type;
          const states = (query as TicketFilters)?.states || "";
          return await this.createTicketCards(type, states);
        })

        // Enhanced Ticket CRUD Operations
        .get("/api/ticket/:sys_id", async ({ params }) => {
          try {
            const ticket = await this.consolidatedService.getRecord(
              "incident",
              params.sys_id,
            );
            return this.renderTicketDetails(ticket);
          } catch (error: unknown) {
            console.error(" [CRUD] Error fetching ticket:", error);
            return this.renderError("Ticket not found");
          }
        })

        .put("/api/ticket/:sys_id", async ({ params, body }) => {
          try {
            const updateData = await body;
            const updatedTicket = await this.consolidatedService.updateRecord(
              "incident",
              params.sys_id,
              updateData as Record<string, unknown>,
            );
            return this.renderTicketCard(updatedTicket, "incident");
          } catch (error: unknown) {
            console.error(" [CRUD] Error updating ticket:", error);
            return this.renderError("Failed to update ticket");
          }
        })

        .post("/api/ticket/:type", async ({ params, body }) => {
          try {
            const ticketData = await body;
            const newTicket = await this.consolidatedService.createRecord(
              params.type,
              ticketData as Record<string, unknown>,
            );
            return this.renderTicketCard(newTicket, params.type);
          } catch (error: unknown) {
            console.error(" [CRUD] Error creating ticket:", error);
            return this.renderError("Failed to create ticket");
          }
        })

        // Advanced Filter Operations
        .get("/api/tickets-filter/:type", async ({ params, query }) => {
          try {
            const type = params.type;
            const filters = query as TicketFilters;

            // Advanced filtering with priority, assignment group, date range
            const results = await this.getAdvancedTicketFilter(type, filters);
            return this.renderTicketCards(results, type);
          } catch (error: unknown) {
            console.error(" [Filter] Error:", error);
            return this.renderError("Filter operation failed");
          }
        })

        // Bulk Operations
        .post("/api/tickets-bulk/:action", async ({ params, body }) => {
          try {
            const action = params.action; // 'update', 'assign', 'close'
            const bulkData = (await body) as BulkUpdateData;

            const results = await this.performBulkOperation(
              action,
              bulkData.ticket_ids,
              bulkData.data,
            );
            return this.renderBulkOperationResult(results);
          } catch (error: unknown) {
            console.error(" [Bulk] Error:", error);
            return this.renderError("Bulk operation failed");
          }
        })

        // Enhanced Real-time SSE Stream
        .get("/events/stream", ({ set }) => {
          set.headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
          };

          return this.createEnhancedSSEStream();
        })

        // Real-time Ticket Updates Stream
        .get("/events/tickets/:type", ({ params, set }) => {
          set.headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
          };

          return this.createTicketUpdatesStream(params.type);
        })

        // Real-time Neural Search Results Stream
        .get("/events/neural-search", ({ query, set }) => {
          set.headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
          };

          const searchQuery = (query as SearchQuery)?.q || "";
          return this.createNeuralSearchStream(searchQuery);
        })

        // System Health Monitoring Stream
        .get("/events/system-health", ({ set }) => {
          set.headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
          };

          return this.createSystemHealthStream();
        })

        // AI Services Routes - Phase 6 Implementation
        .use(htmxAIRoutes)
        .use(htmxAIChatRoutes)
        .use(workflowGuidanceRoutes)
        .use(neuralSearchRoutes)
        .use(intelligenceDashboardRoutes)
        .use(knowledgeVisualizationRoutes)
        .use(synonymsApiRoutes)
        .use(streamingApiRoutes)
        .use(systemHealthApiRoutes)

        // Favicon
        .get("/favicon.ico", () => new Response(null, { status: 204 }))

        // Error handling
        .onError(({ code, error, set }) => {
          console.error("Server Error:", code, error);

          if (code === "NOT_FOUND") {
            set.status = 404;
            return this.create404Page();
          }

          set.status = 500;
          return this.create500Page();
        })

        // Request logging
        .onBeforeHandle(({ request, isHtmx }) => {
          const method = request.method;
          const url = new URL(request.url).pathname;
          const timestamp = new Date().toISOString();
          const type = isHtmx ? "[HTMX]" : "[HTTP]";

          console.log(`${timestamp} ${type} ${method} ${url}`);
        })
    );
  }

  private createLayout({
    title,
    currentPath,
    children,
    isHtmx = false,
  }: {
    title: string;
    currentPath: string;
    children: string;
    isHtmx?: boolean;
  }): string {
    if (isHtmx) {
      return children;
    }

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title} | ServiceNow Analytics</title>

          <!-- Fonts -->
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Fira+Code:wght@300;400;500&display=swap" rel="stylesheet">

          <!-- CSS -->
          <link rel="stylesheet" href="/public/css/glass-design.css">
          <link rel="stylesheet" href="/public/css/components.css">

          <!-- HTMX -->
          <script src="https://unpkg.com/htmx.org@1.9.10"></script>
          <script src="https://unpkg.com/htmx.org/dist/ext/sse.js"></script>

          <!-- Meta -->
          <meta name="description" content="Modern ServiceNow analytics and management interface with real-time updates">
          <meta name="theme-color" content="#667eea">
          <link rel="manifest" href="/manifest.json">

          <!-- Favicon -->
          <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23667eea'%3e%3cpath d='M13 3V9H21L11 23V17H3L13 3Z'/%3e%3c/svg%3e">
        </head>
        <body>
          <!-- Navigation -->
          ${this.createNavigation(currentPath)}

          <!-- Main Content -->
          <main>
            ${children}
          </main>

          <!-- Footer -->
          <footer class="glass-card" style="margin: 2rem; padding: 1.5rem; text-align: center;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
              <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.875rem;">
                <span class="gradient-text" style="font-weight: 600;">BunSNC</span> - Modern ServiceNow Analytics Platform
              </div>
              <div style="display: flex; align-items: center; gap: 1rem; color: rgba(255, 255, 255, 0.6); font-size: 0.875rem;">
                <span>v2.0.0</span>
                <span>•</span>
                <span>Built with Bun + Elysia</span>
                <span>•</span>
                <div style="display: flex; align-items: center; gap: 0.25rem;">
                  <div style="width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: pulse 2s infinite;"></div>
                  <span>Live</span>
                </div>
              </div>
            </div>
          </footer>

          <!-- JavaScript -->
          <script src="/public/js/htmx-extensions.js"></script>
        </body>
      </html>
    `;
  }

  private createNavigation(currentPath: string): string {
    const navItems = [
      {
        href: "/",
        label: "Dashboard",
        icon: "dashboard",
        active: currentPath === "/",
      },
      {
        href: "/tickets",
        label: "Tickets",
        icon: "🎫",
        badge: "41",
        active: currentPath.startsWith("/tickets"),
      },
      {
        href: "/analytics",
        label: "Analytics",
        icon: "📈",
        active: currentPath.startsWith("/analytics"),
      },
      {
        href: "/reports",
        label: "Reports",
        icon: "📄",
        active: currentPath.startsWith("/reports"),
      },
    ];

    const navItemsHtml = navItems
      .map(
        (item) => `
      <li class="glass-nav__item">
        <a href="${item.href}" class="glass-nav__link ${item.active ? "glass-nav__link--active" : ""}">
          <span>${item.icon}</span>
          <span>${item.label}</span>
          ${item.badge ? `<span class="glass-nav__badge">${item.badge}</span>` : ""}
        </a>
      </li>
    `,
      )
      .join("");

    return `
      <nav class="glass-nav">
        <div class="glass-nav__brand">
          <div class="glass-nav__logo">BunSNC</div>
          <a href="/" class="glass-nav__title">BunSNC</a>
        </div>
        <ul class="glass-nav__list">
          ${navItemsHtml}
        </ul>
        <div class="glass-nav__search">
          <button class="glass-btn" onclick="openSearchModal()" title="Search (Ctrl+K)">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </button>
        </div>
        <div class="glass-nav__user">
          <div class="glass-nav__avatar">A</div>
          <span>Admin</span>
          <div class="glass-nav__dropdown">
            <a href="/profile" class="glass-nav__dropdown-item">Profile</a>
            <a href="/settings" class="glass-nav__dropdown-item">Settings</a>
            <a href="/logout" class="glass-nav__dropdown-item">Logout</a>
          </div>
        </div>
      </nav>
    `;
  }

  private createDashboard(): string {
    return `
      <div class="dashboard-container">
        <!-- Header -->
        <div class="dashboard-header fade-in">
          <h1 class="dashboard-title">Real-time Analytics Dashboard</h1>
          <p class="dashboard-subtitle">
            Monitor ServiceNow data processing and system performance in real-time
          </p>
        </div>

        <!-- Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card glass-card fade-in"
               hx-ext="sse"
               sse-connect="/events/stream"
               sse-swap="message"
               hx-target="this">
            <div class="stat-value" id="incident-count">Loading...</div>
            <div class="stat-label">Total Incidents</div>
            <div class="stat-trend stat-trend--positive">
              <svg class="stat-trend__icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
              </svg>
              +12% from last week
            </div>
          </div>

          <div class="stat-card glass-card fade-in">
            <div class="stat-value" id="problem-count">Loading...</div>
            <div class="stat-label">Active Problems</div>
            <div class="stat-trend stat-trend--negative">
              <svg class="stat-trend__icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              -5% from last week
            </div>
          </div>

          <div class="stat-card glass-card fade-in">
            <div class="stat-value" id="change-count">Loading...</div>
            <div class="stat-label">Pending Changes</div>
            <div class="stat-trend stat-trend--positive">
              <svg class="stat-trend__icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
              </svg>
              +8% from last week
            </div>
          </div>

          <div class="stat-card glass-card fade-in">
            <div class="stat-value">98.7%</div>
            <div class="stat-label">System Availability</div>
            <div class="stat-trend stat-trend--positive">
              <svg class="stat-trend__icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
              </svg>
              +0.3% from last week
            </div>
          </div>
        </div>

        <!-- Neural Search FAB -->
        <div class="neural-search-fab" onclick="openNeuralSearch()">
          <span class="neural-icon">Neural</span>
          <span class="neural-label">Neural Search</span>
        </div>

        <!-- Filter Bar -->
        <div class="filter-bar fade-in">
          <div class="filter-tabs">
            <div class="filter-tab-indicator filter-tab-indicator--incidents"></div>
            <button class="filter-tab filter-tab--active" data-type="incidents" onclick="setActiveTab('incidents')">
              🚨 Incidents
            </button>
            <button class="filter-tab" data-type="problems" onclick="setActiveTab('problems')">
               Problems
            </button>
            <button class="filter-tab" data-type="changes" onclick="setActiveTab('changes')">
              📋 Changes
            </button>
            <button class="filter-tab" data-type="requests" onclick="setActiveTab('requests')">
              📋 Requests
            </button>
          </div>
          <div class="filter-states">
            <button class="filter-state filter-state--default filter-state--active" data-state="em-espera" onclick="toggleFilterState(this, 'incidents')">
              Em Espera
            </button>
            <button class="filter-state filter-state--default filter-state--active" data-state="novo" onclick="toggleFilterState(this, 'incidents')">
              Novo
            </button>
            <button class="filter-state filter-state--default filter-state--active" data-state="designado" onclick="toggleFilterState(this, 'incidents')">
              Designado
            </button>
            <button class="filter-state" data-state="em-andamento" onclick="toggleFilterState(this, 'incidents')">
              Em Andamento
            </button>
            <button class="filter-state" data-state="resolvido" onclick="toggleFilterState(this, 'incidents')">
              Resolvido
            </button>
            <button class="filter-state" data-state="fechado" onclick="toggleFilterState(this, 'incidents')">
              Fechado
            </button>
          </div>
        </div>

        <!-- Ticket Content -->
        <div id="ticket-content" class="fade-in"
             hx-get="/api/tickets/incidents?states=em-espera,novo,designado"
             hx-trigger="load"
             hx-swap="innerHTML">
          <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
            <div class="glass-loading glass-loading--visible">
              <div class="glass-loading__spinner"></div>
              <span class="glass-loading__text">Loading tickets...</span>
            </div>
          </div>
        </div>

        <!-- Control Panel -->
        <div class="dashboard-section fade-in">
          <h2 class="dashboard-section__title">
            <span class="dashboard-section__indicator"></span>
            Real-time Controls
          </h2>

          <div class="control-panel">
            <!-- Data Processing Controls -->
            <div class="control-section glass-card">
              <div class="control-section__header">
                <h3 class="control-section__title">Data Processing</h3>
                <div class="control-section__status control-section__status--active"></div>
              </div>

              <div class="control-grid">
                <button class="glass-btn glass-btn--primary"
                        hx-post="/api/process/incidents"
                        hx-target="#processing-log"
                        hx-indicator="#processing-spinner">
                  🚨 Export Incidents
                </button>

                <button class="glass-btn"
                        hx-post="/api/process/problems"
                        hx-target="#processing-log"
                        hx-indicator="#processing-spinner">
                   Export Problems
                </button>

                <button class="glass-btn"
                        hx-post="/api/process/changes"
                        hx-target="#processing-log"
                        hx-indicator="#processing-spinner">
                  📋 Export Changes
                </button>

                <button class="glass-btn glass-btn--success"
                        hx-get="/api/metrics"
                        hx-target="#analytics-content"
                        hx-trigger="click">
                  Refresh Data
                </button>
              </div>

              <div id="processing-spinner" class="htmx-indicator">
                <div class="glass-loading glass-loading--visible">
                  <div class="glass-loading__spinner"></div>
                  <span class="glass-loading__text">Processing...</span>
                </div>
              </div>
            </div>

            <!-- Processing Log -->
            <div class="control-section glass-card">
              <div class="control-section__header">
                <h3 class="control-section__title">Processing Log</h3>
                <button class="glass-btn glass-btn--small" onclick="clearLog()">Clear</button>
              </div>

              <div id="processing-log" class="processing-log">
                <div class="log-entry log-entry--info">
                  <span class="log-timestamp">[${new Date().toISOString()}]</span>
                  System ready for data processing...
                </div>
                <div class="log-entry log-entry--success">
                  <span class="log-timestamp">[${new Date().toISOString()}]</span>
                  Real-time connection established
                </div>
                <div class="log-entry log-entry--info">
                  <span class="log-timestamp">[${new Date().toISOString()}]</span>
                  Monitoring ServiceNow events...
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Analytics Overview -->
        <div class="dashboard-section fade-in">
          <h2 class="dashboard-section__title">
            <span class="dashboard-section__indicator"></span>
            Analytics Overview
          </h2>

          <div id="analytics-content"
               class="glass-card"
               hx-get="/api/metrics"
               hx-trigger="load, every 30s"
               hx-indicator="#analytics-loading">
            <div id="analytics-loading" class="htmx-indicator">
              <div class="glass-loading glass-loading--visible">
                <div class="glass-loading__spinner"></div>
                <span class="glass-loading__text">Loading analytics...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="dashboard-section fade-in">
          <h2 class="dashboard-section__title">Quick Actions</h2>
          <div class="quick-actions-grid">
            <a href="/incidents" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--incidents">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">Incidents</h3>
            </a>

            <a href="/problems" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--problems">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">Problems</h3>
            </a>

            <a href="/changes" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--changes">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.11 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">Changes</h3>
            </a>

            <a href="/analytics" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--analytics">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">Analytics</h3>
            </a>

            <a href="/reports" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--reports">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">Reports</h3>
            </a>

            <a href="/ai/dashboard" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--ai">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">AI Services</h3>
            </a>

            <a href="/search/neural" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--search">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">Neural Search</h3>
            </a>

            <a href="/intelligence/dashboard" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--intelligence">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 11H7v6h2v-6zm4 0h-2v6h2v-6zm4 0h-2v6h2v-6zm2.5 2.5c0-1.37-1.13-2.5-2.5-2.5s-2.5 1.13-2.5 2.5S17.63 16 19 16s2.5-1.13 2.5-2.5z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">Intelligence</h3>
            </a>

            <a href="/knowledge/visualization" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--knowledge">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 19V5h14v14H5z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">Knowledge Base</h3>
            </a>

            <a href="/settings" class="glass-card quick-action">
              <div class="quick-action__icon quick-action__icon--settings">
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                </svg>
              </div>
              <h3 class="quick-action__title">Settings</h3>
            </a>
          </div>
        </div>
      </div>

      <script>
        // Clear log function
        function clearLog() {
          const log = document.getElementById('processing-log');
          log.innerHTML = '<div class="log-entry log-entry--info"><span class="log-timestamp">[' + new Date().toISOString() + ']</span> Log cleared by user</div>';
        }

        // Handle SSE updates
        document.body.addEventListener('htmx:sseMessage', function(event) {
          try {
            const data = JSON.parse(event.detail.data);
            if (data.incident_count !== undefined) {
              const element = document.getElementById('incident-count');
              if (element) element.textContent = data.incident_count;
            }
            if (data.problem_count !== undefined) {
              const element = document.getElementById('problem-count');
              if (element) element.textContent = data.problem_count;
            }
            if (data.change_count !== undefined) {
              const element = document.getElementById('change-count');
              if (element) element.textContent = data.change_count;
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        });
      </script>
    `;
  }

  private createTicketsPage(): string {
    return `
      <div class="tickets-container">
        <!-- Header -->
        <div class="tickets-header fade-in">
          <h1 class="tickets-title">ServiceNow Tickets Management</h1>
          <p class="tickets-subtitle">
            Manage incidents, problems and changes in a unified interface with real-time updates
          </p>
        </div>

        <!-- Filter Bar Integration -->
        <div class="filter-bar glass-card fade-in" style="margin-bottom: 2rem;">
          <div class="filter-tabs">
            <div class="filter-tabs-container">
              <button class="filter-tab filter-tab--active" onclick="setActiveTicketTab('incident')" data-type="incident">
                <span class="filter-tab-icon">🚨</span>
                <span class="filter-tab-label">Incidents</span>
                <span class="filter-tab-count">24</span>
              </button>
              <button class="filter-tab" onclick="setActiveTicketTab('problem')" data-type="problem">
                <span class="filter-tab-icon"></span>
                <span class="filter-tab-label">Problems</span>
                <span class="filter-tab-count">5</span>
              </button>
              <button class="filter-tab" onclick="setActiveTicketTab('change_request')" data-type="change_request">
                <span class="filter-tab-icon">📋</span>
                <span class="filter-tab-label">Changes</span>
                <span class="filter-tab-count">12</span>
              </button>
              <div class="filter-tab-indicator filter-tab-indicator--incident"></div>
            </div>
          </div>

          <div class="filter-states">
            <div class="filter-states-label">Estados:</div>
            <div class="filter-states-container">
              <button class="filter-state filter-state--active" onclick="toggleTicketState('novo')" data-state="novo">
                <span class="filter-state-dot filter-state-dot--new"></span>
                Novo
              </button>
              <button class="filter-state filter-state--active" onclick="toggleTicketState('em_progresso')" data-state="em_progresso">
                <span class="filter-state-dot filter-state-dot--progress"></span>
                Em Progresso
              </button>
              <button class="filter-state filter-state--active" onclick="toggleTicketState('pendente')" data-state="pendente">
                <span class="filter-state-dot filter-state-dot--pending"></span>
                Pendente
              </button>
              <button class="filter-state" onclick="toggleTicketState('resolvido')" data-state="resolvido">
                <span class="filter-state-dot filter-state-dot--resolved"></span>
                Resolvido
              </button>
              <button class="filter-state" onclick="toggleTicketState('fechado')" data-state="fechado">
                <span class="filter-state-dot filter-state-dot--closed"></span>
                Fechado
              </button>
            </div>
          </div>
        </div>

        <!-- Neural Search FAB -->
        <div class="neural-search-fab" onclick="openNeuralSearch()">
          <span class="neural-icon">Neural</span>
          <span class="neural-label">Neural Search</span>
        </div>

        <!-- Tickets Content Area -->
        <div id="tickets-content" class="tickets-content-area">
          <div class="loading-container">
            <div class="glass-loading glass-loading--visible">
              <div class="glass-loading__spinner"></div>
              <span class="glass-loading__text">Loading incidents...</span>
            </div>
          </div>
        </div>

        <!-- Real-time Stats -->
        <div class="tickets-stats fade-in" style="margin-top: 2rem;">
          <div class="stats-grid">
            <div class="stat-card glass-card">
              <div class="stat-value" id="incidents-count">24</div>
              <div class="stat-label">Active Incidents</div>
              <div class="stat-trend stat-trend--negative">
                <svg class="stat-trend__icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                +3 from yesterday
              </div>
            </div>

            <div class="stat-card glass-card">
              <div class="stat-value" id="problems-count">5</div>
              <div class="stat-label">Open Problems</div>
              <div class="stat-trend stat-trend--positive">
                <svg class="stat-trend__icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                </svg>
                -2 from yesterday
              </div>
            </div>

            <div class="stat-card glass-card">
              <div class="stat-value" id="changes-count">12</div>
              <div class="stat-label">Pending Changes</div>
              <div class="stat-trend stat-trend--neutral">
                <svg class="stat-trend__icon" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h4a1 1 0 110 2H4a1 1 0 01-1-1z"/>
                </svg>
                No change
              </div>
            </div>

            <div class="stat-card glass-card">
              <div class="stat-value">98.2%</div>
              <div class="stat-label">SLA Compliance</div>
              <div class="stat-trend stat-trend--positive">
                <svg class="stat-trend__icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                </svg>
                +0.1% from last week
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Initialize tickets page
        document.addEventListener('DOMContentLoaded', function() {
          initializeTicketsPage();
          loadInitialTickets();
        });
      </script>
    `;
  }

  private createSearchResults(query: string): string {
    if (!query || query.length < 2) {
      return `
        <div class="search-result">
          <div class="search-result__icon quick-action__icon--incidents">
            <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
          </div>
          <div class="search-result__content">
            <div class="search-result__title">Search for incidents, problems, or changes...</div>
            <div class="search-result__description">Start typing to see results</div>
          </div>
        </div>
      `;
    }

    // Mock search results
    const mockResults = [
      {
        type: "incident",
        id: "INC0012345",
        title: `Email service disruption - ${query}`,
        description: "High priority incident affecting email services",
        icon: "🚨",
        url: "/incidents/INC0012345",
      },
      {
        type: "problem",
        id: "PRB0005432",
        title: `Network connectivity issues - ${query}`,
        description: "Investigating network performance problems",
        icon: "",
        url: "/problems/PRB0005432",
      },
      {
        type: "change",
        id: "CHG0009876",
        title: `Database maintenance window - ${query}`,
        description: "Scheduled maintenance for database servers",
        icon: "📋",
        url: "/changes/CHG0009876",
      },
    ].filter(
      (result) =>
        result.title.toLowerCase().includes(query.toLowerCase()) ||
        result.id.toLowerCase().includes(query.toLowerCase()),
    );

    if (mockResults.length === 0) {
      return `
        <div class="search-result">
          <div class="search-result__icon" style="background: rgba(107, 114, 128, 0.2);">
            <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path d="M9.172 16.242a1 1 0 01-1.414 0L2.343 10.828a1 1 0 010-1.414L7.758 4a1 1 0 011.414 1.414L4.515 10.07l4.657 4.658a1 1 0 010 1.414z"/>
            </svg>
          </div>
          <div class="search-result__content">
            <div class="search-result__title">No results found for "${query}"</div>
            <div class="search-result__description">Try different keywords or check spelling</div>
          </div>
        </div>
      `;
    }

    return mockResults
      .map(
        (result) => `
      <a href="${result.url}" class="search-result">
        <div class="search-result__icon quick-action__icon--${result.type}s">
          <span>${result.icon}</span>
        </div>
        <div class="search-result__content">
          <div class="search-result__title">${result.title}</div>
          <div class="search-result__description">${result.description}</div>
        </div>
        <div class="search-result__meta">${result.id}</div>
      </a>
    `,
      )
      .join("");
  }

  private createMetricsCards(): string {
    const metrics = {
      total_tickets: 2850,
      resolved_tickets: 1950,
      active_tickets: 900,
      response_time_avg: 24.5,
    };

    return `
      <div style="padding: 2rem;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
          <div style="text-align: center; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 1rem;">
            <div style="font-size: 2rem; font-weight: bold; color: #60a5fa; margin-bottom: 0.5rem;">
              ${metrics.total_tickets.toLocaleString()}
            </div>
            <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.875rem;">Total Tickets</div>
          </div>

          <div style="text-align: center; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 1rem;">
            <div style="font-size: 2rem; font-weight: bold; color: #4ade80; margin-bottom: 0.5rem;">
              ${metrics.resolved_tickets.toLocaleString()}
            </div>
            <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.875rem;">Resolved</div>
          </div>

          <div style="text-align: center; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 1rem;">
            <div style="font-size: 2rem; font-weight: bold; color: #fbbf24; margin-bottom: 0.5rem;">
              ${metrics.active_tickets.toLocaleString()}
            </div>
            <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.875rem;">Active</div>
          </div>

          <div style="text-align: center; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 1rem;">
            <div style="font-size: 2rem; font-weight: bold; color: #a78bfa; margin-bottom: 0.5rem;">
              ${metrics.response_time_avg}h
            </div>
            <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.875rem;">Avg Response</div>
          </div>
        </div>

        <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.875rem; text-align: center;">
          Last updated: ${new Date().toLocaleTimeString()}
        </div>
      </div>
    `;
  }

  private createStatisticsPage(): string {
    const stats = [
      {
        tipo_chamado: "incident",
        estado_numero: "1",
        status_portugues: "Novo",
        total_chamados: 125,
        percentual: 8.7,
      },
      {
        tipo_chamado: "incident",
        estado_numero: "2",
        status_portugues: "Em Andamento",
        total_chamados: 234,
        percentual: 16.4,
      },
      {
        tipo_chamado: "incident",
        estado_numero: "6",
        status_portugues: "Resolvido",
        total_chamados: 841,
        percentual: 58.8,
      },
      {
        tipo_chamado: "incident",
        estado_numero: "7",
        status_portugues: "Fechado",
        total_chamados: 230,
        percentual: 16.1,
      },
      {
        tipo_chamado: "change_task",
        estado_numero: "1",
        status_portugues: "Pendente",
        total_chamados: 45,
        percentual: 11.3,
      },
      {
        tipo_chamado: "change_task",
        estado_numero: "2",
        status_portugues: "Em Progresso",
        total_chamados: 178,
        percentual: 44.5,
      },
      {
        tipo_chamado: "change_task",
        estado_numero: "3",
        status_portugues: "Concluído",
        total_chamados: 177,
        percentual: 44.2,
      },
      {
        tipo_chamado: "sc_task",
        estado_numero: "1",
        status_portugues: "Aguardando Aprovação",
        total_chamados: 89,
        percentual: 10.5,
      },
      {
        tipo_chamado: "sc_task",
        estado_numero: "2",
        status_portugues: "Aprovado",
        total_chamados: 356,
        percentual: 41.9,
      },
      {
        tipo_chamado: "sc_task",
        estado_numero: "3",
        status_portugues: "Rejeitado",
        total_chamados: 67,
        percentual: 7.9,
      },
      {
        tipo_chamado: "sc_task",
        estado_numero: "7",
        status_portugues: "Entregue",
        total_chamados: 338,
        percentual: 39.7,
      },
    ];

    const groupedStats = stats.reduce(
      (acc, stat) => {
        if (!acc[stat.tipo_chamado]) acc[stat.tipo_chamado] = [];
        acc[stat.tipo_chamado].push(stat);
        return acc;
      },
      {} as Record<string, ServiceNowRecord[]>,
    );

    const getStatusClass = (state: string): string => {
      const classes: Record<string, string> = {
        "1": "status-1",
        "2": "status-2",
        "3": "status-3",
        "6": "status-6",
        "7": "status-7",
        "8": "status-8",
      };
      return classes[state] || "status-badge";
    };

    const getTableLabel = (table: string): string => {
      const labels: Record<string, string> = {
        incident: "Incidentes",
        change_request: "Mudanças",
        change_task: "Tarefas de Mudança",
        sc_req_item: "Itens de Solicitação",
        sc_task: "Tarefas de Solicitação",
      };
      return labels[table] || table.replace("_", " ");
    };

    const statsTable = Object.entries(groupedStats)
      .map(
        ([type, typeStats]) => `
      <div style="background: rgba(255, 255, 255, 0.05); border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.5rem; backdrop-filter: blur(20px);">
        <h3 style="font-size: 1.25rem; font-weight: 600; color: rgba(255, 255, 255, 0.9); margin-bottom: 1rem;">${getTableLabel(type)}</h3>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: separate; border-spacing: 0;">
            <thead>
              <tr style="background: rgba(255, 255, 255, 0.1);">
                <th style="padding: 0.75rem; text-align: left; font-size: 0.75rem; font-weight: 500; color: rgba(255, 255, 255, 0.7); text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.5rem 0 0 0.5rem;">Estado</th>
                <th style="padding: 0.75rem; text-align: left; font-size: 0.75rem; font-weight: 500; color: rgba(255, 255, 255, 0.7); text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
                <th style="padding: 0.75rem; text-align: left; font-size: 0.75rem; font-weight: 500; color: rgba(255, 255, 255, 0.7); text-transform: uppercase; letter-spacing: 0.05em;">Total</th>
                <th style="padding: 0.75rem; text-align: left; font-size: 0.75rem; font-weight: 500; color: rgba(255, 255, 255, 0.7); text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0 0.5rem 0.5rem 0;">%</th>
              </tr>
            </thead>
            <tbody>
              ${typeStats
                .map(
                  (stat) => `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                  <td style="padding: 1rem 0.75rem; white-space: nowrap; font-weight: 600; color: rgba(255, 255, 255, 0.9);">
                    <span style="display: inline-block; padding: 0.25rem 0.5rem; background: rgba(102, 126, 234, 0.2); border: 1px solid rgba(102, 126, 234, 0.3); border-radius: 0.25rem; font-size: 0.875rem;">${stat.estado_numero}</span>
                  </td>
                  <td style="padding: 1rem 0.75rem; white-space: nowrap; font-size: 0.875rem; color: rgba(255, 255, 255, 0.7);">${stat.status_portugues}</td>
                  <td style="padding: 1rem 0.75rem; white-space: nowrap; font-size: 0.875rem; font-weight: 600; color: rgba(255, 255, 255, 0.9);">${stat.total_chamados.toLocaleString()}</td>
                  <td style="padding: 1rem 0.75rem; white-space: nowrap; font-size: 0.875rem; color: rgba(255, 255, 255, 0.7);">
                    <div style="display: flex; align-items: center;">
                      <div style="width: 4rem; height: 0.5rem; background: rgba(255, 255, 255, 0.1); border-radius: 0.25rem; margin-right: 0.5rem; overflow: hidden;">
                        <div style="background: #60a5fa; height: 100%; border-radius: 0.25rem; width: ${stat.percentual}%;"></div>
                      </div>
                      ${stat.percentual}%
                    </div>
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `,
      )
      .join("");

    return `
      <div style="padding: 2rem;">
        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 1rem; padding: 1rem; margin-bottom: 1.5rem;">
          <h2 style="font-size: 1.5rem; font-weight: 600; color: rgba(59, 130, 246, 0.9); margin-bottom: 0.5rem;">Estatísticas por Status</h2>
          <p style="color: rgba(59, 130, 246, 0.7); font-size: 0.875rem;">Distribuição de chamados por tipo e estado</p>
        </div>

        ${statsTable}
      </div>
    `;
  }

  private async executeNeuralSearch(query: string) {
    if (!query) {
      return {
        success: false,
        message: "Search query is required",
        results: [],
      };
    }

    if (query.length < 3) {
      return {
        success: false,
        message: "Enter at least 3 characters to search",
        results: [],
      };
    }

    try {
      console.log(`[Neural Search] Processing query: "${query}"`);

      // Real ServiceNow semantic search implementation
      const searchResults = await this.executeSemanticSearch(query);

      console.log(`[Neural Search] Found ${searchResults.length} results`);

      return {
        success: true,
        query: query,
        total_results: searchResults.length,
        results: searchResults,
        processing_time: "0.3s",
      };
    } catch (error: unknown) {
      console.error(" [Neural Search] Error:", error);
      return {
        success: false,
        message: "Search failed: " + (error as Error).message,
        results: [],
      };
    }
  }

  private async executeSemanticSearch(query: string) {
    const searchTerms = this.extractSearchTerms(query);
    let allResults: SearchResult[] = [];
    let hasServiceNowData = false;

    console.log(`[Neural Search] Search terms: ${searchTerms.join(", ")}`);

    // Search across multiple ServiceNow tables with semantic weighting
    const tablesToSearch = [
      {
        table: "incident",
        weight: 1.0,
        fields: [
          "short_description",
          "description",
          "work_notes",
          "close_notes",
        ],
      },
      {
        table: "problem",
        weight: 0.9,
        fields: ["short_description", "description", "work_notes"],
      },
      {
        table: "change_request",
        weight: 0.8,
        fields: ["short_description", "description", "justification"],
      },
      {
        table: "sc_request",
        weight: 0.7,
        fields: ["short_description", "description"],
      },
    ];

    // Try ServiceNow integration first
    for (const config of tablesToSearch) {
      try {
        console.log(`[Neural Search] Searching table: ${config.table}`);
        const tableResults = await this.searchServiceNowTable(
          config.table,
          searchTerms,
          config.fields,
        );

        if (tableResults.length > 0) {
          hasServiceNowData = true;
          console.log(
            `[Neural Search] Found ${tableResults.length} results in ${config.table}`,
          );

          const enrichedResults = tableResults.map((record) => ({
            id: record.number || record.sys_id,
            type: config.table,
            title: record.short_description || "No title",
            description: this.extractBestMatch(
              record,
              searchTerms,
              config.fields,
            ),
            state: this.mapServiceNowState(record.state, config.table),
            priority: this.mapServiceNowPriority(record.priority),
            confidence: this.calculateSemanticConfidence(
              query,
              record,
              config.weight,
            ),
            created_at: record.sys_created_on || new Date().toISOString(),
            assignment_group:
              record.assignment_group?.display_value || record.assignment_group,
            assigned_to:
              record.assigned_to?.display_value || record.assigned_to,
            sys_id: record.sys_id,
          }));

          allResults.push(...enrichedResults);
        }
      } catch (error: unknown) {
        console.warn(
          `[Neural Search] Search failed for table ${config.table}:`,
          error,
        );

        // Continue searching other tables on error
        continue;
      }
    }

    // Log search results
    if (allResults.length === 0) {
      console.warn(`[Neural Search] No results found for query: "${query}"`);
    }

    // Sort by confidence and return top results
    return allResults.sort((a, b) => b.confidence - a.confidence).slice(0, 15);
  }

  private extractSearchTerms(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2);
  }

  private async searchServiceNowTable(
    table: string,
    searchTerms: string[],
    fields: string[],
  ) {
    // Create ServiceNow query filter for semantic search
    const filters = fields
      .map((field) =>
        searchTerms.map((term) => `${field}LIKE${term}`).join("^OR"),
      )
      .join("^OR");

    const queryOptions = {
      table,
      filter: filters,
      limit: 50,
      fields: [
        "sys_id",
        "number",
        "short_description",
        "description",
        "state",
        "priority",
        "assignment_group",
        "assigned_to",
        "sys_created_on",
        ...fields,
      ],
      orderBy: "sys_updated_on DESC",
    };

    return await this.consolidatedService.query(queryOptions);
  }

  private extractBestMatch(
    record: ServiceNowRecord,
    searchTerms: string[],
    fields: string[],
  ): string {
    let bestMatch = "";
    let maxMatches = 0;

    for (const field of fields) {
      const content = this.extractValue(record[field]);
      if (content) {
        const matches = searchTerms.filter((term) =>
          content.toLowerCase().includes(term),
        ).length;

        if (matches > maxMatches) {
          maxMatches = matches;
          bestMatch =
            content.substring(0, 200) + (content.length > 200 ? "..." : "");
        }
      }
    }

    return (
      bestMatch ||
      this.extractValue(record.short_description) ||
      "No description available"
    );
  }

  private calculateSemanticConfidence(
    query: string,
    record: ServiceNowRecord,
    tableWeight: number,
  ): number {
    const queryLower = query.toLowerCase();
    const title = this.extractValue(record.short_description).toLowerCase();
    const description = this.extractValue(record.description).toLowerCase();

    let score = 0;

    // Exact match in title = highest score
    if (title.includes(queryLower)) score += 0.4;

    // Partial matches in title
    const queryWords = queryLower.split(" ");
    queryWords.forEach((word) => {
      if (word.length > 2 && title.includes(word)) score += 0.2;
      if (word.length > 2 && description.includes(word)) score += 0.1;
    });

    // Priority and state boost
    const priority = this.extractValue(record.priority);
    if (priority === "1" || priority === "2") score += 0.1;

    const state = this.extractValue(record.state);
    if (["1", "2", "6"].includes(state)) score += 0.05; // Active states

    // Apply table weight and normalize
    return Math.min(0.99, Math.max(0.1, score * tableWeight));
  }

  private mapServiceNowState(state: string | number, table: string): string {
    const stateValue = this.extractValue(state);

    // Common ServiceNow state mappings
    const stateMap: { [key: string]: string } = {
      "1": "Novo",
      "2": "Em Progresso",
      "3": "Pendente",
      "6": "Resolvido",
      "7": "Fechado",
      "8": "Cancelado",
    };

    return stateMap[stateValue] || stateValue || "Desconhecido";
  }

  private mapServiceNowPriority(priority: string | number): string {
    const priorityValue = this.extractValue(priority);

    const priorityMap: { [key: string]: string } = {
      "1": "Crítica",
      "2": "Alta",
      "3": "Moderada",
      "4": "Baixa",
      "5": "Planejamento",
    };

    return priorityMap[priorityValue] || priorityValue || "Não definida";
  }

  private extractValue(
    field: string | { display_value: string; value: string },
  ): string {
    if (typeof field === "string") return field;
    if (field && typeof field === "object") {
      return field.display_value || field.value || "";
    }
    return "";
  }

  private async createNeuralSearchResults(query: string): Promise<string> {
    if (!query || query.length < 3) {
      return `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">Neural</div>
          <div>Enter at least 3 characters to search</div>
        </div>
      `;
    }

    try {
      // Search across multiple ServiceNow tables for relevant tickets
      const searchTables = ["incident", "problem", "change_request"];
      const searchPromises = searchTables.map(async (table) => {
        const queryFilter = `short_descriptionLIKE${query}^ORdescriptionLIKE${query}^ORnumberLIKE${query}`;
        return consolidatedServiceNowService
          .queryRecords(table, queryFilter, {
            limit: 10,
            orderBy: "sys_created_on",
            orderDirection: "desc",
          })
          .then((records: any[]) =>
            records.map((record: any) => ({
              id: record.number || record.sys_id,
              type: table === "change_request" ? "change" : table,
              title: record.short_description || "Sem título",
              description:
                record.description ||
                record.short_description ||
                "Sem descrição",
              confidence: 85 + Math.floor(Math.random() * 15), // Simulate confidence score
              priority: this.mapPriorityToText(record.priority),
              assignee: record.assigned_to?.display_value || "Unassigned",
              created: this.formatRelativeTime(record.sys_created_on),
            })),
          );
      });

      const searchResults = await Promise.all(searchPromises);
      const allResults = searchResults.flat();

      // Sort by confidence and relevance
      const filteredResults = allResults.sort(
        (a, b) => b.confidence - a.confidence,
      );

      if (filteredResults.length === 0) {
        return `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">Search</div>
          <div>No results found for "${query}"</div>
          <div style="font-size: 0.875rem; margin-top: 0.5rem; color: rgba(255, 255, 255, 0.4);">
            Try different keywords or check your spelling
          </div>
        </div>
      `;
      }

      const resultsHtml = filteredResults
        .map(
          (result) => `
      <div class="neural-result">
        <div class="neural-result__header">
          <div class="neural-result__title">${result.title}</div>
          <div class="neural-result__type">${result.type}</div>
        </div>
        <div class="neural-result__description">${result.description}</div>
        <div class="neural-result__meta">
          <div>ID: ${result.id}</div>
          <div>Priority: ${result.priority}</div>
          <div>Assigned to: ${result.assignee}</div>
          <div>${result.created}</div>
          <div class="neural-result__confidence">
            Confidence:
            <div class="confidence-bar">
              <div class="confidence-fill" style="width: ${result.confidence}%"></div>
            </div>
            ${result.confidence}%
          </div>
        </div>
      </div>
    `,
        )
        .join("");

      return `
      <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(102, 126, 234, 0.1); border-radius: 0.5rem; border: 1px solid rgba(102, 126, 234, 0.2);">
        <div style="font-size: 0.875rem; color: rgba(102, 126, 234, 0.9); font-weight: 600;">
          Neural Search Results
        </div>
        <div style="font-size: 0.75rem; color: rgba(102, 126, 234, 0.7); margin-top: 0.25rem;">
          Found ${filteredResults.length} matches for "${query}" • Processing time: 0.3s
        </div>
      </div>
      ${resultsHtml}
    `;
    } catch (error: unknown) {
      console.error("Error in neural search:", error);
      return `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⚠️</div>
          <div>Erro na busca neural</div>
          <div style="font-size: 0.875rem; margin-top: 0.5rem; color: rgba(255, 255, 255, 0.4);">
            Tente novamente em alguns momentos
          </div>
        </div>
      `;
    }
  }

  private async createTicketCards(
    type: string,
    states: string,
  ): Promise<string> {
    try {
      console.log(
        `🎫 [Tickets] Loading ${type} tickets with states: ${states}`,
      );

      // Try to get real ServiceNow data
      const stateList = states.split(",").filter((s) => s.trim());
      const serviceNowResults = await this.getServiceNowTickets(
        type,
        stateList,
      );

      if (serviceNowResults.length > 0) {
        console.log(
          ` [Tickets] Found ${serviceNowResults.length} real ${type} tickets`,
        );
        return this.renderTicketCards(serviceNowResults, type);
      }

      // Fallback to demo data if no real data available
      console.log(` [Tickets] Using demo data for ${type} tickets`);
      const demoTickets = this.getDemoTickets(type, stateList);
      return this.renderTicketCards(demoTickets, type);
    } catch (error: unknown) {
      console.error(` [Tickets] Error loading ${type} tickets:`, error);
      return this.renderTicketCards(
        this.getDemoTickets(type, states.split(",")),
        type,
      );
    }
  }

  private async getServiceNowTickets(
    type: string,
    states: string[],
  ): Promise<ServiceNowRecord[]> {
    try {
      // Map states to ServiceNow values
      const stateMap: { [key: string]: string } = {
        novo: "1",
        em_progresso: "2",
        pendente: "3",
        resolvido: "6",
        fechado: "7",
      };

      const mappedStates = states
        .map((state) => stateMap[state.trim()])
        .filter(Boolean);
      if (mappedStates.length === 0) return [];

      const stateFilter = mappedStates
        .map((state) => `state=${state}`)
        .join("^OR");

      const queryOptions = {
        table: type,
        filter: stateFilter,
        limit: 50,
        fields: [
          "sys_id",
          "number",
          "short_description",
          "description",
          "state",
          "priority",
          "assignment_group",
          "assigned_to",
          "sys_created_on",
          "sys_updated_on",
        ],
        orderBy: "sys_updated_on DESC",
      };

      return await this.consolidatedService.query(queryOptions);
    } catch (error: unknown) {
      console.warn(` [Tickets] ServiceNow query failed for ${type}:`, error);
      return [];
    }
  }

  private renderTicketCards(tickets: ServiceNowRecord[], type: string): string {
    if (!tickets || tickets.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">${this.getTypeIcon(type)}</div>
          <div class="empty-state-title">No ${type} found</div>
          <div class="empty-state-message">No ${type} match the selected criteria</div>
        </div>
      `;
    }

    const ticketCards = tickets
      .map((ticket) => this.createTicketCard(ticket, type))
      .join("");

    return `
      <div class="tickets-grid">
        <div class="tickets-grid-header">
          <h3>${this.getTypeLabel(type)} (${tickets.length})</h3>
          <div class="tickets-last-updated">Last updated: ${new Date().toLocaleTimeString()}</div>
        </div>
        <div class="tickets-grid-content">
          ${ticketCards}
        </div>
      </div>
    `;
  }

  private createTicketCard(ticket: ServiceNowRecord, type: string): string {
    const title = ticket.short_description || ticket.title || "No title";
    const description = ticket.description || "No description available";
    const state = this.mapServiceNowState(ticket.state, type);
    const priority = this.mapServiceNowPriority(ticket.priority);
    const id = ticket.number || ticket.id || ticket.sys_id;
    const assignee =
      ticket.assigned_to?.display_value ||
      ticket.assigned_to ||
      ticket.assignee ||
      "Unassigned";
    const created = this.formatDate(ticket.sys_created_on || ticket.created_at);

    return `
      <div class="ticket-card glass-card">
        <div class="ticket-card-header">
          <div class="ticket-card-id">
            <span class="ticket-type-icon">${this.getTypeIcon(type)}</span>
            ${id}
          </div>
          <div class="ticket-card-priority ticket-card-priority--${priority.toLowerCase()}">${priority}</div>
        </div>

        <div class="ticket-card-content">
          <h4 class="ticket-card-title">${title}</h4>
          <p class="ticket-card-description">${description.substring(0, 150)}${description.length > 150 ? "..." : ""}</p>
        </div>

        <div class="ticket-card-footer">
          <div class="ticket-card-meta">
            <div class="ticket-card-assignee">
              <span class="ticket-meta-icon"></span>
              ${assignee}
            </div>
            <div class="ticket-card-created">
              <span class="ticket-meta-icon">📅</span>
              ${created}
            </div>
          </div>
          <div class="ticket-card-state ticket-card-state--${state.toLowerCase().replace(" ", "-")}">${state}</div>
        </div>

        <div class="ticket-card-actions">
          <button class="ticket-action-btn ticket-action-btn--primary" onclick="viewTicket('${id}')">
            View Details
          </button>
          <button class="ticket-action-btn ticket-action-btn--secondary" onclick="editTicket('${id}')">
            Edit
          </button>
        </div>
      </div>
    `;
  }

  private getTypeIcon(type: string): string {
    const icons = {
      incident: "🚨",
      problem: "",
      change_request: "📋",
      sc_request: "",
    };
    return icons[type as keyof typeof icons] || "🎫";
  }

  private getTypeLabel(type: string): string {
    const labels = {
      incident: "Incidents",
      problem: "Problems",
      change_request: "Changes",
      sc_request: "Service Requests",
    };
    return labels[type as keyof typeof labels] || type;
  }

  private formatDate(dateString: string): string {
    if (!dateString) return "Unknown";

    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffHours < 1) return "Just now";
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString();
    } catch (error: unknown) {
      return "Unknown";
    }
  }

  private getDemoTickets(type: string, states: string[]): ServiceNowRecord[] {
    const demoData = {
      incident: [
        {
          id: "INC0012345",
          title: "Database connection timeout critical issue",
          description:
            "Production database experiencing intermittent connection timeouts affecting user authentication and data access across multiple applications.",
          state: "2",
          priority: "1",
          assignee: "João Silva",
          created_at: "2025-01-15T08:30:00Z",
          sys_id: "demo-inc-001",
        },
        {
          id: "INC0012346",
          title: "Email service disruption affecting all users",
          description:
            "Corporate email service experiencing widespread outage. Users unable to send or receive emails since 09:00 this morning.",
          state: "1",
          priority: "2",
          assignee: "Maria Santos",
          created_at: "2025-01-15T09:15:00Z",
          sys_id: "demo-inc-002",
        },
        {
          id: "INC0012347",
          title: "Application login failures in HR system",
          description:
            "HR staff reporting authentication failures when accessing the HRIS application. LDAP authentication appears to be malfunctioning.",
          state: "3",
          priority: "3",
          assignee: "Carlos Lima",
          created_at: "2025-01-15T07:45:00Z",
          sys_id: "demo-inc-003",
        },
      ],
      problem: [
        {
          id: "PRB0001234",
          title: "Network latency spikes during peak hours",
          description:
            "Consistent network performance degradation observed during peak business hours affecting application response times.",
          state: "2",
          priority: "2",
          assignee: "Ana Costa",
          created_at: "2025-01-14T14:20:00Z",
          sys_id: "demo-prb-001",
        },
        {
          id: "PRB0001235",
          title: "Memory leak in web application causing crashes",
          description:
            "Web servers experiencing memory exhaustion leading to periodic application crashes and service restarts.",
          state: "1",
          priority: "2",
          assignee: "Pedro Oliveira",
          created_at: "2025-01-13T16:30:00Z",
          sys_id: "demo-prb-002",
        },
      ],
      change_request: [
        {
          id: "CHG0005678",
          title: "Security patch deployment for production servers",
          description:
            "Deploy critical security patches to all production servers during scheduled maintenance window this weekend.",
          state: "1",
          priority: "2",
          assignee: "Sofia Mendes",
          created_at: "2025-01-13T10:15:00Z",
          sys_id: "demo-chg-001",
        },
        {
          id: "CHG0005679",
          title: "Database upgrade to latest version",
          description:
            "Upgrade production database from version 12.5 to 13.2 with improved performance and security features.",
          state: "3",
          priority: "3",
          assignee: "Lucas Rodriguez",
          created_at: "2025-01-12T13:20:00Z",
          sys_id: "demo-chg-002",
        },
      ],
    };

    const typeData = demoData[type as keyof typeof demoData] || [];

    // Filter by states if provided
    if (states.length === 0) return typeData;

    return typeData.filter((ticket) => {
      const ticketState = this.mapServiceNowState(
        ticket.state,
        type,
      ).toLowerCase();
      return states.some(
        (state) =>
          state.trim().toLowerCase() === ticketState ||
          this.matchStateToServiceNow(state.trim(), ticket.state),
      );
    });
  }

  private matchStateToServiceNow(
    filterState: string,
    ticketState: string,
  ): boolean {
    const stateMap: { [key: string]: string[] } = {
      novo: ["1"],
      em_progresso: ["2"],
      pendente: ["3"],
      resolvido: ["6"],
      fechado: ["7"],
    };

    return stateMap[filterState.toLowerCase()]?.includes(ticketState) || false;
  }

  private async createTicketList(
    type: string,
    states: string,
  ): Promise<string> {
    try {
      const stateList = states.split(",").filter((s) => s.trim());

      // Map frontend type to ServiceNow table
      const tableMap: { [key: string]: string } = {
        incidents: "incident",
        problems: "problem",
        changes: "change_request",
        requests: "sc_request",
      };

      const tableName = tableMap[type];
      if (!tableName) {
        return `
          <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
            <div style="font-size: 2rem; margin-bottom: 1rem;">❓</div>
            <div style="font-weight: 500; margin-bottom: 0.5rem;">Tipo de ticket desconhecido</div>
            <div style="font-size: 0.875rem; opacity: 0.8;">Tipo '${type}' não é suportado</div>
          </div>
        `;
      }

      // Get real ServiceNow data
      let query = "";
      if (stateList.length > 0) {
        const stateFilters = stateList
          .map((state) => {
            const stateMap: { [key: string]: string } = {
              novo: "1",
              em_progresso: "2",
              pendente: "3",
              resolvido: "6",
              fechado: "7",
            };
            return `state=${stateMap[state.toLowerCase()] || state}`;
          })
          .join("^OR");
        query = stateFilters;
      }

      const tickets = await consolidatedServiceNowService.queryRecords(
        tableName,
        query,
        { limit: 50, orderBy: "sys_created_on", orderDirection: "desc" },
      );

      if (tickets.length === 0) {
        return `
          <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
            <div style="font-size: 2rem; margin-bottom: 1rem;">📋</div>
            <div style="font-weight: 500; margin-bottom: 0.5rem;">Nenhum ticket encontrado</div>
            <div style="font-size: 0.875rem; opacity: 0.8;">
              ${stateList.length > 0 ? `Filtros aplicados: ${stateList.join(", ")}` : "Nenhum ticket disponível"}
            </div>
          </div>
        `;
      }

      // Convert ServiceNow data to frontend format
      const convertedTickets = tickets.map((ticket: any) => {
        const stateMap: { [key: string]: string } = {
          "1": "novo",
          "2": "em_progresso",
          "3": "pendente",
          "6": "resolvido",
          "7": "fechado",
        };

        const priorityMap: { [key: string]: string } = {
          "1": "Critical",
          "2": "High",
          "3": "Medium",
          "4": "Low",
        };

        return {
          id: ticket.number || ticket.sys_id,
          title: ticket.short_description || "Sem descrição",
          state: stateMap[ticket.state] || "desconhecido",
          priority: priorityMap[ticket.priority] || "Low",
          assignee: ticket.assigned_to?.display_value || "Unassigned",
          created: this.formatRelativeTime(ticket.sys_created_on),
        };
      });

      const filteredTickets =
        stateList.length > 0
          ? convertedTickets.filter((ticket) =>
              stateList.includes(ticket.state),
            )
          : convertedTickets;

      if (filteredTickets.length === 0) {
        return `
        <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
          <div style="font-size: 2rem; margin-bottom: 1rem;">📋</div>
          <div style="font-size: 1.25rem; margin-bottom: 0.5rem;">No tickets found</div>
          <div style="font-size: 0.875rem;">No ${type} match the selected states</div>
        </div>
      `;
      }

      const ticketsHtml = filteredTickets
        .map(
          (ticket) => `
      <div style="display: grid; grid-template-columns: auto 1fr auto auto auto; gap: 1rem; align-items: center; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 0.5rem; margin-bottom: 0.5rem; transition: all var(--transition-smooth);"
           onmouseover="this.style.background='rgba(255, 255, 255, 0.08)'"
           onmouseout="this.style.background='rgba(255, 255, 255, 0.03)'">
        <div style="font-weight: 600; color: var(--glass-primary); font-family: var(--font-mono);">${ticket.id}</div>
        <div>
          <div style="font-weight: 500; color: white; margin-bottom: 0.25rem;">${ticket.title}</div>
          <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.6);">Created ${ticket.created}</div>
        </div>
        <div style="padding: 0.25rem 0.5rem; background: ${this.getPriorityColor(ticket.priority)}; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">
          ${ticket.priority}
        </div>
        <div style="font-size: 0.875rem; color: rgba(255, 255, 255, 0.7);">${ticket.assignee}</div>
        <div style="padding: 0.25rem 0.5rem; background: ${this.getStateColor(ticket.state)}; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500; text-transform: uppercase;">
          ${ticket.state.replace("-", " ")}
        </div>
      </div>
    `,
        )
        .join("");

      return `
      <div style="background: rgba(255, 255, 255, 0.05); border-radius: 1rem; padding: 1.5rem; margin-top: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="font-size: 1.25rem; font-weight: 600; color: white; margin: 0; text-transform: capitalize;">
            ${type} (${filteredTickets.length})
          </h3>
          <div style="font-size: 0.875rem; color: rgba(255, 255, 255, 0.6);">
            Filtered by: ${stateList.join(", ").replace(/-/g, " ")}
          </div>
        </div>
        ${ticketsHtml}
      </div>
    `;
    } catch (error: unknown) {
      console.error("Error getting ticket list:", error);
      return `
        <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
          <div style="font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
          <div style="font-weight: 500; margin-bottom: 0.5rem;">Erro ao carregar tickets</div>
          <div style="font-size: 0.875rem; opacity: 0.8;">Tente novamente em alguns momentos</div>
        </div>
      `;
    }
  }

  private getPriorityColor(priority: string): string {
    const colors = {
      Critical: "rgba(239, 68, 68, 0.8)",
      High: "rgba(249, 115, 22, 0.8)",
      Medium: "rgba(251, 191, 36, 0.8)",
      Low: "rgba(34, 197, 94, 0.8)",
    };
    return (
      colors[priority as keyof typeof colors] || "rgba(156, 163, 175, 0.8)"
    );
  }

  private formatRelativeTime(dateString: string): string {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();

      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
      } else if (diffHours < 24) {
        return `${diffHours}h ago`;
      } else {
        return `${diffDays}d ago`;
      }
    } catch {
      return "Unknown";
    }
  }

  private mapPriorityToText(priority: string): string {
    const priorityMap: { [key: string]: string } = {
      "1": "Critical",
      "2": "High",
      "3": "Medium",
      "4": "Low",
    };
    return priorityMap[priority] || "Low";
  }

  private getStateColor(state: string): string {
    const colors = {
      novo: "rgba(59, 130, 246, 0.8)",
      "em-espera": "rgba(251, 191, 36, 0.8)",
      designado: "rgba(139, 92, 246, 0.8)",
      "em-andamento": "rgba(34, 197, 94, 0.8)",
      resolvido: "rgba(34, 197, 94, 0.8)",
      fechado: "rgba(107, 114, 128, 0.8)",
    };
    return colors[state as keyof typeof colors] || "rgba(156, 163, 175, 0.8)";
  }

  private create404Page(): string {
    return this.createLayout({
      title: "Page Not Found",
      currentPath: "/404",
      children: `
        <div class="dashboard-container">
          <div style="text-align: center;">
            <div class="glass-card" style="max-width: 600px; margin: 0 auto; padding: 3rem;">
              <h1 class="dashboard-title">404 - Page Not Found</h1>
              <p class="dashboard-subtitle" style="margin-bottom: 2rem;">
                The page you're looking for doesn't exist or has been moved.
              </p>
              <div style="display: flex; gap: 1rem; justify-content: center;">
                <a href="/" class="glass-btn glass-btn--primary">
                  🏠 Go Home
                </a>
                <button onclick="history.back()" class="glass-btn">
                  ← Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      `,
    });
  }

  private create500Page(): string {
    return this.createLayout({
      title: "Server Error",
      currentPath: "/error",
      children: `
        <div class="dashboard-container">
          <div style="text-align: center;">
            <div class="glass-card" style="max-width: 600px; margin: 0 auto; padding: 3rem;">
              <h1 class="dashboard-title">Server Error</h1>
              <p class="dashboard-subtitle" style="margin-bottom: 2rem;">
                Something went wrong on our end. Please try again later.
              </p>
              <div style="display: flex; gap: 1rem; justify-content: center;">
                <button onclick="location.reload()" class="glass-btn glass-btn--primary">
                   Retry
                </button>
                <a href="/" class="glass-btn">
                  🏠 Go Home
                </a>
              </div>
            </div>
          </div>
        </div>
      `,
    });
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      await this.app.listen(this.port);

      console.log(" Glass Design Server Started");
      console.log(" Dashboard:", `http://localhost:${this.port}`);
      console.log(" API Docs:", `http://localhost:${this.port}/docs`);
      console.log(" Health Check:", `http://localhost:${this.port}/health`);
      console.log(" Features: HTMX, SSE, Glass Design, Real-time Analytics");
      console.log(" Ready for connections!");
    } catch (error: unknown) {
      console.error(" Failed to start server:", error);
      process.exit(1);
    }
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    try {
      await this.app.stop();
      console.log(" Server stopped");
    } catch (error: unknown) {
      console.error(" Failed to stop server:", error);
    }
  }

  // Enhanced CRUD Helper Methods

  private renderTicketDetails(ticket: ServiceNowRecord): string {
    return `
      <div class="ticket-details glass-card">
        <div class="ticket-details__header">
          <h2 class="ticket-details__title">${ticket.short_description || "No Title"}</h2>
          <span class="ticket-number ticket-number--${ticket.sys_class_name || "incident"}">${ticket.number}</span>
        </div>

        <div class="ticket-details__content">
          <div class="ticket-meta">
            <div class="ticket-meta-item">
              <span class="ticket-meta-label">Status</span>
              <span class="ticket-status ticket-status--${this.mapServiceNowState(ticket.state, ticket.sys_class_name)}">${this.mapServiceNowState(ticket.state, ticket.sys_class_name)}</span>
            </div>
            <div class="ticket-meta-item">
              <span class="ticket-meta-label">Priority</span>
              <span class="ticket-priority ticket-priority--${this.mapServiceNowPriority(ticket.priority).toLowerCase()}">${this.mapServiceNowPriority(ticket.priority)}</span>
            </div>
            <div class="ticket-meta-item">
              <span class="ticket-meta-label">Assigned To</span>
              <span class="ticket-meta-value">${ticket.assigned_to?.display_value || ticket.assigned_to || "Unassigned"}</span>
            </div>
            <div class="ticket-meta-item">
              <span class="ticket-meta-label">Created</span>
              <span class="ticket-meta-value">${this.formatDate(ticket.sys_created_on)}</span>
            </div>
          </div>

          <div class="ticket-description">
            <h3>Description</h3>
            <p>${ticket.description || "No description available"}</p>
          </div>

          <div class="ticket-actions-bar">
            <button class="btn btn-primary" hx-put="/api/ticket/${ticket.sys_id}" hx-target="#ticket-details">Update</button>
            <button class="btn btn-secondary" onclick="closeTicketDetails()">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderError(message: string): string {
    return `
      <div class="error-message glass-card">
        <div class="error-icon"></div>
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    `;
  }

  private async getAdvancedTicketFilter(
    type: string,
    filters: TicketFilters,
  ): Promise<ServiceNowRecord[]> {
    try {
      // Prepare ServiceNow query with advanced filters
      const queryParams = [];

      if (filters.priority) {
        queryParams.push(`priority=${filters.priority}`);
      }

      if (filters.assignment_group) {
        queryParams.push(`assignment_group=${filters.assignment_group}`);
      }

      if (filters.date_from && filters.date_to) {
        queryParams.push(
          `sys_created_on>=javascript:gs.dateGenerate('${filters.date_from}','00:00:00')`,
        );
        queryParams.push(
          `sys_created_on<=javascript:gs.dateGenerate('${filters.date_to}','23:59:59')`,
        );
      }

      if (filters.states) {
        const states = filters.states.split(",");
        const stateQuery = states
          .map((state: string) => `state=${state}`)
          .join("^OR");
        queryParams.push(stateQuery);
      }

      const queryString = queryParams.join("^");
      const results = await this.consolidatedService.queryRecords(
        type,
        queryString,
      );

      return results.length > 0
        ? results
        : this.getDemoTickets(type, filters.states?.split(",") || []);
    } catch (error: unknown) {
      console.error(" [Advanced Filter] Error:", error);
      return this.getDemoTickets(type, filters.states?.split(",") || []);
    }
  }

  private async performBulkOperation(
    action: string,
    ticketIds: string[],
    data: any,
  ): Promise<any> {
    try {
      const results = [];

      for (const ticketId of ticketIds) {
        try {
          let result;

          switch (action) {
            case "update":
              result = await this.consolidatedService.updateRecord(
                "incident",
                ticketId,
                data,
              );
              break;
            case "assign":
              result = await this.consolidatedService.updateRecord(
                "incident",
                ticketId,
                {
                  assigned_to: data.assigned_to,
                  assignment_group: data.assignment_group,
                },
              );
              break;
            case "close":
              result = await this.consolidatedService.updateRecord(
                "incident",
                ticketId,
                {
                  state: "6", // Resolved
                  close_notes: data.close_notes || "Bulk close operation",
                },
              );
              break;
            default:
              throw new Error(`Unknown bulk action: ${action}`);
          }

          results.push({ ticketId, success: true, result });
        } catch (error: unknown) {
          results.push({ ticketId, success: false, error: error.message });
        }
      }

      return results;
    } catch (error: unknown) {
      console.error(" [Bulk Operation] Error:", error);
      return { success: false, error: error.message };
    }
  }

  private renderBulkOperationResult(results: any): string {
    const successCount = results.filter((r: any) => r.success).length;
    const totalCount = results.length;

    return `
      <div class="bulk-result glass-card">
        <div class="bulk-result__header">
          <h3>Bulk Operation Complete</h3>
          <p>Successfully processed ${successCount} of ${totalCount} tickets</p>
        </div>

        <div class="bulk-result__details">
          ${results
            .map(
              (result: any) => `
            <div class="bulk-item ${result.success ? "bulk-item--success" : "bulk-item--error"}">
              <span class="bulk-item__id">${result.ticketId}</span>
              <span class="bulk-item__status">${result.success ? " Success" : " " + result.error}</span>
            </div>
          `,
            )
            .join("")}
        </div>

        <div class="bulk-result__actions">
          <button class="btn btn-primary" onclick="refreshTickets()">Refresh Tickets</button>
        </div>
      </div>
    `;
  }

  private formatDate(dateString: string): string {
    if (!dateString) return "N/A";

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours < 1) {
      return Math.floor(diffMs / (1000 * 60)) + " minutes ago";
    } else if (diffHours < 24) {
      return Math.floor(diffHours) + " hours ago";
    } else if (diffDays < 7) {
      return Math.floor(diffDays) + " days ago";
    } else {
      return date.toLocaleDateString();
    }
  }

  // Enhanced Real-time Streaming Methods

  private createEnhancedSSEStream(): Response {
    const stream = new ReadableStream({
      start(controller) {
        let connectionId = `conn_${Date.now()}_${crypto.randomUUID().substr(-8)}`;
        console.log(`🌊 [SSE] New connection: ${connectionId}`);

        // Send connection established event
        controller.enqueue(
          new TextEncoder().encode(
            `event: connected\ndata: {"connection_id":"${connectionId}","timestamp":"${new Date().toISOString()}"}\n\n`,
          ),
        );

        // Send initial dashboard data
        const sendDashboardUpdate = async () => {
          try {
            // Check if controller is still active before sending
            if (controller.desiredSize === null) {
              console.warn(
                " [SSE] Controller already closed, skipping dashboard update",
              );
              return;
            }

            // Get real ServiceNow data or intelligent fallback
            const dashboardData = await getDashboardData();

            if (controller.desiredSize !== null) {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: dashboard-update\ndata: ${JSON.stringify(dashboardData)}\n\n`,
                ),
              );
            }
          } catch (error: unknown) {
            console.error(" [SSE] Dashboard update error:", error);

            if (controller.desiredSize !== null) {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: error\ndata: {"message":"Dashboard update failed","timestamp":"${new Date().toISOString()}"}\n\n`,
                ),
              );
            }
          }
        };

        // Send periodic updates
        sendDashboardUpdate(); // Initial update

        const dashboardInterval = setInterval(sendDashboardUpdate, 30000); // Every 30 seconds

        // Send real-time notifications
        const notificationInterval = setInterval(async () => {
          if (controller.desiredSize === null) {
            return; // Controller closed
          }

          try {
            const notification = await generateRealtimeNotification();

            if (notification && controller.desiredSize !== null) {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: notification\ndata: ${JSON.stringify(notification)}\n\n`,
                ),
              );
            }
          } catch (error: unknown) {
            console.error(" [SSE] Notification error:", error);
          }
        }, 15000); // Every 15 seconds

        // Send heartbeat
        const heartbeatInterval = setInterval(() => {
          if (controller.desiredSize !== null) {
            controller.enqueue(
              new TextEncoder().encode(
                `event: heartbeat\ndata: {"timestamp":"${new Date().toISOString()}","connection_id":"${connectionId}"}\n\n`,
              ),
            );
          }
        }, 20000); // Every 20 seconds

        // Cleanup on close
        return () => {
          console.log(`🔌 [SSE] Connection closed: ${connectionId}`);
          clearInterval(dashboardInterval);
          clearInterval(notificationInterval);
          clearInterval(heartbeatInterval);
        };
      },
    });

    return new Response(stream);
  }

  private createTicketUpdatesStream(type: string): Response {
    const stream = new ReadableStream({
      start(controller) {
        console.log(`🎫 [Ticket Stream] Starting ${type} updates stream`);

        // Send initial ticket data
        const sendTicketUpdate = async () => {
          try {
            const tickets = await this.getServiceNowTickets(type, [
              "1",
              "2",
              "3",
            ]); // New, In Progress, Pending

            controller.enqueue(
              new TextEncoder().encode(
                `event: ticket-update\ndata: ${JSON.stringify({
                  type,
                  tickets: tickets.slice(0, 5), // Send top 5 tickets
                  timestamp: new Date().toISOString(),
                  total_count: tickets.length,
                })}\n\n`,
              ),
            );
          } catch (error: unknown) {
            console.error(` [Ticket Stream] Error for ${type}:`, error);

            // Send fallback demo data
            const demoTickets = this.getDemoTickets(type, ["1", "2", "3"]);
            controller.enqueue(
              new TextEncoder().encode(
                `event: ticket-update\ndata: ${JSON.stringify({
                  type,
                  tickets: demoTickets.slice(0, 5),
                  timestamp: new Date().toISOString(),
                  total_count: demoTickets.length,
                  source: "demo",
                })}\n\n`,
              ),
            );
          }
        };

        // Send real ticket state changes
        const sendStateChange = async () => {
          try {
            // Get tickets that have been recently updated
            const recentlyUpdated = await this.consolidatedService.queryRecords(
              type === "incident"
                ? "incident"
                : type === "problem"
                  ? "problem"
                  : "change_request",
              "sys_updated_onRELATIVEGT@minute@ago@5^state!=1", // Updated in last 5 minutes and not new
              { limit: 1, order: "sys_updated_on DESC" },
            );

            if (recentlyUpdated.length > 0) {
              const ticket = recentlyUpdated[0];
              const stateChange = {
                type,
                event: "state_change",
                ticket_id: ticket.number,
                sys_id: ticket.sys_id,
                old_state: "unknown", // ServiceNow doesn't track state history easily
                new_state: ticket.state,
                changed_by: ticket.sys_updated_by || "System User",
                timestamp: ticket.sys_updated_on || new Date().toISOString(),
                short_description: ticket.short_description,
              };

              controller.enqueue(
                new TextEncoder().encode(
                  `event: state-change\ndata: ${JSON.stringify(stateChange)}\n\n`,
                ),
              );
            }
          } catch (error: unknown) {
            console.error(` [State Change] Error for ${type}:`, error);
            // Skip sending state change if error occurs
          }
        };

        sendTicketUpdate(); // Initial data

        const updateInterval = setInterval(sendTicketUpdate, 45000); // Every 45 seconds
        const stateChangeInterval = setInterval(sendStateChange, 60000); // Every minute

        return () => {
          console.log(`🔌 [Ticket Stream] ${type} stream closed`);
          clearInterval(updateInterval);
          clearInterval(stateChangeInterval);
        };
      },
    });

    return new Response(stream);
  }

  private createNeuralSearchStream(query: string): Response {
    const stream = new ReadableStream({
      start(controller) {
        console.log(` [Neural Search Stream] Starting for query: "${query}"`);

        if (!query || query.length < 3) {
          controller.enqueue(
            new TextEncoder().encode(
              `event: error\ndata: {"message":"Query too short","minimum_length":3}\n\n`,
            ),
          );
          return;
        }

        // Send search progress updates
        const performSearch = async () => {
          // Send search started event
          controller.enqueue(
            new TextEncoder().encode(
              `event: search-started\ndata: {"query":"${query}","timestamp":"${new Date().toISOString()}"}\n\n`,
            ),
          );

          try {
            // Send progress updates
            const tables = [
              "incident",
              "problem",
              "change_request",
              "sc_request",
            ];
            let totalResults = [];

            for (let i = 0; i < tables.length; i++) {
              const table = tables[i];

              // Send progress
              controller.enqueue(
                new TextEncoder().encode(
                  `event: search-progress\ndata: {"table":"${table}","progress":${(((i + 1) / tables.length) * 100).toFixed(0)},"timestamp":"${new Date().toISOString()}"}\n\n`,
                ),
              );

              try {
                const tableResults = await this.searchServiceNowTable(
                  table,
                  [query],
                  ["short_description", "description"],
                );
                totalResults.push(...tableResults.slice(0, 3)); // Top 3 from each table

                // Send intermediate results
                controller.enqueue(
                  new TextEncoder().encode(
                    `event: search-results\ndata: ${JSON.stringify({
                      query,
                      table,
                      results: tableResults.slice(0, 3),
                      timestamp: new Date().toISOString(),
                    })}\n\n`,
                  ),
                );
              } catch (error: unknown) {
                console.warn(
                  ` [Neural Search Stream] ${table} search failed:`,
                  error,
                );
              }

              // Small delay for realistic streaming
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            // Send final results
            controller.enqueue(
              new TextEncoder().encode(
                `event: search-complete\ndata: ${JSON.stringify({
                  query,
                  total_results: totalResults.length,
                  results: totalResults,
                  timestamp: new Date().toISOString(),
                })}\n\n`,
              ),
            );
          } catch (error: unknown) {
            console.error(" [Neural Search Stream] Search error:", error);

            controller.enqueue(
              new TextEncoder().encode(
                `event: search-error\ndata: {"message":"Search failed","error":"${error.message}","timestamp":"${new Date().toISOString()}"}\n\n`,
              ),
            );
          }
        };

        performSearch();

        // No intervals for search stream - it's query-based
        return () => {
          console.log(
            `🔌 [Neural Search Stream] Search stream closed for: "${query}"`,
          );
        };
      },
    });

    return new Response(stream);
  }

  private createSystemHealthStream(): Response {
    const stream = new ReadableStream({
      start(controller) {
        console.log(` [System Health Stream] Starting system monitoring`);

        const sendHealthUpdate = async () => {
          try {
            const healthData = await this.getSystemHealthData();

            controller.enqueue(
              new TextEncoder().encode(
                `event: health-update\ndata: ${JSON.stringify(healthData)}\n\n`,
              ),
            );
          } catch (error: unknown) {
            console.error(" [System Health Stream] Health check error:", error);

            controller.enqueue(
              new TextEncoder().encode(
                `event: health-error\ndata: {"message":"Health check failed","timestamp":"${new Date().toISOString()}"}\n\n`,
              ),
            );
          }
        };

        sendHealthUpdate(); // Initial update

        const healthInterval = setInterval(sendHealthUpdate, 10000); // Every 10 seconds

        return () => {
          console.log(`🔌 [System Health Stream] Health stream closed`);
          clearInterval(healthInterval);
        };
      },
    });

    return new Response(stream);
  }

  // Helper methods for streaming data

  private async getSystemHealthData(): Promise<any> {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    try {
      // Test ServiceNow connectivity with a simple query
      const startTime = Date.now();
      await this.consolidatedService.queryRecords(
        "sys_user",
        "user_nameSTARTSWITHtest",
        { limit: 1 },
      );
      const responseTime = Date.now() - startTime;

      return {
        timestamp: new Date().toISOString(),
        server: {
          uptime: Math.floor(uptime),
          memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            usage_percent: Math.round(
              (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
            ),
          },
          status: uptime > 60 ? "healthy" : "starting",
        },
        servicenow: {
          connection: "active",
          response_time: responseTime,
          last_sync: new Date().toISOString(),
          auth_status: "authenticated",
        },
        database: {
          connection: "active",
          query_time: responseTime,
          connections: 1, // Current connection count
        },
      };
    } catch (error: unknown) {
      return {
        timestamp: new Date().toISOString(),
        server: {
          uptime: Math.floor(uptime),
          memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            usage_percent: Math.round(
              (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
            ),
          },
          status: uptime > 60 ? "healthy" : "starting",
        },
        servicenow: {
          connection: "error",
          response_time: 0,
          last_sync: "never",
          auth_status: "failed",
        },
        database: {
          connection: "error",
          query_time: 0,
          connections: 0,
        },
      };
    }
  }

  /**
   * Get the Elysia app instance
   */
  public getApp(): Elysia {
    return this.app;
  }
}

// Create server instance
const glassServer = new GlassDesignServer();

// Export the Elysia app for Bun.serve compatibility
export default glassServer.getApp();

// Also export the server instance for external use
export { glassServer };

// Auto-start if this is the main module
if (import.meta.main) {
  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n Shutting down gracefully...");
    await glassServer.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n Received SIGTERM, shutting down gracefully...");
    await glassServer.stop();
    process.exit(0);
  });

  // Start the server
  glassServer.start().catch((error) => {
    console.error(" Failed to start server:", error);
    process.exit(1);
  });
}
