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
import { htmx } from "@gtramontina.com/elysia-htmx";
import { cors } from "@elysiajs/cors";

// Routes
import { layoutRoutes } from "./routes/layout.routes";
import { feedRoutes } from "./routes/feed.routes";

// Components
import { hamburgerMenuRoutes } from "./components/hamburger-menu.component";
import { floatingPanelRoutes } from "./components/floating-panel.component";
import { searchBarRoutes } from "./components/search-bar.component";
import { filterTabsRoutes } from "./components/filter-tabs.component";
import { ticketModalRoutes } from "./components/ticket-modal.component";

/**
 * Main UI Application
 * Follows Elysia Best Practice: "1 instance = 1 controller"
 */
export const uiApp = new Elysia({ prefix: "/ui" })
  .use(html())
  .use(htmx())
  .use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  )

  // Integrate all routes
  .use(layoutRoutes)
  .use(feedRoutes)
  .use(hamburgerMenuRoutes)
  .use(floatingPanelRoutes)
  .use(searchBarRoutes)
  .use(filterTabsRoutes)
  .use(ticketModalRoutes)

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
