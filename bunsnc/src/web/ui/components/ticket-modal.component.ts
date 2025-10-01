/**
 * Ticket Modal Component - Transparent Modal with All Actions
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Features:
 * - Center-positioned transparent modal
 * - All ticket actions (assign, note, status, close, history, attach)
 * - Close with ESC or overlay click
 * - HTMX-powered actions
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";

/**
 * Ticket Details Interface
 */
interface TicketDetails {
  sys_id: string;
  number: string;
  type: string;
  short_description: string;
  description?: string;
  state: string;
  priority?: string;
  assigned_to?: string;
  assignment_group?: string;
  caller_id?: string;
  category?: string;
  sys_created_on: string;
  sys_updated_on: string;
  work_notes?: string;
  close_notes?: string;
}

/**
 * Ticket Actions
 */
const TICKET_ACTIONS = [
  { id: 'assign', label: 'Assign', icon: 'user-plus', color: 'btn-primary' },
  { id: 'note', label: 'Add Note', icon: 'message-square', color: 'btn-primary' },
  { id: 'status', label: 'Change Status', icon: 'git-branch', color: 'btn-primary' },
  { id: 'close', label: 'Close Ticket', icon: 'check-circle', color: 'badge-resolved' },
  { id: 'history', label: 'View History', icon: 'clock', color: 'btn-primary' },
  { id: 'attach', label: 'Attach File', icon: 'paperclip', color: 'btn-primary' },
];

/**
 * Render Action Form
 */
function renderActionForm(action: string, ticketId: string, ticketType: string): string {
  switch (action) {
    case 'assign':
      return `
        <form hx-post="/api/tickets/${ticketId}/${ticketType}/assign" hx-target="#modal-content" hx-swap="innerHTML">
          <label class="block text-sm text-text-secondary mb-2">Assign to User:</label>
          <input type="text" name="assigned_to" class="input-glass w-full mb-4" placeholder="Enter user ID or name" required>
          <button type="submit" class="btn-primary w-full">Assign</button>
        </form>
      `;

    case 'note':
      return `
        <form hx-post="/api/tickets/${ticketId}/${ticketType}/notes" hx-target="#modal-content" hx-swap="innerHTML">
          <label class="block text-sm text-text-secondary mb-2">Work Note:</label>
          <textarea name="work_notes" class="input-glass w-full h-32 mb-4" placeholder="Enter your note..." required></textarea>
          <button type="submit" class="btn-primary w-full">Add Note</button>
        </form>
      `;

    case 'status':
      return `
        <form hx-post="/api/tickets/${ticketId}/${ticketType}/status" hx-target="#modal-content" hx-swap="innerHTML">
          <label class="block text-sm text-text-secondary mb-2">New Status:</label>
          <select name="state" class="input-glass w-full mb-4" required>
            <option value="1">New</option>
            <option value="2">In Progress</option>
            <option value="3">Waiting</option>
            <option value="6">Resolved</option>
            <option value="7">Closed</option>
          </select>
          <button type="submit" class="btn-primary w-full">Update Status</button>
        </form>
      `;

    case 'close':
      return `
        <form hx-post="/api/tickets/${ticketId}/${ticketType}/close" hx-target="#modal-content" hx-swap="innerHTML">
          <label class="block text-sm text-text-secondary mb-2">Resolution Code:</label>
          <select name="resolution_code" class="input-glass w-full mb-4" required>
            <option value="solved">Solved</option>
            <option value="not_solved">Not Solved</option>
            <option value="workaround">Workaround</option>
          </select>
          <label class="block text-sm text-text-secondary mb-2">Close Notes:</label>
          <textarea name="close_notes" class="input-glass w-full h-32 mb-4" placeholder="Enter close notes..." required></textarea>
          <button type="submit" class="btn-primary w-full">Close Ticket</button>
        </form>
      `;

    case 'attach':
      return `
        <form hx-post="/api/tickets/${ticketId}/${ticketType}/attachment" hx-target="#modal-content" hx-swap="innerHTML" hx-encoding="multipart/form-data">
          <label class="block text-sm text-text-secondary mb-2">Select File:</label>
          <input type="file" name="file" class="input-glass w-full mb-4" required>
          <button type="submit" class="btn-primary w-full">Upload File</button>
        </form>
      `;

    case 'history':
      return `
        <div hx-get="/api/tickets/${ticketId}/${ticketType}/history" hx-trigger="load" hx-swap="innerHTML">
          <div class="flex items-center justify-center py-8">
            <i data-lucide="loader-2" class="w-8 h-8 animate-spin text-accent-primary"></i>
          </div>
        </div>
      `;

    default:
      return '<p class="text-text-muted">Action not implemented</p>';
  }
}

/**
 * Ticket Modal HTML
 */
export function ticketModalHTML(ticket: TicketDetails): string {
  const statusLabels = {
    '1': 'New',
    '2': 'In Progress',
    '3': 'Waiting',
    '6': 'Resolved',
    '7': 'Closed',
  };

  const statusColors = {
    '1': 'badge-new',
    '2': 'badge-progress',
    '3': 'badge-waiting',
    '6': 'badge-resolved',
    '7': 'badge-closed',
  };

  return `
    <!-- Modal Overlay -->
    <div
      id="ticket-modal"
      class="fixed inset-0 z-modal flex items-center justify-center modal-overlay animate-fade-in"
      onclick="if (event.target === this) document.getElementById('modal-container').innerHTML = ''"
    >
      <!-- Modal Content -->
      <div class="glass-modal rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4 animate-fade-in">
        <!-- Modal Header -->
        <div class="sticky top-0 glass-panel z-10 px-6 py-4 border-b border-white/10">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="font-mono text-lg text-accent-primary">${ticket.number}</span>
              <span class="text-sm ${statusColors[ticket.state] || 'badge-new'} px-3 py-1 rounded">
                ${statusLabels[ticket.state] || 'Unknown'}
              </span>
              ${ticket.priority ? `<span class="text-sm badge-critical px-3 py-1 rounded">P${ticket.priority}</span>` : ''}
            </div>
            <button
              class="btn-primary p-2"
              onclick="document.getElementById('modal-container').innerHTML = ''"
              aria-label="Close modal"
            >
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
        </div>

        <!-- Modal Body -->
        <div id="modal-content" class="px-6 py-6">
          <!-- Ticket Details -->
          <div class="mb-6">
            <h2 class="text-xl font-semibold text-text-primary mb-4">${ticket.short_description}</h2>
            ${ticket.description ? `
              <div class="glass-card p-4 rounded-lg mb-4">
                <p class="text-sm text-text-secondary whitespace-pre-wrap">${ticket.description}</p>
              </div>
            ` : ''}

            <!-- Metadata Grid -->
            <div class="grid grid-cols-2 gap-4 mb-6">
              ${ticket.assigned_to ? `
                <div>
                  <p class="text-xs text-text-muted mb-1">Assigned To</p>
                  <div class="flex items-center gap-2">
                    <i data-lucide="user" class="w-4 h-4 text-accent-primary"></i>
                    <p class="text-sm text-text-primary">${ticket.assigned_to}</p>
                  </div>
                </div>
              ` : ''}

              ${ticket.assignment_group ? `
                <div>
                  <p class="text-xs text-text-muted mb-1">Assignment Group</p>
                  <div class="flex items-center gap-2">
                    <i data-lucide="users" class="w-4 h-4 text-accent-primary"></i>
                    <p class="text-sm text-text-primary">${ticket.assignment_group}</p>
                  </div>
                </div>
              ` : ''}

              ${ticket.caller_id ? `
                <div>
                  <p class="text-xs text-text-muted mb-1">Caller</p>
                  <div class="flex items-center gap-2">
                    <i data-lucide="phone" class="w-4 h-4 text-accent-primary"></i>
                    <p class="text-sm text-text-primary">${ticket.caller_id}</p>
                  </div>
                </div>
              ` : ''}

              ${ticket.category ? `
                <div>
                  <p class="text-xs text-text-muted mb-1">Category</p>
                  <div class="flex items-center gap-2">
                    <i data-lucide="tag" class="w-4 h-4 text-accent-primary"></i>
                    <p class="text-sm text-text-primary">${ticket.category}</p>
                  </div>
                </div>
              ` : ''}

              <div>
                <p class="text-xs text-text-muted mb-1">Created</p>
                <div class="flex items-center gap-2">
                  <i data-lucide="calendar" class="w-4 h-4 text-accent-primary"></i>
                  <p class="text-sm text-text-primary">${new Date(ticket.sys_created_on).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <p class="text-xs text-text-muted mb-1">Updated</p>
                <div class="flex items-center gap-2">
                  <i data-lucide="clock" class="w-4 h-4 text-accent-primary"></i>
                  <p class="text-sm text-text-primary">${new Date(ticket.sys_updated_on).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <!-- Work Notes -->
            ${ticket.work_notes ? `
              <div class="glass-card p-4 rounded-lg mb-4">
                <h4 class="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                  <i data-lucide="message-square" class="w-4 h-4"></i>
                  Work Notes
                </h4>
                <p class="text-sm text-text-secondary whitespace-pre-wrap">${ticket.work_notes}</p>
              </div>
            ` : ''}
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            ${TICKET_ACTIONS.map(action => `
              <button
                class="${action.color} flex items-center justify-center gap-2 py-3 rounded-lg"
                hx-get="/ui/ticket/${ticket.sys_id}/${ticket.type}/action/${action.id}"
                hx-target="#action-form-container"
                hx-swap="innerHTML"
              >
                <i data-lucide="${action.icon}" class="w-4 h-4"></i>
                <span class="text-sm">${action.label}</span>
              </button>
            `).join('')}
          </div>

          <!-- Action Form Container -->
          <div id="action-form-container" class="glass-card p-4 rounded-lg hidden"></div>
        </div>
      </div>
    </div>

    <script>
      // Show action form container when an action button is clicked
      document.body.addEventListener('htmx:afterSwap', (event) => {
        const container = document.getElementById('action-form-container');
        if (container && event.detail.target === container) {
          container.classList.remove('hidden');
        }
      });

      // Close modal on ESC key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          document.getElementById('modal-container').innerHTML = '';
        }
      });
    </script>
  `;
}

/**
 * Ticket Modal Routes
 */
export const ticketModalRoutes = new Elysia({ prefix: "/ui" })
  .use(html())

  .get("/ticket/:id/:type", async ({ params }) => {
    try {
      // Fetch ticket details from API
      const apiUrl = `http://localhost:3008/api/incidents/${params.id}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.success && data.data) {
        const ticket: TicketDetails = {
          sys_id: data.data.sys_id,
          number: data.data.number,
          type: params.type,
          short_description: data.data.short_description,
          description: data.data.description,
          state: data.data.state,
          priority: data.data.priority,
          assigned_to: data.data.assigned_to_display || data.data.assigned_to,
          assignment_group: data.data.assignment_group_display || data.data.assignment_group,
          caller_id: data.data.caller_id_display || data.data.caller_id,
          category: data.data.category,
          sys_created_on: data.data.sys_created_on,
          sys_updated_on: data.data.sys_updated_on,
          work_notes: data.data.work_notes,
          close_notes: data.data.close_notes,
        };

        return ticketModalHTML(ticket);
      } else {
        return '<div class="p-4 text-center text-accent-danger">Failed to load ticket details</div>';
      }
    } catch (error) {
      console.error('Ticket modal error:', error);
      return '<div class="p-4 text-center text-accent-danger">Error loading ticket</div>';
    }
  })

  .get("/ticket/:id/:type/action/:action", ({ params }) => {
    return renderActionForm(params.action, params.id, params.type);
  });
