/**
 * HTMX Search Routes - Ticket Search Functionality
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { htmx } from "@gtramontina.com/elysia-htmx";
import { ticketSearchService } from "../../services/TicketSearchService";
import { ErrorHandler } from "../../utils/ErrorHandler";

export const htmxSearchRoutes = new Elysia()
  .use(html())
  .use(htmx())

  /**
   * Search tickets by number or keywords
   */
  .get("/search", async ({ query }) => {
    const { query: searchQuery, table, state, priority } = query as any;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return `
        <div class="text-center text-gray-500 py-8">
          <p>Digite pelo menos 2 caracteres para buscar</p>
        </div>
      `;
    }

    try {
      // Use TicketSearchService to search MongoDB
      const filters = {
        table: table,
        state: state,
        priority: priority,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (!filters[key as keyof typeof filters]) {
          delete filters[key as keyof typeof filters];
        }
      });

      const results = await ticketSearchService.searchTickets(
        {
          query: searchQuery.trim(),
          limit: 20,
        },
        filters,
      );

      if (results.length === 0) {
        return `
          <div class="text-center text-gray-500 py-8">
            <p>Nenhum ticket encontrado para "${searchQuery}"</p>
          </div>
        `;
      }

      return `
        <div class="space-y-4">
          ${results
            .map(
              (ticket) => `
            <div class="ticket-card rounded-lg p-4 cursor-pointer transition-all duration-300 hover:shadow-lg" 
                 hx-get="/htmx/ticket/${ticket.sys_id}/${ticket.table}" 
                 hx-target="#ticket-modal .modal-content" 
                 hx-trigger="click"
                 onclick="BunSNC.openModal('ticket-modal')">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <h3 class="font-semibold text-white">${ticket.number}</h3>
                  <p class="text-sm text-gray-300">${getTableLabel(ticket.table)}</p>
                </div>
                <div class="flex space-x-2">
                  <span class="status-badge ${getStatusClass(ticket.state)}">${getStatusLabel(ticket.state)}</span>
                  <span class="priority-badge ${getPriorityClass(ticket.priority)}">P${ticket.priority || "N/A"}</span>
                </div>
              </div>
              <p class="text-sm text-gray-400 mb-2">${ticket.short_description || "Sem descrição"}</p>
              <div class="flex justify-between text-xs text-gray-500">
                <span>Atribuído: ${ticket.assigned_to || "Não atribuído"}</span>
                <span>Criado: ${new Date(ticket.created_on).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
        
        <script>
          function getStatusLabel(state) {
            const states = {
              '1': 'Novo',
              '2': 'Em Andamento', 
              '3': 'Trabalho em Progresso',
              '6': 'Resolvido',
              '7': 'Fechado',
              '8': 'Cancelado'
            };
            return states[state] || 'Desconhecido';
          }
          
          function getStatusClass(state) {
            const classes = {
              '1': 'status-1',
              '2': 'status-2',
              '3': 'status-3', 
              '6': 'status-6',
              '7': 'status-7',
              '8': 'status-8'
            };
            return classes[state] || 'status-badge';
          }
          
          function getPriorityClass(priority) {
            return \`priority-\${priority}\`;
          }
          
          function getTableLabel(table) {
            const labels = {
              'incident': 'Incidente',
              'change_request': 'Mudança',
              'sc_req_item': 'Item Solicitação',
              'sc_task': 'Tarefa Solicitação',
              'change_task': 'Tarefa Mudança'
            };
            return labels[table] || table;
          }
        </script>
      `;
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("HtmxSearchRoutes.search", error);
      return `
        <div class="text-center text-red-500 py-8">
          <p>Erro ao buscar tickets. Tente novamente.</p>
          <p class="text-sm mt-2">${ErrorHandler.getErrorMessage(error)}</p>
        </div>
      `;
    }
  })

  /**
   * Search form component
   */
  .get("/search-form", () => {
    return `
      <div class="bg-white rounded-lg shadow-sm border p-6 mb-6" x-data="searchComponent">
        <div class="flex flex-col md:flex-row gap-4">
          <!-- Search Input -->
          <div class="flex-1">
            <label for="search-input" class="block text-sm font-medium text-gray-700 mb-2">
              Buscar Tickets
            </label>
            <div class="relative">
              <input 
                type="text" 
                id="search-input"
                name="query"
                placeholder="Digite o número do ticket (ex: INC0012345) ou palavras-chave..."
                class="search-input w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                hx-get="/htmx/search" 
                hx-target="#search-results" 
                hx-trigger="keyup changed delay:500ms, search"
                hx-include="[name='table'], [name='state'], [name='priority']"
                hx-indicator="#search-loading"
                autocomplete="off"
                x-model="searchQuery"
                @keyup.enter="performSearch">
              <div class="absolute inset-y-0 right-0 flex items-center pr-3">
                <svg id="search-loading" class="htmx-indicator w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            </div>
          </div>

          <!-- Filter Options -->
          <div class="flex flex-col md:flex-row gap-4">
            <!-- Table Filter -->
            <div class="min-w-[150px]">
              <label for="table-filter" class="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Ticket
              </label>
              <select 
                name="table" 
                id="table-filter"
                class="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                hx-get="/htmx/search" 
                hx-target="#search-results" 
                hx-trigger="change"
                hx-include="[name='query'], [name='state'], [name='priority']"
                x-model="selectedTable">
                <option value="">Todos os tipos</option>
                <option value="incident">Incidentes</option>
                <option value="change_request">Mudanças</option>
                <option value="sc_req_item">Itens de Solicitação</option>
                <option value="sc_task">Tarefas de Solicitação</option>
                <option value="change_task">Tarefas de Mudança</option>
              </select>
            </div>

            <!-- State Filter -->
            <div class="min-w-[120px]">
              <label for="state-filter" class="block text-sm font-medium text-gray-700 mb-2">
                Estado
              </label>
              <select 
                name="state" 
                id="state-filter"
                class="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                hx-get="/htmx/search" 
                hx-target="#search-results" 
                hx-trigger="change"
                hx-include="[name='query'], [name='table'], [name='priority']"
                x-model="selectedState">
                <option value="">Todos</option>
                <option value="1">Novo</option>
                <option value="2">Em Andamento</option>
                <option value="3">Trabalho em Progresso</option>
                <option value="6">Resolvido</option>
                <option value="7">Fechado</option>
                <option value="8">Cancelado</option>
              </select>
            </div>

            <!-- Priority Filter -->
            <div class="min-w-[120px]">
              <label for="priority-filter" class="block text-sm font-medium text-gray-700 mb-2">
                Prioridade
              </label>
              <select 
                name="priority" 
                id="priority-filter"
                class="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                hx-get="/htmx/search" 
                hx-target="#search-results" 
                hx-trigger="change"
                hx-include="[name='query'], [name='table'], [name='state']"
                x-model="selectedPriority">
                <option value="">Todas</option>
                <option value="1">1 - Crítica</option>
                <option value="2">2 - Alta</option>
                <option value="3">3 - Moderada</option>
                <option value="4">4 - Baixa</option>
                <option value="5">5 - Planejamento</option>
              </select>
            </div>
          </div>

          <!-- Search Button -->
          <div class="flex items-end">
            <button 
              type="button"
              class="btn-animated px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 font-medium"
              hx-get="/htmx/search" 
              hx-target="#search-results" 
              hx-include="[name='query'], [name='table'], [name='state'], [name='priority']"
              @click="performSearch">
              <svg class="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
              Buscar
            </button>
          </div>
        </div>

        <!-- Quick Search Suggestions -->
        <div class="mt-4 flex flex-wrap gap-2">
          <span class="text-sm text-gray-600">Busca rápida:</span>
          <button 
            type="button"
            class="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
            @click="quickSearch('state=1')">
            Tickets Novos
          </button>
          <button 
            type="button"
            class="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
            @click="quickSearch('priority=1')">
            Prioridade Crítica
          </button>
          <button 
            type="button"
            class="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
            @click="quickSearch('assigned_to=javascript:gs.getUserID()')">
            Meus Tickets
          </button>
        </div>

        <script>
          document.addEventListener('alpine:init', () => {
            Alpine.data('searchComponent', () => ({
              searchQuery: '',
              selectedTable: '',
              selectedState: '',
              selectedPriority: '',
              
              performSearch() {
                htmx.trigger('#search-input', 'search');
              },
              
              quickSearch(filter) {
                // Implementation for quick search filters
                const searchInput = document.getElementById('search-input');
                htmx.ajax('GET', '/htmx/search?' + filter, '#search-results');
              }
            }));
          });
        </script>
      </div>
    `;
  });

// Helper functions
function getStatusClass(state: string): string {
  const classes: Record<string, string> = {
    "1": "status-1",
    "2": "status-2",
    "3": "status-3",
    "6": "status-6",
    "7": "status-7",
    "8": "status-8",
  };
  return classes[state] || "status-badge";
}

function getStatusLabel(state: string): string {
  const states: Record<string, string> = {
    "1": "Novo",
    "2": "Em Andamento",
    "3": "Trabalho em Progresso",
    "6": "Resolvido",
    "7": "Fechado",
    "8": "Cancelado",
  };
  return states[state] || "Desconhecido";
}

function getPriorityClass(priority: string): string {
  return `priority-${priority}`;
}

function getTableLabel(table: string): string {
  const labels: Record<string, string> = {
    incident: "Incidente",
    change_request: "Mudança",
    sc_req_item: "Item Solicitação",
    sc_task: "Tarefa Solicitação",
    change_task: "Tarefa Mudança",
  };
  return labels[table] || table;
}
