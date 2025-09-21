/**
 * HTMX Statistics Routes - ServiceNow Statistics and Metrics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { htmx } from "@gtramontina.com/elysia-htmx";

export const htmxStatisticsRoutes = new Elysia()
  .use(html())
  .use(htmx())

  /**
   * Metrics cards component
   */
  .get("/metrics", async () => {
    const metrics = {
      total_tickets: 2850,
      resolved_tickets: 1950,
      active_tickets: 900,
      response_time_avg: 24.5,
      by_type: {
        incidents: 1200,
        change_tasks: 800,
        service_catalog_tasks: 850,
      },
    };
    // Rate limiting now handled internally - using mock data for safe rendering
    const rateLimitMetrics = {
      totalRequests: 15650,
      successfulRequests: 14890,
      failedRequests: 760,
      rateLimitedRequests: 125,
      averageResponseTime: 245,
    };

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
   * Statistics page component
   */
  .get("/statistics", async () => {
    const stats = [
      {
        tipo_chamado: "incident",
        estado_numero: "1",
        status_portugues: "Novo",
        total_chamados: 125,
        percentual: 8.7,
      },
      {
        tipo_chamado: "incident",
        estado_numero: "2",
        status_portugues: "Em Andamento",
        total_chamados: 234,
        percentual: 16.4,
      },
      {
        tipo_chamado: "incident",
        estado_numero: "6",
        status_portugues: "Resolvido",
        total_chamados: 841,
        percentual: 58.8,
      },
      {
        tipo_chamado: "incident",
        estado_numero: "7",
        status_portugues: "Fechado",
        total_chamados: 230,
        percentual: 16.1,
      },
      {
        tipo_chamado: "change_task",
        estado_numero: "1",
        status_portugues: "Pendente",
        total_chamados: 45,
        percentual: 11.3,
      },
      {
        tipo_chamado: "change_task",
        estado_numero: "2",
        status_portugues: "Em Progresso",
        total_chamados: 178,
        percentual: 44.5,
      },
      {
        tipo_chamado: "change_task",
        estado_numero: "3",
        status_portugues: "Concluído",
        total_chamados: 177,
        percentual: 44.2,
      },
      {
        tipo_chamado: "sc_task",
        estado_numero: "1",
        status_portugues: "Aguardando Aprovação",
        total_chamados: 89,
        percentual: 10.5,
      },
      {
        tipo_chamado: "sc_task",
        estado_numero: "2",
        status_portugues: "Aprovado",
        total_chamados: 356,
        percentual: 41.9,
      },
      {
        tipo_chamado: "sc_task",
        estado_numero: "3",
        status_portugues: "Rejeitado",
        total_chamados: 67,
        percentual: 7.9,
      },
      {
        tipo_chamado: "sc_task",
        estado_numero: "7",
        status_portugues: "Entregue",
        total_chamados: 338,
        percentual: 39.7,
      },
    ];

    // Rate limiting now handled internally - using mock data for safe rendering
    const rateLimitStats = {
      details: {
        metrics: {
          successfulRequests: 14890,
          failedRequests: 760,
          rateLimitedRequests: 125,
          averageResponseTime: 245,
        },
      },
    };

    const groupedStats = stats.reduce(
      (acc, stat) => {
        if (!acc[stat.tipo_chamado]) acc[stat.tipo_chamado] = [];
        acc[stat.tipo_chamado].push(stat);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    const statsTable = Object.entries(groupedStats)
      .map(
        ([type, typeStats]) => `
      <div class="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 capitalize">${getTableLabel(type)}</h3>
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
              ${typeStats
                .map(
                  (stat) => `
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <span class="status-badge ${getStatusClass(stat.estado_numero)}">${stat.estado_numero}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${stat.status_portugues}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">${stat.total_chamados.toLocaleString()}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div class="flex items-center">
                      <div class="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div class="bg-blue-600 h-2 rounded-full" style="width: ${stat.percentual}%"></div>
                      </div>
                      ${stat.percentual}%
                    </div>
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `,
      )
      .join("");

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

function getTableLabel(table: string): string {
  const labels: Record<string, string> = {
    incident: "Incidentes",
    change_request: "Mudanças",
    change_task: "Tarefas de Mudança",
    sc_req_item: "Itens de Solicitação",
    sc_task: "Tarefas de Solicitação",
  };
  return labels[table] || table.replace("_", " ");
}
