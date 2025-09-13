/**
 * HTMX Ticket Routes - Ticket Operations and Details
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import { html } from '@elysiajs/html';
import { htmx } from '@gtramontina.com/elysia-htmx';
import { serviceNowAuthClient } from '../../services/ServiceNowAuthClient';

export const htmxTicketRoutes = new Elysia()
  .use(html())
  .use(htmx())
  
  /**
   * Tickets list component with pagination
   */
  .get('/tickets', async ({ query: params, hx }) => {
    const {
      table = 'incident',
      state = '',
      priority = '',
      assigned_to = '',
      assignment_group = '',
      page = '1',
      limit = '20'
    } = params as any;

    try {
      const pageNum = parseInt(page) || 1;
      const pageLimit = parseInt(limit) || 20;
      const offset = (pageNum - 1) * pageLimit;

      // Build filters
      let filters = [];
      if (state) filters.push(`state=${state}`);
      if (priority) filters.push(`priority=${priority}`);
      if (assigned_to) filters.push(`assigned_to=${assigned_to}`);
      if (assignment_group) filters.push(`assignment_group=${assignment_group}`);

      const filterQuery = filters.length > 0 ? filters.join('^') : '';

      const response = await serviceNowAuthClient.makeRequest(
        table,
        filterQuery,
        pageLimit,
        {
          sysparm_offset: offset,
          sysparm_fields: 'sys_id,number,short_description,description,state,priority,urgency,impact,assignment_group,assigned_to,caller_id,sys_created_on,sys_updated_on'
        }
      );

      const tickets = response.result || [];

      if (tickets.length === 0) {
        return `
          <div class="text-center py-12">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2M4 13h2m-6 0h.01M21 13h-.01"/>
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900">Nenhum ticket encontrado</h3>
            <p class="mt-1 text-sm text-gray-500">Tente ajustar os filtros de busca.</p>
          </div>
        `;
      }

      const ticketsList = tickets.map(ticket => `
        <div class="ticket-card rounded-lg p-6 cursor-pointer transition-all duration-300 hover:shadow-lg border" 
             hx-get="/htmx/ticket/${ticket.sys_id}/${table}" 
             hx-target="#ticket-modal .modal-content" 
             hx-trigger="click"
             onclick="BunSNC.openModal('ticket-modal')">
          
          <!-- Ticket Header -->
          <div class="flex justify-between items-start mb-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-lg font-semibold text-white">${ticket.number}</h3>
                <span class="status-badge ${getStatusClass(ticket.state)}">${getStatusLabel(ticket.state)}</span>
                <span class="priority-badge ${getPriorityClass(ticket.priority)}">P${ticket.priority || 'N/A'}</span>
              </div>
              <p class="text-sm text-gray-300 font-medium">${ticket.short_description || 'Sem título'}</p>
            </div>
            
            <div class="text-right text-xs text-gray-500">
              <div>Criado: ${new Date(ticket.sys_created_on).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}</div>
              ${ticket.sys_updated_on !== ticket.sys_created_on ? `
                <div>Atualizado: ${new Date(ticket.sys_updated_on).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit', 
                  hour: '2-digit',
                  minute: '2-digit'
                })}</div>
              ` : ''}
            </div>
          </div>

          <!-- Ticket Details -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-gray-400">Atribuído:</span>
              <span class="text-gray-200 ml-2">${ticket.assigned_to || 'Não atribuído'}</span>
            </div>
            <div>
              <span class="text-gray-400">Grupo:</span>
              <span class="text-gray-200 ml-2">${ticket.assignment_group || 'Não definido'}</span>
            </div>
            <div>
              <span class="text-gray-400">Solicitante:</span>
              <span class="text-gray-200 ml-2">${ticket.caller_id || 'N/A'}</span>
            </div>
            <div>
              <span class="text-gray-400">Urgência/Impacto:</span>
              <span class="text-gray-200 ml-2">${ticket.urgency || 'N/A'}/${ticket.impact || 'N/A'}</span>
            </div>
          </div>

          <!-- Description Preview -->
          ${ticket.description ? `
            <div class="mt-4 pt-4 border-t border-gray-700">
              <p class="text-sm text-gray-400 line-clamp-2">${ticket.description.substring(0, 150)}${ticket.description.length > 150 ? '...' : ''}</p>
            </div>
          ` : ''}

          <!-- Quick Actions -->
          <div class="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center">
            <div class="flex gap-2">
              <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                ${getTableLabel(table)}
              </span>
            </div>
            <div class="text-xs text-gray-500">
              Clique para ver detalhes →
            </div>
          </div>
        </div>
      `).join('');

      // Pagination
      const hasMore = tickets.length === pageLimit;
      const pagination = `
        <div class="flex justify-between items-center mt-6 p-4 bg-gray-50 rounded-lg">
          <div class="text-sm text-gray-600">
            Página ${pageNum} • ${tickets.length} tickets
          </div>
          <div class="flex gap-2">
            ${pageNum > 1 ? `
              <button 
                class="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                hx-get="/htmx/tickets?${new URLSearchParams({...params as any, page: String(pageNum - 1)}).toString()}"
                hx-target="#tickets-list">
                ← Anterior
              </button>
            ` : ''}
            ${hasMore ? `
              <button 
                class="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                hx-get="/htmx/tickets?${new URLSearchParams({...params as any, page: String(pageNum + 1)}).toString()}"
                hx-target="#tickets-list">
                Próxima →
              </button>
            ` : ''}
          </div>
        </div>
      `;

      return ticketsList + pagination;

    } catch (error) {
      console.error('Error loading tickets:', error);
      return `
        <div class="text-center py-12 text-red-600">
          <p>Erro ao carregar tickets. Tente novamente.</p>
        </div>
      `;
    }
  })

  /**
   * Complete ticket details with SLA information
   */
  .get('/ticket/:sysId/:table', async ({ params: { sysId, table } }) => {
    try {
      // Get ticket details
      const response = await serviceNowAuthClient.makeRequest(
        table,
        `sys_id=${sysId}`,
        1,
        {
          sysparm_fields: 'sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,sys_created_on,sys_updated_on,work_notes,close_notes,resolution_code,resolved_at,closed_at'
        }
      );

      if (!response.result || response.result.length === 0) {
        return `
          <div class="text-center py-8">
            <p class="text-red-600">Ticket não encontrado</p>
          </div>
        `;
      }

      const ticket = response.result[0];

      // Try to get SLA information
      let slaInfo = [];
      try {
        const slaResponse = await serviceNowAuthClient.makeRequest(
          'task_sla',
          `task=${sysId}^active=true`,
          5,
          {
            sysparm_fields: 'sys_id,sla,stage,percentage,business_percentage,has_breached,breach_time,business_time_left,time_left,start_time,end_time,business_duration,duration'
          }
        );
        
        if (slaResponse.result) {
          slaInfo = slaResponse.result;
        }
      } catch (slaError) {
        console.warn('SLA information not available:', slaError);
      }

      // Format date helper
      const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      };

      // Get status info
      function getStateInfo(state: string) {
        const states: Record<string, {label: string, color: string}> = {
          '1': { label: 'Novo', color: 'bg-blue-100 text-blue-800' },
          '2': { label: 'Em Andamento', color: 'bg-yellow-100 text-yellow-800' },
          '3': { label: 'Trabalho em Progresso', color: 'bg-orange-100 text-orange-800' },
          '6': { label: 'Resolvido', color: 'bg-green-100 text-green-800' },
          '7': { label: 'Fechado', color: 'bg-gray-100 text-gray-800' },
          '8': { label: 'Cancelado', color: 'bg-red-100 text-red-800' }
        };
        return states[state] || { label: 'Desconhecido', color: 'bg-gray-100 text-gray-800' };
      }

      // Get priority info
      function getPriorityInfo(priority: string) {
        const priorities: Record<string, {label: string, color: string}> = {
          '1': { label: 'Crítica', color: 'bg-red-100 text-red-800' },
          '2': { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
          '3': { label: 'Moderada', color: 'bg-yellow-100 text-yellow-800' },
          '4': { label: 'Baixa', color: 'bg-green-100 text-green-800' },
          '5': { label: 'Planejamento', color: 'bg-blue-100 text-blue-800' }
        };
        return priorities[priority] || { label: 'N/A', color: 'bg-gray-100 text-gray-800' };
      }

      // Format time remaining
      function formatTimeRemaining(timeStr: string) {
        if (!timeStr) return 'N/A';
        
        // Parse duration (assuming format like "2 Days 3 Hours 45 Minutes")
        const match = timeStr.match(/(\d+)\s*Days?\s*(\d+)\s*Hours?\s*(\d+)\s*Minutes?/i);
        if (match) {
          const days = parseInt(match[1] || '0');
          const hours = parseInt(match[2] || '0'); 
          const minutes = parseInt(match[3] || '0');
          
          if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
          } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
          }
          return `${minutes}m`;
        }
        
        return timeStr;
      }

      const stateInfo = getStateInfo(ticket.state);
      const priorityInfo = getPriorityInfo(ticket.priority);

      return `
        <div class="max-w-4xl mx-auto bg-white">
          <!-- Modal Header -->
          <div class="flex justify-between items-center p-6 border-b border-gray-200">
            <div class="flex items-center gap-4">
              <h2 class="text-2xl font-bold text-gray-900">${ticket.number}</h2>
              <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${stateInfo.color}">
                ${stateInfo.label}
              </span>
              <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${priorityInfo.color}">
                Prioridade ${priorityInfo.label}
              </span>
            </div>
            <button 
              class="text-gray-400 hover:text-gray-600 transition-colors"
              onclick="BunSNC.closeModal('ticket-modal')">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <!-- Ticket Content -->
          <div class="p-6 space-y-6">
            <!-- Basic Information -->
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-3">Informações Básicas</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="font-medium text-gray-600">Título:</span>
                  <p class="mt-1 text-gray-900">${ticket.short_description || 'Sem título'}</p>
                </div>
                <div>
                  <span class="font-medium text-gray-600">Categoria:</span>
                  <p class="mt-1 text-gray-900">${ticket.category || 'N/A'} ${ticket.subcategory ? `/ ${ticket.subcategory}` : ''}</p>
                </div>
                <div>
                  <span class="font-medium text-gray-600">Atribuído a:</span>
                  <p class="mt-1 text-gray-900">${ticket.assigned_to || 'Não atribuído'}</p>
                </div>
                <div>
                  <span class="font-medium text-gray-600">Grupo de Atribuição:</span>
                  <p class="mt-1 text-gray-900">${ticket.assignment_group || 'Não definido'}</p>
                </div>
                <div>
                  <span class="font-medium text-gray-600">Solicitante:</span>
                  <p class="mt-1 text-gray-900">${ticket.caller_id || 'N/A'}</p>
                </div>
                <div>
                  <span class="font-medium text-gray-600">Urgência / Impacto:</span>
                  <p class="mt-1 text-gray-900">${ticket.urgency || 'N/A'} / ${ticket.impact || 'N/A'}</p>
                </div>
              </div>
            </div>

            <!-- Description -->
            ${ticket.description ? `
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Descrição</h3>
                <div class="bg-gray-50 rounded-lg p-4">
                  <p class="text-gray-700 whitespace-pre-wrap">${ticket.description}</p>
                </div>
              </div>
            ` : ''}

            <!-- Timeline -->
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-3">Timeline</h3>
              <div class="space-y-3">
                <div class="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                  <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900">Ticket Criado</p>
                    <p class="text-xs text-gray-600">${formatDate(ticket.sys_created_on)}</p>
                  </div>
                </div>
                
                ${ticket.sys_updated_on !== ticket.sys_created_on ? `
                  <div class="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                    <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <div class="flex-1">
                      <p class="text-sm font-medium text-gray-900">Última Atualização</p>
                      <p class="text-xs text-gray-600">${formatDate(ticket.sys_updated_on)}</p>
                    </div>
                  </div>
                ` : ''}

                ${ticket.resolved_at ? `
                  <div class="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div class="flex-1">
                      <p class="text-sm font-medium text-gray-900">Resolvido</p>
                      <p class="text-xs text-gray-600">${formatDate(ticket.resolved_at)}</p>
                    </div>
                  </div>
                ` : ''}

                ${ticket.closed_at ? `
                  <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div class="w-2 h-2 bg-gray-500 rounded-full"></div>
                    <div class="flex-1">
                      <p class="text-sm font-medium text-gray-900">Fechado</p>
                      <p class="text-xs text-gray-600">${formatDate(ticket.closed_at)}</p>
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- SLA Information -->
            ${slaInfo.length > 0 ? `
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Informações de SLA</h3>
                <div class="space-y-3">
                  ${slaInfo.map(sla => `
                    <div class="border border-gray-200 rounded-lg p-4 ${sla.has_breached === 'true' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}">
                      <div class="flex justify-between items-start mb-2">
                        <h4 class="font-medium text-gray-900">${sla.sla || 'SLA'}</h4>
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          sla.has_breached === 'true' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }">
                          ${sla.has_breached === 'true' ? 'Violado' : 'No Prazo'}
                        </span>
                      </div>
                      <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span class="text-gray-600">Progresso:</span>
                          <div class="mt-1">
                            <div class="w-full bg-gray-200 rounded-full h-2">
                              <div class="bg-blue-500 h-2 rounded-full" style="width: ${sla.percentage || 0}%"></div>
                            </div>
                            <span class="text-xs text-gray-600">${sla.percentage || 0}%</span>
                          </div>
                        </div>
                        <div>
                          <span class="text-gray-600">Tempo Restante:</span>
                          <p class="text-gray-900">${formatTimeRemaining(sla.time_left || sla.business_time_left)}</p>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Work Notes -->
            ${ticket.work_notes ? `
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Notas de Trabalho</h3>
                <div class="bg-gray-50 rounded-lg p-4">
                  <p class="text-gray-700 whitespace-pre-wrap">${ticket.work_notes}</p>
                </div>
              </div>
            ` : ''}

            <!-- Resolution Information -->
            ${ticket.resolution_code || ticket.close_notes ? `
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Resolução</h3>
                <div class="bg-green-50 rounded-lg p-4">
                  ${ticket.resolution_code ? `
                    <div class="mb-3">
                      <span class="font-medium text-gray-600">Código de Resolução:</span>
                      <p class="text-gray-900">${ticket.resolution_code}</p>
                    </div>
                  ` : ''}
                  ${ticket.close_notes ? `
                    <div>
                      <span class="font-medium text-gray-600">Notas de Fechamento:</span>
                      <p class="text-gray-700 whitespace-pre-wrap">${ticket.close_notes}</p>
                    </div>
                  ` : ''}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Modal Footer -->
          <div class="flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50">
            <div class="text-sm text-gray-600">
              Ticket ID: ${ticket.sys_id}
            </div>
            <div class="flex gap-3">
              <button 
                class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                onclick="BunSNC.closeModal('ticket-modal')">
                Fechar
              </button>
              <button 
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                onclick="window.open('https://instance.service-now.com/${table}.do?sys_id=${ticket.sys_id}', '_blank')">
                Abrir no ServiceNow
              </button>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Error loading ticket details:', error);
      return `
        <div class="text-center py-8">
          <p class="text-red-600">Erro ao carregar detalhes do ticket</p>
          <button 
            class="mt-2 px-4 py-2 text-sm bg-gray-200 rounded-lg hover:bg-gray-300"
            onclick="BunSNC.closeModal('ticket-modal')">
            Fechar
          </button>
        </div>
      `;
    }
  });

// Helper functions
function getStatusClass(state: string): string {
  const classes: Record<string, string> = {
    '1': 'status-1',
    '2': 'status-2',
    '3': 'status-3', 
    '6': 'status-6',
    '7': 'status-7',
    '8': 'status-8'
  };
  return classes[state] || 'status-badge';
}

function getStatusLabel(state: string): string {
  const states: Record<string, string> = {
    '1': 'Novo',
    '2': 'Em Andamento',
    '3': 'Trabalho em Progresso',
    '6': 'Resolvido', 
    '7': 'Fechado',
    '8': 'Cancelado'
  };
  return states[state] || 'Desconhecido';
}

function getPriorityClass(priority: string): string {
  return `priority-${priority}`;
}

function getTableLabel(table: string): string {
  const labels: Record<string, string> = {
    'incident': 'Incidente',
    'change_request': 'Mudança',
    'sc_req_item': 'Item Solicitação',
    'sc_task': 'Tarefa Solicitação', 
    'change_task': 'Tarefa Mudança'
  };
  return labels[table] || table;
}