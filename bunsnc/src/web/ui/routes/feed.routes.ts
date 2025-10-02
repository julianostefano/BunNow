/**
 * Feed Routes - Infinite Scroll Ticket Feed
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Features:
 * - Infinite scroll with lazy loading
 * - Virtual scroll for performance
 * - Loading skeleton
 * - Intersection Observer for auto-load
 */

import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";

/**
 * Ticket Card Interface
 */
interface TicketCard {
  sys_id: string;
  number: string;
  type: string;
  short_description: string;
  state: string;
  priority?: string;
  assigned_to?: string;
  sys_created_on: string;
  sys_updated_on: string;
}

/**
 * Render Loading Skeleton
 */
function renderLoadingSkeleton(count: number = 10): string {
  return Array.from({ length: count }, (_, i) => `
    <div class="glass-card p-4 rounded-lg skeleton">
      <div class="h-4 bg-white/10 rounded w-1/4 mb-2"></div>
      <div class="h-6 bg-white/10 rounded w-3/4 mb-2"></div>
      <div class="h-4 bg-white/10 rounded w-1/2"></div>
    </div>
  `).join('');
}

/**
 * Render Ticket Card
 */
function renderTicketCard(ticket: TicketCard): string {
  const typeIcons = {
    incident: 'alert-circle',
    task: 'check-square',
    ctask: 'git-branch',
    sctask: 'shopping-cart',
  };

  const statusColors = {
    '1': 'badge-new',
    '2': 'badge-progress',
    '3': 'badge-waiting',
    '6': 'badge-resolved',
    '7': 'badge-closed',
  };

  const priorityColors = {
    '1': 'badge-critical',
    '2': 'badge-critical',
    '3': 'badge-waiting',
    '4': 'badge-new',
    '5': 'badge-new',
  };

  const statusLabels = {
    '1': 'New',
    '2': 'In Progress',
    '3': 'Waiting',
    '6': 'Resolved',
    '7': 'Closed',
  };

  const createdDate = new Date(ticket.sys_created_on);
  const timeAgo = getTimeAgo(createdDate);

  return `
    <button
      class="w-full glass-card p-4 rounded-lg text-left transition-all hover:scale-[1.01]"
      hx-get="/ui/ticket/${ticket.sys_id}/${ticket.type}"
      hx-target="#modal-container"
      hx-swap="innerHTML"
      data-ticket-id="${ticket.sys_id}"
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <i data-lucide="${typeIcons[ticket.type] || 'file'}" class="w-4 h-4 text-accent-primary"></i>
          <span class="font-mono text-sm text-accent-primary">${ticket.number}</span>
          <span class="text-xs ${statusColors[ticket.state] || 'badge-new'} px-2 py-0.5 rounded">
            ${statusLabels[ticket.state] || 'Unknown'}
          </span>
          ${ticket.priority ? `
            <span class="text-xs ${priorityColors[ticket.priority] || 'badge-new'} px-2 py-0.5 rounded">
              P${ticket.priority}
            </span>
          ` : ''}
        </div>
        <span class="text-xs text-text-muted">${timeAgo}</span>
      </div>

      <!-- Title -->
      <h3 class="text-text-primary font-medium line-clamp-2 mb-2">
        ${ticket.short_description || 'No description'}
      </h3>

      <!-- Footer -->
      <div class="flex items-center justify-between text-xs text-text-muted">
        ${ticket.assigned_to ? `
          <div class="flex items-center gap-1">
            <i data-lucide="user" class="w-3 h-3"></i>
            <span>${ticket.assigned_to}</span>
          </div>
        ` : '<span>Unassigned</span>'}
        <i data-lucide="arrow-right" class="w-4 h-4"></i>
      </div>
    </button>
  `;
}

/**
 * Get Time Ago String
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Feed Routes
 */
export const feedRoutes = new Elysia()
  .use(html())

  .get(
    "/feed",
    async ({ query }) => {
      const type = query.type || 'all';
      const status = query.status || 'all';
      const offset = parseInt(query.offset as string) || 0;
      const limit = parseInt(query.limit as string) || 50;

      try {
        // Determine API endpoint based on type
        let apiUrl = 'http://localhost:3008/api/incidents';
        if (type === 'task') apiUrl = 'http://localhost:3008/api/tasks';
        // Add more types as needed

        // Build query params
        const params = new URLSearchParams();
        if (status !== 'all') params.append('state', status);
        params.append('limit', limit.toString());

        // Fetch tickets
        const response = await fetch(`${apiUrl}?${params}`);
        const data = await response.json();

        if (data.success && data.data && data.data.length > 0) {
          const tickets = data.data.map((ticket: any) => ({
            sys_id: ticket.sys_id,
            number: ticket.number,
            type: type === 'all' ? 'incident' : type,
            short_description: ticket.short_description,
            state: ticket.state,
            priority: ticket.priority,
            assigned_to: ticket.assigned_to,
            sys_created_on: ticket.sys_created_on,
            sys_updated_on: ticket.sys_updated_on,
          }));

          const feedHTML = `
            <div id="feed-list" class="grid grid-cols-1 gap-4">
              ${tickets.map((ticket: TicketCard) => renderTicketCard(ticket)).join('')}
            </div>

            <!-- Infinite Scroll Trigger -->
            ${data.data.length >= limit ? `
              <div
                id="load-more-trigger"
                class="flex justify-center py-8"
                hx-get="/ui/feed?type=${type}&status=${status}&offset=${offset + limit}&limit=${limit}"
                hx-trigger="revealed"
                hx-swap="beforebegin"
                hx-target="#load-more-trigger"
              >
                <div class="flex items-center gap-2 text-text-muted">
                  <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
                  <span class="text-sm">Loading more...</span>
                </div>
              </div>
            ` : `
              <div class="flex justify-center py-8 text-text-muted text-sm">
                <div class="flex items-center gap-2">
                  <i data-lucide="check-circle" class="w-5 h-5"></i>
                  <span>All tickets loaded</span>
                </div>
              </div>
            `}
          `;

          return feedHTML;
        } else {
          return `
            <div class="flex flex-col items-center justify-center py-16 text-center">
              <i data-lucide="inbox" class="w-16 h-16 text-text-muted mb-4"></i>
              <h3 class="text-lg font-medium text-text-primary mb-2">No tickets found</h3>
              <p class="text-sm text-text-muted">Try adjusting your filters</p>
            </div>
          `;
        }
      } catch (error) {
        console.error('Feed fetch error:', error);
        return `
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <i data-lucide="alert-circle" class="w-16 h-16 text-accent-danger mb-4"></i>
            <h3 class="text-lg font-medium text-text-primary mb-2">Failed to load tickets</h3>
            <p class="text-sm text-text-muted">${error.message || 'Unknown error'}</p>
            <button
              class="btn-primary mt-4"
              hx-get="/ui/feed?type=${type}&status=${status}&offset=${offset}&limit=${limit}"
              hx-target="#feed-container"
              hx-swap="innerHTML"
            >
              <i data-lucide="refresh-cw" class="w-4 h-4 inline mr-2"></i>
              Retry
            </button>
          </div>
        `;
      }
    },
    {
      query: t.Object({
        type: t.Optional(t.String()),
        status: t.Optional(t.String()),
        offset: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    }
  );
