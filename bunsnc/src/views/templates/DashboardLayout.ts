/**
 * DashboardLayout - Main Dashboard Template
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Main layout template for the clean HTMX dashboard interface.
 * Provides the core structure including header, navigation, and content areas.
 */

/**
 * Generate the main dashboard layout HTML
 * @param options Layout configuration options
 * @returns Complete HTML layout string
 */
export function generateDashboardLayout(options: {
  title?: string;
  showServiceStatus?: boolean;
  enableAutoRefresh?: boolean;
} = {}): string {
  const { 
    title = 'BunSNC Dashboard', 
    showServiceStatus = true, 
    enableAutoRefresh = true 
  } = options;

  return `
    <!DOCTYPE html>
    <html lang="pt-BR" class="h-full">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        
        <!-- HTMX Core -->
        <script src="https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js"></script>
        <script src="https://unpkg.com/alpinejs@3.13.3/dist/cdn.min.js" defer></script>
        
        <!-- Local Scripts -->
        <script>
            htmx.config.selfRequestsOnly = true;
            htmx.config.allowEval = true;
            htmx.config.addedClass = 'htmx-added';
            htmx.config.settledClass = 'htmx-settled';
            
            // Auto-close any opened modals when ESC is pressed
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    const modals = document.querySelectorAll('[x-show]');
                    modals.forEach(modal => {
                        if (modal.style.display !== 'none') {
                            modal.style.display = 'none';
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
        ${generateHeader({ showServiceStatus })}

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            
            <!-- Metrics Section -->
            <div id="metrics-section" 
                 hx-get="/clean/metrics" 
                 hx-trigger="load${enableAutoRefresh ? ', every 60s[document.visibilityState === \'visible\']' : ''}"
                 class="mb-8">
                <div class="text-center py-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-elysia-blue mx-auto mb-4"></div>
                    <p class="text-gray-400">Carregando métricas...</p>
                </div>
            </div>

            <!-- Search Section -->
            ${generateSearchSection()}

            <!-- Search Results -->
            <div id="search-results" class="min-h-[200px]">
                <div class="text-center py-12 text-gray-400">
                    <i data-lucide="search" class="w-16 h-16 mx-auto mb-4 text-gray-500"></i>
                    <p>Digite acima para buscar tickets</p>
                </div>
            </div>

            <!-- Tickets Dashboard -->
            <div class="mt-8" x-data="dashboardData()">
                ${generateTicketTabs()}
            </div>

        </main>

        <!-- Modal Container -->
        <div id="modal-container"></div>

        <!-- Dashboard Scripts -->
        ${generateDashboardScripts({ enableAutoRefresh })}

    </body>
    </html>
  `;
}

/**
 * Generate the header section
 */
function generateHeader(options: { showServiceStatus: boolean }): string {
  return `
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
                ${options.showServiceStatus ? `
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
                ` : ''}
            </div>
        </div>
    </header>
  `;
}

/**
 * Generate the search section
 */
function generateSearchSection(): string {
  return `
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
  `;
}

/**
 * Generate ticket tabs structure
 */
function generateTicketTabs(): string {
  return `
    <!-- Tab Navigation -->
    <div class="border-b border-gray-700 mb-6">
        <nav class="-mb-px flex space-x-8" role="tablist">
            <button @click="switchTab('incident')" 
                    :class="activeTab === 'incident' ? 'border-elysia-blue text-elysia-blue' : 'border-transparent text-gray-400 hover:text-gray-300'"
                    class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">
                <i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>
                Incidents
            </button>
            <button @click="switchTab('change_task')" 
                    :class="activeTab === 'change_task' ? 'border-elysia-blue text-elysia-blue' : 'border-transparent text-gray-400 hover:text-gray-300'"
                    class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">
                <i data-lucide="git-branch" class="w-4 h-4 inline mr-2"></i>
                Change Tasks
            </button>
            <button @click="switchTab('sc_task')" 
                    :class="activeTab === 'sc_task' ? 'border-elysia-blue text-elysia-blue' : 'border-transparent text-gray-400 hover:text-gray-300'"
                    class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">
                <i data-lucide="shopping-cart" class="w-4 h-4 inline mr-2"></i>
                Service Tasks
            </button>
        </nav>
    </div>

    <!-- Tab Content -->
    <div class="space-y-4">
        <!-- Incidents Tab -->
        <div x-show="activeTab === 'incident'" 
             x-transition:enter="transition ease-out duration-300"
             x-transition:enter-start="opacity-0 transform translate-y-4"
             x-transition:enter-end="opacity-100 transform translate-y-0"
             class="space-y-4">
            <div id="tickets-container-incident" class="space-y-4">
                <div class="text-center py-8 text-gray-400">
                    <i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-4 text-gray-500"></i>
                    <p>Incidents serão carregados automaticamente</p>
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
  `;
}

/**
 * Generate dashboard scripts
 */
function generateDashboardScripts(options: { enableAutoRefresh: boolean }): string {
  return `
    <script>
        // Alpine.js Dashboard Data
        function dashboardData() {
            return {
                activeTab: 'incident',
                group: 'all',
                state: 'in_progress',
                autoRefreshPaused: ${!options.enableAutoRefresh},
                refreshInterval: 15,
                
                // State labels mapping
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
                
                // Tab switching function
                switchTab(tab) {
                    this.activeTab = tab;
                    this.loadTickets();
                },
                
                // Load tickets for current tab
                loadTickets() {
                    const container = document.getElementById('tickets-container-' + this.activeTab);
                    if (container) {
                        htmx.ajax('GET', '/clean/tickets/' + this.activeTab + '?group=' + this.group + '&state=' + this.state, {
                            target: '#tickets-container-' + this.activeTab
                        });
                    }
                }
            };
        }

        // Initialize Lucide icons after page load
        document.addEventListener('DOMContentLoaded', function() {
            lucide.createIcons();
        });
        
        // Re-initialize icons after HTMX swaps
        document.body.addEventListener('htmx:afterSwap', function() {
            lucide.createIcons();
        });
        
        // HTMX Configuration
        htmx.config.requestClass = 'htmx-request';
        htmx.config.defaultSwapStyle = 'innerHTML';
        
        // Loading states with enhanced visual feedback
        document.body.addEventListener('htmx:beforeRequest', function(event) {
            event.target.style.opacity = '0.7';
            
            const rateLimitIndicator = document.getElementById('rate-limit-indicator');
            if (rateLimitIndicator) {
                rateLimitIndicator.classList.add('animate-pulse');
            }
        });
        
        document.body.addEventListener('htmx:afterRequest', function(event) {
            event.target.style.opacity = '1';
            
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
                    <div class="w-3 h-3 bg-red-400 rounded-full animate-bounce"></div>
                    <span class="text-sm text-red-400">Connection Issue</span>
                \`;
                
                // Reset after 5 seconds
                setTimeout(() => {
                    statusElement.innerHTML = \`
                        <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                        <span class="text-sm text-green-400">ServiceNow Connected</span>
                    \`;
                }, 5000);
            }
        });

        // Global function to show ticket details modal
        window.showTicketDetails = function(sysId, table) {
            const button = event.target.closest('button');
            if (button) {
                button.innerHTML = '<i data-lucide="loader" class="w-4 h-4 inline mr-2 animate-spin"></i>Carregando...';
                button.disabled = true;
            }
            
            console.log(\`🔍 [MODAL DEBUG] Loading ticket details: \${sysId}, \${table}\`);
            
            htmx.ajax('GET', \`/clean/ticket-details/\${sysId}/\${table}\`, {
                target: '#modal-container',
                swap: 'innerHTML'
            }).then(() => {
                console.log(\`✅ [MODAL DEBUG] Successfully loaded ticket details\`);
                if (button) {
                    button.innerHTML = '<i data-lucide="eye" class="w-4 h-4 inline mr-2"></i>Ver Detalhes';
                    button.disabled = false;
                    lucide.createIcons();
                }
            }).catch((error) => {
                console.error(\`❌ [MODAL DEBUG] Error loading ticket details:\`, error);
                if (button) {
                    button.innerHTML = '<i data-lucide="eye" class="w-4 h-4 inline mr-2"></i>Ver Detalhes';
                    button.disabled = false;
                }
            });
        };
    </script>
  `;
}