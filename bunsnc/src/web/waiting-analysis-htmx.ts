/**
 * HTMX Page for Waiting Tickets Analysis - Real ServiceNow API Integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';
import { htmx } from '@gtramontina.com/elysia-htmx';
import { serviceNowAuthClient } from '../services/ServiceNowAuthClient';

const FALLBACK_GROUPS = [
    "L2-NE-IT APP AND DATABASE",
    "L2-NE-IT SAP BASIS", 
    "L2-NE-IT APP AND SERVICES",
    "L2-NE-IT PROCESSING",
    "L2-NE-IT NETWORK SECURITY",
    "L2-NE-IT NETWORK",
    "L2-NE-CLOUDSERVICES",
    "L2-NE-IT MONITORY",
    "L2-NE-IT SO UNIX",
    "L2-NE-IT BOC",
    "L2-NE-IT MIDDLEWARE",
    "L2-NE-IT BACKUP",
    "L2-NE-IT STORAGE",
    "L2-NE-IT VOIP",
    "L2-NE-IT NOC",
    "L2-NE-IT PCP PRODUCTION"
];

interface WaitingTicketSummary {
    grupo: string;
    incidents_waiting: number;
    ctasks_waiting: number;
    sctasks_waiting: number;
    total_waiting: number;
}

async function getRealWaitingData(): Promise<WaitingTicketSummary[]> {
    try {
        return await serviceNowAuthClient.getWaitingTicketsSummary(FALLBACK_GROUPS);
    } catch (error) {
        console.error('Error getting real ServiceNow data:', error);
        // Fallback to empty array if ServiceNow is unavailable
        return FALLBACK_GROUPS.map(grupo => ({
            grupo,
            incidents_waiting: 0,
            ctasks_waiting: 0,
            sctasks_waiting: 0,
            total_waiting: 0
        }));
    }
}

async function getRealTicketDetails(group?: string): Promise<any[]> {
    try {
        const groupsToQuery = group ? [group] : FALLBACK_GROUPS;
        return await serviceNowAuthClient.getWaitingTicketsDetails(groupsToQuery);
    } catch (error) {
        console.error('Error getting real ServiceNow ticket details:', error);
        // Return empty array if ServiceNow is unavailable
        return [];
    }
}

export const waitingAnalysisHtmx = new Elysia({ prefix: '/waiting-analysis' })
  .use(html())
  .use(htmx())
  
  /**
   * Main waiting analysis page
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
            <title>BunSNC - Análise de Chamados em Espera</title>
            <script src="https://unpkg.com/htmx.org@1.9.10"></script>
            <script src="https://unpkg.com/alpinejs@3.13.5/dist/cdn.min.js" defer></script>
            <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
            <style>
                .htmx-request { opacity: 0.7; transition: opacity 0.3s; }
                .htmx-request::after { content: " ⏳"; }
                .priority-critical { @apply bg-red-100 text-red-800 border-red-300; }
                .priority-high { @apply bg-orange-100 text-orange-800 border-orange-300; }
                .priority-moderate { @apply bg-yellow-100 text-yellow-800 border-yellow-300; }
                .priority-low { @apply bg-green-100 text-green-800 border-green-300; }
                .group-card { @apply bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow cursor-pointer; }
                .ticket-card { @apply bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow; }
            </style>
        </head>
        <body class="bg-gray-50 min-h-screen">
            <div class="container mx-auto px-4 py-6">
                
                <!-- Header -->
                <header class="mb-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h1 class="text-3xl font-bold text-gray-900">Análise de Chamados em Espera</h1>
                            <p class="text-gray-600">Monitoramento dos grupos de fallback TARGET_GROUPS</p>
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-gray-500">Última atualização:</div>
                            <div class="text-sm font-medium text-gray-900" id="last-update">
                                ${new Date().toLocaleString('pt-BR')}
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Controls -->
                <div class="bg-white rounded-lg shadow-sm border p-4 mb-6">
                    <div class="flex items-center justify-between">
                        <div class="flex space-x-4">
                            <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
                                    hx-get="/waiting-analysis/summary"
                                    hx-target="#main-content">
                                 Resumo por Grupos
                            </button>
                            <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500"
                                    hx-get="/waiting-analysis/details"
                                    hx-target="#main-content">
                                📋 Chamados Detalhados
                            </button>
                            <button class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 focus:ring-2 focus:ring-purple-500"
                                    hx-get="/waiting-analysis/critical"
                                    hx-target="#main-content">
                                🚨 Apenas Críticos
                            </button>
                            <button class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500"
                                    hx-get="/waiting-analysis/cache-metrics"
                                    hx-target="#main-content">
                                 Cache Metrics
                            </button>
                        </div>
                        
                        <button class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:ring-2 focus:ring-gray-500"
                                hx-get="/waiting-analysis/summary"
                                hx-target="#main-content"
                                title="Atualizar dados">
                             Atualizar
                        </button>
                    </div>
                </div>

                <!-- Main Content -->
                <div id="main-content"
                     hx-get="/waiting-analysis/summary" 
                     hx-trigger="load"
                     class="min-h-96">
                    <div class="text-center py-12">
                        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p class="text-gray-600">Carregando dados dos chamados em espera...</p>
                    </div>
                </div>

                <!-- Auto-refresh every 5 minutes -->
                <div hx-get="/waiting-analysis/summary" 
                     hx-trigger="every 300s"
                     hx-target="#main-content"
                     hx-swap="innerHTML"
                     style="display: none;">
                </div>

            </div>

            <script>
                // Update timestamp on refresh
                document.body.addEventListener('htmx:afterRequest', function(event) {
                    document.getElementById('last-update').textContent = new Date().toLocaleString('pt-BR');
                });
                
                // Show loading state
                document.body.addEventListener('htmx:beforeRequest', function(event) {
                    event.target.classList.add('htmx-request');
                });
                
                document.body.addEventListener('htmx:afterRequest', function(event) {
                    event.target.classList.remove('htmx-request');
                });
            </script>
        </body>
        </html>
      `;
    }
    
    // HTMX partial response
    return '<div>Waiting Analysis Dashboard updated via HTMX</div>';
  })

  /**
   * Summary by groups component
   */
  .get('/summary', async () => {
    const data = await getRealWaitingData();
    data.sort((a, b) => b.total_waiting - a.total_waiting);
    
    let totalIncidents = 0;
    let totalCtasks = 0;
    let totalSctasks = 0;
    let totalWaiting = 0;
    
    const groupCards = data.map(item => {
        totalIncidents += item.incidents_waiting;
        totalCtasks += item.ctasks_waiting;
        totalSctasks += item.sctasks_waiting;
        totalWaiting += item.total_waiting;
        
        const statusColor = item.total_waiting === 0 ? 'green' : 
                           item.total_waiting >= 5 ? 'red' : 'yellow';
        
        return `
            <div class="group-card border-l-4 border-${statusColor}-500"
                 hx-get="/waiting-analysis/group-details?group=${encodeURIComponent(item.grupo)}"
                 hx-target="#main-content">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h3 class="font-semibold text-gray-900 mb-2">${item.grupo}</h3>
                        <div class="grid grid-cols-3 gap-2 text-sm">
                            <div class="text-center">
                                <div class="font-bold text-blue-600">${item.incidents_waiting}</div>
                                <div class="text-gray-500">Incidents</div>
                            </div>
                            <div class="text-center">
                                <div class="font-bold text-purple-600">${item.ctasks_waiting}</div>
                                <div class="text-gray-500">CTasks</div>
                            </div>
                            <div class="text-center">
                                <div class="font-bold text-green-600">${item.sctasks_waiting}</div>
                                <div class="text-gray-500">SCTasks</div>
                            </div>
                        </div>
                    </div>
                    <div class="ml-4 text-right">
                        <div class="text-2xl font-bold text-gray-900">${item.total_waiting}</div>
                        <div class="text-sm text-gray-500">Total</div>
                        ${item.total_waiting > 0 ? 
                            `<div class="text-xs px-2 py-1 mt-1 bg-${statusColor}-100 text-${statusColor}-800 rounded">
                                ${item.total_waiting >= 5 ? 'Alto' : 'Médio'}
                            </div>` : 
                            `<div class="text-xs px-2 py-1 mt-1 bg-green-100 text-green-800 rounded">
                                OK
                            </div>`
                        }
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div>
            <!-- Summary Cards -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="text-2xl font-bold text-blue-600">${totalIncidents}</div>
                    <div class="text-sm text-gray-600">Incidents em Espera</div>
                </div>
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="text-2xl font-bold text-purple-600">${totalCtasks}</div>
                    <div class="text-sm text-gray-600">Change Tasks em Espera</div>
                </div>
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="text-2xl font-bold text-green-600">${totalSctasks}</div>
                    <div class="text-sm text-gray-600">SC Tasks em Espera</div>
                </div>
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="text-2xl font-bold text-red-600">${totalWaiting}</div>
                    <div class="text-sm text-gray-600">Total em Espera</div>
                </div>
            </div>

            <!-- Groups Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${groupCards}
            </div>
            
            ${totalWaiting === 0 ? 
                `<div class="text-center py-8">
                    <div class="text-6xl mb-4">🎉</div>
                    <h3 class="text-xl font-semibold text-green-600 mb-2">Excelente!</h3>
                    <p class="text-gray-600">Nenhum chamado em espera nos grupos de fallback!</p>
                </div>` : ''
            }
        </div>
    `;
  })

  /**
   * Detailed tickets view
   */
  .get('/details', async ({ query }) => {
    const group = query.group as string;
    const tickets = await getRealTicketDetails(group);
    
    const ticketsHtml = tickets.map((ticket, index) => {
        const priorityClass = 
            ticket.prioridade.includes('Critical') ? 'priority-critical' :
            ticket.prioridade.includes('High') ? 'priority-high' :
            ticket.prioridade.includes('Moderate') ? 'priority-moderate' : 'priority-low';
            
        const typeIcon = 
            ticket.tipo_chamado === 'incident' ? '🎫' :
            ticket.tipo_chamado === 'change_task' ? '' : '📋';
            
        return `
            <div class="ticket-card">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center space-x-2">
                        <span class="text-lg">${typeIcon}</span>
                        <span class="font-semibold text-gray-900">${ticket.numero}</span>
                        <span class="px-2 py-1 text-xs rounded border ${priorityClass}">
                            ${ticket.prioridade}
                        </span>
                    </div>
                    <div class="text-sm text-gray-500">
                        ${new Date(ticket.data_criacao).toLocaleDateString('pt-BR')}
                    </div>
                </div>
                
                <h4 class="font-medium text-gray-900 mb-2">${ticket.descricao}</h4>
                
                <div class="grid grid-cols-2 gap-4 text-sm text-gray-600">
                    <div>
                        <span class="font-medium">Grupo:</span> ${ticket.grupo_atribuicao}
                    </div>
                    <div>
                        <span class="font-medium">Status:</span> ${ticket.status_portugues}
                    </div>
                    <div>
                        <span class="font-medium">Aberto por:</span> ${ticket.opened_by}
                    </div>
                    <div>
                        <span class="font-medium">Tipo:</span> ${ticket.tipo_chamado.replace('_', ' ').toUpperCase()}
                    </div>
                </div>
                
                <div class="mt-3 flex justify-between items-center">
                    <div class="text-xs text-gray-500">
                        ID: ${ticket.sys_id}
                    </div>
                    <button class="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        Ver Detalhes →
                    </button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div>
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-semibold text-gray-900">
                    ${group ? `Chamados em Espera - ${group}` : 'Todos os Chamados em Espera'}
                </h2>
                <div class="text-sm text-gray-600">
                    ${tickets.length} chamados encontrados
                </div>
            </div>
            
            <div class="space-y-4">
                ${ticketsHtml || '<div class="text-center py-8 text-gray-500">Nenhum chamado em espera encontrado</div>'}
            </div>
        </div>
    `;
  })

  /**
   * Critical tickets only
   */
  .get('/critical', async () => {
    const allTickets = await getRealTicketDetails();
    const tickets = allTickets.filter(t => 
        t.prioridade?.includes('Critical') || t.prioridade?.includes('High')
    );
    
    const criticalHtml = tickets.map(ticket => `
        <div class="ticket-card border-l-4 border-red-500">
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center space-x-2">
                    <span class="text-lg">🚨</span>
                    <span class="font-semibold text-gray-900">${ticket.numero}</span>
                    <span class="px-2 py-1 text-xs rounded border priority-critical">
                        ${ticket.prioridade}
                    </span>
                </div>
                <div class="text-sm text-red-600 font-medium">
                    ${Math.floor((Date.now() - new Date(ticket.data_criacao).getTime()) / (1000 * 60 * 60))}h em espera
                </div>
            </div>
            
            <h4 class="font-medium text-gray-900 mb-2">${ticket.descricao}</h4>
            <p class="text-sm text-gray-600 mb-3">👥 ${ticket.grupo_atribuicao}</p>
            
            <div class="flex justify-between items-center">
                <div class="text-xs text-gray-500">
                    Aberto por ${ticket.opened_by}
                </div>
                <button class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">
                    Escalar Agora
                </button>
            </div>
        </div>
    `).join('');

    return `
        <div>
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-semibold text-red-600">🚨 Chamados Críticos e Altos em Espera</h2>
                <div class="px-3 py-1 bg-red-100 text-red-800 rounded text-sm font-medium">
                    ${tickets.length} chamados críticos
                </div>
            </div>
            
            ${tickets.length > 0 ? 
                `<div class="space-y-4">${criticalHtml}</div>` :
                `<div class="text-center py-8">
                    <div class="text-6xl mb-4"></div>
                    <h3 class="text-xl font-semibold text-green-600 mb-2">Ótimo!</h3>
                    <p class="text-gray-600">Nenhum chamado crítico em espera no momento.</p>
                </div>`
            }
        </div>
    `;
  })

  /**
   * Group details
   */
  .get('/group-details', async ({ query }) => {
    const group = query.group as string;
    if (!group) return '<div>Grupo não especificado</div>';
    
    const tickets = await getRealTicketDetails(group);
    
    return `
        <div>
            <div class="mb-6">
                <button class="text-blue-600 hover:text-blue-800 mb-4"
                        hx-get="/waiting-analysis/summary"
                        hx-target="#main-content">
                    ← Voltar ao Resumo
                </button>
                <h2 class="text-xl font-semibold text-gray-900">${group}</h2>
                <p class="text-gray-600">${tickets.length} chamados em espera neste grupo</p>
            </div>
            
            <div class="space-y-4">
                ${tickets.map(ticket => `
                    <div class="ticket-card">
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <div class="flex items-center space-x-2 mb-2">
                                    <span class="font-semibold">${ticket.numero}</span>
                                    <span class="px-2 py-1 text-xs rounded border ${
                                        ticket.prioridade.includes('Critical') ? 'priority-critical' :
                                        ticket.prioridade.includes('High') ? 'priority-high' :
                                        ticket.prioridade.includes('Moderate') ? 'priority-moderate' : 'priority-low'
                                    }">
                                        ${ticket.prioridade}
                                    </span>
                                </div>
                                <p class="text-gray-700 mb-2">${ticket.descricao}</p>
                                <div class="text-sm text-gray-500">
                                    Criado em ${new Date(ticket.data_criacao).toLocaleString('pt-BR')} por ${ticket.opened_by}
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
  })

  /**
   * Cache metrics endpoint
   */
  .get('/cache-metrics', async () => {
    try {
      const metrics = serviceNowAuthClient.getCacheMetrics();
      
      return `
        <div class="bg-white p-6 rounded-lg shadow">
          <h3 class="text-lg font-semibold mb-4"> Métricas do Redis Cache</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center">
              <div class="text-2xl font-bold text-green-600">${(metrics.hitRate * 100).toFixed(1)}%</div>
              <div class="text-sm text-gray-600">Hit Rate</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-blue-600">${metrics.hits}</div>
              <div class="text-sm text-gray-600">Cache Hits</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-red-600">${metrics.misses}</div>
              <div class="text-sm text-gray-600">Cache Misses</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-purple-600">${metrics.totalKeys}</div>
              <div class="text-sm text-gray-600">Total Keys</div>
            </div>
          </div>
          <div class="mt-4 pt-4 border-t">
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div><strong>Sets:</strong> ${metrics.sets}</div>
              <div><strong>Deletes:</strong> ${metrics.deletes}</div>
              <div><strong>Evictions:</strong> ${metrics.evictions}</div>
              <div><strong>Memory:</strong> ${(metrics.totalSize / 1024).toFixed(1)} KB</div>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      return `
        <div class="bg-red-50 p-4 rounded">
          <p class="text-red-600">Erro ao carregar métricas do cache</p>
        </div>
      `;
    }
  });

export default waitingAnalysisHtmx;