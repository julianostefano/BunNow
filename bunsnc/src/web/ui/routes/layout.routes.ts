/**
 * Layout Routes - Base Layout with Header
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";

/**
 * Base HTML Layout
 * Clean, corporate design with glassmorphism effects
 */
function baseLayout(content: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="BunSNC Dashboard - ServiceNow Integration">
  <title>BunSNC Dashboard</title>

  <!-- Tailwind CSS v4 -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/ui/styles/custom.css">

  <!-- HTMX (local, instead of CDN) -->
  <script src="/ui/js/htmx.min.js"></script>
  <script src="/ui/js/htmx/ext/sse.js"></script>

  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>

  <!-- Chart.js (for panel graphics) -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>

  <style>
    /* Additional inline critical CSS */
    html { scroll-behavior: smooth; }
    body { min-height: 100vh; }
  </style>
</head>
<body class="h-full overflow-x-hidden">
  ${content}

  <!-- Initialize Lucide Icons -->
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();
    });

    // Reinitialize icons after HTMX swaps
    document.body.addEventListener('htmx:afterSwap', () => {
      lucide.createIcons();
    });
  </script>
</body>
</html>`;
}

/**
 * Main Dashboard Layout
 * Includes header, floating panel, search bar, and content area
 */
export function dashboardLayout(options: {
  showPanel?: boolean;
  panelMinimized?: boolean;
}) {
  const { showPanel = true, panelMinimized = false } = options;

  return baseLayout(`
    <div id="app-container" class="h-full flex flex-col">
      <!-- Header (fixed top) -->
      <header id="app-header" class="fixed top-0 left-0 right-0 z-50 glass-card">
        <div class="container mx-auto px-4 py-3 flex items-center justify-between">
          <!-- Hamburger Menu Button -->
          <button
            id="menu-toggle"
            class="btn-primary flex items-center gap-2"
            hx-get="/ui/menu"
            hx-target="#menu-container"
            hx-swap="innerHTML"
            aria-label="Toggle menu"
          >
            <i data-lucide="menu" class="w-5 h-5"></i>
            <span class="hidden sm:inline">Menu</span>
          </button>

          <!-- Logo/Title -->
          <div class="flex items-center gap-3">
            <i data-lucide="database" class="w-6 h-6 text-accent-primary"></i>
            <h1 class="text-xl font-semibold text-text-primary">BunSNC Dashboard</h1>
          </div>

          <!-- User Actions -->
          <div class="flex items-center gap-3">
            <!-- Notifications -->
            <button class="btn-primary p-2" aria-label="Notifications">
              <i data-lucide="bell" class="w-5 h-5"></i>
            </button>

            <!-- User Menu -->
            <button class="btn-primary flex items-center gap-2" aria-label="User menu">
              <i data-lucide="user" class="w-5 h-5"></i>
              <span class="hidden sm:inline text-sm">Admin</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Menu Container (slide-in from left) -->
      <div id="menu-container" class="z-menu"></div>

      <!-- Main Content Area -->
      <main class="flex-1 pt-20 relative">
        <!-- Floating Panel (dynamic content) -->
        ${showPanel ? `
        <div id="floating-panel-container" class="${panelMinimized ? 'panel-minimized' : ''}">
          <div
            hx-get="/ui/panel"
            hx-trigger="load"
            hx-swap="innerHTML"
          ></div>
        </div>
        ` : ''}

        <!-- Search Bar (transparent, always below panel) -->
        <div id="search-bar-container">
          <div
            hx-get="/ui/search-bar"
            hx-trigger="load"
            hx-swap="innerHTML"
          ></div>
        </div>

        <!-- Filter Tabs -->
        <div id="filter-tabs-container">
          <div
            hx-get="/ui/filter-tabs"
            hx-trigger="load"
            hx-swap="innerHTML"
          ></div>
        </div>

        <!-- Feed Content (infinite scroll) -->
        <div id="feed-container" class="container mx-auto px-4 py-6">
          <div
            hx-get="/ui/feed?offset=0&limit=50"
            hx-trigger="load"
            hx-swap="innerHTML"
          ></div>
        </div>
      </main>

      <!-- Modal Container (ticket details) -->
      <div id="modal-container"></div>
    </div>

    <!-- Global Keyboard Shortcuts -->
    <script>
      document.addEventListener('keydown', (e) => {
        // Ctrl+K or Cmd+K: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          const searchInput = document.querySelector('#search-input');
          if (searchInput) searchInput.focus();
        }

        // Escape: Close modal/menu
        if (e.key === 'Escape') {
          const modal = document.querySelector('#modal-container .modal-overlay');
          if (modal) modal.remove();

          const menu = document.querySelector('#menu-container .menu-sidebar');
          if (menu) menu.remove();
        }
      });
    </script>
  `);
}

/**
 * Layout Routes
 * NOTE: Root route "/" moved to uiApp in src/web/ui/index.ts to avoid route conflict
 * See v5.5.15 fix for details
 *
 * FIX v5.5.15: Removed @gtramontina.com/elysia-htmx plugin
 * Root cause: Plugin had initialization side-effects causing ServiceNowClient errors
 * HTMX is client-side library - loaded via script tag in HTML
 */
export const layoutRoutes = new Elysia()
  .use(html())

  // Serve static assets
  .get("/styles/custom.css", () => {
    return Bun.file("src/web/ui/styles/custom.css");
  })

  // Serve HTMX library locally (instead of CDN)
  .get("/js/htmx.min.js", ({ set }) => {
    set.headers["content-type"] = "application/javascript; charset=utf-8";
    set.headers["cache-control"] = "public, max-age=31536000, immutable";
    return Bun.file("node_modules/htmx.org/dist/htmx.min.js");
  })

  .get("/js/htmx/ext/sse.js", ({ set }) => {
    set.headers["content-type"] = "application/javascript; charset=utf-8";
    set.headers["cache-control"] = "public, max-age=31536000, immutable";
    return Bun.file("node_modules/htmx.org/dist/ext/sse.js");
  });
