/**
 * Simple Test Server for Glass Design
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";

// Import our routes
import dashboardRoute from "./routes/index";
import eventsRoute from "./routes/events/stream";
import htmxStatsRoute from "./routes/HtmxStatisticsRoutes";

const app = new Elysia()
  .use(html())

  // Static files
  .use(staticPlugin({
    assets: "public",
    prefix: "/public"
  }))

  // Routes
  .use(dashboardRoute)
  .use(eventsRoute)
  .use("/htmx", htmxStatsRoute)

  // Health check
  .get("/health", () => ({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "glass-design-test"
  }))

  .listen(3009);

console.log("🌐 Test server running on http://localhost:3009");
console.log("📊 Dashboard: http://localhost:3009");
console.log("🔍 Health: http://localhost:3009/health");