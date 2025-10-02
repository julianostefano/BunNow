/**
 * UI Index - Main Entry Point for BunSNC Dashboard v2.0
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Corporate Clean Design with:
 * - Glassmorphism effects
 * - HTMX for interactivity
 * - Tailwind CSS v4
 * - Lucide icons (no emojis)
 * - Infinite scroll
 * - Real-time updates
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { cors } from "@elysiajs/cors";

// Routes
import { layoutRoutes, dashboardLayout } from "./routes/layout.routes";
import { feedRoutes } from "./routes/feed.routes";

// Components
import { hamburgerMenuRoutes } from "./components/hamburger-menu.component";
import { floatingPanelRoutes } from "./components/floating-panel.component";
import { searchBarRoutes } from "./components/search-bar.component";
import { filterTabsRoutes } from "./components/filter-tabs.component";
import { ticketModalRoutes } from "./components/ticket-modal.component";

// Routes
import { streamingMetricsRoutes } from "./routes/streaming-metrics.routes";

/**
 * Main UI Application
 * Follows Elysia Best Practice: "1 instance = 1 controller"
 *
 * FIX v5.5.15: Removed @gtramontina.com/elysia-htmx plugin
 * Root cause: Plugin had initialization side-effects causing ServiceNowClient errors
 * HTMX is client-side library - loaded via CDN in HTML, no server plugin needed
 */
export const uiApp = new Elysia({ prefix: "/ui" })
  .use(html())
  .use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  )

  // FIX v5.5.15: Root route for /ui/ (moved from layout.routes.ts to avoid conflict)
  .get("/", ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return dashboardLayout({
      showPanel: true,
      panelMinimized: false,
    });
  })

  // Integrate all routes
  .use(layoutRoutes)
  .use(feedRoutes)
  .use(hamburgerMenuRoutes)
  .use(floatingPanelRoutes)
  .use(searchBarRoutes)
  .use(filterTabsRoutes)
  .use(ticketModalRoutes)
  // FIX v5.5.16: Add SSE metrics endpoint for floating panel real-time updates
  .use(streamingMetricsRoutes)

  // Health check
  .get("/health", () => ({
    status: "healthy",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
  }));

/**
 * Export for integration into main app
 */
export default uiApp;
