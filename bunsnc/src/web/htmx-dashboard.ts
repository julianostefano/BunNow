/**
 * HTMX Dashboard Routes for Ultra-Fast ServiceNow UI
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import { html } from '@elysiajs/html';
import { htmx } from '@gtramontina.com/elysia-htmx';
import { serviceNowRepository } from '../repositories/ServiceNowRepository';
import { serviceNowStreams } from '../config/redis-streams';
import { serviceNowRateLimiter } from '../services/ServiceNowRateLimit';

export const htmxDashboard = new Elysia({ prefix: '/htmx' })
  .use(html())
  .use(htmx())
  
  /**
   * Main dashboard page with HTMX layout
   */
  .get('/', ({ hx, set }) => {
    if (!hx.isHTMX) {
      // Full page for direct access
      return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BunSNC - ServiceNow Dashboard</title>
            <script src="https://unpkg.com/htmx.org@1.9.10"></script>
            <script src="https://unpkg.com/htmx.org/dist/ext/ws.js"></script>
            <script src="https://unpkg.com/alpinejs@3.13.5/dist/cdn.min.js" defer></script>
            <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
            <style>
                .htmx-request { opacity: 0.7; transition: opacity 0.3s; }
                .htmx-request::after { content: " ⏳"; }
                .status-badge { @apply px-2 py-1 rounded text-xs font-medium; }
                .status-novo { @apply bg-blue-100 text-blue-800; }
                .status-andamento { @apply bg-yellow-100 text-yellow-800; }
                .status-resolvido { @apply bg-green-100 text-green-800; }
                .status-fechado { @apply bg-gray-100 text-gray-800; }
                .status-cancelado { @apply bg-red-100 text-red-800; }
                .metric-card { @apply bg-white rounded-lg shadow-sm border p-4; }
                .search-container { @apply bg-white rounded-lg shadow-sm border p-4; }
            </style>
        </head>
        <body class="bg-gray-50 min-h-screen">
            <div class="container mx-auto px-4 py-6">
                
                <!-- Header -->
                <header class="mb-6">
                    <h1 class="text-3xl font-bold text-gray-900 mb-2">BunSNC Dashboard</h1>
                    <p class="text-gray-600">ServiceNow Real-time Management System</p>
                    
                    <!-- Health Status -->
                    <div id="health-status" 
                         hx-get="/htmx/health" 
                         hx-trigger="load, every 30s"
                         class="mt-4 p-2 rounded-lg">
                    </div>
                </header>

                <!-- Metrics Cards -->
                <section id="metrics-section" 
                         hx-get="/htmx/metrics" 
                         hx-trigger="load, every 60s"
                         class="mb-6">
                    <div class="text-center py-8">⏳ Carregando métricas...</div>
                </section>

                <!-- Search and Filters -->
                <section class="search-container mb-6">
                    <div hx-get="/htmx/search-form" 
                         hx-trigger="load"
                         hx-target="#search-container">
                        <div class="text-center py-4">⏳ Carregando filtros...</div>
                    </div>
                    <div id="search-container"></div>
                </section>

                <!-- Results Section -->
                <section>
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-semibold text-gray-900">Chamados</h2>
                        <div class="flex space-x-2">
                            <button class="btn-active px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
                                    hx-get="/htmx/tickets?type=active"
                                    hx-target="#tickets-list">
                                Ativos
                            </button>
                            <button class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                                    hx-get="/htmx/tickets?type=resolved"
                                    hx-target="#tickets-list">
                                Finalizados
                            </button>
                        </div>
                    </div>
                    
                    <div id="tickets-list" 
                         hx-get="/htmx/tickets?type=active" 
                         hx-trigger="load"
                         class="space-y-2">
                        <div class="text-center py-8">⏳ Carregando chamados...</div>
                    </div>

                    <!-- Load More Button -->
                    <div id="load-more-container" class="mt-4 text-center">
                        <!-- Will be populated by ticket list response -->
                    </div>
                </section>

                <!-- Real-time Updates via WebSocket -->
                <div hx-ext="ws" 
                     ws-connect="/ws/dashboard" 
                     hx-trigger="wsMessage"
                     id="ws-updates">
                </div>

            </div>

            <!-- Global notification area -->
            <div id="notifications" class="fixed top-4 right-4 space-y-2" style="z-index: 1000;"></div>

            <script>
                // Custom HTMX configurations
                htmx.config.requestClass = 'htmx-request';
                htmx.config.defaultSwapStyle = 'innerHTML';
                
                // Handle WebSocket messages for real-time updates
                document.body.addEventListener('wsMessage', function(event) {
                    const data = JSON.parse(event.detail.message);
                    if (data.type === 'metrics_updated') {
                        htmx.trigger('#metrics-section', 'refresh');
                    } else if (data.type === 'ticket_updated') {
                        htmx.trigger('#tickets-list', 'refresh');
                    }
                });

                // Auto-refresh on visibility change (user returns to tab)
                document.addEventListener('visibilitychange', function() {
                    if (!document.hidden) {
                        htmx.trigger('#metrics-section', 'refresh');
                        htmx.trigger('#tickets-list', 'refresh');
                    }
                });
            </script>
        </body>
        </html>
      `;
    }
    
    // HTMX partial response
    return '<div>Dashboard updated via HTMX</div>';
  })

  /**
   * Health status component
   */
  .get('/health', async () => {
    const dbHealth = await serviceNowRepository.getHealthStats();
    const streamHealth = await serviceNowStreams.healthCheck();
    const rateLimitHealth = serviceNowRateLimiter.getHealthStatus();

    const overallStatus = 
      streamHealth.status === 'healthy' && 
      rateLimitHealth.status === 'healthy' ? 'healthy' : 'degraded';

    const statusColor = overallStatus === 'healthy' ? 'green' : 'yellow';

    return `
      <div class="flex items-center space-x-4 p-3 bg-${statusColor}-50 border border-${statusColor}-200 rounded-lg">
        <div class="flex-shrink-0">
          <div class="h-2 w-2 bg-${statusColor}-500 rounded-full"></div>
        </div>
        <div class="flex-1">
          <div class="text-sm font-medium text-${statusColor}-800">
            Sistema: ${overallStatus === 'healthy' ? 'Operacional' : 'Degradado'}
          </div>
          <div class="text-xs text-${statusColor}-600">
            DB: ${Object.values(dbHealth.table_counts).reduce((a: number, b: number) => a + b, 0)} tickets | 
            Streams: ${streamHealth.status} | 
            Rate Limit: ${rateLimitHealth.details.metrics.currentConcurrentRequests}/${rateLimitHealth.details.config.maxConcurrentRequests} conexões
          </div>
        </div>
        <div class="text-xs text-${statusColor}-600">
          ${new Date().toLocaleTimeString('pt-BR')}
        </div>
      </div>
    `;
  })

  /**
   * Metrics cards component
   */
  .get('/metrics', async () => {
    const metrics = await serviceNowRepository.getServiceNowMetrics();
    const rateLimitMetrics = serviceNowRateLimiter.getMetrics();

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="metric-card">
          <div class="text-2xl font-bold text-blue-600">${metrics.total_tickets.toLocaleString()}</div>
          <div class="text-sm text-gray-600">Total de Chamados</div>
        </div>
        
        <div class="metric-card">
          <div class="text-2xl font-bold text-green-600">${metrics.resolved_tickets.toLocaleString()}</div>
          <div class="text-sm text-gray-600">Finalizados</div>
          <div class="text-xs text-gray-500">
            ${Math.round((metrics.resolved_tickets / metrics.total_tickets) * 100)}% do total
          </div>
        </div>
        
        <div class="metric-card">
          <div class="text-2xl font-bold text-yellow-600">${metrics.active_tickets.toLocaleString()}</div>
          <div class="text-sm text-gray-600">Ativos</div>
          <div class="text-xs text-gray-500">
            Tempo médio: ${metrics.response_time_avg}h
          </div>
        </div>
        
        <div class="metric-card">
          <div class="text-2xl font-bold text-purple-600">${rateLimitMetrics.totalRequests.toLocaleString()}</div>
          <div class="text-sm text-gray-600">Requests Processados</div>
          <div class="text-xs text-gray-500">
            ${Math.round((rateLimitMetrics.successfulRequests / rateLimitMetrics.totalRequests) * 100)}% sucesso
          </div>
        </div>
      </div>

      <!-- Breakdown by type -->
      <div class="bg-white rounded-lg shadow-sm border p-4 mb-4">
        <h3 class="font-semibold text-gray-900 mb-3">Por Tipo de Chamado</h3>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <div class="text-lg font-bold text-red-600">${metrics.by_type.incidents.toLocaleString()}</div>
            <div class="text-xs text-gray-600">Incidents</div>
          </div>
          <div>
            <div class="text-lg font-bold text-blue-600">${metrics.by_type.change_tasks.toLocaleString()}</div>
            <div class="text-xs text-gray-600">Change Tasks</div>
          </div>
          <div>
            <div class="text-lg font-bold text-green-600">${metrics.by_type.service_catalog_tasks.toLocaleString()}</div>
            <div class="text-xs text-gray-600">Service Catalog</div>
          </div>
        </div>
      </div>
    `;
  })

  /**
   * Search form component
   */
  .get('/search-form', () => {
    return `
      <form hx-get="/htmx/tickets" 
            hx-target="#tickets-list" 
            hx-trigger="submit, change delay:500ms"
            class="space-y-4">
        
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <input type="text" 
                   name="search" 
                   placeholder="Número, descrição..."
                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select name="ticketType" 
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">Todos</option>
              <option value="incident">Incidents</option>
              <option value="change_task">Change Tasks</option>
              <option value="sc_task">Service Catalog</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select name="status" 
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">Todos</option>
              <option value="1">Novo/Pending</option>
              <option value="2">Em Andamento/Open</option>
              <option value="3">Em Espera/WIP</option>
              <option value="6">Resolvido</option>
              <option value="7">Fechado</option>
              <option value="8">Cancelado</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Grupo</label>
            <input type="text" 
                   name="assignmentGroup" 
                   placeholder="Grupo de atribuição"
                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
        
        <div class="flex justify-between items-center">
          <div class="flex space-x-2">
            <button type="button" 
                    class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    onclick="this.form.reset(); htmx.trigger(this.form, 'submit')">
              Limpar Filtros
            </button>
          </div>
          
          <button type="submit" 
                  class="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500">
            Buscar
          </button>
        </div>
      </form>
    `;
  })

  /**
   * Tickets list component with pagination
   */
  .get('/tickets', async ({ query: params, hx }) => {
    const {
      type = 'active',
      search = '',
      ticketType = '',
      status = '',
      assignmentGroup = '',
      page = '1'
    } = params as any;

    const limit = 20;
    const offset = (parseInt(page) - 1) * limit;

    let tickets;
    
    if (search || ticketType || status || assignmentGroup) {
      // Use search with filters
      tickets = await serviceNowRepository.searchTickets(
        search, 
        ticketType, 
        status, 
        assignmentGroup, 
        undefined, 
        undefined, 
        limit, 
        offset
      );
    } else if (type === 'resolved') {
      tickets = await serviceNowRepository.getResolvedTickets(limit, offset);
    } else {
      tickets = await serviceNowRepository.getActiveTickets(limit, offset);
    }

    const hasMore = tickets.length === limit;
    const nextPage = parseInt(page) + 1;

    function getStatusBadgeClass(status: string, statusText: string): string {
      if (statusText.includes('Resolvido') || statusText.includes('Fechado Completo')) return 'status-resolvido';
      if (statusText.includes('Fechado') || statusText.includes('Cancelado')) return 'status-fechado';
      if (statusText.includes('Andamento') || statusText.includes('Open') || statusText.includes('WIP')) return 'status-andamento';
      if (statusText.includes('Novo') || statusText.includes('Pending')) return 'status-novo';
      return 'bg-gray-100 text-gray-800';
    }

    const ticketsList = tickets.map(ticket => `
      <div class="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1">
            <div class="flex items-center space-x-2 mb-1">
              <span class="font-semibold text-gray-900">${ticket.numero}</span>
              <span class="status-badge ${getStatusBadgeClass(ticket.estado_numero, ticket.status_portugues)}">
                ${ticket.status_portugues}
              </span>
              <span class="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
                ${ticket.tipo_chamado.replace('_', ' ')}
              </span>
            </div>
            <p class="text-sm text-gray-700 mb-2">${ticket.descricao || 'Sem descrição'}</p>
            <div class="text-xs text-gray-500">
              Grupo: ${ticket.grupo_atribuicao || 'Não atribuído'}
              ${ticket.data_fechamento ? ` | Fechado: ${new Date(ticket.data_fechamento).toLocaleDateString('pt-BR')}` : ''}
            </div>
          </div>
          <div class="flex-shrink-0 ml-4">
            <button class="text-blue-600 hover:text-blue-800 text-sm"
                    hx-get="/htmx/ticket/${ticket.sys_id}/${ticket.tipo_chamado}"
                    hx-target="#ticket-modal"
                    hx-trigger="click">
              Ver Detalhes
            </button>
          </div>
        </div>
      </div>
    `).join('');

    const loadMoreButton = hasMore ? `
      <button class="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
              hx-get="/htmx/tickets?${new URLSearchParams({...params, page: nextPage.toString()}).toString()}"
              hx-target="#tickets-list"
              hx-swap="beforeend"
              hx-select=".bg-white.border">
        Carregar Mais (página ${nextPage})
      </button>
    ` : '';

    // Only return tickets if it's a pagination request (page > 1)
    if (parseInt(page) > 1 && hx.request) {
      return ticketsList;
    }

    // Full response with load more button
    return `
      ${ticketsList}
      <div id="load-more-container" class="mt-4">
        ${loadMoreButton}
      </div>
    `;
  })

  /**
   * Ticket details modal
   */
  .get('/ticket/:sysId/:type', async ({ params: { sysId, type } }) => {
    const ticket = await serviceNowRepository.getTicketDetails(sysId, type);
    
    if (!ticket) {
      return `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="ticket-modal">
          <div class="bg-white rounded-lg p-6 max-w-md w-full m-4">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">Erro</h2>
            <p class="text-gray-600 mb-4">Chamado não encontrado</p>
            <button class="px-4 py-2 bg-gray-600 text-white rounded-lg"
                    onclick="document.getElementById('ticket-modal').remove()">
              Fechar
            </button>
          </div>
        </div>
      `;
    }

    const data = ticket.ticket_data;
    
    return `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="ticket-modal">
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full m-4 max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-start mb-4">
            <h2 class="text-lg font-semibold text-gray-900">Detalhes do Chamado</h2>
            <button class="text-gray-400 hover:text-gray-600"
                    onclick="document.getElementById('ticket-modal').remove()">
              ✕
            </button>
          </div>
          
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">Número</label>
                <p class="text-sm text-gray-900">${data.number || 'N/A'}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Estado</label>
                <p class="text-sm text-gray-900">${data.state || 'N/A'}</p>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700">Descrição</label>
              <p class="text-sm text-gray-900">${data.short_description || 'N/A'}</p>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700">Descrição Completa</label>
              <p class="text-sm text-gray-900 max-h-32 overflow-y-auto">${data.description || 'N/A'}</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">Grupo de Atribuição</label>
                <p class="text-sm text-gray-900">${data.assignment_group?.display_value || data.assignment_group || 'N/A'}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Atribuído a</label>
                <p class="text-sm text-gray-900">${data.assigned_to?.display_value || data.assigned_to || 'N/A'}</p>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">Criado em</label>
                <p class="text-sm text-gray-900">${data.sys_created_on ? new Date(data.sys_created_on).toLocaleString('pt-BR') : 'N/A'}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Atualizado em</label>
                <p class="text-sm text-gray-900">${data.sys_updated_on ? new Date(data.sys_updated_on).toLocaleString('pt-BR') : 'N/A'}</p>
              </div>
            </div>
            
            ${data.closed_at ? `
              <div>
                <label class="block text-sm font-medium text-gray-700">Fechado em</label>
                <p class="text-sm text-gray-900">${new Date(data.closed_at).toLocaleString('pt-BR')}</p>
              </div>
            ` : ''}
          </div>
          
          <div class="flex justify-end space-x-2 mt-6">
            <button class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    onclick="document.getElementById('ticket-modal').remove()">
              Fechar
            </button>
          </div>
        </div>
      </div>
    `;
  })

  /**
   * Statistics page component
   */
  .get('/statistics', async () => {
    const stats = await serviceNowRepository.getStatusStatistics();
    const rateLimitStats = serviceNowRateLimiter.getHealthStatus();
    
    const groupedStats = stats.reduce((acc, stat) => {
      if (!acc[stat.tipo_chamado]) acc[stat.tipo_chamado] = [];
      acc[stat.tipo_chamado].push(stat);
      return acc;
    }, {} as Record<string, any[]>);

    const statsTable = Object.entries(groupedStats).map(([type, typeStats]) => `
      <div class="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 capitalize">${type.replace('_', ' ')}</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">%</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${typeStats.map(stat => `
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${stat.estado_numero}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${stat.status_portugues}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${stat.total_chamados.toLocaleString()}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${stat.percentual}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');

    return `
      <div class="space-y-6">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 class="text-xl font-semibold text-blue-900 mb-2">Estatísticas por Status</h2>
          <p class="text-blue-700 text-sm">Distribuição de chamados por tipo e estado</p>
        </div>
        
        ${statsTable}
        
        <div class="bg-white rounded-lg shadow-sm border p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Rate Limiter Status</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center">
              <div class="text-2xl font-bold text-green-600">${rateLimitStats.details.metrics.successfulRequests}</div>
              <div class="text-sm text-gray-600">Sucessos</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-red-600">${rateLimitStats.details.metrics.failedRequests}</div>
              <div class="text-sm text-gray-600">Falhas</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-yellow-600">${rateLimitStats.details.metrics.rateLimitedRequests}</div>
              <div class="text-sm text-gray-600">Rate Limited</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-blue-600">${rateLimitStats.details.metrics.averageResponseTime}ms</div>
              <div class="text-sm text-gray-600">Tempo Médio</div>
            </div>
          </div>
        </div>
      </div>
    `;
  });

export default htmxDashboard;