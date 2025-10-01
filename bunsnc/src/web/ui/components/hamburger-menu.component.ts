/**
 * Hamburger Menu Component - Complete Application Navigation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";

/**
 * Menu Structure
 * All functionalities mapped from existing routes and services
 */
interface MenuItem {
  label: string;
  icon: string; // Lucide icon name
  href?: string;
  children?: MenuItem[];
  badge?: string;
}

const MENU_STRUCTURE: MenuItem[] = [
  {
    label: "Dashboard",
    icon: "layout-dashboard",
    children: [
      { label: "Home", icon: "home", href: "/ui" },
      { label: "Statistics", icon: "bar-chart-3", href: "/ui/statistics" },
      { label: "System Health", icon: "activity", href: "/ui/system-health" },
      { label: "Performance", icon: "gauge", href: "/ui/performance" },
    ],
  },
  {
    label: "Tickets",
    icon: "ticket",
    children: [
      { label: "Incidents", icon: "alert-circle", href: "/ui/tickets/incidents" },
      { label: "Tasks", icon: "check-square", href: "/ui/tickets/tasks" },
      { label: "Change Tasks", icon: "git-branch", href: "/ui/tickets/ctasks" },
      { label: "Catalog Tasks", icon: "shopping-cart", href: "/ui/tickets/sctasks" },
      { label: "Search Tickets", icon: "search", href: "/ui/search" },
      { label: "Advanced Search", icon: "filter", href: "/ui/search/advanced" },
    ],
  },
  {
    label: "AI & Intelligence",
    icon: "brain",
    children: [
      { label: "AI Chat", icon: "message-square", href: "/ui/ai/chat" },
      { label: "AI Assistant", icon: "bot", href: "/ui/ai/assistant" },
      { label: "Intelligence Dashboard", icon: "trending-up", href: "/ui/intelligence" },
      { label: "Predictive Analytics", icon: "line-chart", href: "/ui/analytics/predictive" },
      { label: "Ticket Intelligence", icon: "lightbulb", href: "/ui/ai/tickets" },
      { label: "Document Intelligence", icon: "file-text", href: "/ui/ai/documents" },
      { label: "Neural Search", icon: "scan-search", href: "/ui/search/neural" },
    ],
  },
  {
    label: "Knowledge & Workflow",
    icon: "book-open",
    children: [
      { label: "Knowledge Base", icon: "library", href: "/ui/knowledge" },
      { label: "Knowledge Graph", icon: "network", href: "/ui/knowledge/graph" },
      { label: "Workflow Guidance", icon: "git-pull-request", href: "/ui/workflow" },
      { label: "Document Lifecycle", icon: "file-clock", href: "/ui/documents/lifecycle" },
    ],
  },
  {
    label: "SLA & Analytics",
    icon: "pie-chart",
    children: [
      { label: "SLA Metrics", icon: "timer", href: "/ui/sla" },
      { label: "Contractual SLA", icon: "file-badge", href: "/ui/sla/contractual" },
      { label: "Violation Tracking", icon: "alert-triangle", href: "/ui/sla/violations" },
      { label: "Enhanced Metrics", icon: "bar-chart-4", href: "/ui/metrics/enhanced" },
      { label: "Analytics Dashboard", icon: "trending-up", href: "/ui/analytics" },
    ],
  },
  {
    label: "Data Management",
    icon: "database",
    children: [
      { label: "Streaming", icon: "radio", href: "/ui/streaming" },
      { label: "Hadoop Sync", icon: "hard-drive", href: "/ui/hadoop" },
      { label: "Parquet Export", icon: "file-down", href: "/ui/export/parquet" },
      { label: "Background Sync", icon: "refresh-cw", href: "/ui/sync" },
      { label: "Data Quality", icon: "check-circle-2", href: "/ui/data/quality" },
    ],
  },
  {
    label: "Search & Filters",
    icon: "search",
    children: [
      { label: "Semantic Search", icon: "brain-circuit", href: "/ui/search/semantic" },
      { label: "Synonyms", icon: "text-quote", href: "/ui/synonyms" },
      { label: "Search History", icon: "history", href: "/ui/search/history" },
    ],
  },
  {
    label: "Security & Auth",
    icon: "shield",
    children: [
      { label: "Authentication", icon: "key", href: "/ui/auth" },
      { label: "SAML Config", icon: "lock", href: "/ui/auth/saml" },
      { label: "Rate Limiting", icon: "gauge", href: "/ui/security/rate-limit" },
      { label: "Audit Logs", icon: "file-search", href: "/ui/security/audit" },
    ],
  },
  {
    label: "Settings",
    icon: "settings",
    children: [
      { label: "Preferences", icon: "sliders", href: "/ui/settings" },
      { label: "Notifications", icon: "bell", href: "/ui/settings/notifications" },
      { label: "API Keys", icon: "key-round", href: "/ui/settings/api-keys" },
      { label: "About", icon: "info", href: "/ui/about" },
    ],
  },
];

/**
 * Render Menu Item
 */
function renderMenuItem(item: MenuItem, level: number = 0): string {
  const hasChildren = item.children && item.children.length > 0;
  const indentClass = level > 0 ? `pl-${(level + 1) * 4}` : "";

  if (hasChildren) {
    return `
      <div class="menu-section">
        <button
          class="w-full flex items-center justify-between px-4 py-3 hover:bg-accent-primary/10 transition-colors"
          onclick="this.nextElementSibling.classList.toggle('hidden')"
        >
          <div class="flex items-center gap-3 ${indentClass}">
            <i data-lucide="${item.icon}" class="w-5 h-5 text-accent-primary"></i>
            <span class="font-medium text-text-primary">${item.label}</span>
          </div>
          <i data-lucide="chevron-down" class="w-4 h-4 text-text-secondary transition-transform"></i>
        </button>
        <div class="hidden">
          ${item.children.map(child => renderMenuItem(child, level + 1)).join('')}
        </div>
      </div>
    `;
  }

  return `
    <a
      href="${item.href || '#'}"
      class="flex items-center gap-3 px-4 py-3 ${indentClass} hover:bg-accent-primary/10 transition-colors"
      hx-get="${item.href || '#'}"
      hx-target="#feed-container"
      hx-swap="innerHTML"
      hx-push-url="true"
    >
      <i data-lucide="${item.icon}" class="w-5 h-5 text-text-secondary"></i>
      <span class="text-text-primary">${item.label}</span>
      ${item.badge ? `<span class="ml-auto badge-critical text-xs px-2 py-1 rounded">${item.badge}</span>` : ''}
    </a>
  `;
}

/**
 * Hamburger Menu Component
 */
export function hamburgerMenuHTML(): string {
  return `
    <div class="menu-sidebar fixed inset-y-0 left-0 w-80 glass-panel z-menu transform transition-transform duration-300 ease-out animate-slide-in">
      <!-- Menu Header -->
      <div class="flex items-center justify-between p-4 border-b border-white/10">
        <div class="flex items-center gap-3">
          <i data-lucide="database" class="w-6 h-6 text-accent-primary"></i>
          <h2 class="text-lg font-semibold text-text-primary">BunSNC</h2>
        </div>
        <button
          class="btn-primary p-2"
          onclick="document.getElementById('menu-container').innerHTML = ''"
          aria-label="Close menu"
        >
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Menu Content (scrollable) -->
      <div class="overflow-y-auto h-[calc(100vh-80px)] py-4">
        ${MENU_STRUCTURE.map(item => renderMenuItem(item)).join('')}
      </div>

      <!-- Menu Footer -->
      <div class="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 glass-panel">
        <div class="flex items-center justify-between text-xs text-text-muted">
          <span>v5.5.11</span>
          <span>BunSNC © 2025</span>
        </div>
      </div>
    </div>

    <!-- Overlay (click to close) -->
    <div
      class="fixed inset-0 modal-overlay z-menu animate-fade-in"
      style="z-index: 940;"
      onclick="document.getElementById('menu-container').innerHTML = ''"
    ></div>
  `;
}

/**
 * Menu Routes
 */
export const hamburgerMenuRoutes = new Elysia({ prefix: "/ui" })
  .use(html())

  .get("/menu", () => {
    return hamburgerMenuHTML();
  });
