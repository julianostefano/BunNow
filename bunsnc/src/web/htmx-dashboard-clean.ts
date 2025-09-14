/**
 * HTMX Dashboard Routes - Clean ElysiaJS Theme
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import { html } from '@elysiajs/html';
import { htmx } from '@gtramontina.com/elysia-htmx';
import { serviceNowAuthClient } from '../services/ServiceNowAuthClient';

// Temporarily commenting out problematic imports to isolate circular dependency issue
// import { HybridTicketService } from '../services/HybridTicketService';
// import { ConsolidatedDataService } from '../services/ConsolidatedDataService';
// Note: TicketDetailsRoutes handled by main app to avoid circular dependency
// import { createTicketListRoutes } from '../routes/TicketListRoutes';
// import { 
//   TICKET_TYPES, 
//   getStatusConfig, 
//   getActiveStatuses, 
//   getAllStatuses,
//   getUserActions,
//   STATUS_FILTERS 
// } from '../config/servicenow-status';

// Helper function to initialize services safely - temporarily disabled for circular dependency fix
async function initializeCleanServices() {
  try {
    // const mongoService = new ConsolidatedDataService();
    // const hybridService = new HybridTicketService(mongoService, serviceNowAuthClient);
    return { mongoService: null, hybridService: null, error: null };
  } catch (error) {
    console.error('❌ Clean Dashboard Services initialization error:', error);
    return { mongoService: null, hybridService: null, error };
  }
}

/**
 * Centralized Status Mapping System
 * Handles conversion between named states (frontend) and numeric codes (ServiceNow API)
 */
interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  numericCode: string;
}

// Unified state mapping - source of truth for all status conversions
const UNIFIED_STATUS_MAP: Record<string, StatusConfig> = {
  // Named states (used by frontend)
  'new': { 
    label: 'Novo', 
    color: 'text-blue-300', 
    bgColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    numericCode: '1'
  },
  'in_progress': { 
    label: 'Em Andamento', 
    color: 'text-yellow-300', 
    bgColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    numericCode: '2'
  },
  'designated': { 
    label: 'Designado', 
    color: 'text-indigo-300', 
    bgColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    numericCode: '18'
  },
  'assigned': { 
    label: 'Atribuído', 
    color: 'text-purple-300', 
    bgColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    numericCode: '18'  // Same as designated - ServiceNow uses same code
  },
  'waiting': { 
    label: 'Em Espera', 
    color: 'text-orange-300', 
    bgColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    numericCode: '3'
  },
  'awaiting': { 
    label: 'Aguardando', 
    color: 'text-amber-300', 
    bgColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    numericCode: '3'  // Same as waiting - ServiceNow uses same code
  },
  'resolved': { 
    label: 'Resolvido', 
    color: 'text-green-300', 
    bgColor: 'bg-green-500/20 text-green-300 border-green-500/30',
    numericCode: '6'
  },
  'closed': { 
    label: 'Fechado', 
    color: 'text-gray-300', 
    bgColor: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    numericCode: '7'
  },
  'cancelled': { 
    label: 'Cancelado', 
    color: 'text-red-300', 
    bgColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    numericCode: '8'
  },
  // Additional states for Change Tasks
  'scheduled': { 
    label: 'Agendado', 
    color: 'text-purple-300', 
    bgColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    numericCode: '4'
  },
  'complete': { 
    label: 'Completo', 
    color: 'text-emerald-300', 
    bgColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    numericCode: '6'
  },
  // Additional states for SC Tasks
  'closed_complete': { 
    label: 'Fechado Completo', 
    color: 'text-green-300', 
    bgColor: 'bg-green-500/20 text-green-300 border-green-500/30',
    numericCode: '3'
  },
  'closed_incomplete': { 
    label: 'Fechado Incompleto', 
    color: 'text-amber-300', 
    bgColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    numericCode: '4'
  },
  'closed_skipped': { 
    label: 'Fechado Ignorado', 
    color: 'text-gray-400', 
    bgColor: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
    numericCode: '7'
  },
  // Numeric states (returned by ServiceNow API) - mapped back to same config
  '1': { 
    label: 'Novo', 
    color: 'text-blue-300', 
    bgColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    numericCode: '1'
  },
  '2': { 
    label: 'Em Andamento', 
    color: 'text-yellow-300', 
    bgColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    numericCode: '2'
  },
  '18': { 
    label: 'Designado', 
    color: 'text-indigo-300', 
    bgColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    numericCode: '18'
  },
  '3': { 
    label: 'Em Espera', 
    color: 'text-orange-300', 
    bgColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    numericCode: '3'
  },
  '6': { 
    label: 'Resolvido', 
    color: 'text-green-300', 
    bgColor: 'bg-green-500/20 text-green-300 border-green-500/30',
    numericCode: '6'
  },
  '7': { 
    label: 'Fechado', 
    color: 'text-gray-300', 
    bgColor: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    numericCode: '7'
  },
  '8': { 
    label: 'Cancelado', 
    color: 'text-red-300', 
    bgColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    numericCode: '8'
  },
  // Additional numeric codes for extended states
  '4': { 
    label: 'Agendado/Incompleto', 
    color: 'text-purple-300', 
    bgColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    numericCode: '4'
  }
};

/**
 * Get status configuration for any state (named or numeric)
 * @param state - The state value (e.g., 'designated', '18', 'in_progress', '2')
 * @returns StatusConfig object with label, colors, and numeric code
 */
function getUnifiedStatusConfig(state: string): StatusConfig {
  const config = UNIFIED_STATUS_MAP[state];
  if (!config) {
    console.warn(`Unknown state: ${state}, using default`);
    return {
      label: 'Desconhecido',
      color: 'text-gray-300',
      bgColor: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
      numericCode: '1'
    };
  }
  return config;
}

/**
 * Safely format dates to avoid "Data inválida" errors
 * @param dateValue - Date value from ServiceNow (can be null/undefined/string/object)
 * @returns Formatted date string or fallback message
 */
function formatSafeDate(dateValue: any): string {
  if (!dateValue || dateValue === 'null' || dateValue === '' || dateValue === 'undefined') {
    return 'Data não informada';
  }
  
  try {
    // Handle ServiceNow object format {display_value: "date", value: "date"}
    const dateToFormat = (typeof dateValue === 'object' && dateValue.display_value) 
      ? dateValue.display_value 
      : dateValue;
    
    const date = new Date(dateToFormat);
    if (isNaN(date.getTime())) {
      return 'Data não disponível';
    }
    
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    console.warn('Date formatting error:', error, 'for value:', dateValue);
    return 'Data não disponível';
  }
}

/**
 * Convert named state to numeric code for ServiceNow API
 * @param namedState - Named state like 'designated', 'in_progress'
 * @returns Numeric code like '18', '2'
 */
function stateToNumeric(namedState: string): string {
  // If already numeric, return as-is
  if (/^\d+$/.test(namedState)) {
    return namedState;
  }
  
  const config = getUnifiedStatusConfig(namedState);
  console.log(`🔄 State mapping: ${namedState} → ${config.numericCode} (${config.label})`);
  return config.numericCode;
}

export const htmxDashboardClean = new Elysia({ prefix: '/clean' })
  .use(html())
  .use(htmx())
  .decorate('serviceNowAuthClient', serviceNowAuthClient)
  // Global error handler to prevent "_r_r is not defined" Elysia bug
  .onError({ as: 'global' }, (context) => {
    const { code, error, set } = context;
    
    console.error(`🚨 [GLOBAL ERROR HANDLER] Code: ${code}, Error: ${error?.message || 'Unknown'}`);
    
    // Handle NOT_FOUND errors that trigger the _r_r bug
    if (code === 'NOT_FOUND') {
      set.status = 404;
      set.headers['content-type'] = 'text/html; charset=utf-8';
      
      return `
        <!DOCTYPE html>
        <html lang="pt-BR" class="h-full">
        <head>
            <meta charset="UTF-8">
            <title>404 - Página não encontrada</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="h-full bg-gray-900 text-white flex items-center justify-center">
            <div class="text-center">
                <h1 class="text-4xl font-bold mb-4">404 - Página não encontrada</h1>
                <p class="text-gray-400 mb-6">A página solicitada não foi encontrada.</p>
                <a href="/clean/" class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg">
                    Voltar ao Dashboard
                </a>
            </div>
        </body>
        </html>
      `;
    }
    
    // Handle other errors safely
    set.status = error?.status || 500;
    set.headers['content-type'] = 'text/html; charset=utf-8';
    
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <title>Erro - BunSNC Dashboard</title>
          <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-900 text-white">
          <div class="min-h-screen flex items-center justify-center">
              <div class="text-center">
                  <h1 class="text-2xl font-bold mb-4">Erro no Sistema</h1>
                  <p class="text-gray-400 mb-4">Ocorreu um erro interno. Tente novamente.</p>
                  <button onclick="window.location.reload()" 
                          class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg">
                      Recarregar
                  </button>
              </div>
          </div>
      </body>
      </html>
    `;
  })
  
  // Serve CSS using Bun.file() - correct Elysia pattern
  .get('/styles.css', () => {
    return Bun.file('/storage/enviroments/integrations/nex/BunNow/bunsnc/public/styles.css');
  })
  
  /**
   * Main dashboard page - Clean ElysiaJS Theme
   */
  .get('/', async ({ hx, set }) => {
    try {
      // Initialize services safely - will be used by HTMX endpoints
      const services = await initializeCleanServices();
      if (services.error && !hx.isHTMX) {
        // Return fallback page for full page loads when services fail
        return `
          <!DOCTYPE html>
          <html lang="pt-BR" class="h-full">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>BunSNC Dashboard - Service Unavailable</title>
              <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="h-full bg-gray-100 flex items-center justify-center">
              <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
                  <div class="text-center">
                      <div class="text-red-500 text-6xl mb-4">⚠️</div>
                      <h1 class="text-2xl font-bold text-gray-900 mb-2">Dashboard Clean Indisponível</h1>
                      <p class="text-gray-600 mb-4">Os serviços MongoDB ou ServiceNow estão indisponíveis.</p>
                      <div class="text-sm text-gray-500 mb-4">
                          <p><strong>Erro:</strong> ${services.error.message}</p>
                      </div>
                      <div class="space-y-2">
                          <a href="/health" class="block w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600">
                              Verificar Status da API
                          </a>
                          <a href="/enhanced/" class="block w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600">
                              Dashboard Enhanced
                          </a>
                          <button onclick="window.location.reload()" class="block w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600">
                              Tentar Novamente
                          </button>
                      </div>
                  </div>
              </div>
          </body>
          </html>
        `;
      }
      
    if (!hx.isHTMX) {
      return `
        <!DOCTYPE html>
        <html lang="pt-BR" class="h-full">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BunSNC Dashboard - ElysiaJS Style</title>
            <!-- Alpine.js MUST be loaded for state selector to work -->
            <script src="/public/js/htmx.min.js"></script>
            <script src="/public/js/alpine.min.js" defer></script>
            <script>
                // Global closeModal function - always available
                window.closeModal = function() {
                    const modals = document.querySelectorAll('[id*="Modal"], [id*="modal"]');
                    modals.forEach(modal => {
                        if (modal && modal.style.display !== 'none') {
                            modal.remove();
                        }
                    });
                };
                
                // Ensure closeModal is available after HTMX content swaps
                document.addEventListener('htmx:afterSwap', function(evt) {
                    window.closeModal = function() {
                        const modals = document.querySelectorAll('[id*="Modal"], [id*="modal"]');
                        modals.forEach(modal => {
                            if (modal && modal.style.display !== 'none') {
                                modal.remove();
                            }
                        });
                    };
                });
            </script>
            <link href="/public/css/tailwind.min.css" rel="stylesheet">
            <script src="/public/js/lucide-local.min.js"></script>
            <style>
                .gradient-bg {
                    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                }
                .card-gradient {
                    background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
                }
                .glass-effect {
                    backdrop-filter: blur(10px);
                    background: rgba(30, 41, 59, 0.8);
                }
            </style>
        </head>
        <body class="h-full gradient-bg text-white font-sans antialiased">
            
            <!-- Header -->
            <header class="border-b border-gray-700">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <div class="w-10 h-10 bg-gradient-to-r from-elysia-blue to-elysia-purple rounded-lg flex items-center justify-center">
                                <i data-lucide="activity" class="w-6 h-6 text-white"></i>
                            </div>
                            <div>
                                <h1 class="text-2xl font-bold text-white">BunSNC Dashboard</h1>
                                <p class="text-sm text-gray-300">ServiceNow Real-time Management powered by Elysia</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="flex items-center justify-end space-x-2 mb-1">
                                <div id="servicenow-status" class="flex items-center space-x-2">
                                    <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                                    <span class="text-sm text-green-400">ServiceNow Connected</span>
                                </div>
                            </div>
                            <div class="flex items-center justify-end space-x-2">
                                <div id="rate-limit-indicator" class="flex items-center space-x-1">
                                    <div class="w-2 h-2 bg-blue-400 rounded-full"></div>
                                    <span class="text-xs text-gray-400" id="rate-limit-text">25 req/s limit</span>
                                </div>
                                <div class="text-xs text-gray-500 font-mono">Bun + HTMX</div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Main Content -->
            <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                
                <!-- Metrics Cards with Smart Refresh -->
                <div id="metrics-section" 
                     hx-get="/clean/metrics" 
                     hx-trigger="load, every 60s[document.visibilityState === 'visible']"
                     class="mb-8">
                    <div class="text-center py-8">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-elysia-blue mx-auto mb-4"></div>
                        <p class="text-gray-400">Carregando métricas...</p>
                    </div>
                </div>

                <!-- Search Section -->
                <div class="glass-effect rounded-xl border border-gray-600 p-8 mb-8">
                    <div class="text-center mb-8">
                        <h2 class="text-2xl font-bold text-white mb-2">Buscar Tickets ServiceNow</h2>
                        <p class="text-gray-300">Digite o número do ticket ou palavras-chave para buscar</p>
                    </div>

                    <!-- Search Form -->
                    <form hx-get="/clean/search" 
                          hx-target="#search-results" 
                          hx-trigger="submit, keyup delay:1s changed"
                          hx-indicator="#search-loading"
                          class="max-w-2xl mx-auto">
                        
                        <div class="relative">
                            <input type="text" 
                                   name="query" 
                                   placeholder="INC0012345, SCTASK0067890, CTASK0034567 ou palavras-chave..."
                                   class="w-full px-6 py-4 text-lg bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-elysia-blue focus:border-elysia-blue transition-all duration-300"
                                   autocomplete="off">
                            
                            <!-- Search Icon -->
                            <div class="absolute right-4 top-1/2 transform -translate-y-1/2">
                                <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                            </div>
                            
                            <!-- Loading Indicator -->
                            <div id="search-loading" class="htmx-indicator absolute right-12 top-1/2 transform -translate-y-1/2">
                                <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-elysia-blue"></div>
                            </div>
                        </div>
                        
                        <div class="mt-3 text-center">
                            <p class="text-sm text-gray-400">
                                Exemplos: <span class="font-mono text-elysia-cyan">INC0012345</span>, 
                                <span class="font-mono text-elysia-cyan">SCTASK0067890</span>, 
                                <span class="font-mono text-elysia-cyan">falha de rede</span>
                            </p>
                        </div>
                    </form>
                </div>

                <!-- Search Results -->
                <div id="search-results" class="min-h-[200px]">
                    <div class="text-center py-12 text-gray-400">
                        <i data-lucide="search" class="w-16 h-16 mx-auto mb-4 text-gray-500"></i>
                        <p>Digite acima para buscar tickets</p>
                    </div>
                </div>

                <!-- Tickets Dashboard com Abas -->
                <div class="mt-8" x-data="{ 
                    activeTab: 'incident', 
                    group: 'all', 
                    state: 'in_progress',
                    autoRefreshPaused: false,
                    refreshInterval: 15,
                    // Mapeamento de labels de estado
                    stateLabels: {
                        'all': 'Todos Status',
                        'new': 'Novo',
                        'in_progress': 'Em Andamento', 
                        'designated': 'Designado',
                        'waiting': 'Em Espera',
                        'resolved': 'Resolvido',
                        'closed': 'Fechado',
                        'cancelled': 'Cancelado'
                    },
                    // Status específicos por tipo de ticket usando estados nomeados consistentes
                    ticketTypeStates: {
                        incident: {
                            'all': 'Todos Status',
                            'new': 'Novo',
                            'in_progress': 'Em Andamento', 
                            'assigned': 'Designado',
                            'awaiting': 'Em Espera',
                            'resolved': 'Resolvido',
                            'closed': 'Fechado',
                            'cancelled': 'Cancelado'
                        },
                        change_task: {
                            'all': 'Todos Status',
                            'new': 'Novo',
                            'in_progress': 'Em Andamento',
                            'awaiting': 'Em Espera',
                            'scheduled': 'Agendado',
                            'complete': 'Completo',
                            'closed': 'Fechado',
                            'cancelled': 'Cancelado'
                        },
                        sc_task: {
                            'all': 'Todos Status',
                            'new': 'Novo',
                            'in_progress': 'Em Andamento',
                            'awaiting': 'Em Espera',
                            'closed_complete': 'Fechado Completo',
                            'closed_incomplete': 'Fechado Incompleto',
                            'closed_skipped': 'Fechado Ignorado'
                        }
                    },
                    // Getter para status disponíveis do tipo ativo
                    get availableStates() {
                        return this.ticketTypeStates[this.activeTab] || {};
                    },
                    loadTab(tabType) {
                        this.activeTab = tabType;
                        // Trigger lazy loading for the selected tab
                        htmx.ajax('GET', \`/clean/tickets-lazy?group=\${this.group}&ticketType=\${tabType}&state=\${this.state}&page=1&limit=10\`, {
                            target: \`#tickets-container-\${tabType}\`,
                            swap: 'innerHTML'
                        });
                    },
                    updateFilters() {
                        // Update active tab content when filters change
                        this.loadTab(this.activeTab);
                    },
                    toggleAutoRefresh() {
                        this.autoRefreshPaused = !this.autoRefreshPaused;
                        console.log('Auto-refresh:', this.autoRefreshPaused ? 'Pausado' : 'Ativo');
                    },
                    adjustRefreshInterval(interval) {
                        this.refreshInterval = interval;
                        console.log('Intervalo de atualização ajustado para:', interval + 's');
                    }
                }">
                
                    <!-- Filters Section -->
                    <div class="flex items-center justify-between mb-6">
                        <h3 class="text-xl font-semibold text-white">Dashboard de Chamados</h3>
                        
                        <div class="flex space-x-4">
                            <!-- Group Filter -->
                            <div class="relative">
                                <select x-model="group" @change="updateFilters()"
                                        class="appearance-none bg-gray-800 border border-gray-600 text-white px-4 py-2 pr-8 rounded-lg text-sm hover:border-elysia-blue focus:border-elysia-blue focus:ring-2 focus:ring-elysia-blue focus:ring-opacity-50 transition-all duration-300">
                                    <option value="all">Todos os Grupos</option>
                                    <option value="L2-NE-IT APP AND DATABASE">App & Database</option>
                                    <option value="L2-NE-IT SAP BASIS">SAP Basis</option>
                                    <option value="L2-NE-IT APP AND SERVICES">App & Services</option>
                                    <option value="L2-NE-IT PROCESSING">Processing</option>
                                    <option value="L2-NE-IT NETWORK SECURITY">Network Security</option>
                                    <option value="L2-NE-IT NETWORK">Network</option>
                                    <option value="L2-NE-CLOUDSERVICES">Cloud Services</option>
                                    <option value="L2-NE-IT MONITORY">Monitoring</option>
                                    <option value="L2-NE-IT SO UNIX">Unix Systems</option>
                                    <option value="L2-NE-IT BOC">BOC</option>
                                    <option value="L2-NE-IT MIDDLEWARE">Middleware</option>
                                    <option value="L2-NE-IT BACKUP">Backup</option>
                                    <option value="L2-NE-IT STORAGE">Storage</option>
                                    <option value="L2-NE-IT VOIP">VoIP</option>
                                    <option value="L2-NE-IT NOC">NOC</option>
                                    <option value="L2-NE-IT PCP PRODUCTION">PCP Production</option>
                                </select>
                                <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                    <i data-lucide="building" class="w-4 h-4 text-gray-400"></i>
                                </div>
                            </div>
                            
                            <!-- Status Filter - Dynamic per Ticket Type -->
                            <div class="relative">
                                <select x-model="state" @change="updateFilters()"
                                        class="appearance-none bg-gray-800 border border-gray-600 text-white px-4 py-2 pr-8 rounded-lg text-sm hover:border-elysia-blue focus:border-elysia-blue focus:ring-2 focus:ring-elysia-blue focus:ring-opacity-50 transition-all duration-300">
                                    <template x-for="(label, value) in availableStates" :key="value">
                                        <option :value="value" x-text="label" :selected="state === value"></option>
                                    </template>
                                </select>
                                <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                    <i data-lucide="filter" class="w-4 h-4 text-gray-400"></i>
                                </div>
                            </div>
                            
                            <!-- Auto-Refresh Controls -->
                            <div class="flex items-center space-x-3">
                                <button @click="toggleAutoRefresh()" 
                                        :class="autoRefreshPaused ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'"
                                        class="px-3 py-2 text-white text-xs rounded-lg transition-colors duration-300 flex items-center space-x-2">
                                    <i :data-lucide="autoRefreshPaused ? 'play' : 'pause'" class="w-3 h-3"></i>
                                    <span x-text="autoRefreshPaused ? 'Retomar' : 'Pausar'"></span>
                                </button>
                                <select x-model="refreshInterval" @change="adjustRefreshInterval(refreshInterval)"
                                        class="appearance-none bg-gray-800 border border-gray-600 text-white px-3 py-2 pr-6 rounded-lg text-xs hover:border-elysia-blue focus:border-elysia-blue focus:ring-2 focus:ring-elysia-blue focus:ring-opacity-50 transition-all duration-300">
                                    <option value="5">5s</option>
                                    <option value="15">15s</option>
                                    <option value="30">30s</option>
                                    <option value="60">1min</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Tabs Navigation -->
                    <div class="mb-6">
                        <nav class="flex space-x-1 bg-gray-800/50 p-1 rounded-xl border border-gray-700">
                            <button @click="loadTab('incident')" 
                                    :class="activeTab === 'incident' ? 
                                        'bg-gradient-to-r from-elysia-blue to-elysia-cyan text-white shadow-lg scale-105' : 
                                        'text-gray-400 hover:text-white hover:bg-gray-700/50'"
                                    class="flex items-center px-6 py-3 text-sm font-medium rounded-lg transition-all duration-300 transform">
                                <i data-lucide="alert-circle" class="w-4 h-4 mr-2"></i>
                                Incidents
                                <span class="ml-2 px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-300" 
                                      x-show="activeTab === 'incident'" id="incident-count">0</span>
                            </button>
                            <button @click="loadTab('change_task')" 
                                    :class="activeTab === 'change_task' ? 
                                        'bg-gradient-to-r from-elysia-blue to-elysia-cyan text-white shadow-lg scale-105' : 
                                        'text-gray-400 hover:text-white hover:bg-gray-700/50'"
                                    class="flex items-center px-6 py-3 text-sm font-medium rounded-lg transition-all duration-300 transform">
                                <i data-lucide="git-branch" class="w-4 h-4 mr-2"></i>
                                Change Tasks
                                <span class="ml-2 px-2 py-1 text-xs rounded-full bg-orange-500/20 text-orange-300" 
                                      x-show="activeTab === 'change_task'" id="change_task-count">0</span>
                            </button>
                            <button @click="loadTab('sc_task')" 
                                    :class="activeTab === 'sc_task' ? 
                                        'bg-gradient-to-r from-elysia-blue to-elysia-cyan text-white shadow-lg scale-105' : 
                                        'text-gray-400 hover:text-white hover:bg-gray-700/50'"
                                    class="flex items-center px-6 py-3 text-sm font-medium rounded-lg transition-all duration-300 transform">
                                <i data-lucide="shopping-cart" class="w-4 h-4 mr-2"></i>
                                Service Tasks
                                <span class="ml-2 px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-300" 
                                      x-show="activeTab === 'sc_task'" id="sc_task-count">0</span>
                            </button>
                        </nav>
                    </div>
                    
                    <!-- Auto-load ticket counts -->
                    <div hx-get="/clean/ticket-counts" 
                         hx-trigger="load, every 30s"
                         hx-swap="outerHTML"></div>

                    <!-- Status Info Banner with Refresh Indicator -->
                    <div class="mb-6 p-4 bg-gradient-to-r from-gray-800/50 to-gray-700/50 rounded-xl border border-gray-600">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <i data-lucide="info" class="w-5 h-5 text-elysia-blue"></i>
                                <span class="text-white font-medium">
                                    Exibindo tickets <span x-text="stateLabels[state]" class="text-elysia-cyan font-semibold"></span>
                                    <span x-show="group !== 'all'"> do grupo <span x-text="group" class="text-elysia-cyan font-semibold"></span></span>
                                </span>
                                
                                <!-- Auto-refresh indicator -->
                                <div id="refresh-indicator" class="htmx-indicator flex items-center">
                                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-elysia-blue mr-2"></div>
                                    <span class="text-xs text-elysia-blue">Atualizando...</span>
                                </div>
                            </div>
                            <div class="flex items-center space-x-4">
                                <div class="text-xs text-gray-400">
                                    <i data-lucide="calendar" class="w-4 h-4 inline mr-1"></i>
                                    Mês atual
                                </div>
                                <div class="text-xs text-green-400">
                                    <i data-lucide="refresh-cw" class="w-4 h-4 inline mr-1"></i>
                                    Auto-refresh: 30s
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Tabs Content with Lazy Loading -->
                    <div class="space-y-6">
                        
                        <!-- Incidents Tab -->
                        <div x-show="activeTab === 'incident'" 
                             x-transition:enter="transition ease-out duration-300"
                             x-transition:enter-start="opacity-0 transform translate-y-4"
                             x-transition:enter-end="opacity-100 transform translate-y-0"
                             class="space-y-4">
                            <div id="tickets-container-incident" 
                                 hx-get="/clean/tickets-lazy?group=all&ticketType=incident&state=in_progress&page=1&limit=10"
                                 hx-trigger="load, every 15s[document.visibilityState === 'visible' && !$autoRefreshPaused]"
                                 hx-indicator="#refresh-indicator"
                                 class="space-y-4"
                                 data-refresh-type="critical">
                                <!-- Skeleton Loading -->
                                <div class="space-y-4">
                                    <div class="bg-gray-700/30 rounded-lg border border-gray-600/50 p-4 animate-pulse">
                                        <div class="flex justify-between items-start mb-3">
                                            <div class="flex items-center space-x-3">
                                                <div class="h-6 bg-gray-600 rounded w-24"></div>
                                                <div class="h-6 bg-gray-600 rounded w-16"></div>
                                            </div>
                                            <div class="h-5 bg-gray-600 rounded w-20"></div>
                                        </div>
                                        <div class="h-4 bg-gray-600 rounded w-full mb-2"></div>
                                        <div class="h-4 bg-gray-600 rounded w-3/4 mb-3"></div>
                                        <div class="flex justify-between items-center text-sm">
                                            <div class="h-4 bg-gray-600 rounded w-32"></div>
                                            <div class="h-8 bg-gray-600 rounded w-24"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Change Tasks Tab -->
                        <div x-show="activeTab === 'change_task'" 
                             x-transition:enter="transition ease-out duration-300"
                             x-transition:enter-start="opacity-0 transform translate-y-4"
                             x-transition:enter-end="opacity-100 transform translate-y-0"
                             class="space-y-4">
                            <div id="tickets-container-change_task" class="space-y-4">
                                <div class="text-center py-8 text-gray-400">
                                    <i data-lucide="git-branch" class="w-12 h-12 mx-auto mb-4 text-gray-500"></i>
                                    <p>Change Tasks serão carregadas quando a aba for selecionada</p>
                                </div>
                            </div>
                        </div>

                        <!-- Service Tasks Tab -->
                        <div x-show="activeTab === 'sc_task'" 
                             x-transition:enter="transition ease-out duration-300"
                             x-transition:enter-start="opacity-0 transform translate-y-4"
                             x-transition:enter-end="opacity-100 transform translate-y-0"
                             class="space-y-4">
                            <div id="tickets-container-sc_task" class="space-y-4">
                                <div class="text-center py-8 text-gray-400">
                                    <i data-lucide="shopping-cart" class="w-12 h-12 mx-auto mb-4 text-gray-500"></i>
                                    <p>Service Tasks serão carregadas quando a aba for selecionada</p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </main>

            <!-- Modal Container -->
            <div id="modal-container"></div>

            <script>
                // Initialize Lucide icons after page load
                document.addEventListener('DOMContentLoaded', function() {
                    lucide.createIcons();
                });
                
                // Re-initialize icons after HTMX swaps
                document.body.addEventListener('htmx:afterSwap', function() {
                    lucide.createIcons();
                });
                
                // Update status indicators based on metrics
                document.body.addEventListener('htmx:afterSwap', function(event) {
                    if (event.target.id === 'metrics-section') {
                        updateHeaderStatusIndicators();
                    }
                });
                
                function updateHeaderStatusIndicators() {
                    // This function could be enhanced to update header indicators
                    // based on the current metrics data
                    const statusElement = document.getElementById('servicenow-status');
                    const rateLimitElement = document.getElementById('rate-limit-text');
                    
                    if (statusElement && rateLimitElement) {
                        // Visual feedback could be enhanced here
                        // For now, we'll keep the basic indicators
                    }
                }
                
                // HTMX Configuration
                htmx.config.requestClass = 'htmx-request';
                htmx.config.defaultSwapStyle = 'innerHTML';
                
                // Loading states with enhanced visual feedback
                document.body.addEventListener('htmx:beforeRequest', function(event) {
                    event.target.style.opacity = '0.7';
                    
                    // Update rate limit indicator during requests
                    const rateLimitIndicator = document.getElementById('rate-limit-indicator');
                    if (rateLimitIndicator) {
                        rateLimitIndicator.classList.add('animate-pulse');
                    }
                });
                
                document.body.addEventListener('htmx:afterRequest', function(event) {
                    event.target.style.opacity = '1';
                    
                    // Reset rate limit indicator
                    const rateLimitIndicator = document.getElementById('rate-limit-indicator');
                    if (rateLimitIndicator) {
                        rateLimitIndicator.classList.remove('animate-pulse');
                    }
                });

                // Error handling for connectivity issues
                document.body.addEventListener('htmx:responseError', function(event) {
                    const statusElement = document.getElementById('servicenow-status');
                    if (statusElement) {
                        statusElement.innerHTML = \`
                            <div class=\"w-3 h-3 bg-red-400 rounded-full animate-bounce\"></div>
                            <span class=\"text-sm text-red-400\">Connection Issue</span>
                        \`;
                    }
                    
                    // Reset after 5 seconds
                    setTimeout(() => {
                        if (statusElement) {
                            statusElement.innerHTML = \`
                                <div class=\"w-3 h-3 bg-green-400 rounded-full animate-pulse\"></div>
                                <span class=\"text-sm text-green-400\">ServiceNow Connected</span>
                            \`;
                        }
                    }, 5000);
                });

                // Global function to show ticket details modal
                window.showTicketDetails = function(sysId, table) {
                    // Add loading state
                    const button = event.target.closest('button');
                    if (button) {
                        button.innerHTML = '<i data-lucide="loader" class="w-4 h-4 inline mr-2 animate-spin"></i>Carregando...';
                        button.disabled = true;
                    }
                    
                    console.log(\`🔍 [MODAL DEBUG] Loading ticket details: \${sysId}, \${table}\`);
                    console.log(\`🔍 [MODAL DEBUG] Target URL: /clean/ticket-details/\${sysId}/\${table}\`);
                    
                    // Use HTMX to load ticket details
                    htmx.ajax('GET', \`/clean/ticket-details/\${sysId}/\${table}\`, {
                        target: '#modal-container',
                        swap: 'innerHTML'
                    }).then(() => {
                        console.log(\`✅ [MODAL DEBUG] Successfully loaded ticket details\`);
                        // Reset button state
                        if (button) {
                            button.innerHTML = '<i data-lucide="eye" class="w-4 h-4 inline mr-2"></i>Ver Detalhes';
                            button.disabled = false;
                            lucide.createIcons();
                        }
                    }).catch((error) => {
                        console.error(\`❌ [MODAL DEBUG] Error loading ticket details:\`, error);
                        if (button) {
                            button.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>Erro';
                            button.disabled = false;
                            lucide.createIcons();
                        }
                    });
                };

                // Keyboard shortcuts
                document.addEventListener('keydown', function(event) {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                        event.preventDefault();
                        document.querySelector('input[name="query"]').focus();
                    }
                });
            </script>

        </body>
        </html>
      `;
    }
    } catch (error) {
      console.error('❌ Clean Dashboard Error:', error);
      set.status = 503;
      return `
        <!DOCTYPE html>
        <html lang="pt-BR" class="h-full">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BunSNC Dashboard - Error</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="h-full bg-gray-100 flex items-center justify-center">
            <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
                <div class="text-center">
                    <div class="text-red-500 text-6xl mb-4">❌</div>
                    <h1 class="text-2xl font-bold text-gray-900 mb-2">Erro no Dashboard</h1>
                    <p class="text-gray-600 mb-4">Ocorreu um erro inesperado.</p>
                    <div class="text-sm text-gray-500 mb-4">
                        <p><strong>Erro:</strong> ${error.message}</p>
                    </div>
                    <div class="space-y-2">
                        <a href="/health" class="block w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600">
                            Verificar Status
                        </a>
                        <button onclick="window.location.reload()" class="block w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600">
                            Tentar Novamente
                        </button>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `;
    }
  })

  /**
   * Metrics component with ServiceNow connection status
   */
  .get('/metrics', async () => {
    try {
      const rateLimitMetrics = // Rate limiting now handled internally: getHealthStatus();
      
      // Provide default values if metrics are undefined
      const totalRequests = rateLimitMetrics.totalRequests || 0;
      const successfulRequests = rateLimitMetrics.successfulRequests || 0;
      const currentRate = rateLimitMetrics.currentRate || 0;
      const concurrentRequests = rateLimitMetrics.concurrentRequests || 0;
      const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 100;
      
      // Test ServiceNow connectivity
      let serviceNowStatus = 'connected';
      let lastTestTime = new Date().toISOString();
      
      try {
        await serviceNowAuthClient.makeRequest('incident', 'GET', { 
          sysparm_limit: 1,
          sysparm_fields: 'sys_id'
        });
      } catch (error) {
        serviceNowStatus = 'disconnected';
        console.warn('ServiceNow connectivity test failed:', error);
      }
      
      return `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div class="card-gradient rounded-xl border border-gray-600 p-6 text-center hover:border-elysia-blue transition-all duration-300">
            <div class="text-3xl font-bold text-elysia-blue mb-2">${totalRequests}</div>
            <div class="text-sm text-gray-300">Total Requests</div>
            <div class="text-xs text-gray-400 mt-1">${successRate}% success</div>
          </div>
          
          <div class="card-gradient rounded-xl border border-gray-600 p-6 text-center hover:border-green-500 transition-all duration-300">
            <div class="text-3xl font-bold text-green-400 mb-2">${successfulRequests}</div>
            <div class="text-sm text-gray-300">Successful</div>
            <div class="text-xs text-gray-400 mt-1">API Calls</div>
          </div>
          
          <div class="card-gradient rounded-xl border border-gray-600 p-6 text-center hover:border-yellow-500 transition-all duration-300">
            <div class="text-3xl font-bold text-yellow-400 mb-2">${currentRate}/s</div>
            <div class="text-sm text-gray-300">Current Rate</div>
            <div class="text-xs text-gray-400 mt-1">Requests per second</div>
          </div>
          
          <div class="card-gradient rounded-xl border border-gray-600 p-6 text-center hover:border-purple-500 transition-all duration-300">
            <div class="text-3xl font-bold text-purple-400 mb-2">${concurrentRequests}</div>
            <div class="text-sm text-gray-300">Concurrent</div>
            <div class="text-xs text-gray-400 mt-1">Active requests</div>
          </div>
        </div>
        
        <!-- System Status with Real-time Indicators -->
        <div class="glass-effect rounded-xl border border-gray-600 p-6 mb-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-white">System Status</h3>
            <div class="flex items-center space-x-2">
              <div class="w-3 h-3 ${serviceNowStatus === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-red-400 animate-bounce'} rounded-full"></div>
              <span class="text-sm ${serviceNowStatus === 'connected' ? 'text-green-400' : 'text-red-400'}">${serviceNowStatus === 'connected' ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div class="text-gray-400 mb-1">ServiceNow</div>
              <div class="${serviceNowStatus === 'connected' ? 'text-green-400' : 'text-red-400'} font-medium flex items-center">
                <i data-lucide="${serviceNowStatus === 'connected' ? 'check-circle' : 'x-circle'}" class="w-4 h-4 mr-1"></i> 
                ${serviceNowStatus === 'connected' ? 'Connected' : 'Disconnected'}
              </div>
              <div class="text-xs text-gray-500 mt-1">${new Date(lastTestTime).toLocaleTimeString('pt-BR')}</div>
            </div>
            <div>
              <div class="text-gray-400 mb-1">Redis Cache</div>
              <div class="text-green-400 font-medium flex items-center"><i data-lucide="check-circle" class="w-4 h-4 mr-1"></i> Active</div>
              <div class="text-xs text-gray-500 mt-1">Caching enabled</div>
            </div>
            <div>
              <div class="text-gray-400 mb-1">Rate Limiting</div>
              <div class="text-green-400 font-medium flex items-center"><i data-lucide="check-circle" class="w-4 h-4 mr-1"></i> Healthy</div>
              <div class="text-xs text-gray-500 mt-1">${currentRate}/25 req/s</div>
            </div>
            <div>
              <div class="text-gray-400 mb-1">Current Load</div>
              <div class="text-${concurrentRequests > 15 ? 'orange' : concurrentRequests > 10 ? 'yellow' : 'green'}-400 font-medium flex items-center">
                <i data-lucide="zap" class="w-4 h-4 mr-1"></i> ${concurrentRequests} active
              </div>
              <div class="text-xs text-gray-500 mt-1">Max: 25 concurrent</div>
            </div>
          </div>
        </div>
        
        <!-- Rate Limiting Visual Indicator -->
        <div class="glass-effect rounded-xl border border-gray-600 p-4 mb-6">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-medium text-white">Rate Limiting Status</h4>
            <span class="text-xs text-gray-400">Real-time monitoring</span>
          </div>
          <div class="flex items-center space-x-4">
            <div class="flex-1">
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Current Rate</span>
                <span>${currentRate}/25 req/s</span>
              </div>
              <div class="w-full bg-gray-700 rounded-full h-2">
                <div class="h-2 rounded-full transition-all duration-300 ${currentRate > 80 ? 'bg-red-500' : currentRate > 60 ? 'bg-orange-500' : 'bg-green-500'}" 
                     style="width: ${Math.min((currentRate / 25) * 100, 100)}%"></div>
              </div>
            </div>
            <div class="flex items-center space-x-2">
              <div class="w-3 h-3 ${currentRate > 20 ? 'bg-red-400 animate-pulse' : currentRate > 15 ? 'bg-orange-400' : 'bg-green-400'} rounded-full"></div>
              <span class="text-xs ${currentRate > 20 ? 'text-red-400' : currentRate > 15 ? 'text-orange-400' : 'text-green-400'}">
                ${currentRate > 20 ? 'High Load' : currentRate > 15 ? 'Medium Load' : 'Normal'}
              </span>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Error getting metrics:', error);
      return `
        <div class="glass-effect rounded-xl border border-red-600 p-6 text-center">
          <i data-lucide="alert-triangle" class="w-16 h-16 mx-auto mb-4 text-red-400"></i>
          <h3 class="text-lg font-medium text-red-400 mb-2">Erro ao carregar métricas</h3>
          <p class="text-red-300 text-sm">Não foi possível obter as métricas do sistema</p>
        </div>
      `;
    }
  })

  /**
   * Search tickets
   */
  .get('/search', async ({ query }) => {
    const { query: searchQuery } = query as any;
    
    if (!searchQuery || searchQuery.trim().length < 2) {
      return `
        <div class="text-center py-12 text-gray-400">
          <i data-lucide="search" class="w-16 h-16 mx-auto mb-4 text-gray-500"></i>
          <p>Digite pelo menos 2 caracteres para buscar</p>
        </div>
      `;
    }

    try {
      // Target groups for filtering
      const targetGroups = [
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

      // Detect ticket number pattern - include CHG for change requests
      const ticketNumberPattern = /^(INC|SCTASK|CTASK|CHG)\d+$/i;
      const isTicketNumber = ticketNumberPattern.test(searchQuery.trim());

      let results = [];
      // Use same query syntax as Python scripts
      const groupQuery = targetGroups.map(group => `assignment_group.nameCONTAINS${group}`).join('^OR');

      if (isTicketNumber) {
        // Search by exact ticket number (with group filter)
        // Use exact table names from Python scripts
        let tables = ['incident', 'sc_task', 'change_task'];
        
        // Add change_request table for CHG tickets based on ServiceNow standard tables
        if (searchQuery.trim().toUpperCase().startsWith('CHG')) {
          tables = ['change_request'];
          console.log(`🔍 [SEARCH CHG] Searching for CHG ticket: ${searchQuery.trim()}`);
        }
        
        for (const table of tables) {
          try {
            console.log(`🔍 [SEARCH] Table: ${table}, Query: number=${searchQuery.trim()}`);
            
            // For ticket number search, don't restrict by groups to find any ticket
            const response = await serviceNowAuthClient.makeRequest(
              table,
              'GET',
              { 
                sysparm_query: `number=${searchQuery.trim()}`,
                sysparm_fields: 'sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,sys_created_on,sys_updated_on',
                sysparm_display_value: 'all', // Same as Python default
                sysparm_exclude_reference_link: 'true',
                sysparm_limit: 1
              }
            );
            
            console.log(`📊 [SEARCH RESULT] Table: ${table}, Results: ${response?.result?.length || 0}`);
            
            if (response?.result && response.result.length > 0) {
              console.log(`✅ [SEARCH FOUND] Ticket found in ${table}:`, response.result[0].number);
              results.push({
                ...response.result[0],
                table_name: table
              });
            }
          } catch (error) {
            console.warn(`Error searching ${table}:`, error);
          }
        }
      } else {
        // Search by description across tables (with group filter) - use exact table names from Python scripts
        const tables = ['incident', 'sc_task', 'change_task', 'change_request'];
        
        for (const table of tables) {
          try {
            const response = await serviceNowAuthClient.makeRequest(
              table,
              'GET',
              { 
                sysparm_query: `(short_descriptionCONTAINS${searchQuery.trim()}^ORdescriptionCONTAINS${searchQuery.trim()})^(${groupQuery})`,
                sysparm_fields: 'sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,sys_created_on,sys_updated_on',
                sysparm_display_value: 'all', // Same as Python default
                sysparm_exclude_reference_link: 'true',
                sysparm_limit: 5
              }
            );
            
            if (response?.result && response.result.length > 0) {
              results.push(...response.result.map(item => ({
                ...item,
                table_name: table
              })));
            }
          } catch (error) {
            console.warn(`Error searching ${table}:`, error);
          }
        }
      }

      if (results.length === 0) {
        return `
          <div class="text-center py-12">
            <i data-lucide="file-text" class="w-16 h-16 mx-auto mb-4 text-yellow-400"></i>
            <h3 class="text-lg font-medium text-white mb-2">Nenhum resultado encontrado</h3>
            <p class="text-gray-400">Não encontramos tickets para: "<span class="font-medium text-white">${searchQuery}</span>"</p>
          </div>
        `;
      }

      // Priority color helper function
      function getPriorityColor(priority) {
        const priorities = {
          '1': 'bg-red-500/20 text-red-300',
          '2': 'bg-orange-500/20 text-orange-300',
          '3': 'bg-yellow-500/20 text-yellow-300',
          '4': 'bg-blue-500/20 text-blue-300',
          '5': 'bg-gray-500/20 text-gray-300'
        };
        return priorities[priority] || 'bg-gray-500/20 text-gray-300';
      }

      return `
        <div class="space-y-4">
          <div class="text-center mb-6">
            <h3 class="text-lg font-semibold text-white mb-2">Resultados da busca</h3>
            <div class="text-sm text-gray-400">
              Encontrados ${results.length} ticket(s) para: "<span class="font-medium text-white">${searchQuery}</span>"
            </div>
          </div>
          
          <div class="grid gap-4">
            ${results.map(ticket => {
              // Safe data extraction with proper null checks
              const ticketNumber = ticket.number || 'N/A';
              const priority = ticket.priority?.value || ticket.priority || 'N/A';
              const urgency = ticket.urgency?.value || ticket.urgency || '';
              const state = ticket.state?.value || ticket.state || '1';
              const shortDescription = ticket.short_description?.value || ticket.short_description || 'Sem descrição';
              const assignmentGroup = ticket.assignment_group?.display_value || 'Não atribuído';
              const assignedTo = (ticket.assigned_to && typeof ticket.assigned_to === 'object' && ticket.assigned_to.display_value) 
                ? ticket.assigned_to.display_value 
                : (ticket.assigned_to && typeof ticket.assigned_to === 'string') 
                  ? `User (${ticket.assigned_to.slice(0, 8)}...)` 
                  : 'Não atribuído';
              const createdOn = ticket.sys_created_on?.value || ticket.sys_created_on;
              
              return `
                <div class="card-gradient rounded-xl border border-gray-600 p-6 hover:border-elysia-blue transition-all duration-300 cursor-pointer group" 
                     onclick="showTicketDetails('${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}', '${ticket.table_name}')">
                  <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center space-x-3">
                      <span class="text-lg font-bold text-elysia-cyan">${ticketNumber}</span>
                      <span class="px-3 py-1 rounded-full text-xs font-medium border ${(() => {
                        const states = {
                          '1': { label: 'Novo', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                          '2': { label: 'Em Andamento', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
                          '18': { label: 'Designado', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
                          '3': { label: 'Em Espera', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
                          '6': { label: 'Resolvido', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
                          '7': { label: 'Fechado', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
                          '8': { label: 'Cancelado', color: 'bg-red-500/20 text-red-300 border-red-500/30' }
                        };
                        return (states[state] || { label: 'Desconhecido', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' }).color;
                      })()}">
                        ${(() => {
                        const states = {
                          '1': { label: 'Novo', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                          '2': { label: 'Em Andamento', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
                          '18': { label: 'Designado', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
                          '3': { label: 'Em Espera', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
                          '6': { label: 'Resolvido', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
                          '7': { label: 'Fechado', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
                          '8': { label: 'Cancelado', color: 'bg-red-500/20 text-red-300 border-red-500/30' }
                        };
                        return (states[state] || { label: 'Desconhecido', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' }).label;
                      })()}
                      </span>
                      <span class="px-2 py-1 rounded text-xs font-medium ${(() => {
                        const priorities = {
                          '1': 'bg-red-500/20 text-red-300',
                          '2': 'bg-orange-500/20 text-orange-300',
                          '3': 'bg-yellow-500/20 text-yellow-300',
                          '4': 'bg-blue-500/20 text-blue-300',
                          '5': 'bg-gray-500/20 text-gray-300'
                        };
                        return priorities[priority] || 'bg-gray-500/20 text-gray-300';
                      })()}">
                        P${priority}
                      </span>
                      ${urgency ? `
                        <span class="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-300">
                          U${urgency}
                        </span>
                      ` : ''}
                    </div>
                    <div class="text-sm text-gray-400">
                      ${formatSafeDate(createdOn)}
                    </div>
                  </div>
                  
                  <h4 class="font-medium text-white mb-3">${shortDescription}</h4>
                  
                  <div class="grid grid-cols-2 gap-4 text-sm text-gray-300">
                    <div>
                      <span class="text-gray-400">Grupo:</span> 
                      <span class="text-white">${assignmentGroup}</span>
                    </div>
                    <div>
                      <span class="text-gray-400">Responsável:</span> 
                      <span class="text-white">${assignedTo}</span>
                    </div>
                  </div>
                  
                  <div class="mt-4 text-right">
                    <button 
                      hx-get="/clean/ticket-details/${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}/${ticket.table_name}"
                      hx-target="#modal-container"
                      hx-swap="innerHTML"
                      class="px-4 py-2 bg-elysia-blue text-white rounded-lg text-sm hover:bg-blue-600 transition-all duration-300 group-hover:scale-105 focus:outline-none focus:ring-2 focus:ring-elysia-blue focus:ring-opacity-50">
                      <i data-lucide="eye" class="w-4 h-4 inline mr-2"></i>
                      Ver Detalhes
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <script>
          
          
        </script>
      `;
      
    } catch (error) {
      console.error('Search error:', error);
      return `
        <div class="text-center py-12">
          <i data-lucide="alert-triangle" class="w-20 h-20 mx-auto mb-4 text-red-400"></i>
          <h3 class="text-xl font-medium text-red-400 mb-2">Erro na busca</h3>
          <p class="text-red-300">${error instanceof Error ? error.message : 'Erro desconhecido'}</p>
          <button class="mt-4 px-4 py-2 bg-elysia-blue text-white rounded-lg hover:bg-blue-600 transition-colors" 
                  onclick="location.reload()">
            Tentar novamente
          </button>
        </div>
      `;
    }
  })

  /**
   * Get tickets list - Grouped by target groups with status filters
   */
  .get('/tickets', async ({ query }) => {
    const { type = 'in_progress', group = 'all' } = query as any;
    
    console.log(`🚨 [TICKETS ENDPOINT] Starting request - type: ${type}, group: ${group}`);
    
    try {
      // Target groups (fallback_groups) - from ServiceNow production environment
      const targetGroups = [
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

      // Filter groups based on selection - use all 16 groups as requested
      const groupsToSearch = group === 'all' ? targetGroups : [group]; // All 16 groups as requested
      
      // Current month date range
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const dateQuery = `sys_created_onBETWEEN${currentMonthStart.toISOString().split('T')[0]}@${currentMonthEnd.toISOString().split('T')[0]}`;
      
      // State filtering based on type
      let stateQuery = '';
      switch (type) {
        case 'in_progress':
          stateQuery = 'state=2'; // Em Andamento (Work in Progress)
          break;
        case 'waiting':
          stateQuery = 'state=3'; // Em Espera (On Hold/Waiting)
          break;
        case 'all':
          stateQuery = 'stateIN1,2,3'; // Novo, Em Andamento, Em Espera
          break;
        default:
          stateQuery = 'state=2'; // Default to in progress
      }

      const allResults = [];
      
      // Search all tables as in Python scripts
      const tables = ['incident', 'sc_task', 'change_task']; // Same as Python scripts
      
      for (const table of tables) {
        for (const targetGroup of groupsToSearch) {
          try {
            // Use exactly the same query syntax as Python scripts
            const queryString = `${dateQuery}^${stateQuery}^assignment_group.nameCONTAINS${targetGroup}`;
            console.log(`🔍 [QUERY] Table: ${table}, Group: ${targetGroup}, Query: ${queryString}`);
            
            const response = await serviceNowAuthClient.makeRequest(
              table,
              'GET',
              {
                sysparm_query: queryString,
                sysparm_fields: 'sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,sys_created_on,sys_updated_on',
                sysparm_display_value: 'all', // Same as Python default
                sysparm_exclude_reference_link: 'true',
                sysparm_limit: 20
              }
            );
            
            console.log(`📊 [RESPONSE] Table: ${table}, Group: ${targetGroup}, Results: ${response?.result?.length || 0}`);

            if (response?.result && response.result.length > 0) {
              allResults.push(...response.result.map(ticket => ({
                ...ticket,
                table_name: table,
                target_group: targetGroup
              })));
            }
          } catch (error) {
            console.warn(`Error fetching ${table} for group ${targetGroup}:`, error);
          }
        }
      }

      // Debug logging
      console.log(`🐛 Total tickets found: ${allResults.length}`);
      if (allResults.length > 0) {
        console.log(`🐛 Sample ticket:`, JSON.stringify(allResults[0], null, 2));
      }

      // Group tickets by assignment group
      const groupedResults = {};
      allResults.forEach(ticket => {
        const assignmentGroup = ticket.assignment_group?.display_value || 'Não atribuído';
        if (!groupedResults[assignmentGroup]) {
          groupedResults[assignmentGroup] = [];
        }
        groupedResults[assignmentGroup].push(ticket);
      });
      
      console.log(`🐛 Grouped results: ${Object.keys(groupedResults).length} groups`);
      Object.keys(groupedResults).forEach(group => {
        console.log(`🐛 Group "${group}": ${groupedResults[group].length} tickets`);
      });

      // Sort each group by creation date (newest first)
      Object.keys(groupedResults).forEach(group => {
        groupedResults[group].sort((a, b) => 
          new Date(b.sys_created_on?.value || b.sys_created_on).getTime() - 
          new Date(a.sys_created_on?.value || a.sys_created_on).getTime()
        );
      });

      if (Object.keys(groupedResults).length === 0) {
        const typeLabel = type === 'in_progress' ? 'em andamento' : type === 'waiting' ? 'em espera' : 'ativos';
        return `
          <div class="text-center py-12">
            <i data-lucide="inbox" class="w-16 h-16 mx-auto mb-4 text-gray-500"></i>
            <h3 class="text-lg font-medium text-white mb-2">Nenhum ticket encontrado</h3>
            <p class="text-gray-400">Não há tickets ${typeLabel} para os grupos alvo no mês atual.</p>
            <div class="mt-4 text-xs text-gray-500">
              Grupos monitorados: ${targetGroups.slice(0, 3).join(', ')} e outros
            </div>
          </div>
        `;
      }



      const totalTickets = Object.values(groupedResults).reduce((sum, tickets) => sum + tickets.length, 0);
      const typeLabel = type === 'in_progress' ? 'em andamento' : type === 'waiting' ? 'em espera' : 'ativos';
      const groupLabel = group === 'all' ? 'todos os grupos' : group;

      console.log(`🎯 [HTML GENERATION] About to generate HTML for ${totalTickets} tickets in ${Object.keys(groupedResults).length} groups`);

      return `
        <div class="space-y-6">
          <!-- Summary -->
          <div class="glass-effect rounded-xl border border-gray-600 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-lg font-semibold text-white">${totalTickets} ticket(s) ${typeLabel}</div>
                <div class="text-sm text-gray-400">Filtro: ${groupLabel}</div>
              </div>
              <div class="flex items-center space-x-2">
                <i data-lucide="filter" class="w-5 h-5 text-elysia-blue"></i>
                <span class="text-sm text-elysia-blue">${Object.keys(groupedResults).length} grupo(s)</span>
              </div>
            </div>
          </div>
          
          <!-- Groups -->
          ${Object.entries(groupedResults).map(([groupName, tickets]) => `
            <div class="card-gradient rounded-xl border border-gray-600 p-6">
              <!-- Group Header -->
              <div class="flex items-center justify-between mb-4 pb-3 border-b border-gray-600">
                <div class="flex items-center space-x-3">
                  <i data-lucide="users" class="w-5 h-5 text-elysia-cyan"></i>
                  <h4 class="text-lg font-semibold text-white">${groupName}</h4>
                  <span class="px-3 py-1 rounded-full text-xs font-medium bg-elysia-blue/20 text-elysia-blue border border-elysia-blue/30">
                    ${tickets.length} ticket(s)
                  </span>
                </div>
                <div class="text-sm text-gray-400">
                  Atualizado: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              
              <!-- Tickets in Group -->
              <div class="space-y-3">
                ${tickets.map(ticket => {
                  // Safe data extraction with proper null checks
                  const ticketNumber = ticket.number || 'N/A';
                  const priority = ticket.priority?.value || ticket.priority || 'N/A';
                  const urgency = ticket.urgency?.value || ticket.urgency || '';
                  const state = ticket.state?.value || ticket.state || '1';
                  const shortDescription = ticket.short_description?.value || ticket.short_description || 'Sem descrição';
                  const assignedTo = (ticket.assigned_to && typeof ticket.assigned_to === 'object' && ticket.assigned_to.display_value) 
                ? ticket.assigned_to.display_value 
                : (ticket.assigned_to && typeof ticket.assigned_to === 'string') 
                  ? `User (${ticket.assigned_to.slice(0, 8)}...)` 
                  : 'Não atribuído';
                  const createdOn = ticket.sys_created_on?.value || ticket.sys_created_on;
                  
                  return `
                    <div class="bg-gray-700/50 rounded-lg border border-gray-600 p-4 hover:border-elysia-blue transition-all duration-300 cursor-pointer group"
                         onclick="showTicketDetails('${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}', '${ticket.table_name}')">
                      <div class="flex justify-between items-start mb-3">
                        <div class="flex items-center space-x-3">
                          <span class="text-lg font-bold text-elysia-cyan">${ticketNumber}</span>
                          <span class="px-2 py-1 rounded-full text-xs font-medium border ${(() => {
                            const states = {
                              '1': { label: 'Novo', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                              '2': { label: 'Em Andamento', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
                              '18': { label: 'Designado', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
                              '3': { label: 'Em Espera', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
                              '6': { label: 'Resolvido', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
                              '7': { label: 'Fechado', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
                              '8': { label: 'Cancelado', color: 'bg-red-500/20 text-red-300 border-red-500/30' }
                            };
                            return (states[state] || { label: 'Desconhecido', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' }).color;
                          })()}">
                            ${(() => {
                              const states = {
                                '1': { label: 'Novo', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                                '2': { label: 'Em Andamento', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
                                '18': { label: 'Designado', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
                                '3': { label: 'Em Espera', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
                                '6': { label: 'Resolvido', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
                                '7': { label: 'Fechado', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
                                '8': { label: 'Cancelado', color: 'bg-red-500/20 text-red-300 border-red-500/30' }
                              };
                              return (states[state] || { label: 'Desconhecido', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' }).label;
                            })()}
                          </span>
                          <span class="px-2 py-1 rounded text-xs font-medium ${(() => {
                            const priorities = {
                              '1': 'bg-red-500/20 text-red-300',
                              '2': 'bg-orange-500/20 text-orange-300',
                              '3': 'bg-yellow-500/20 text-yellow-300',
                              '4': 'bg-blue-500/20 text-blue-300',
                              '5': 'bg-gray-500/20 text-gray-300'
                            };
                            return priorities[priority] || 'bg-gray-500/20 text-gray-300';
                          })()}">
                            P${priority}
                          </span>
                          ${urgency ? `
                            <span class="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-300">
                              U${urgency}
                            </span>
                          ` : ''}
                        </div>
                        <div class="text-sm text-gray-400">
                          ${formatSafeDate(createdOn)}
                        </div>
                      </div>
                      
                      <h5 class="font-medium text-white mb-2 line-clamp-2">${shortDescription}</h5>
                      
                      <div class="flex justify-between items-center">
                        <div class="text-sm text-gray-300">
                          <span class="text-gray-400">Responsável:</span> 
                          <span class="text-white">${assignedTo}</span>
                        </div>
                        <button class="px-3 py-1 bg-elysia-blue text-white rounded text-xs hover:bg-blue-600 transition-all duration-300 group-hover:scale-105">
                          <i data-lucide="eye" class="w-3 h-3 inline mr-1"></i>
                          Ver
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        
        <script>
          // Re-initialize Lucide icons after content swap
          lucide.createIcons();
          
          // Function to show ticket details with smooth transition
          window.showTicketDetails = function(sysId, table) {
            // Add loading state
            const button = event.target.closest('button');
            if (button) {
              button.innerHTML = '<i data-lucide="loader" class="w-4 h-4 inline mr-2 animate-spin"></i>Carregando...';
              button.disabled = true;
            }
            
            // Use HTMX to load ticket details - fix the endpoint URL
            console.log(\`🔍 [MODAL DEBUG] Loading ticket details: \${sysId}, \${table}\`);
            console.log(\`🔍 [MODAL DEBUG] Target URL: /clean/ticket-details/\${sysId}/\${table}\`);
            
            htmx.ajax('GET', \`/clean/ticket-details/\${sysId}/\${table}\`, {
              target: '#modal-container',
              swap: 'innerHTML'
            }).then(() => {
              console.log(\`✅ [MODAL DEBUG] Successfully loaded ticket details\`);
              // Reset button state
              if (button) {
                button.innerHTML = '<i data-lucide="eye" class="w-4 h-4 inline mr-2"></i>Ver Detalhes';
                button.disabled = false;
                lucide.createIcons();
              }
            }).catch((error) => {
              console.error(\`❌ [MODAL DEBUG] Error loading ticket details:\`, error);
              if (button) {
                button.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>Erro';
                button.disabled = false;
                lucide.createIcons();
              }
            });
          };
        </script>
      `;
      
    } catch (error) {
      console.error('Error fetching tickets:', error);
      return `
        <div class="text-center py-8">
          <i data-lucide="alert-triangle" class="w-16 h-16 mx-auto mb-4 text-red-400"></i>
          <h3 class="text-lg font-medium text-red-400 mb-2">Erro ao carregar chamados</h3>
          <p class="text-red-300 mb-4">Não foi possível conectar ao ServiceNow para buscar os chamados.</p>
          <div class="text-xs text-gray-400">
            Verifique a conectividade e tente novamente em alguns segundos.
          </div>
        </div>
      `;
    }
  })

  /**
   * Get ticket details modal
   */
  .get('/ticket/:sysId/:table', async ({ params: { sysId, table } }) => {
    console.log(`🎫 Loading ticket details: sysId=${sysId}, table=${table}`);
    try {
      const ticketResponse = await serviceNowAuthClient.makeRequest(
        table,
        'GET',
        { 
          sysparm_query: `sys_id=${sysId}`,
          sysparm_fields: 'sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,sys_created_on,sys_updated_on,resolved_at,closed_at',
          sysparm_display_value: 'all', // Same as Python default
          sysparm_exclude_reference_link: 'true'
        }
      );

      if (!ticketResponse?.result || ticketResponse.result.length === 0) {
        return `
          <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" id="ticket-modal">
            <div class="bg-gray-800 rounded-xl p-6 max-w-md w-full m-4 border border-gray-600">
              <div class="text-center">
                <i data-lucide="x-circle" class="w-16 h-16 mx-auto mb-4 text-red-400"></i>
                <h3 class="text-lg font-medium text-red-400 mb-2">Ticket não encontrado</h3>
                <p class="text-red-300 mb-4">O ticket solicitado não foi encontrado no sistema.</p>
                <button class="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                        onclick="document.getElementById('ticket-modal').remove()">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        `;
      }

      const ticket = ticketResponse.result[0];
      console.log(`🐛 [TICKET DETAILS] Raw ticket data:`, JSON.stringify(ticket, null, 2));

      // Get comprehensive SLA information using our enhanced SLA method
      let slaBreakdown = {};
      try {
        console.log(`🎯 Getting comprehensive SLA breakdown for ${sysId} from table ${table}`);
        slaBreakdown = await serviceNowAuthClient.getTicketSLABreakdown(sysId);
        console.log(`✅ SLA breakdown obtained:`, Object.keys(slaBreakdown));
      } catch (slaError) {
        console.warn('❌ Comprehensive SLA information not available:', slaError);
        slaBreakdown = {};
      }


      function getPriorityLabel(priority) {
        const priorities = {
          '1': { label: 'Crítica', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
          '2': { label: 'Alta', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
          '3': { label: 'Moderada', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
          '4': { label: 'Baixa', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
          '5': { label: 'Planning', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
        };
        return priorities[priority] || { label: 'N/A', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' };
      }

      const stateInfo = getStateLabel(ticket.state);
      const priorityInfo = getPriorityLabel(ticket.priority);
      
      return `
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" id="ticket-modal">
          <div class="bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-600">
            
            <!-- Header -->
            <div class="sticky top-0 bg-gray-800 border-b border-gray-600 p-6">
              <div class="flex justify-between items-start">
                <div class="flex items-center space-x-4">
                  <h2 class="text-2xl font-bold text-white">${ticket.number}</h2>
                  <span class="px-3 py-1 rounded-full text-sm font-medium border ${stateInfo.color}">
                    ${stateInfo.label}
                  </span>
                  <span class="px-3 py-1 rounded-full text-sm font-medium border ${priorityInfo.color}">
                    Prioridade ${priorityInfo.label}
                  </span>
                </div>
                <button class="text-gray-400 hover:text-white text-2xl transition-colors"
                        onclick="document.getElementById('ticket-modal').remove()">
                  <i data-lucide="x" class="w-6 h-6"></i>
                </button>
              </div>
            </div>

            <!-- Tab Navigation -->
            <div class="border-b border-gray-600">
              <nav class="flex px-6">
                <button class="tab-button active px-4 py-3 text-sm font-medium text-white border-b-2 border-elysia-blue" 
                        onclick="switchTab('ticket-details')">
                  <i data-lucide="info" class="w-4 h-4 inline mr-2"></i>Detalhes do Ticket
                </button>
                <button class="tab-button px-4 py-3 text-sm font-medium text-gray-300 border-b-2 border-transparent hover:text-white hover:border-gray-300" 
                        onclick="switchTab('annotations')">
                  <i data-lucide="message-circle" class="w-4 h-4 inline mr-2"></i>Anotações
                </button>
                <button class="tab-button px-4 py-3 text-sm font-medium text-gray-300 border-b-2 border-transparent hover:text-white hover:border-gray-300" 
                        onclick="switchTab('attachments')">
                  <i data-lucide="paperclip" class="w-4 h-4 inline mr-2"></i>Anexos
                </button>
              </nav>
            </div>

            <div class="p-6">
              <!-- Tab Content: Ticket Details -->
              <div id="ticket-details" class="tab-content">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  <!-- Main Content -->
                  <div class="lg:col-span-2 space-y-6">
                  
                  <!-- Basic Information -->
                  <div class="card-gradient rounded-lg border border-gray-600 p-4">
                    <h3 class="font-semibold text-white mb-4">Informações Básicas</h3>
                    <div class="space-y-3">
                      <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Descrição Breve</label>
                        <p class="text-white font-medium">${ticket.short_description || 'N/A'}</p>
                      </div>
                      ${ticket.description ? `
                        <div>
                          <label class="block text-sm font-medium text-gray-400 mb-1">Descrição Completa</label>
                          <div class="bg-gray-700 border border-gray-600 rounded-lg p-3 max-h-40 overflow-y-auto">
                            <p class="text-gray-100 text-sm whitespace-pre-wrap">${ticket.description}</p>
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <!-- Assignment Information -->
                  <div class="card-gradient rounded-lg border border-gray-600 p-4">
                    <h3 class="font-semibold text-white mb-4">Atribuições</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Grupo de Atribuição</label>
                        <p class="text-white">${
                          // Safe extraction with multiple fallbacks
                          ticket.assignment_group?.display_value || 
                          ticket.assignment_group?.value ||
                          (typeof ticket.assignment_group === 'string' ? ticket.assignment_group : 'Não atribuído')
                        }</p>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Atribuído a</label>
                        <p class="text-white">${
                          // Safe extraction with multiple fallbacks
                          ticket.assigned_to?.display_value || 
                          ticket.assigned_to?.value ||
                          (typeof ticket.assigned_to === 'string' ? ticket.assigned_to : 'Não atribuído')
                        }</p>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Solicitante</label>
                        <p class="text-white">${
                          // Safe extraction with multiple fallbacks  
                          (ticket.caller_id && typeof ticket.caller_id === 'object' && ticket.caller_id.display_value)
                            ? ticket.caller_id.display_value
                            : (ticket.caller_id && typeof ticket.caller_id === 'string')
                              ? `User (${ticket.caller_id.slice(0, 8)}...)`
                              : 'N/A'
                        }</p>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Categoria</label>
                        <p class="text-white">${ticket.category || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  <!-- Timeline -->
                  <div class="card-gradient rounded-lg border border-gray-600 p-4">
                    <h3 class="font-semibold text-white mb-4">Timeline</h3>
                    <div class="space-y-3">
                      <div class="flex items-center py-2 border-l-4 border-blue-400 pl-4">
                        <div>
                          <div class="font-medium text-white">Criado</div>
                          <div class="text-sm text-gray-300">${new Date(ticket.sys_created_on).toLocaleString('pt-BR')}</div>
                        </div>
                      </div>
                      ${ticket.sys_updated_on !== ticket.sys_created_on ? `
                        <div class="flex items-center py-2 border-l-4 border-yellow-400 pl-4">
                          <div>
                            <div class="font-medium text-white">Última Atualização</div>
                            <div class="text-sm text-gray-300">${new Date(ticket.sys_updated_on).toLocaleString('pt-BR')}</div>
                          </div>
                        </div>
                      ` : ''}
                      ${ticket.resolved_at ? `
                        <div class="flex items-center py-2 border-l-4 border-green-400 pl-4">
                          <div>
                            <div class="font-medium text-white">Resolvido</div>
                            <div class="text-sm text-gray-300">${new Date(ticket.resolved_at).toLocaleString('pt-BR')}</div>
                          </div>
                        </div>
                      ` : ''}
                      ${ticket.closed_at ? `
                        <div class="flex items-center py-2 border-l-4 border-gray-400 pl-4">
                          <div>
                            <div class="font-medium text-white">Fechado</div>
                            <div class="text-sm text-gray-300">${new Date(ticket.closed_at).toLocaleString('pt-BR')}</div>
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                </div>

                <!-- SLA Sidebar -->
                <div class="space-y-6">
                  <div class="card-gradient rounded-lg border border-gray-600 p-4">
                    <h3 class="font-semibold text-white mb-4 flex items-center">
                      <i data-lucide="clock" class="w-5 h-5 text-elysia-cyan mr-2"></i>
                      SLA Information
                    </h3>
                    
                    ${slaInfo && slaInfo.length > 0 ? `
                      <div class="space-y-4">
                        ${slaInfo.map(sla => {
                          const percentage = parseInt(sla.business_percentage || sla.percentage || 0);
                          const isBreached = sla.has_breached === 'true' || sla.has_breached === true;
                          
                          return `
                            <div class="bg-gray-700 rounded-lg p-3 border ${isBreached ? 'border-red-400' : 'border-gray-600'}">
                              <div class="flex items-center justify-between mb-2">
                                <div class="font-medium text-white">${sla.sla?.display_value || 'SLA'}</div>
                                <span class="text-sm font-medium ${isBreached ? 'text-red-400' : percentage > 80 ? 'text-orange-400' : 'text-green-400'}">
                                  ${percentage}%
                                </span>
                              </div>
                              
                              <!-- Progress Bar -->
                              <div class="w-full bg-gray-600 rounded-full h-2 mb-2">
                                <div class="h-2 rounded-full transition-all duration-300 ${isBreached ? 'bg-red-500' : percentage > 80 ? 'bg-orange-500' : 'bg-green-500'}" 
                                     style="width: ${Math.min(percentage, 100)}%"></div>
                              </div>
                              
                              <div class="text-xs text-gray-300">
                                ${isBreached ? `
                                  <div class="flex items-center text-red-400">
                                    <i data-lucide="alert-triangle" class="w-4 h-4 mr-1"></i>
                                    <span class="font-medium">SLA Violado</span>
                                  </div>
                                ` : `
                                  <div class="flex items-center text-green-400">
                                    <i data-lucide="check-circle" class="w-4 h-4 mr-1"></i>
                                    <span>Dentro do SLA</span>
                                  </div>
                                `}
                              </div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    ` : `
                      <div class="text-center py-6 text-gray-400">
                        <i data-lucide="bar-chart" class="w-12 h-12 mx-auto mb-2 text-gray-500"></i>
                        <p class="text-sm">Nenhuma informação de SLA disponível</p>
                      </div>
                    `}
                  </div>

                  <!-- Technical Details -->
                  <div class="card-gradient rounded-lg border border-gray-600 p-4">
                    <h3 class="font-semibold text-white mb-4">Detalhes Técnicos</h3>
                    <div class="space-y-3 text-sm">
                      <div>
                        <label class="block font-medium text-gray-400 mb-1">Sys ID</label>
                        <p class="text-gray-300 font-mono text-xs break-all bg-gray-700 p-2 rounded">${ticket.sys_id}</p>
                      </div>
                      <div>
                        <label class="block font-medium text-gray-400 mb-1">Tabela</label>
                        <p class="text-gray-300">${table}</p>
                      </div>
                      ${ticket.urgency ? `
                        <div>
                          <label class="block font-medium text-gray-400 mb-1">Urgência</label>
                          <p class="text-gray-300">${ticket.urgency}</p>
                        </div>
                      ` : ''}
                      ${ticket.impact ? `
                        <div>
                          <label class="block font-medium text-gray-400 mb-1">Impacto</label>
                          <p class="text-gray-300">${ticket.impact}</p>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Tab Content: Annotations -->
              <div id="annotations" class="tab-content hidden">
                <div class="space-y-6">
                  <!-- Add New Annotation -->
                  <div class="card-gradient rounded-lg border border-gray-600 p-4">
                    <h3 class="font-semibold text-white mb-4">Adicionar Anotação</h3>
                    <div class="space-y-3">
                      <textarea 
                        id="new-annotation" 
                        class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:border-elysia-blue focus:outline-none resize-none" 
                        rows="3" 
                        placeholder="Digite sua anotação aqui..."></textarea>
                      <div class="flex justify-end">
                        <button class="px-4 py-2 bg-elysia-blue text-white rounded-lg hover:bg-elysia-blue/80 transition-colors"
                                onclick="addAnnotation('${sysId}')">
                          <i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>Adicionar Anotação
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Existing Annotations -->
                  <div class="card-gradient rounded-lg border border-gray-600 p-4">
                    <h3 class="font-semibold text-white mb-4">Histórico de Anotações</h3>
                    <div id="annotations-list" class="space-y-3">
                      <div class="text-center py-8 text-gray-400">
                        <i data-lucide="message-circle" class="w-12 h-12 mx-auto mb-2 text-gray-500"></i>
                        <p class="text-sm">Carregando anotações...</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Tab Content: Attachments -->
              <div id="attachments" class="tab-content hidden">
                <div class="space-y-6">
                  <!-- Upload New Attachment -->
                  <div class="card-gradient rounded-lg border border-gray-600 p-4">
                    <h3 class="font-semibold text-white mb-4">Enviar Anexo</h3>
                    <div class="space-y-3">
                      <div class="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-elysia-blue transition-colors">
                        <input type="file" id="file-upload" class="hidden" multiple onchange="handleFileUpload(event, '${sysId}', '${table}')">
                        <label for="file-upload" class="cursor-pointer">
                          <i data-lucide="upload" class="w-12 h-12 mx-auto mb-2 text-gray-400"></i>
                          <p class="text-gray-400">Clique para selecionar arquivos ou arraste e solte aqui</p>
                          <p class="text-sm text-gray-500 mt-1">Múltiplos arquivos são permitidos</p>
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- Existing Attachments -->
                  <div class="card-gradient rounded-lg border border-gray-600 p-4">
                    <h3 class="font-semibold text-white mb-4">Anexos Existentes</h3>
                    <div id="attachments-list" class="space-y-3">
                      <div class="text-center py-8 text-gray-400">
                        <i data-lucide="paperclip" class="w-12 h-12 mx-auto mb-2 text-gray-500"></i>
                        <p class="text-sm">Carregando anexos...</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- User Actions -->
              <div class="mt-8 pt-4 border-t border-gray-600">
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <!-- Add Note Action -->
                  <button class="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                          onclick="showAnnotationForm('${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}', '${table}')">
                    <i data-lucide="message-circle" class="w-4 h-4 mr-2"></i>
                    Adicionar Nota
                  </button>
                  
                  <!-- Assign to Me -->
                  <button class="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                          onclick="assignToMe('${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}', '${table}')">
                    <i data-lucide="user-check" class="w-4 h-4 mr-2"></i>
                    Assumir
                  </button>
                  
                  <!-- Change Status -->
                  <button class="flex items-center justify-center px-4 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                          onclick="showStatusChangeForm('${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}', '${table}', '${ticket.state}')">
                    <i data-lucide="refresh-cw" class="w-4 h-4 mr-2"></i>
                    Alterar Status
                  </button>
                  
                  <!-- Close Ticket -->
                  <button class="flex items-center justify-center px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                          onclick="closeTicket('${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}', '${table}')">
                    <i data-lucide="check-circle" class="w-4 h-4 mr-2"></i>
                    Encerrar
                  </button>
                </div>
                
                <!-- Action Form Container -->
                <div id="action-form-container" class="mb-6 hidden">
                  <!-- Dynamic form content will be loaded here -->
                </div>
                
                <div class="flex justify-end space-x-3">
                  <button class="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                          onclick="document.getElementById('ticket-modal').remove()">
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <script>
          // Re-initialize Lucide icons after modal loads
          lucide.createIcons();
          
          // Tab switching functionality
          window.switchTab = function(tabName) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(tab => {
              tab.classList.add('hidden');
            });
            
            // Remove active class from all buttons
            document.querySelectorAll('.tab-button').forEach(btn => {
              btn.classList.remove('active', 'text-white', 'border-elysia-blue');
              btn.classList.add('text-gray-300', 'border-transparent');
            });
            
            // Show selected tab content
            document.getElementById(tabName).classList.remove('hidden');
            
            // Add active class to selected button
            event.target.classList.add('active', 'text-white', 'border-elysia-blue');
            event.target.classList.remove('text-gray-300', 'border-transparent');
            
            // Load content based on tab
            if (tabName === 'annotations') {
              loadAnnotations('${sysId}');
            } else if (tabName === 'attachments') {
              loadAttachments('${sysId}', '${table}');
            }
          };

          // User action functions
          window.showAnnotationForm = function(sysId, table) {
            const container = document.getElementById('action-form-container');
            container.innerHTML = \`
              <div class="bg-gray-800 rounded-lg p-4">
                <h4 class="text-white font-medium mb-4">Adicionar Anotação</h4>
                <form id="annotation-form" onsubmit="submitAnnotation(event, '\${sysId}', '\${table}')">
                  <textarea
                    name="note"
                    required
                    rows="4"
                    class="w-full bg-gray-700 text-white rounded-lg p-3 resize-none focus:ring-2 focus:ring-elysia-blue focus:border-elysia-blue border border-gray-600"
                    placeholder="Digite sua anotação aqui..."></textarea>
                  <div class="flex justify-end space-x-3 mt-4">
                    <button type="button" 
                            class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            onclick="document.getElementById('action-form-container').classList.add('hidden')">
                      Cancelar
                    </button>
                    <button type="submit" 
                            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      Adicionar
                    </button>
                  </div>
                </form>
              </div>
            \`;
            container.classList.remove('hidden');
          };

          window.submitAnnotation = function(event, sysId, table) {
            event.preventDefault();
            const form = event.target;
            const formData = new FormData(form);
            const note = formData.get('note');
            
            // Make API call to add annotation
            htmx.ajax('POST', \`/clean/ticket/\${sysId}/\${table}/note\`, {
              values: { note: note },
              target: '#action-form-container',
              swap: 'innerHTML',
            }).then(() => {
              // Reload annotations tab if active
              if (!document.getElementById('annotations').classList.contains('hidden')) {
                loadAnnotations(sysId);
              }
              document.getElementById('action-form-container').classList.add('hidden');
            });
          };

          window.assignToMe = function(sysId, table) {
            if (confirm('Deseja assumir este ticket?')) {
              htmx.ajax('POST', \`/clean/ticket/\${sysId}/\${table}/assign\`, {
                target: '#action-form-container',
                swap: 'innerHTML',
              }).then(() => {
                // Reload ticket details
                location.reload();
              });
            }
          };

          window.showStatusChangeForm = function(sysId, table, currentStatus) {
            const container = document.getElementById('action-form-container');
            const statusOptions = {
              '1': 'Novo',
              '2': 'Em Andamento',
              '18': 'Designado',
              '3': 'Em Espera',
              '6': 'Resolvido',
              '7': 'Fechado',
              '8': 'Cancelado'
            };
            
            let optionsHtml = '';
            for (const [value, label] of Object.entries(statusOptions)) {
              if (value !== currentStatus) {
                optionsHtml += \`<option value="\${value}">\${label}</option>\`;
              }
            }
            
            container.innerHTML = \`
              <div class="bg-gray-800 rounded-lg p-4">
                <h4 class="text-white font-medium mb-4">Alterar Status</h4>
                <form id="status-form" onsubmit="submitStatusChange(event, '\${sysId}', '\${table}')">
                  <select name="status" required
                          class="w-full bg-gray-700 text-white rounded-lg p-3 focus:ring-2 focus:ring-elysia-blue focus:border-elysia-blue border border-gray-600 mb-4">
                    <option value="">Selecione o novo status</option>
                    \${optionsHtml}
                  </select>
                  <textarea
                    name="reason"
                    rows="3"
                    class="w-full bg-gray-700 text-white rounded-lg p-3 resize-none focus:ring-2 focus:ring-elysia-blue focus:border-elysia-blue border border-gray-600"
                    placeholder="Motivo da alteração (opcional)..."></textarea>
                  <div class="flex justify-end space-x-3 mt-4">
                    <button type="button" 
                            class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            onclick="document.getElementById('action-form-container').classList.add('hidden')">
                      Cancelar
                    </button>
                    <button type="submit" 
                            class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
                      Alterar Status
                    </button>
                  </div>
                </form>
              </div>
            \`;
            container.classList.remove('hidden');
          };

          window.submitStatusChange = function(event, sysId, table) {
            event.preventDefault();
            const form = event.target;
            const formData = new FormData(form);
            
            htmx.ajax('POST', \`/clean/ticket/\${sysId}/\${table}/status\`, {
              values: { 
                status: formData.get('status'),
                reason: formData.get('reason')
              },
              target: '#action-form-container',
              swap: 'innerHTML',
            }).then(() => {
              document.getElementById('action-form-container').classList.add('hidden');
              // Reload ticket details
              location.reload();
            });
          };

          window.closeTicket = function(sysId, table) {
            if (confirm('Deseja encerrar este ticket? Esta ação marcará o ticket como resolvido.')) {
              htmx.ajax('POST', \`/clean/ticket/\${sysId}/\${table}/close\`, {
                target: '#action-form-container',
                swap: 'innerHTML',
              }).then(() => {
                // Reload ticket details
                location.reload();
              });
            }
          };
          
          // Add annotation function
          window.addAnnotation = function(sysId) {
            const textarea = document.getElementById('new-annotation');
            const text = textarea.value.trim();
            
            if (!text) {
              alert('Por favor, digite uma anotação.');
              return;
            }
            
            // Show loading state
            const button = event.target;
            button.disabled = true;
            button.innerHTML = '<i data-lucide="loader" class="w-4 h-4 inline mr-2 animate-spin"></i>Salvando...';
            
            // Mock implementation - replace with actual API call
            setTimeout(() => {
              textarea.value = '';
              button.disabled = false;
              button.innerHTML = '<i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>Adicionar Anotação';
              lucide.createIcons();
              loadAnnotations(sysId);
            }, 1000);
          };
          
          // Load annotations function
          window.loadAnnotations = function(sysId) {
            const container = document.getElementById('annotations-list');
            container.innerHTML = '<div class="text-center py-8 text-gray-400"><i data-lucide="loader" class="w-8 h-8 mx-auto mb-2 animate-spin text-elysia-blue"></i><p class="text-sm">Carregando anotações...</p></div>';
            lucide.createIcons();
            
            // Mock annotations - replace with actual API call
            setTimeout(() => {
              container.innerHTML = \`
                <div class="space-y-3">
                  <div class="bg-gray-700 rounded-lg p-4 border border-gray-600">
                    <div class="flex justify-between items-start mb-2">
                      <span class="font-medium text-white">Admin User</span>
                      <span class="text-xs text-gray-400">\${new Date().toLocaleString('pt-BR')}</span>
                    </div>
                    <p class="text-gray-300 text-sm">Ticket em análise. Aguardando resposta do cliente.</p>
                  </div>
                  <div class="text-center py-4 text-gray-500 text-sm">
                    <i data-lucide="message-circle" class="w-8 h-8 mx-auto mb-2 text-gray-600"></i>
                    Nenhuma anotação adicional encontrada
                  </div>
                </div>
              \`;
              lucide.createIcons();
            }, 800);
          };
          
          // Load attachments function
          window.loadAttachments = function(sysId, table) {
            const container = document.getElementById('attachments-list');
            container.innerHTML = '<div class="text-center py-8 text-gray-400"><i data-lucide="loader" class="w-8 h-8 mx-auto mb-2 animate-spin text-elysia-blue"></i><p class="text-sm">Carregando anexos...</p></div>';
            lucide.createIcons();
            
            // Mock attachments - replace with actual API call
            setTimeout(() => {
              container.innerHTML = \`
                <div class="space-y-3">
                  <div class="bg-gray-700 rounded-lg p-4 border border-gray-600 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                      <i data-lucide="file-text" class="w-8 h-8 text-blue-400"></i>
                      <div>
                        <p class="font-medium text-white">screenshot_error.png</p>
                        <p class="text-sm text-gray-400">1.2 MB • Enviado em \${formatSafeDate(new Date())}</p>
                      </div>
                    </div>
                    <button class="px-3 py-1 bg-elysia-blue/20 text-elysia-blue rounded hover:bg-elysia-blue/30 transition-colors text-sm">
                      <i data-lucide="download" class="w-4 h-4 inline mr-1"></i>Download
                    </button>
                  </div>
                  <div class="bg-gray-700 rounded-lg p-4 border border-gray-600 flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                      <i data-lucide="file" class="w-8 h-8 text-green-400"></i>
                      <div>
                        <p class="font-medium text-white">logs_system.txt</p>
                        <p class="text-sm text-gray-400">5.8 KB • Enviado em \${formatSafeDate(new Date())}</p>
                      </div>
                    </div>
                    <button class="px-3 py-1 bg-elysia-blue/20 text-elysia-blue rounded hover:bg-elysia-blue/30 transition-colors text-sm">
                      <i data-lucide="download" class="w-4 h-4 inline mr-1"></i>Download
                    </button>
                  </div>
                  <div class="text-center py-4 text-gray-500 text-sm border-t border-gray-600">
                    <p><strong>Total:</strong> 2 anexos</p>
                  </div>
                </div>
              \`;
              lucide.createIcons();
            }, 800);
          };
          
          // Handle file upload
          window.handleFileUpload = function(event, sysId, table) {
            const files = event.target.files;
            if (files.length === 0) return;
            
            console.log(\`Uploading \${files.length} files to ticket \${sysId}\`);
            // Mock upload implementation - replace with actual API call
            alert(\`\${files.length} arquivo(s) selecionado(s). Funcionalidade de upload será implementada.\`);
          };
        </script>
      `;
      
    } catch (error) {
      console.error('Error loading ticket details:', error);
      return `
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" id="ticketModal">
          <div class="bg-gray-800 rounded-xl p-6 max-w-md w-full m-4 border border-gray-600">
            <div class="text-center">
              <i data-lucide="x-circle" class="w-16 h-16 mx-auto mb-4 text-red-400"></i>
              <h3 class="text-lg font-medium text-red-400 mb-2">Erro ao carregar ticket</h3>
              <p class="text-red-300 mb-4">Não foi possível carregar os detalhes do ticket.</p>
              <button class="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      onclick="closeModal()">
                Fechar
              </button>
            </div>
          </div>
        </div>
        <script>
          lucide.createIcons();
          window.closeModal = function() {
            const modal = document.getElementById('ticketModal');
            if (modal) {
              modal.remove();
            }
          };
        </script>
      `;
    }
  });

  // User action endpoints for ticket modal
  htmxDashboardClean
  // Add annotation/note to ticket
  .post('/ticket/:sysId/:table/note', async ({ params: { sysId, table }, body }) => {
    try {
      const { note } = body as any;
      
      if (!note || note.trim().length === 0) {
        return `
          <div class="bg-red-500/20 text-red-300 p-4 rounded-lg">
            ❌ Anotação não pode estar vazia
          </div>
        `;
      }

      // Add work note to ServiceNow ticket
      const response = await serviceNowAuthClient.makeRequest(
        table,
        'PUT',
        { sys_id: sysId },
        {
          work_notes: note
        }
      );

      if (response.data) {
        return `
          <div class="bg-green-500/20 text-green-300 p-4 rounded-lg">
            ✅ Anotação adicionada com sucesso
          </div>
        `;
      } else {
        throw new Error('Falha ao adicionar anotação');
      }
    } catch (error) {
      console.error('Error adding note:', error);
      return `
        <div class="bg-red-500/20 text-red-300 p-4 rounded-lg">
          ❌ Erro ao adicionar anotação: ${error instanceof Error ? error.message : 'Erro desconhecido'}
        </div>
      `;
    }
  })

  // Assign ticket to current user
  .post('/ticket/:sysId/:table/assign', async ({ params: { sysId, table } }) => {
    try {
      const response = await serviceNowAuthClient.makeRequest(
        table,
        'PUT',
        { sys_id: sysId },
        {
          assigned_to: 'current_user', // In real implementation, use actual user ID
          state: '2' // Set to "In Progress"
        }
      );

      if (response.data) {
        return `
          <div class="bg-green-500/20 text-green-300 p-4 rounded-lg">
            ✅ Ticket assumido com sucesso
          </div>
        `;
      } else {
        throw new Error('Falha ao assumir ticket');
      }
    } catch (error) {
      console.error('Error assigning ticket:', error);
      return `
        <div class="bg-red-500/20 text-red-300 p-4 rounded-lg">
          ❌ Erro ao assumir ticket: ${error instanceof Error ? error.message : 'Erro desconhecido'}
        </div>
      `;
    }
  })

  // Change ticket status
  .post('/ticket/:sysId/:table/status', async ({ params: { sysId, table }, body }) => {
    try {
      const { status, reason } = body as any;
      
      if (!status) {
        return `
          <div class="bg-red-500/20 text-red-300 p-4 rounded-lg">
            ❌ Status é obrigatório
          </div>
        `;
      }

      const updateData: any = { state: status };
      if (reason && reason.trim().length > 0) {
        updateData.work_notes = `Status alterado para: ${status}. Motivo: ${reason}`;
      }

      const response = await serviceNowAuthClient.makeRequest(
        table,
        'PUT',
        updateData,
        sysId
      );

      if (response.data) {
        return `
          <div class="bg-green-500/20 text-green-300 p-4 rounded-lg">
            ✅ Status alterado com sucesso
          </div>
        `;
      } else {
        throw new Error('Falha ao alterar status');
      }
    } catch (error) {
      console.error('Error changing status:', error);
      return `
        <div class="bg-red-500/20 text-red-300 p-4 rounded-lg">
          ❌ Erro ao alterar status: ${error instanceof Error ? error.message : 'Erro desconhecido'}
        </div>
      `;
    }
  })

  // Close/resolve ticket
  .post('/ticket/:sysId/:table/close', async ({ params: { sysId, table } }) => {
    try {
      const response = await serviceNowAuthClient.makeRequest(
        table,
        'PUT',
        { sys_id: sysId },
        {
          state: '6', // Resolved
          close_notes: 'Ticket encerrado via dashboard web'
        }
      );

      if (response.data) {
        return `
          <div class="bg-green-500/20 text-green-300 p-4 rounded-lg">
            ✅ Ticket encerrado com sucesso
          </div>
        `;
      } else {
        throw new Error('Falha ao encerrar ticket');
      }
    } catch (error) {
      console.error('Error closing ticket:', error);
      return `
        <div class="bg-red-500/20 text-red-300 p-4 rounded-lg">
          ❌ Erro ao encerrar ticket: ${error instanceof Error ? error.message : 'Erro desconhecido'}
        </div>
      `;
    }
  })

  // Lazy loading endpoint for paginated tickets - Enhanced error handling
  .get('/tickets-lazy', async (context) => {
    // Robust parameter extraction to avoid Elysia errors
    let query, group, ticketType, state, page, limit;
    
    try {
      query = context?.query || {};
      group = query?.group || 'all';
      ticketType = query?.ticketType || 'incident';
      state = query?.state || 'in_progress';
      page = query?.page || '1';
      limit = query?.limit || '10';
      
      console.log(`🔄 [LAZY LOAD] group: ${group}, type: ${ticketType}, state: ${state}, page: ${page}`);
    } catch (paramError) {
      console.error('🚨 [LAZY LOAD] Parameter extraction error:', paramError);
      // Fallback to default values
      group = 'all';
      ticketType = 'incident';
      state = 'in_progress';
      page = '1';
      limit = '10';
    }
    
    try {
      const targetGroups = [
        'L2-NE-IT APP AND DATABASE',
        'L2-NE-IT SAP BASIS', 
        'L2-NE-IT APP AND SERVICES',
        'L2-NE-IT PROCESSING',
        'L2-NE-IT NETWORK SECURITY',
        'L2-NE-IT NETWORK',
        'L2-NE-CLOUDSERVICES',
        'L2-NE-IT MONITORY',
        'L2-NE-IT SO UNIX',
        'L2-NE-IT BOC',
        'L2-NE-IT MIDDLEWARE',
        'L2-NE-IT BACKUP',
        'L2-NE-IT STORAGE',
        'L2-NE-IT VOIP',
        'L2-NE-IT NOC',
        'L2-NE-IT PCP PRODUCTION'
      ];

      // Use unified state mapping system
      const stateValue = state === 'all' ? 'all' : stateToNumeric(state as string || 'in_progress');
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 10;

      let results: any[] = [];
      let totalCount = 0;
      let hasMoreGlobal = false;

      if (group === 'all') {
        // Load from all target groups
        for (const targetGroup of targetGroups) {
          const response = await serviceNowAuthClient.makeRequestPaginated(
            ticketType as string,
            targetGroup,
            stateValue,
            pageNum,
            Math.ceil(limitNum / targetGroups.length)
          );
          
          results.push(...response.data);
          totalCount += response.total;
          hasMoreGlobal = hasMoreGlobal || response.hasMore;
        }
        
        // Sort by creation date and limit
        results = results
          .sort((a, b) => new Date(b.sys_created_on?.value || b.sys_created_on).getTime() - 
                          new Date(a.sys_created_on?.value || a.sys_created_on).getTime())
          .slice(0, limitNum);
          
      } else {
        // Load from specific group
        const response = await serviceNowAuthClient.makeRequestPaginated(
          ticketType as string,
          group as string,
          stateValue,
          pageNum,
          limitNum
        );
        
        results = response.data;
        totalCount = response.total;
        hasMoreGlobal = response.hasMore;
      }

      console.log(`📊 [LAZY LOAD] Found ${results.length} tickets, hasMore: ${hasMoreGlobal}`);

      // Generate skeleton placeholders for loading state
      const generateSkeleton = (count: number) => {
        return Array.from({ length: count }, (_, i) => `
          <div class="bg-gray-700/30 rounded-lg border border-gray-600/50 p-4 animate-pulse">
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center space-x-3">
                <div class="h-6 bg-gray-600 rounded w-24"></div>
                <div class="h-6 bg-gray-600 rounded w-16"></div>
              </div>
              <div class="h-5 bg-gray-600 rounded w-20"></div>
            </div>
            <div class="h-4 bg-gray-600 rounded w-full mb-2"></div>
            <div class="h-4 bg-gray-600 rounded w-3/4 mb-3"></div>
            <div class="flex justify-between items-center text-sm">
              <div class="h-4 bg-gray-600 rounded w-32"></div>
              <div class="h-8 bg-gray-600 rounded w-24"></div>
            </div>
          </div>
        `).join('');
      };

      // User lookup helper function 
      const getUserDisplayName = async (userId) => {
        if (!userId || typeof userId !== 'string') return 'N/A';
        try {
          const response = await serviceNowAuthClient.makeRequestPaginated('/sys_user', {
            sysparm_query: `sys_id=${userId}`,
            sysparm_fields: 'name,user_name,first_name,last_name',
            sysparm_limit: 1
          });
          
          const user = response?.result?.[0];
          if (user) {
            return user.name || user.user_name || `${user.first_name} ${user.last_name}`.trim() || 'Usuário';
          }
        } catch (error) {
          console.warn(`Failed to lookup user ${userId}:`, error);
        }
        return `User (${userId.slice(0, 8)}...)`;
      };

      // Collect all unique user IDs from tickets
      const userIds = new Set();
      results.forEach(ticket => {
        if (ticket.assigned_to && typeof ticket.assigned_to === 'string') {
          userIds.add(ticket.assigned_to);
        }
        if (ticket.caller_id && typeof ticket.caller_id === 'string') {
          userIds.add(ticket.caller_id);
        }
        if (ticket.opened_by && typeof ticket.opened_by === 'string') {
          userIds.add(ticket.opened_by);
        }
      });

      // Batch lookup users
      const userDisplayNames = new Map();
      if (userIds.size > 0) {
        try {
          console.log(`🔍 Looking up ${userIds.size} users: ${Array.from(userIds).join(', ')}`);
          const userList = Array.from(userIds).join(',');
          const usersResponse = await serviceNowAuthClient.makeRequestPaginated('/sys_user', {
            sysparm_query: `sys_idIN${userList}`,
            sysparm_fields: 'sys_id,name,user_name,first_name,last_name',
            sysparm_limit: 100
          });
          
          console.log(`🔍 Users response structure:`, JSON.stringify(usersResponse, null, 2));
          if (usersResponse?.result) {
            console.log(`📊 Processing ${usersResponse.result.length} users from response`);
            usersResponse.result.forEach(user => {
              const displayName = user.name || user.user_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Usuário';
              userDisplayNames.set(user.sys_id, displayName);
              console.log(`👤 User lookup: ${user.sys_id} = ${displayName}`);
            });
          } else {
            console.log(`⚠️ No users result found in response:`, usersResponse);
          }
        } catch (error) {
          console.warn('Failed to batch lookup users:', error);
        }
      }

      // Generate ticket cards HTML
      const ticketCards = results.map(ticket => {
        const ticketNumber = ticket.number?.display_value || ticket.number || 'N/A';
        const shortDescription = ticket.short_description?.display_value || ticket.short_description || 'Sem descrição';
        // DEBUGGING: Log specific fields with full structure
        console.log(`🔍 CARD DEBUG - Ticket ${ticket.number?.display_value || ticket.number}:`);
        console.log(`  - target_group: ${ticket.target_group}`);
        console.log(`  - assignment_group FULL: ${JSON.stringify(ticket.assignment_group, null, 2)}`);
        console.log(`  - assigned_to FULL: ${JSON.stringify(ticket.assigned_to, null, 2)}`);
        console.log(`  - caller_id FULL: ${JSON.stringify(ticket.caller_id, null, 2)}`);
        
        // Extract display values or fallback to raw values - ServiceNow returns both formats
        const assignmentGroup = ticket.target_group || ticket.assignment_group?.display_value || ticket.assignment_group || 'Não atribuído';
        
        // User fields - Handle ServiceNow user object structure properly
        const assignedTo = (ticket.assigned_to && typeof ticket.assigned_to === 'object' && ticket.assigned_to.display_value) 
          ? ticket.assigned_to.display_value 
          : (ticket.assigned_to && typeof ticket.assigned_to === 'string') 
            ? `User (${ticket.assigned_to.slice(0, 8)}...)` 
            : 'Não atribuído';
          
        const caller = (ticket.caller_id && typeof ticket.caller_id === 'object' && ticket.caller_id.display_value)
          ? ticket.caller_id.display_value
          : (ticket.opened_by && typeof ticket.opened_by === 'object' && ticket.opened_by.display_value)
            ? ticket.opened_by.display_value
            : (ticket.caller_id && typeof ticket.caller_id === 'string')
              ? `User (${ticket.caller_id.slice(0, 8)}...)`
              : (ticket.opened_by && typeof ticket.opened_by === 'string')
                ? `User (${ticket.opened_by.slice(0, 8)}...)`
                : 'N/A';
        
        const priority = ticket.priority?.display_value || ticket.priority || 'N/A';
        const stateValue = ticket.state?.value || ticket.state || '1';
        const createdOn = ticket.sys_created_on?.display_value || ticket.sys_created_on;
        const updatedOn = ticket.sys_updated_on?.display_value || ticket.sys_updated_on;
        const category = ticket.category?.display_value || ticket.category || 'N/A';
        const subcategory = ticket.subcategory?.display_value || ticket.subcategory || '';
        const urgency = ticket.urgency?.display_value || ticket.urgency || 'N/A';
        const impact = ticket.impact?.display_value || ticket.impact || 'N/A';
        const description = ticket.description?.display_value || ticket.description || 'Sem descrição detalhada';
        
        // Debug user field structure
        console.log(`🔍 Raw user fields for ticket ${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}:`);
        console.log(`  assigned_to:`, JSON.stringify(ticket.assigned_to, null, 2));
        console.log(`  caller_id:`, JSON.stringify(ticket.caller_id, null, 2));
        console.log(`  opened_by:`, JSON.stringify(ticket.opened_by, null, 2));
        console.log(`  → Final values: Grupo="${assignmentGroup}", Responsável="${assignedTo}", Solicitante="${caller}"`);
        console.log('');

        // Get proper status configuration using the unified mapping system
        const statusConfig = getUnifiedStatusConfig(stateValue);
        const statusLabel = statusConfig.label;
        const statusColor = statusConfig.color;
        const statusBgColor = statusConfig.bgColor;

        return `
          <div class="bg-gray-700/50 rounded-lg border border-gray-600 p-4 hover:border-elysia-blue transition-all duration-300 cursor-pointer group transform hover:scale-[1.02]"
               onclick="showTicketDetails('${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}', '${ticketType}')">
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center space-x-3">
                <span class="text-lg font-bold text-elysia-cyan">${ticketNumber}</span>
                <span class="px-2 py-1 rounded-full text-xs font-medium border ${statusBgColor}">
                  ${statusLabel}
                </span>
              </div>
              <span class="px-2 py-1 rounded text-xs font-medium ${(() => {
                const priorities = {
                  '1': 'bg-red-500/20 text-red-300',
                  '2': 'bg-orange-500/20 text-orange-300',
                  '3': 'bg-yellow-500/20 text-yellow-300',
                  '4': 'bg-blue-500/20 text-blue-300',
                  '5': 'bg-gray-500/20 text-gray-300'
                };
                return priorities[priority] || 'bg-gray-500/20 text-gray-300';
              })()}">${priority}</span>
            </div>
            
            <h4 class="font-semibold text-white mb-3 line-clamp-2">${shortDescription}</h4>
            
            <!-- Enhanced Ticket Information Grid -->
            <div class="grid grid-cols-2 gap-3 text-xs text-gray-300 mb-4">
              <div class="space-y-1">
                <p><i data-lucide="users" class="w-3 h-3 inline mr-1 text-elysia-cyan"></i><span class="text-gray-400">Grupo:</span> ${assignmentGroup}</p>
                <p><i data-lucide="user" class="w-3 h-3 inline mr-1 text-green-400"></i><span class="text-gray-400">Responsável:</span> ${assignedTo}</p>
                <p><i data-lucide="phone" class="w-3 h-3 inline mr-1 text-blue-400"></i><span class="text-gray-400">Solicitante:</span> ${caller}</p>
              </div>
              <div class="space-y-1">
                <p><i data-lucide="tag" class="w-3 h-3 inline mr-1 text-purple-400"></i><span class="text-gray-400">Categoria:</span> ${category}</p>
                ${subcategory ? `<p><i data-lucide="tags" class="w-3 h-3 inline mr-1 text-indigo-400"></i><span class="text-gray-400">Subcategoria:</span> ${subcategory}</p>` : ''}
                <p><i data-lucide="zap" class="w-3 h-3 inline mr-1 text-yellow-400"></i><span class="text-gray-400">Urgência:</span> ${urgency}</p>
                <p><i data-lucide="target" class="w-3 h-3 inline mr-1 text-red-400"></i><span class="text-gray-400">Impacto:</span> ${impact}</p>
              </div>
            </div>
            
            <!-- Timestamps -->
            <div class="flex justify-between items-center text-xs text-gray-400 border-t border-gray-600 pt-3">
              <div class="flex items-center space-x-4">
                <span><i data-lucide="plus-circle" class="w-3 h-3 inline mr-1"></i>Criado: ${formatSafeDate(createdOn)}</span>
                ${updatedOn && updatedOn !== createdOn ? `<span><i data-lucide="edit-3" class="w-3 h-3 inline mr-1"></i>Atualizado: ${formatSafeDate(updatedOn)}</span>` : ''}
              </div>
              <button class="px-3 py-2 bg-elysia-blue/20 text-elysia-blue rounded-lg hover:bg-elysia-blue/30 transition-colors group-hover:scale-105 text-xs font-medium"
                      onclick="event.stopPropagation(); showTicketDetails('${typeof ticket.sys_id === 'object' ? ticket.sys_id.value : ticket.sys_id}', '${ticketType}')">
                <i data-lucide="eye" class="w-4 h-4 inline mr-1"></i>Ver Detalhes
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Return HTML with load more button if needed
      const loadMoreButton = hasMoreGlobal ? `
        <div class="text-center py-6" id="load-more-container">
          <button class="px-6 py-3 bg-elysia-blue/20 text-elysia-blue border border-elysia-blue/30 rounded-lg hover:bg-elysia-blue/30 transition-all duration-300 transform hover:scale-105"
                  hx-get="/clean/tickets-lazy?group=${group}&ticketType=${ticketType}&state=${state}&page=${pageNum + 1}&limit=${limit}"
                  hx-target="#tickets-container-${ticketType}"
                  hx-swap="beforeend"
                  hx-indicator="#loading-indicator-${ticketType}">
            <i data-lucide="plus-circle" class="w-4 h-4 inline mr-2"></i>Carregar mais (${totalCount - results.length} restantes)
          </button>
          <div id="loading-indicator-${ticketType}" class="htmx-indicator">
            <div class="flex items-center justify-center mt-4">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-elysia-blue"></div>
              <span class="ml-2 text-gray-400">Carregando...</span>
            </div>
          </div>
        </div>
        <div class="infinite-scroll-trigger" 
             id="scroll-trigger-${ticketType}"
             hx-get="/clean/tickets-lazy?group=${group}&ticketType=${ticketType}&state=${state}&page=${pageNum + 1}&limit=${limit}"
             hx-target="#tickets-container-${ticketType}"
             hx-swap="beforeend"
             hx-trigger="intersect once"
             style="height: 1px; margin-top: -100px;">
        </div>
      ` : '';

      return ticketCards + loadMoreButton;

    } catch (error) {
      console.error('🚨 [LAZY LOAD] Fatal error in lazy loading endpoint:', error);
      console.error('🚨 [LAZY LOAD] Error type:', error?.constructor?.name || 'Unknown');
      console.error('🚨 [LAZY LOAD] Error message:', error?.message || 'No message');
      
      // Handle specific Elysia "_r_r is not defined" error
      if (error?.message && error.message.includes('_r_r is not defined')) {
        console.error('🚨 [LAZY LOAD] Detected Elysia framework error, returning safe fallback HTML');
      }
      
      // Always return valid HTML to prevent breaking HTMX
      const safeErrorHTML = `
        <div class="text-center py-8">
          <i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-4 text-red-400"></i>
          <p class="text-red-400 mb-2">Erro ao carregar tickets</p>
          <p class="text-gray-400 text-sm mb-4">
            ${error?.message?.includes('_r_r is not defined') 
              ? 'Erro interno do framework - recarregando automaticamente...' 
              : 'Tente novamente em alguns instantes'}
          </p>
          <button onclick="window.location.reload()" 
                  class="px-4 py-2 bg-elysia-blue text-white rounded-lg hover:bg-blue-600 transition-colors">
            Recarregar Página
          </button>
        </div>
      `;
      
      try {
        return safeErrorHTML;
      } catch (returnError) {
        // Last resort: log error and return minimal HTML
        console.error('🚨 [LAZY LOAD] Cannot even return error HTML:', returnError);
        return '<div class="text-center py-8 text-red-400">Sistema temporariamente indisponível</div>';
      }
    }
  })
  
  // Endpoint to get ticket counts for tabs
  .get('/ticket-counts', async ({ query }) => {
    const { group = 'all', state = 'in_progress' } = query as any;
    
    try {
      const counts = {
        incident: 0,
        change_task: 0,
        sc_task: 0
      };
      
      // Get counts for each ticket type
      for (const ticketType of ['incident', 'change_task', 'sc_task']) {
        let stateQuery = '';
        switch (state) {
          case 'in_progress':
            stateQuery = 'state=2';
            break;
          case 'waiting':
            stateQuery = 'state=3';
            break;
          case 'all':
            stateQuery = 'stateIN1,2,3';
            break;
          default:
            stateQuery = 'state=2';
        }
        
        try {
          const response = await serviceNowAuthClient.makeRequest(ticketType, 'GET', {
            sysparm_query: stateQuery,
            sysparm_limit: '1',
            sysparm_fields: 'sys_id'
          });
          const headers = response?.headers;
          const totalHeader = headers?.['x-total-count'] || headers?.['X-Total-Count'] || '0';
          counts[ticketType as keyof typeof counts] = parseInt(totalHeader);
        } catch (error) {
          console.log(`🔍 Error getting count for ${ticketType}:`, error);
        }
      }
      
      return `
        <script>
          document.getElementById('incident-count').textContent = '${counts.incident}';
          document.getElementById('change_task-count').textContent = '${counts.change_task}';
          document.getElementById('sc_task-count').textContent = '${counts.sc_task}';
        </script>
      `;
    } catch (error) {
      console.log('🔍 Error getting ticket counts:', error);
      return `<script>console.log('Failed to load ticket counts');</script>`;
    }
  })


  // POST endpoint for adding notes
  .post('/ticket/:sysId/:table/note', async ({ params, body, serviceNowAuthClient }) => {
    try {
      const { sysId, table } = params;
      const { note } = body as { note: string };

      if (!note || !note.trim()) {
        return `
          <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
            <i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>
            Anotação não pode estar vazia
          </div>
        `;
      }

      // Add note to ServiceNow
      const result = await serviceNowAuthClient.makeRequest(
        table,
        'PUT',
        {
          work_notes: note.trim()
        },
        sysId
      );

      if (result) {
        return `
          <div class="bg-green-500/20 text-green-300 p-3 rounded-lg border border-green-500/30 mb-3">
            <div class="flex items-start space-x-3">
              <i data-lucide="user" class="w-4 h-4 mt-0.5"></i>
              <div class="flex-1">
                <div class="text-sm font-medium mb-1">Usuário Atual</div>
                <div class="text-white">${note.trim()}</div>
                <div class="text-xs text-gray-400 mt-1">${new Date().toLocaleString('pt-BR')}</div>
              </div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
            <i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>
            Erro ao adicionar anotação
          </div>
        `;
      }
    } catch (error) {
      console.error('Error adding note:', error);
      return `
        <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
          <i data-lucide="alert-triangle" class="w-4 h-4 inline mr-2"></i>
          Falha ao adicionar anotação
        </div>
      `;
    }
  })

  // POST endpoint for assigning ticket
  .post('/ticket/:sysId/:table/assign', async ({ params, serviceNowAuthClient }) => {
    try {
      const { sysId, table } = params;

      // Update ticket assignment (would need actual user context in real implementation)
      const result = await serviceNowAuthClient.makeRequest(
        table,
        'PUT',
        {
          assigned_to: 'current_user', // This would be actual user ID
          state: '18' // Set to Designado
        },
        sysId
      );

      if (result) {
        // Close modal and refresh the dashboard
        return `
          <script>
            document.getElementById('ticketModal').remove();
            // Refresh the current dashboard view
            location.reload();
          </script>
        `;
      } else {
        return `
          <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
            <i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>
            Erro ao assumir ticket
          </div>
        `;
      }
    } catch (error) {
      console.error('Error assigning ticket:', error);
      return `
        <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
          <i data-lucide="alert-triangle" class="w-4 h-4 inline mr-2"></i>
          Falha ao assumir ticket
        </div>
      `;
    }
  })

  // POST endpoint for changing status
  .post('/ticket/:sysId/:table/status', async ({ params, body, serviceNowAuthClient }) => {
    try {
      const { sysId, table } = params;
      const { status } = body as { status: string };

      if (!status) {
        return `
          <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
            <i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>
            Status inválido
          </div>
        `;
      }

      // Update ticket status
      const result = await serviceNowAuthClient.makeRequest(
        table,
        'PUT',
        {
          state: status
        },
        sysId
      );

      if (result) {
        // Close modal and refresh the dashboard
        return `
          <script>
            document.getElementById('ticketModal').remove();
            // Refresh the current dashboard view
            location.reload();
          </script>
        `;
      } else {
        return `
          <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
            <i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>
            Erro ao alterar status
          </div>
        `;
      }
    } catch (error) {
      console.error('Error changing status:', error);
      return `
        <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
          <i data-lucide="alert-triangle" class="w-4 h-4 inline mr-2"></i>
          Falha ao alterar status
        </div>
      `;
    }
  })

  // POST endpoint for closing ticket
  .post('/ticket/:sysId/:table/close', async ({ params, body, serviceNowAuthClient }) => {
    try {
      const { sysId, table } = params;
      const { reason } = body as { reason?: string };

      // Prepare update data
      const updateData: any = {
        state: '7', // Fechado
        close_code: 'Solved (Permanently)',
        close_notes: reason || 'Ticket fechado via dashboard'
      };

      // Update ticket
      const result = await serviceNowAuthClient.makeRequest(
        table,
        'PUT',
        updateData,
        sysId
      );

      if (result) {
        // Close modal and refresh the dashboard
        return `
          <script>
            document.getElementById('ticketModal').remove();
            // Refresh the current dashboard view
            location.reload();
          </script>
        `;
      } else {
        return `
          <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
            <i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>
            Erro ao encerrar ticket
          </div>
        `;
      }
    } catch (error) {
      console.error('Error closing ticket:', error);
      return `
        <div class="bg-red-500/20 text-red-300 p-3 rounded-lg border border-red-500/30">
          <i data-lucide="alert-triangle" class="w-4 h-4 inline mr-2"></i>
          Falha ao encerrar ticket
        </div>
      `;
    }
  })

  // MongoDB-first ticket details endpoint with safe service initialization
  .get('/ticket-details/:sysId/:table', async ({ params, set }) => {
      try {
        const { sysId, table } = params;
        console.log(`🔍 [HTMX] Ticket details requested: ${sysId} from ${table}`);
        
        // Initialize services safely
        const services = await initializeCleanServices();
        if (services.error) {
          console.error('❌ Service initialization failed:', services.error);
          set.headers['content-type'] = 'text/html';
          return getServiceErrorFallbackHTML();
        }
        
        // MongoDB-first strategy via HybridTicketService
        const result = await services.hybridService.getTicketDetails(table, sysId);
      
      if (!result || !result.data) {
        const errorHtml = `
          <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div class="text-center">
                <div class="text-red-500 text-6xl mb-4">⚠️</div>
                <h3 class="text-lg font-semibold text-gray-900 mb-2">Ticket não encontrado</h3>
                <p class="text-gray-600 mb-4">O ticket ${sysId} não foi encontrado no sistema.</p>
                <button onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" 
                        class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        `;
        set.headers['content-type'] = 'text/html; charset=utf-8';
        return errorHtml;
      }

      const ticket = result.data;
      const source = result.source;
      
      // Generate simple modal with real data
      const htmlContent = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <!-- Header -->
            <div class="flex justify-between items-start mb-6">
              <div>
                <h2 class="text-2xl font-bold text-gray-900">${ticket.number || sysId}</h2>
                <div class="flex items-center gap-2 mt-2">
                  <span class="px-2 py-1 text-xs rounded-full ${source === 'mongodb' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">
                    ${source === 'mongodb' ? '📊 MongoDB' : '🌐 ServiceNow'}
                  </span>
                  <span class="text-sm text-gray-600">Sys ID: ${sysId}</span>
                </div>
              </div>
              <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                      class="text-gray-400 hover:text-gray-600 text-2xl font-bold">
                ×
              </button>
            </div>

            <!-- Content -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 class="text-lg font-semibold mb-3">Informações Básicas</h3>
                <div class="space-y-2">
                  <div><strong>Número:</strong> ${ticket.number || 'N/A'}</div>
                  <div><strong>Estado:</strong> ${ticket.state || 'N/A'}</div>
                  <div><strong>Prioridade:</strong> ${ticket.priority || 'N/A'}</div>
                  <div><strong>Categoria:</strong> ${ticket.category || 'N/A'}</div>
                  <div><strong>Subcategoria:</strong> ${ticket.subcategory || 'N/A'}</div>
                </div>
              </div>
              
              <div>
                <h3 class="text-lg font-semibold mb-3">Atribuição</h3>
                <div class="space-y-2">
                  <div><strong>Grupo:</strong> ${ticket.assignment_group?.display_value || ticket.assignment_group || 'Não atribuído'}</div>
                  <div><strong>Responsável:</strong> ${ticket.assigned_to?.display_value || ticket.assigned_to || 'Não atribuído'}</div>
                  <div><strong>Solicitante:</strong> ${ticket.caller_id?.display_value || ticket.caller_id || 'N/A'}</div>
                  <div><strong>Empresa:</strong> ${ticket.company?.display_value || ticket.company || 'N/A'}</div>
                </div>
              </div>
            </div>

            <div class="mt-6">
              <h3 class="text-lg font-semibold mb-3">Descrição</h3>
              <div class="bg-gray-50 p-4 rounded-lg">
                <p>${ticket.short_description || ticket.description || 'Sem descrição disponível'}</p>
              </div>
            </div>

            <div class="mt-6">
              <h3 class="text-lg font-semibold mb-3">Datas</h3>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><strong>Criado:</strong> ${ticket.sys_created_on || 'N/A'}</div>
                <div><strong>Atualizado:</strong> ${ticket.sys_updated_on || 'N/A'}</div>
                <div><strong>Aberto:</strong> ${ticket.opened_at || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      set.headers['content-type'] = 'text/html; charset=utf-8';
      return htmlContent;
      
    } catch (error) {
      console.error('HTMX Ticket Details Error:', error);
      
      const errorHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div class="text-center">
              <div class="text-red-500 text-6xl mb-4">❌</div>
              <h3 class="text-lg font-semibold text-gray-900 mb-2">Erro ao carregar ticket</h3>
              <p class="text-gray-600 mb-4">${error.message}</p>
              <button onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" 
                      class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
                Fechar
              </button>
            </div>
          </div>
        </div>
      `;
      
      set.headers['content-type'] = 'text/html; charset=utf-8';
      return errorHtml;
    }
  })

  // GET endpoint for ticket SLA information
  .get('/ticket-sla/:ticketNumber', async ({ params, serviceNowAuthClient }) => {
    try {
      const { ticketNumber } = params;
      console.log(`🎯 Loading SLA data for ticket: ${ticketNumber}`);
      
      // Use ServiceNowService to get SLA data (reuse our enhanced service)
      const { ServiceNowService } = await import('../services/servicenow.service');
      const instanceUrl = process.env.SERVICENOW_INSTANCE_URL || process.env.SNC_INSTANCE_URL;
      const authToken = process.env.SNC_AUTH_TOKEN;
      
      if (!instanceUrl || !authToken) {
        throw new Error('ServiceNow credentials not configured');
      }
      
      const sncService = new ServiceNowService(instanceUrl, authToken);
      
      // Get SLA summary for this ticket
      const slaSummary = await sncService.getTaskSLASummary(ticketNumber);
      
      if (slaSummary.total_slas === 0) {
        return `
          <div class="text-center py-8 text-gray-400">
            <i data-lucide="shield-check" class="w-12 h-12 mx-auto mb-3 text-gray-500"></i>
            <h4 class="text-lg font-medium text-gray-300 mb-2">Nenhum SLA Configurado</h4>
            <p class="text-sm">Este ticket não possui SLAs ativos no momento</p>
            <div class="mt-4 text-xs text-gray-500">
              Ticket: ${ticketNumber}
            </div>
          </div>
        `;
      }
      
      // Render SLA information
      const breachPercentage = slaSummary.breach_percentage;
      const breachColor = breachPercentage > 50 ? 'text-red-400' : breachPercentage > 25 ? 'text-yellow-400' : 'text-green-400';
      
      return `
        <!-- SLA Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-gray-700 border border-gray-600 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wide">Total SLAs</p>
                <p class="text-2xl font-bold text-white">${slaSummary.total_slas}</p>
              </div>
              <i data-lucide="shield" class="w-8 h-8 text-gray-400"></i>
            </div>
          </div>
          
          <div class="bg-gray-700 border border-gray-600 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wide">Ativos</p>
                <p class="text-2xl font-bold text-blue-400">${slaSummary.active_slas}</p>
              </div>
              <i data-lucide="clock" class="w-8 h-8 text-blue-400"></i>
            </div>
          </div>
          
          <div class="bg-gray-700 border border-gray-600 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wide">Violados</p>
                <p class="text-2xl font-bold text-red-400">${slaSummary.breached_slas}</p>
              </div>
              <i data-lucide="alert-triangle" class="w-8 h-8 text-red-400"></i>
            </div>
          </div>
          
          <div class="bg-gray-700 border border-gray-600 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wide">% Violação</p>
                <p class="text-2xl font-bold ${breachColor}">${breachPercentage.toFixed(1)}%</p>
              </div>
              <i data-lucide="trending-${breachPercentage > 50 ? 'up' : 'down'}" class="w-8 h-8 ${breachColor}"></i>
            </div>
          </div>
        </div>

        <!-- Individual SLA Details -->
        <div class="space-y-4">
          <h4 class="text-lg font-semibold text-white mb-4">Detalhes dos SLAs</h4>
          
          ${slaSummary.all_slas.map((sla, index) => {
            const statusColor = sla.has_breached 
              ? 'border-red-500 bg-red-500/10' 
              : sla.business_percentage > 90 
                ? 'border-yellow-500 bg-yellow-500/10'
                : 'border-green-500 bg-green-500/10';
            
            const statusIcon = sla.has_breached 
              ? 'alert-circle' 
              : sla.business_percentage > 90 
                ? 'clock'
                : 'check-circle';
            
            const statusText = sla.has_breached 
              ? 'VIOLADO' 
              : sla.stage === 'completed' 
                ? 'CUMPRIDO'
                : 'EM ANDAMENTO';
            
            const formatSLADate = (dateStr) => {
              if (!dateStr) return 'N/A';
              try {
                return new Date(dateStr).toLocaleString('pt-BR');
              } catch (error) {
                return dateStr;
              }
            };
            
            return `
              <div class="border ${statusColor} rounded-lg p-4">
                <div class="flex items-start justify-between mb-3">
                  <div class="flex-1">
                    <h5 class="font-semibold text-white text-lg">${sla.sla_name}</h5>
                    <p class="text-sm text-gray-300 mt-1">Estágio: ${sla.stage}</p>
                  </div>
                  <div class="flex items-center space-x-2">
                    <span class="px-3 py-1 rounded-full text-xs font-medium ${
                      sla.has_breached ? 'bg-red-500 text-white' :
                      sla.business_percentage > 90 ? 'bg-yellow-500 text-black' :
                      'bg-green-500 text-white'
                    }">
                      ${statusText}
                    </span>
                    <i data-lucide="${statusIcon}" class="w-5 h-5 ${
                      sla.has_breached ? 'text-red-400' :
                      sla.business_percentage > 90 ? 'text-yellow-400' :
                      'text-green-400'
                    }"></i>
                  </div>
                </div>
                
                <!-- Progress Bar -->
                <div class="mb-4">
                  <div class="flex justify-between items-center mb-2">
                    <span class="text-sm text-gray-300">Progresso</span>
                    <span class="text-sm font-medium text-white">${sla.business_percentage.toFixed(1)}%</span>
                  </div>
                  <div class="w-full bg-gray-700 rounded-full h-2">
                    <div class="h-2 rounded-full ${
                      sla.has_breached ? 'bg-red-500' :
                      sla.business_percentage > 90 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }" style="width: ${Math.min(sla.business_percentage, 100)}%"></div>
                  </div>
                </div>
                
                <!-- SLA Timeline -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span class="text-gray-400">Início:</span>
                    <span class="text-white ml-2">${formatSLADate(sla.start_time)}</span>
                  </div>
                  <div>
                    <span class="text-gray-400">Fim:</span>
                    <span class="text-white ml-2">${formatSLADate(sla.end_time)}</span>
                  </div>
                  ${sla.breach_time ? `
                  <div class="md:col-span-2">
                    <span class="text-gray-400">Violado em:</span>
                    <span class="text-red-400 ml-2 font-medium">${formatSLADate(sla.breach_time)}</span>
                  </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        ${slaSummary.worst_sla ? `
        <!-- Worst SLA Alert -->
        <div class="mt-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div class="flex items-start space-x-3">
            <i data-lucide="alert-triangle" class="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5"></i>
            <div>
              <h5 class="font-semibold text-red-400 mb-1">SLA Crítico</h5>
              <p class="text-sm text-gray-300">
                <strong>${slaSummary.worst_sla.sla_name}</strong> está violado com ${slaSummary.worst_sla.business_percentage.toFixed(1)}% de progresso.
              </p>
              ${slaSummary.worst_sla.breach_time ? `
              <p class="text-xs text-gray-400 mt-2">
                Violado em: ${new Date(slaSummary.worst_sla.breach_time).toLocaleString('pt-BR')}
              </p>
              ` : ''}
            </div>
          </div>
        </div>
        ` : ''}
        
        <script>
          // Initialize Lucide icons for SLA content
          lucide.createIcons();
        </script>
      `;
      
    } catch (error: any) {
      console.error('Error loading SLA data:', error);
      return `
        <div class="text-center py-8 text-red-400">
          <i data-lucide="alert-triangle" class="w-12 h-12 mx-auto mb-2"></i>
          <p>Erro ao carregar informações de SLA</p>
          <p class="text-sm text-gray-400">${error.message}</p>
          <button onclick="htmx.ajax('GET', '/clean/ticket-sla/${ticketNumber}', {target: '#sla-content-${ticketNumber}'})" 
                  class="mt-3 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">
            <i data-lucide="refresh-cw" class="w-4 h-4 inline mr-2"></i>
            Tentar Novamente
          </button>
        </div>
      `;
    }
  })
  
  // MVC Modular Routes - following Development Guidelines  
  // Note: Routes temporarily disabled to fix circular dependency
  // .use(createTicketListRoutes);

export default htmxDashboardClean;