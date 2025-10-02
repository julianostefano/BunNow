/**
 * Filter Tabs Component - Ticket Type and Status Filters
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Features:
 * - Tab navigation for ticket types (incident, ctask, sctask)
 * - Status filters below main tabs
 * - Active state with animated underline
 * - Sticky positioning below panel
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";

/**
 * Ticket Types
 */
const TICKET_TYPES = [
  { id: 'all', label: 'All Tickets', icon: 'list' },
  { id: 'incident', label: 'Incidents', icon: 'alert-circle' },
  { id: 'task', label: 'Tasks', icon: 'check-square' },
  { id: 'ctask', label: 'Change Tasks', icon: 'git-branch' },
  { id: 'sctask', label: 'Catalog Tasks', icon: 'shopping-cart' },
];

/**
 * Status Filters
 */
const STATUS_FILTERS = [
  { id: 'all', label: 'All Status', color: 'text-text-primary' },
  { id: 'new', label: 'New', color: 'text-status-new' },
  { id: 'in_progress', label: 'In Progress', color: 'text-status-progress' },
  { id: 'waiting', label: 'Waiting', color: 'text-status-waiting' },
  { id: 'resolved', label: 'Resolved', color: 'text-status-resolved' },
  { id: 'closed', label: 'Closed', color: 'text-status-closed' },
];

/**
 * Filter Tabs HTML
 */
export function filterTabsHTML(activeType: string = 'all', activeStatus: string = 'all'): string {
  return `
    <div
      id="filter-tabs"
      class="sticky top-20 z-50 glass-card border-b border-white/10"
    >
      <div class="container mx-auto px-4">
        <!-- Type Tabs -->
        <div class="flex items-center gap-1 overflow-x-auto pb-0">
          ${TICKET_TYPES.map(type => `
            <button
              class="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative ${activeType === type.id ? 'tab-active text-accent-primary' : 'text-text-secondary hover:text-text-primary'}"
              hx-get="/ui/feed?type=${type.id}&status=${activeStatus}&offset=0&limit=50"
              hx-target="#feed-container"
              hx-swap="innerHTML"
              hx-push-url="true"
              onclick="setActiveTab(this, 'type')"
              data-type="${type.id}"
            >
              <i data-lucide="${type.icon}" class="w-4 h-4"></i>
              <span>${type.label}</span>
              ${activeType === type.id ? '<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary"></div>' : ''}
            </button>
          `).join('')}
        </div>

        <!-- Status Filters -->
        <div class="flex items-center gap-2 overflow-x-auto py-3 border-t border-white/5">
          <span class="text-xs text-text-muted mr-2">Status:</span>
          ${STATUS_FILTERS.map(status => `
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-full transition-all ${activeStatus === status.id ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30' : 'text-text-secondary hover:bg-white/5'}"
              hx-get="/ui/feed?type=${activeType}&status=${status.id}&offset=0&limit=50"
              hx-target="#feed-container"
              hx-swap="innerHTML"
              hx-push-url="true"
              onclick="setActiveTab(this, 'status')"
              data-status="${status.id}"
            >
              ${status.label}
            </button>
          `).join('')}
        </div>
      </div>
    </div>

    <script>
      function setActiveTab(element, tabType) {
        // Remove active class from siblings
        const siblings = element.parentElement.querySelectorAll('button');
        siblings.forEach(btn => {
          btn.classList.remove('tab-active', 'bg-accent-primary/20', 'text-accent-primary', 'border', 'border-accent-primary/30');
          btn.classList.add('text-text-secondary');

          // Remove underline
          const underline = btn.querySelector('.absolute.bottom-0');
          if (underline) underline.remove();
        });

        // Add active class to clicked element
        if (tabType === 'type') {
          element.classList.add('tab-active', 'text-accent-primary');
          element.classList.remove('text-text-secondary');

          // Add underline
          if (!element.querySelector('.absolute.bottom-0')) {
            element.insertAdjacentHTML('beforeend', '<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary"></div>');
          }
        } else {
          element.classList.add('bg-accent-primary/20', 'text-accent-primary', 'border', 'border-accent-primary/30');
          element.classList.remove('text-text-secondary');
        }
      }
    </script>
  `;
}

/**
 * Filter Tabs Routes
 */
export const filterTabsRoutes = new Elysia()
  .use(html())

  .get("/filter-tabs", ({ query }) => {
    const activeType = query.type || 'all';
    const activeStatus = query.status || 'all';
    return filterTabsHTML(activeType, activeStatus);
  });
