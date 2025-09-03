/**
 * Enhanced ServiceNow Dashboard with Advanced Status Mapping and User Actions
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';
import { serviceNowAuthClient } from '../services/ServiceNowAuthClient';
import { 
  TICKET_TYPES, 
  getStatusConfig, 
  getActiveStatuses, 
  getAllStatuses,
  getUserActions,
  STATUS_FILTERS 
} from '../config/servicenow-status';

const htmxDashboardEnhanced = new Elysia({ prefix: '/enhanced' })
  .use(html())
  .get('/', async ({ html }) => {
    // Import status configuration for frontend
    const ticketTypesJSON = JSON.stringify(TICKET_TYPES);
    const statusFiltersJSON = JSON.stringify(STATUS_FILTERS);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR" class="h-full">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>ServiceNow Enhanced Dashboard</title>
          <script src="https://unpkg.com/htmx.org@2.0.0"></script>
          <script src="https://unpkg.com/alpinejs@3.14.1/dist/cdn.min.js" defer></script>
          <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    'elysia-blue': '#3b82f6',
                    'elysia-cyan': '#06b6d4',
                    'dark-bg': '#0f172a',
                    'dark-card': '#1e293b',
                    'dark-border': '#334155'
                  }
                }
              }
            };
            
            // Make status configurations available globally
            window.TICKET_TYPES = ${ticketTypesJSON};
            window.STATUS_FILTERS = ${statusFiltersJSON};
          </script>
          <style>
            body { 
              font-family: 'Inter', sans-serif; 
              background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            }
            .glass-effect {
              background: rgba(30, 41, 59, 0.8);
              backdrop-filter: blur(12px);
              border: 1px solid rgba(51, 65, 85, 0.6);
            }
            .status-badge {
              display: inline-flex;
              align-items: center;
              padding: 4px 12px;
              border-radius: 9999px;
              font-size: 0.75rem;
              font-weight: 500;
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
          </style>
      </head>
      
      <body class="h-full bg-dark-bg text-white">
          <!-- Main Dashboard -->
          <div class="min-h-screen p-6">
              <div class="max-w-7xl mx-auto">
                  <!-- Header -->
                  <div class="mb-8">
                      <h1 class="text-4xl font-bold bg-gradient-to-r from-elysia-blue to-elysia-cyan bg-clip-text text-transparent mb-2">
                          ServiceNow Enhanced Dashboard
                      </h1>
                      <p class="text-gray-400">Painel inteligente com mapeamento completo de status e ações do usuário</p>
                  </div>

                  <!-- Dashboard Content -->
                  <div class="mt-8" x-data="{
                      activeTab: 'incident',
                      group: 'all',
                      state: 'active', 
                      autoRefreshPaused: false,
                      refreshInterval: 15,
                      ticketTypes: window.TICKET_TYPES,
                      statusFilters: window.STATUS_FILTERS,
                      selectedTicket: null,
                      showModal: false,
                      modalTab: 'details',
                      newNote: '',
                      
                      // Get available statuses for current ticket type
                      getAvailableStatuses() {
                          const typeConfig = this.ticketTypes[this.activeTab];
                          return typeConfig ? Object.values(typeConfig.statuses) : [];
                      },
                      
                      // Get active statuses for current ticket type  
                      getActiveStatuses() {
                          return this.getAvailableStatuses().filter(status => status.isActive);
                      },
                      
                      // Update filters based on selected values
                      updateFilters() {
                          console.log('Filters updated:', { tab: this.activeTab, group: this.group, state: this.state });
                          this.loadTabContent();
                      },
                      
                      // Load tab with updated filters
                      loadTab(tabType) {
                          this.activeTab = tabType;
                          this.loadTabContent();
                      },
                      
                      // Load tab content via HTMX
                      loadTabContent() {
                          const url = \`/enhanced/tickets-lazy?group=\${this.group}&ticketType=\${this.activeTab}&state=\${this.state}&page=1&limit=10\`;
                          htmx.ajax('GET', url, {
                              target: \`#tickets-container-\${this.activeTab}\`,
                              swap: 'innerHTML'
                          });
                      },
                      
                      // Toggle auto-refresh
                      toggleAutoRefresh() {
                          this.autoRefreshPaused = !this.autoRefreshPaused;
                          console.log('Auto-refresh:', this.autoRefreshPaused ? 'Pausado' : 'Ativo');
                      },
                      
                      // Show ticket details modal
                      showTicketDetails(ticket) {
                          this.selectedTicket = ticket;
                          this.showModal = true;
                          this.modalTab = 'details';
                          // Load full details
                          this.loadTicketDetails(ticket.sys_id, ticket.table);
                      },
                      
                      // Load ticket details
                      loadTicketDetails(sysId, table) {
                          htmx.ajax('GET', \`/enhanced/ticket-details/\${table}/\${sysId}\`, {
                              target: '#ticket-details-content',
                              swap: 'innerHTML'
                          });
                      },
                      
                      // Load ticket notes
                      loadTicketNotes(sysId, table) {
                          htmx.ajax('GET', \`/enhanced/ticket-notes/\${table}/\${sysId}\`, {
                              target: '#ticket-notes-content', 
                              swap: 'innerHTML'
                          });
                      },
                      
                      // Perform ticket action
                      performAction(action, requiresNote = false) {
                          if (requiresNote && !this.newNote.trim()) {
                              alert('Esta ação requer uma anotação.');
                              return;
                          }
                          
                          const data = {
                              action: action,
                              note: this.newNote || '',
                              ticketType: this.selectedTicket.table
                          };
                          
                          htmx.ajax('POST', \`/enhanced/ticket-action/\${this.selectedTicket.table}/\${this.selectedTicket.sys_id}\`, {
                              values: data,
                              target: '#action-result',
                              swap: 'innerHTML'
                          }).then(() => {
                              this.newNote = '';
                              this.loadTabContent(); // Refresh ticket list
                              this.loadTicketDetails(this.selectedTicket.sys_id, this.selectedTicket.table);
                          });
                      },
                      
                      // Close modal
                      closeModal() {
                          this.showModal = false;
                          this.selectedTicket = null;
                          this.newNote = '';
                      }
                  }" x-init="loadTabContent()">
                  
                      <!-- Filters Section -->
                      <div class="glass-effect rounded-2xl p-6 mb-8 border-gray-700">
                          <div class="flex justify-between items-center mb-4">
                              <h2 class="text-xl font-semibold text-white flex items-center">
                                  <i data-lucide="filter" class="w-5 h-5 mr-2 text-elysia-blue"></i>
                                  Filtros Avançados
                              </h2>
                          </div>
                          
                          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <!-- Group Filter -->
                              <div class="relative">
                                  <label class="block text-sm font-medium text-gray-300 mb-2">Grupo de Atribuição</label>
                                  <select x-model="group" @change="updateFilters()"
                                          class="w-full appearance-none bg-gray-800/50 border border-gray-600 text-white px-4 py-3 pr-10 rounded-xl text-sm hover:border-elysia-blue focus:border-elysia-blue focus:ring-2 focus:ring-elysia-blue focus:ring-opacity-50 transition-all duration-300 backdrop-blur-sm">
                                      <option value="all">🌐 Todos os Grupos</option>
                                      <option value="L2-NE-IT APP AND DATABASE">💾 App & Database</option>
                                      <option value="L2-NE-IT SAP BASIS">🏢 SAP Basis</option>
                                      <option value="L2-NE-IT APP AND SERVICES">⚙️ App & Services</option>
                                      <option value="L2-NE-IT PROCESSING">🔄 Processing</option>
                                      <option value="L2-NE-IT NETWORK SECURITY">🔐 Network Security</option>
                                      <option value="L2-NE-IT NETWORK">🌐 Network</option>
                                      <option value="L2-NE-CLOUDSERVICES">☁️ Cloud Services</option>
                                      <option value="L2-NE-IT MONITORY">📊 Monitoring</option>
                                      <option value="L2-NE-IT SO UNIX">🐧 Unix Systems</option>
                                      <option value="L2-NE-IT BOC">📋 BOC</option>
                                      <option value="L2-NE-IT MIDDLEWARE">🔗 Middleware</option>
                                      <option value="L2-NE-IT BACKUP">💿 Backup</option>
                                      <option value="L2-NE-IT STORAGE">🗄️ Storage</option>
                                      <option value="L2-NE-IT VOIP">📞 VoIP</option>
                                      <option value="L2-NE-IT NOC">🖥️ NOC</option>
                                      <option value="L2-NE-IT PCP PRODUCTION">🏭 PCP Production</option>
                                  </select>
                                  <div class="absolute inset-y-0 right-0 top-6 flex items-center px-3 pointer-events-none">
                                      <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400"></i>
                                  </div>
                              </div>
                              
                              <!-- Dynamic Status Filter -->
                              <div class="relative">
                                  <label class="block text-sm font-medium text-gray-300 mb-2">Status</label>
                                  <select x-model="state" @change="updateFilters()"
                                          class="w-full appearance-none bg-gray-800/50 border border-gray-600 text-white px-4 py-3 pr-10 rounded-xl text-sm hover:border-elysia-blue focus:border-elysia-blue focus:ring-2 focus:ring-elysia-blue focus:ring-opacity-50 transition-all duration-300 backdrop-blur-sm">
                                      <option value="active">🔄 Ativos</option>
                                      <option value="assigned">👤 Designados</option> 
                                      <option value="in_progress">⚡ Em Andamento</option>
                                      <option value="pending">⏳ Pendentes</option>
                                      <option value="new">🆕 Novos</option>
                                      <option value="resolved">✅ Resolvidos</option>
                                      <option value="closed">🔒 Fechados</option>
                                      <option value="all">📋 Todos</option>
                                  </select>
                                  <div class="absolute inset-y-0 right-0 top-6 flex items-center px-3 pointer-events-none">
                                      <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400"></i>
                                  </div>
                              </div>
                              
                              <!-- Auto-Refresh Controls -->
                              <div class="relative">
                                  <label class="block text-sm font-medium text-gray-300 mb-2">Auto-Refresh</label>
                                  <div class="flex items-center space-x-2">
                                      <button @click="toggleAutoRefresh()" 
                                              :class="autoRefreshPaused ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'"
                                              class="px-4 py-3 rounded-xl border transition-all duration-300 flex items-center space-x-2 backdrop-blur-sm">
                                          <i :data-lucide="autoRefreshPaused ? 'play' : 'pause'" class="w-4 h-4"></i>
                                          <span x-text="autoRefreshPaused ? 'Pausado' : 'Ativo'" class="text-sm font-medium"></span>
                                      </button>
                                  </div>
                              </div>
                              
                              <!-- Refresh Interval -->
                              <div class="relative">
                                  <label class="block text-sm font-medium text-gray-300 mb-2">Intervalo</label>
                                  <select x-model="refreshInterval"
                                          class="w-full appearance-none bg-gray-800/50 border border-gray-600 text-white px-4 py-3 pr-10 rounded-xl text-sm hover:border-elysia-blue focus:border-elysia-blue focus:ring-2 focus:ring-elysia-blue focus:ring-opacity-50 transition-all duration-300 backdrop-blur-sm">
                                      <option value="5">⚡ 5 segundos</option>
                                      <option value="15">🔄 15 segundos</option>
                                      <option value="30">⏰ 30 segundos</option>
                                      <option value="60">⏱️ 1 minuto</option>
                                      <option value="300">🕐 5 minutos</option>
                                  </select>
                                  <div class="absolute inset-y-0 right-0 top-6 flex items-center px-3 pointer-events-none">
                                      <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400"></i>
                                  </div>
                              </div>
                          </div>
                      </div>

                      <!-- Tabs Navigation -->
                      <div class="mb-8">
                          <nav class="flex space-x-2 bg-gray-800/30 p-2 rounded-2xl border border-gray-700 backdrop-blur-sm">
                              <button @click="loadTab('incident')" 
                                      :class="activeTab === 'incident' ? 
                                          'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg scale-105 border-red-500/50' : 
                                          'text-gray-400 hover:text-white hover:bg-gray-700/50 border-transparent'"
                                      class="flex items-center px-6 py-4 text-sm font-medium rounded-xl transition-all duration-300 transform border backdrop-blur-sm">
                                  <i data-lucide="alert-circle" class="w-5 h-5 mr-2"></i>
                                  <span class="font-semibold">Incidents</span>
                                  <span class="ml-3 px-2 py-1 text-xs rounded-full bg-white/20" x-show="activeTab === 'incident'">0</span>
                              </button>
                              <button @click="loadTab('change_task')" 
                                      :class="activeTab === 'change_task' ? 
                                          'bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg scale-105 border-orange-500/50' : 
                                          'text-gray-400 hover:text-white hover:bg-gray-700/50 border-transparent'"
                                      class="flex items-center px-6 py-4 text-sm font-medium rounded-xl transition-all duration-300 transform border backdrop-blur-sm">
                                  <i data-lucide="git-branch" class="w-5 h-5 mr-2"></i>
                                  <span class="font-semibold">Change Tasks</span>
                                  <span class="ml-3 px-2 py-1 text-xs rounded-full bg-white/20" x-show="activeTab === 'change_task'">0</span>
                              </button>
                              <button @click="loadTab('sc_task')" 
                                      :class="activeTab === 'sc_task' ? 
                                          'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg scale-105 border-blue-500/50' : 
                                          'text-gray-400 hover:text-white hover:bg-gray-700/50 border-transparent'"
                                      class="flex items-center px-6 py-4 text-sm font-medium rounded-xl transition-all duration-300 transform border backdrop-blur-sm">
                                  <i data-lucide="shopping-cart" class="w-5 h-5 mr-2"></i>
                                  <span class="font-semibold">Service Tasks</span>
                                  <span class="ml-3 px-2 py-1 text-xs rounded-full bg-white/20" x-show="activeTab === 'sc_task'">0</span>
                              </button>
                          </nav>
                      </div>

                      <!-- Ticket Content Areas -->
                      <div class="space-y-8">
                          <!-- Incidents Tab -->
                          <div x-show="activeTab === 'incident'" x-transition>
                              <div id="tickets-container-incident" class="space-y-4">
                                  <div class="glass-effect rounded-2xl p-8 text-center">
                                      <div class="animate-pulse">
                                          <i data-lucide="loader" class="w-8 h-8 mx-auto text-elysia-blue animate-spin mb-4"></i>
                                          <p class="text-gray-400">Carregando incidents...</p>
                                      </div>
                                  </div>
                              </div>
                          </div>
                          
                          <!-- Change Tasks Tab -->
                          <div x-show="activeTab === 'change_task'" x-transition>
                              <div id="tickets-container-change_task" class="space-y-4">
                                  <div class="glass-effect rounded-2xl p-8 text-center">
                                      <div class="animate-pulse">
                                          <i data-lucide="loader" class="w-8 h-8 mx-auto text-elysia-blue animate-spin mb-4"></i>
                                          <p class="text-gray-400">Carregando change tasks...</p>
                                      </div>
                                  </div>
                              </div>
                          </div>
                          
                          <!-- SC Tasks Tab -->
                          <div x-show="activeTab === 'sc_task'" x-transition>
                              <div id="tickets-container-sc_task" class="space-y-4">
                                  <div class="glass-effect rounded-2xl p-8 text-center">
                                      <div class="animate-pulse">
                                          <i data-lucide="loader" class="w-8 h-8 mx-auto text-elysia-blue animate-spin mb-4"></i>
                                          <p class="text-gray-400">Carregando service tasks...</p>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>
                      
                      <!-- Enhanced Ticket Details Modal -->
                      <div x-show="showModal" 
                           x-transition:enter="transition ease-out duration-300"
                           x-transition:enter-start="opacity-0"
                           x-transition:enter-end="opacity-100"
                           x-transition:leave="transition ease-in duration-200"
                           x-transition:leave-start="opacity-100"
                           x-transition:leave-end="opacity-0"
                           class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                           @click.self="closeModal()">
                           
                          <!-- Modal Content -->
                          <div class="bg-gray-900 rounded-3xl border border-gray-700 shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col"
                               x-transition:enter="transition ease-out duration-300 transform"
                               x-transition:enter-start="scale-95 opacity-0"
                               x-transition:enter-end="scale-100 opacity-100">
                               
                              <!-- Modal Header -->
                              <div class="flex items-center justify-between p-6 border-b border-gray-700">
                                  <div class="flex items-center space-x-4">
                                      <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-elysia-blue to-elysia-cyan flex items-center justify-center">
                                          <i data-lucide="ticket" class="w-6 h-6 text-white"></i>
                                      </div>
                                      <div>
                                          <h3 class="text-xl font-bold text-white" x-text="selectedTicket?.number || 'Detalhes do Ticket'"></h3>
                                          <p class="text-sm text-gray-400" x-text="selectedTicket?.short_description || ''"></p>
                                      </div>
                                  </div>
                                  <button @click="closeModal()" 
                                          class="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors duration-200 flex items-center justify-center">
                                      <i data-lucide="x" class="w-5 h-5 text-gray-400"></i>
                                  </button>
                              </div>
                              
                              <!-- Modal Tabs -->
                              <div class="flex border-b border-gray-700 px-6">
                                  <button @click="modalTab = 'details'; loadTicketDetails(selectedTicket.sys_id, selectedTicket.table)"
                                          :class="modalTab === 'details' ? 'border-elysia-blue text-elysia-blue bg-elysia-blue/10' : 'border-transparent text-gray-400 hover:text-gray-300'"
                                          class="px-6 py-4 text-sm font-medium border-b-2 transition-all duration-200">
                                      <i data-lucide="info" class="w-4 h-4 inline mr-2"></i>
                                      Detalhes
                                  </button>
                                  <button @click="modalTab = 'notes'; loadTicketNotes(selectedTicket.sys_id, selectedTicket.table)"
                                          :class="modalTab === 'notes' ? 'border-elysia-blue text-elysia-blue bg-elysia-blue/10' : 'border-transparent text-gray-400 hover:text-gray-300'"
                                          class="px-6 py-4 text-sm font-medium border-b-2 transition-all duration-200">
                                      <i data-lucide="message-square" class="w-4 h-4 inline mr-2"></i>
                                      Anotações
                                  </button>
                                  <button @click="modalTab = 'attachments'"
                                          :class="modalTab === 'attachments' ? 'border-elysia-blue text-elysia-blue bg-elysia-blue/10' : 'border-transparent text-gray-400 hover:text-gray-300'"
                                          class="px-6 py-4 text-sm font-medium border-b-2 transition-all duration-200">
                                      <i data-lucide="paperclip" class="w-4 h-4 inline mr-2"></i>
                                      Anexos
                                  </button>
                                  <button @click="modalTab = 'actions'"
                                          :class="modalTab === 'actions' ? 'border-elysia-blue text-elysia-blue bg-elysia-blue/10' : 'border-transparent text-gray-400 hover:text-gray-300'"
                                          class="px-6 py-4 text-sm font-medium border-b-2 transition-all duration-200">
                                      <i data-lucide="settings" class="w-4 h-4 inline mr-2"></i>
                                      Ações
                                  </button>
                              </div>
                              
                              <!-- Modal Content Area -->
                              <div class="flex-1 overflow-auto p-6">
                                  <!-- Details Tab -->
                                  <div x-show="modalTab === 'details'" class="space-y-6">
                                      <div id="ticket-details-content">
                                          <div class="animate-pulse text-center py-12">
                                              <i data-lucide="loader" class="w-8 h-8 mx-auto text-elysia-blue animate-spin mb-4"></i>
                                              <p class="text-gray-400">Carregando detalhes...</p>
                                          </div>
                                      </div>
                                  </div>
                                  
                                  <!-- Notes Tab -->
                                  <div x-show="modalTab === 'notes'" class="space-y-6">
                                      <div id="ticket-notes-content">
                                          <div class="animate-pulse text-center py-12">
                                              <i data-lucide="loader" class="w-8 h-8 mx-auto text-elysia-blue animate-spin mb-4"></i>
                                              <p class="text-gray-400">Carregando anotações...</p>
                                          </div>
                                      </div>
                                      
                                      <!-- Add Note Form -->
                                      <div class="border-t border-gray-700 pt-6">
                                          <h4 class="text-lg font-semibold text-white mb-4">Adicionar Anotação</h4>
                                          <div class="space-y-4">
                                              <textarea x-model="newNote" 
                                                        placeholder="Digite sua anotação aqui..."
                                                        class="w-full h-32 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:border-elysia-blue focus:ring-2 focus:ring-elysia-blue focus:ring-opacity-50 transition-all duration-200 resize-none"></textarea>
                                              <button @click="performAction('note', true)" 
                                                      class="px-6 py-3 bg-gradient-to-r from-elysia-blue to-elysia-cyan text-white rounded-xl font-medium hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                                                      :disabled="!newNote.trim()">
                                                  <i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>
                                                  Adicionar Anotação
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                                  
                                  <!-- Attachments Tab -->
                                  <div x-show="modalTab === 'attachments'" class="space-y-6">
                                      <div class="text-center py-12">
                                          <i data-lucide="paperclip" class="w-12 h-12 mx-auto text-gray-500 mb-4"></i>
                                          <p class="text-gray-400">Funcionalidade de anexos em desenvolvimento</p>
                                      </div>
                                  </div>
                                  
                                  <!-- Actions Tab -->
                                  <div x-show="modalTab === 'actions'" class="space-y-6">
                                      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <button @click="performAction('assign')"
                                                  class="flex items-center justify-center px-6 py-4 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl hover:bg-indigo-500/30 transition-all duration-200">
                                              <i data-lucide="user-check" class="w-5 h-5 mr-3"></i>
                                              Assumir Ticket
                                          </button>
                                          <button @click="performAction('in_progress')"
                                                  class="flex items-center justify-center px-6 py-4 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-xl hover:bg-yellow-500/30 transition-all duration-200">
                                              <i data-lucide="play" class="w-5 h-5 mr-3"></i>
                                              Colocar em Andamento
                                          </button>
                                          <button @click="performAction('hold', true)"
                                                  class="flex items-center justify-center px-6 py-4 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-xl hover:bg-orange-500/30 transition-all duration-200">
                                              <i data-lucide="pause" class="w-5 h-5 mr-3"></i>
                                              Colocar em Espera
                                          </button>
                                          <button @click="performAction('resolve', true)"
                                                  class="flex items-center justify-center px-6 py-4 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl hover:bg-green-500/30 transition-all duration-200">
                                              <i data-lucide="check-circle" class="w-5 h-5 mr-3"></i>
                                              Resolver
                                          </button>
                                      </div>
                                      
                                      <!-- Action Notes -->
                                      <div class="border-t border-gray-700 pt-6">
                                          <label class="block text-sm font-medium text-gray-300 mb-2">Anotação da Ação</label>
                                          <textarea x-model="newNote" 
                                                    placeholder="Adicione uma anotação sobre a ação realizada..."
                                                    class="w-full h-24 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:border-elysia-blue focus:ring-2 focus:ring-elysia-blue focus:ring-opacity-50 transition-all duration-200 resize-none"></textarea>
                                      </div>
                                      
                                      <!-- Action Result -->
                                      <div id="action-result"></div>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>

          <script>
              // Initialize Lucide icons
              lucide.createIcons();
              
              // Re-initialize icons after HTMX swaps
              document.addEventListener('htmx:afterSwap', function(event) {
                  lucide.createIcons();
              });
          </script>
      </body>
      </html>
    `;
    
    return new Response(htmlContent, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  })

  // Enhanced tickets lazy loading endpoint with proper status mapping
  .get('/tickets-lazy', async (context) => {
    const { query } = context;
    const { group = 'all', ticketType = 'incident', state = 'active', page = '1', limit = '10' } = query;
    
    console.log(`🔄 [ENHANCED LAZY] group: ${group}, type: ${ticketType}, state: ${state}, page: ${page}`);
    
    try {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      
      // Get tickets using the enhanced status mapping
      const result = await serviceNowAuthClient.makeRequestPaginated(ticketType, group, state, pageNum, limitNum);
      
      if (!result || !result.data) {
        return `<div class="glass-effect rounded-2xl p-8 text-center">
          <i data-lucide="inbox" class="w-12 h-12 mx-auto text-gray-500 mb-4"></i>
          <p class="text-gray-400">Nenhum ticket encontrado</p>
        </div>`;
      }

      // Map tickets with proper status configuration
      const typeConfig = TICKET_TYPES[ticketType];
      const ticketsHtml = result.data.map(ticket => {
        const statusConfig = getStatusConfig(ticketType, ticket.state);
        const statusLabel = statusConfig?.label || `Status ${ticket.state}`;
        const statusColor = statusConfig?.color || 'text-gray-600';
        const statusBg = statusConfig?.bgColor || 'bg-gray-100';
        
        return `
          <div class="glass-effect rounded-2xl p-6 border border-gray-700 hover:border-elysia-blue/50 transition-all duration-300 transform hover:scale-[1.02]">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center space-x-3 mb-3">
                  <h3 class="text-lg font-semibold text-white">${ticket.number}</h3>
                  <span class="status-badge ${statusColor} ${statusBg}">
                    ${statusLabel}
                  </span>
                  ${ticket.priority ? `<span class="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-300 border border-red-500/30">P${ticket.priority}</span>` : ''}
                </div>
                
                <p class="text-gray-300 text-sm mb-4 line-clamp-2">${ticket.short_description || 'Sem descrição'}</p>
                
                <div class="flex items-center justify-between text-xs text-gray-400">
                  <div class="flex items-center space-x-4">
                    <span class="flex items-center">
                      <i data-lucide="user" class="w-3 h-3 mr-1"></i>
                      ${ticket.assignment_group_display || 'Não atribuído'}
                    </span>
                    <span class="flex items-center">
                      <i data-lucide="clock" class="w-3 h-3 mr-1"></i>
                      ${new Date(ticket.sys_updated_on).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  
                  <button onclick="window.Alpine.store('dashboard').showTicketDetails({
                    sys_id: '${ticket.sys_id}',
                    number: '${ticket.number}',
                    short_description: '${ticket.short_description?.replace(/'/g, '\\\'') || ''}',
                    state: '${ticket.state}',
                    table: '${ticketType}'
                  })"
                          class="px-4 py-2 bg-elysia-blue/20 text-elysia-blue border border-elysia-blue/30 rounded-lg hover:bg-elysia-blue/30 transition-all duration-200">
                    <i data-lucide="eye" class="w-4 h-4 inline mr-1"></i>
                    Ver Detalhes
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Add pagination if needed
      let paginationHtml = '';
      if (result.hasMore) {
        paginationHtml = `
          <div class="text-center py-6" id="load-more-container">
            <button class="px-6 py-3 bg-elysia-blue/20 text-elysia-blue border border-elysia-blue/30 rounded-lg hover:bg-elysia-blue/30 transition-all duration-300 transform hover:scale-105"
                    hx-get="/enhanced/tickets-lazy?group=${group}&ticketType=${ticketType}&state=${state}&page=${pageNum + 1}&limit=${limit}"
                    hx-target="#tickets-container-${ticketType}"
                    hx-swap="beforeend"
                    hx-indicator="#loading-indicator-${ticketType}">
              <i data-lucide="plus" class="w-4 h-4 inline mr-2"></i>
              Carregar Mais (${result.currentPage}/${result.totalPages})
            </button>
            <div id="loading-indicator-${ticketType}" class="htmx-indicator mt-4">
              <i data-lucide="loader" class="w-5 h-5 animate-spin mx-auto text-elysia-blue"></i>
            </div>
          </div>
        `;
      }

      return ticketsHtml + paginationHtml;
      
    } catch (error) {
      console.error('Enhanced tickets-lazy error:', error);
      return `<div class="glass-effect rounded-2xl p-8 text-center border-red-500/30 bg-red-500/10">
        <i data-lucide="alert-triangle" class="w-12 h-12 mx-auto text-red-400 mb-4"></i>
        <p class="text-red-400">Erro ao carregar tickets</p>
        <p class="text-xs text-gray-500 mt-2">${error.message}</p>
      </div>`;
    }
  })

  // Ticket details endpoint
  .get('/ticket-details/:table/:sysId', async ({ params }) => {
    const { table, sysId } = params;
    
    try {
      // This would fetch detailed ticket information from ServiceNow
      // For now, we'll return a placeholder
      const typeConfig = TICKET_TYPES[table];
      if (!typeConfig) {
        return `<div class="text-red-400">Tipo de ticket inválido: ${table}</div>`;
      }

      return `
        <div class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <h4 class="text-lg font-semibold text-white">Informações Básicas</h4>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-gray-400">Número:</span>
                  <span class="text-white font-medium">INC0012345</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Status:</span>
                  <span class="status-badge text-yellow-700 bg-yellow-100">Em Andamento</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Prioridade:</span>
                  <span class="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-300">Alta</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Grupo:</span>
                  <span class="text-white">L2-NE-IT APP AND DATABASE</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Responsável:</span>
                  <span class="text-white">João Silva</span>
                </div>
              </div>
            </div>
            
            <div class="space-y-4">
              <h4 class="text-lg font-semibold text-white">Datas</h4>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-gray-400">Criado em:</span>
                  <span class="text-white">${new Date().toLocaleString('pt-BR')}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Atualizado em:</span>
                  <span class="text-white">${new Date().toLocaleString('pt-BR')}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Prazo:</span>
                  <span class="text-white">-</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="space-y-4">
            <h4 class="text-lg font-semibold text-white">Descrição</h4>
            <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p class="text-gray-300">Detalhes completos do ticket serão carregados aqui...</p>
            </div>
          </div>
        </div>
      `;
      
    } catch (error) {
      console.error('Ticket details error:', error);
      return `<div class="text-red-400">Erro ao carregar detalhes: ${error.message}</div>`;
    }
  })

  // Ticket notes endpoint
  .get('/ticket-notes/:table/:sysId', async ({ params }) => {
    const { table, sysId } = params;
    
    try {
      // This would fetch work notes from ServiceNow
      // For now, we'll return a placeholder
      return `
        <div class="space-y-4">
          <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div class="flex items-start space-x-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-elysia-blue to-elysia-cyan flex items-center justify-center text-sm font-semibold text-white">
                JS
              </div>
              <div class="flex-1">
                <div class="flex items-center space-x-2 mb-2">
                  <span class="text-white font-medium">João Silva</span>
                  <span class="text-xs text-gray-400">${new Date().toLocaleString('pt-BR')}</span>
                </div>
                <p class="text-gray-300 text-sm">Ticket em análise. Identificamos que o problema está relacionado ao banco de dados.</p>
              </div>
            </div>
          </div>
          
          <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div class="flex items-start space-x-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-sm font-semibold text-white">
                MS
              </div>
              <div class="flex-1">
                <div class="flex items-center space-x-2 mb-2">
                  <span class="text-white font-medium">Maria Santos</span>
                  <span class="text-xs text-gray-400">Há 2 horas</span>
                </div>
                <p class="text-gray-300 text-sm">Aplicando correção no servidor de produção. ETA: 30 minutos.</p>
              </div>
            </div>
          </div>
        </div>
      `;
      
    } catch (error) {
      console.error('Ticket notes error:', error);
      return `<div class="text-red-400">Erro ao carregar anotações: ${error.message}</div>`;
    }
  })

  // Ticket actions endpoint
  .post('/ticket-action/:table/:sysId', async ({ params, body }) => {
    const { table, sysId } = params;
    
    try {
      // Parse form data
      const formData = new URLSearchParams(await body as string);
      const action = formData.get('action');
      const note = formData.get('note');
      const ticketType = formData.get('ticketType');
      
      console.log(`🎯 Ticket Action: ${action} on ${table}:${sysId}`);
      
      // This would perform the actual action in ServiceNow
      // For now, we'll return a success message
      return `
        <div class="bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-4">
          <div class="flex items-center space-x-2">
            <i data-lucide="check-circle" class="w-5 h-5 text-green-400"></i>
            <span class="text-green-400 font-medium">Ação executada com sucesso!</span>
          </div>
          <p class="text-sm text-gray-300 mt-2">
            Ação: <strong>${action}</strong><br>
            ${note ? `Anotação: ${note}` : ''}
          </p>
        </div>
      `;
      
    } catch (error) {
      console.error('Ticket action error:', error);
      return `
        <div class="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-4">
          <div class="flex items-center space-x-2">
            <i data-lucide="alert-circle" class="w-5 h-5 text-red-400"></i>
            <span class="text-red-400 font-medium">Erro ao executar ação</span>
          </div>
          <p class="text-sm text-gray-300 mt-2">${error.message}</p>
        </div>
      `;
    }
  });

export { htmxDashboardEnhanced };
export default htmxDashboardEnhanced;