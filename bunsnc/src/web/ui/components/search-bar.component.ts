/**
 * Search Bar Component - Transparent Floating Search
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Features:
 * - Transparent glassmorphism design
 * - Always positioned below floating panel
 * - Keyboard shortcuts (↑ ↓ ↵ ESC, Ctrl+K)
 * - Debounced input (300ms)
 * - Real-time search results
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";

/**
 * Search Result Item
 */
interface SearchResult {
  id: string;
  type: 'incident' | 'task' | 'ctask' | 'sctask';
  number: string;
  title: string;
  status: string;
  priority?: string;
  assigned_to?: string;
}

/**
 * Render Search Result Item
 */
function renderSearchResult(result: SearchResult): string {
  const typeIcons = {
    incident: 'alert-circle',
    task: 'check-square',
    ctask: 'git-branch',
    sctask: 'shopping-cart',
  };

  const statusColors = {
    new: 'badge-new',
    in_progress: 'badge-progress',
    resolved: 'badge-resolved',
    closed: 'badge-closed',
    waiting: 'badge-waiting',
  };

  return `
    <button
      class="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent-primary/10 transition-colors search-result-item"
      hx-get="/ui/ticket/${result.id}/${result.type}"
      hx-target="#modal-container"
      hx-swap="innerHTML"
      data-result-id="${result.id}"
    >
      <!-- Icon -->
      <div class="flex-shrink-0">
        <i data-lucide="${typeIcons[result.type]}" class="w-5 h-5 text-accent-primary"></i>
      </div>

      <!-- Content -->
      <div class="flex-1 text-left">
        <div class="flex items-center gap-2">
          <span class="font-mono text-sm text-accent-primary">${result.number}</span>
          <span class="text-xs ${statusColors[result.status] || 'badge-new'} px-2 py-0.5 rounded">${result.status}</span>
          ${result.priority ? `<span class="text-xs badge-critical px-2 py-0.5 rounded">P${result.priority}</span>` : ''}
        </div>
        <p class="text-sm text-text-primary mt-1 truncate">${result.title}</p>
        ${result.assigned_to ? `<p class="text-xs text-text-muted mt-1">Assigned: ${result.assigned_to}</p>` : ''}
      </div>

      <!-- Arrow -->
      <div class="flex-shrink-0">
        <i data-lucide="arrow-right" class="w-4 h-4 text-text-muted"></i>
      </div>
    </button>
  `;
}

/**
 * Search Bar HTML
 */
export function searchBarHTML(): string {
  return `
    <div
      id="search-bar"
      class="fixed top-[280px] left-1/2 transform -translate-x-1/2 w-[90%] max-w-2xl z-search"
    >
      <div class="glass-search rounded-xl p-4">
        <!-- Search Input -->
        <div class="relative">
          <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <i data-lucide="search" class="w-5 h-5 text-text-muted"></i>
          </div>
          <input
            type="text"
            id="search-input"
            class="input-glass w-full pl-10 pr-32 py-3 text-sm"
            placeholder="Search tickets... (Ctrl+K)"
            autocomplete="off"
            hx-get="/ui/search-results"
            hx-trigger="keyup changed delay:300ms"
            hx-target="#search-results"
            hx-swap="innerHTML"
            hx-include="[name='search']"
          >
          <input type="hidden" name="search" id="search-query">

          <!-- Keyboard Hints -->
          <div class="absolute inset-y-0 right-0 flex items-center pr-3 gap-2 pointer-events-none">
            <span class="text-xs text-text-muted hidden sm:inline">↑ ↓ to navigate</span>
            <span class="text-xs text-text-muted hidden sm:inline">↵ to select</span>
            <span class="text-xs text-text-muted hidden sm:inline">ESC to close</span>
          </div>
        </div>

        <!-- Search Results -->
        <div
          id="search-results"
          class="mt-4 max-h-96 overflow-y-auto hidden"
        ></div>

        <!-- Search Filters (collapsed by default) -->
        <div id="search-filters" class="mt-4 hidden">
          <div class="grid grid-cols-2 gap-2">
            <select class="input-glass text-sm" name="type">
              <option value="">All Types</option>
              <option value="incident">Incidents</option>
              <option value="task">Tasks</option>
              <option value="ctask">Change Tasks</option>
              <option value="sctask">Catalog Tasks</option>
            </select>

            <select class="input-glass text-sm" name="status">
              <option value="">All Status</option>
              <option value="new">New</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting">Waiting</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <button
            class="btn-primary w-full mt-2 text-sm"
            hx-get="/ui/search-results"
            hx-target="#search-results"
            hx-swap="innerHTML"
            hx-include="#search-input, [name='type'], [name='status']"
          >
            Apply Filters
          </button>
        </div>

        <!-- Toggle Filters Button -->
        <button
          class="btn-primary w-full mt-4 text-sm"
          onclick="document.getElementById('search-filters').classList.toggle('hidden')"
        >
          <i data-lucide="filter" class="w-4 h-4 inline mr-2"></i>
          Advanced Filters
        </button>
      </div>
    </div>

    <script>
      (function() {
        const searchInput = document.getElementById('search-input');
        const searchResults = document.getElementById('search-results');
        const searchQuery = document.getElementById('search-query');
        let selectedIndex = -1;

        // Update hidden input on keyup
        searchInput.addEventListener('input', (e) => {
          searchQuery.value = e.target.value;
          selectedIndex = -1;

          // Show/hide results based on input
          if (e.target.value.trim()) {
            searchResults.classList.remove('hidden');
          } else {
            searchResults.classList.add('hidden');
          }
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
          const items = document.querySelectorAll('.search-result-item');

          switch(e.key) {
            case 'ArrowDown':
              e.preventDefault();
              selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
              updateSelection(items);
              break;

            case 'ArrowUp':
              e.preventDefault();
              selectedIndex = Math.max(selectedIndex - 1, 0);
              updateSelection(items);
              break;

            case 'Enter':
              e.preventDefault();
              if (selectedIndex >= 0 && items[selectedIndex]) {
                items[selectedIndex].click();
              }
              break;

            case 'Escape':
              e.preventDefault();
              searchInput.value = '';
              searchQuery.value = '';
              searchResults.classList.add('hidden');
              searchInput.blur();
              break;
          }
        });

        function updateSelection(items) {
          items.forEach((item, index) => {
            if (index === selectedIndex) {
              item.classList.add('bg-accent-primary/20');
              item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
              item.classList.remove('bg-accent-primary/20');
            }
          });
        }

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
          if (!e.target.closest('#search-bar')) {
            searchResults.classList.add('hidden');
          }
        });

        // Global Ctrl+K shortcut
        document.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
          }
        });
      })();
    </script>
  `;
}

/**
 * Search Bar Routes
 */
export const searchBarRoutes = new Elysia()
  .use(html())

  .get("/search-bar", () => {
    return searchBarHTML();
  })

  .get("/search-results", async ({ query }) => {
    const searchQuery = query.search || '';
    const type = query.type || '';
    const status = query.status || '';

    if (!searchQuery.trim()) {
      return '<div class="p-4 text-center text-text-muted text-sm">Start typing to search...</div>';
    }

    try {
      // Build query params
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (type) params.append('type', type);
      if (status) params.append('state', status);

      // Fetch from search API
      const response = await fetch(`http://localhost:3008/api/search?${params}`);
      const data = await response.json();

      if (data.success && data.results && data.results.length > 0) {
        return data.results.map(result => renderSearchResult({
          id: result.sys_id,
          type: result.table || 'incident',
          number: result.number,
          title: result.short_description || result.description,
          status: result.state || 'new',
          priority: result.priority,
          assigned_to: result.assigned_to,
        })).join('');
      } else {
        return '<div class="p-4 text-center text-text-muted text-sm">No results found</div>';
      }
    } catch (error) {
      console.error('Search error:', error);
      return '<div class="p-4 text-center text-accent-danger text-sm">Search failed. Please try again.</div>';
    }
  });
