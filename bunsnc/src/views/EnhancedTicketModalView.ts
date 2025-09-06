/**
 * Enhanced Ticket Modal View - Professional Layout with SLA Tabs
 * Restored from commit e476e9b and enhanced with HybridDataService
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketData } from '../services/HybridDataService';

export interface EnhancedModalProps {
  ticket: TicketData;
  slaData?: any[];
  notes?: any[];
  history?: any[];
  isRealTime?: boolean;
}

export class EnhancedTicketModalView {
  /**
   * Generate complete professional modal with tabs
   */
  static generateModal(props: EnhancedModalProps): string {
    const { ticket, slaData = [], notes = [], history = [] } = props;
    
    return `
      <div id="ticketModal" class="fixed inset-0 z-50 overflow-y-auto bg-black/50" 
           x-data="{ activeTab: 'details' }" 
           x-init="document.body.style.overflow = 'hidden'">
        <div class="flex items-center justify-center min-h-screen p-4">
          <div class="relative w-full max-w-6xl bg-gray-900 border border-gray-700 rounded-lg shadow-2xl">
            
            ${this.generateModalHeader(ticket)}
            ${this.generateTabNavigation()}
            
            <div class="max-h-[calc(95vh-160px)] overflow-y-auto">
              ${this.generateDetailsTab(ticket)}
              ${this.generateSLATab(slaData)}
              ${this.generateNotesTab(notes)}
              ${this.generateHistoryTab(history)}
            </div>
            
            ${this.generateModalActions(ticket)}
            ${this.generateRealTimeScript(ticket.sys_id)}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate modal header with ticket info
   */
  private static generateModalHeader(ticket: TicketData): string {
    const priorityConfig = this.getPriorityConfig(ticket.priority);
    const statusConfig = this.getStatusConfig(ticket.state);

    return `
      <div class="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-800/50">
        <div class="flex items-center space-x-4">
          <div class="p-2 rounded-lg ${priorityConfig.bgColor}">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 18.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
          </div>
          
          <div>
            <h2 class="text-2xl font-bold text-white">${ticket.number}</h2>
            <p class="text-gray-400 text-sm mt-1 max-w-2xl line-clamp-2">
              ${ticket.short_description || 'Sem descrição'}
            </p>
          </div>
        </div>
        
        <div class="flex items-center space-x-3">
          <span class="px-3 py-1 text-xs font-medium rounded-full border ${statusConfig.bgColor}">
            ${statusConfig.label}
          </span>
          <span class="px-3 py-1 text-xs font-medium rounded-full border ${priorityConfig.bgColor}">
            Prioridade ${ticket.priority}
          </span>
          <button onclick="window.closeModal()" 
                  class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Generate tab navigation
   */
  private static generateTabNavigation(): string {
    return `
      <div class="border-b border-gray-700 bg-gray-800/30">
        <nav class="-mb-px flex space-x-8 px-6" role="tablist">
          <button @click="activeTab = 'details'" 
                  :class="activeTab === 'details' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'"
                  class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">
            <svg class="w-4 h-4 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Detalhes
          </button>
          
          <button @click="activeTab = 'sla'" 
                  :class="activeTab === 'sla' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-300'"
                  class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">
            <svg class="w-4 h-4 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            SLA/SLM
          </button>
          
          <button @click="activeTab = 'notes'" 
                  :class="activeTab === 'notes' ? 'border-yellow-500 text-yellow-400' : 'border-transparent text-gray-400 hover:text-gray-300'"
                  class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">
            <svg class="w-4 h-4 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            Notas
          </button>
          
          <button @click="activeTab = 'history'" 
                  :class="activeTab === 'history' ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-gray-300'"
                  class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">
            <svg class="w-4 h-4 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Histórico
          </button>
        </nav>
      </div>
    `;
  }

  /**
   * Generate details tab content
   */
  private static generateDetailsTab(ticket: TicketData): string {
    return `
      <div x-show="activeTab === 'details'" class="p-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <!-- Informações Básicas -->
          <div class="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
            <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Informações Básicas
            </h3>
            
            <div class="space-y-3">
              <div class="flex justify-between py-2 border-b border-gray-700/50">
                <span class="text-gray-400">Número:</span>
                <span class="text-white font-medium">${ticket.number}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-gray-700/50">
                <span class="text-gray-400">Estado:</span>
                <span class="${this.getStatusConfig(ticket.state).color} font-medium">
                  ${this.getStatusConfig(ticket.state).label}
                </span>
              </div>
              <div class="flex justify-between py-2 border-b border-gray-700/50">
                <span class="text-gray-400">Prioridade:</span>
                <span class="${this.getPriorityConfig(ticket.priority).color} font-medium">
                  ${this.getPriorityLabel(ticket.priority)}
                </span>
              </div>
              <div class="flex justify-between py-2 border-b border-gray-700/50">
                <span class="text-gray-400">Criado em:</span>
                <span class="text-white">${this.formatDate(ticket.sys_created_on)}</span>
              </div>
              <div class="flex justify-between py-2">
                <span class="text-gray-400">Atualizado em:</span>
                <span class="text-white">${this.formatDate(ticket.sys_updated_on)}</span>
              </div>
            </div>
          </div>
          
          <!-- Atribuição -->
          <div class="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
            <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
              Atribuição
            </h3>
            
            <div class="space-y-3">
              <div class="flex justify-between py-2 border-b border-gray-700/50">
                <span class="text-gray-400">Grupo:</span>
                <span class="text-white">${ticket.assignment_group?.display_value || ticket.assignment_group || 'N/A'}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-gray-700/50">
                <span class="text-gray-400">Atribuído para:</span>
                <span class="text-white">${ticket.assigned_to?.display_value || ticket.assigned_to || 'Não atribuído'}</span>
              </div>
              <div class="flex justify-between py-2">
                <span class="text-gray-400">Solicitante:</span>
                <span class="text-white">${ticket.caller_id?.display_value || ticket.caller_id || 'N/A'}</span>
              </div>
            </div>
          </div>
          
          <!-- Descrição Completa -->
          <div class="lg:col-span-2 bg-gray-800/50 rounded-lg border border-gray-700 p-4">
            <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Descrição
            </h3>
            
            <div class="prose prose-invert max-w-none">
              <p class="text-gray-300 leading-relaxed whitespace-pre-wrap">
                ${ticket.description || ticket.short_description || 'Sem descrição disponível'}
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate SLA tab with progress bars and status indicators
   */
  private static generateSLATab(slaData: any[]): string {
    if (!slaData || slaData.length === 0) {
      return `
        <div x-show="activeTab === 'sla'" class="p-6">
          <div class="text-center py-12">
            <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <h3 class="text-lg font-medium text-gray-400 mb-2">Nenhum SLA encontrado</h3>
            <p class="text-gray-500">Este ticket não possui SLAs configurados.</p>
          </div>
        </div>
      `;
    }

    const slaCards = slaData.map(sla => this.generateSLACard(sla)).join('');
    
    return `
      <div x-show="activeTab === 'sla'" class="p-6">
        <div class="space-y-4">
          ${slaCards}
        </div>
      </div>
    `;
  }

  /**
   * Generate individual SLA card with progress bar
   */
  private static generateSLACard(sla: any): string {
    const percentage = parseFloat(sla.taskslatable_business_percentage || '0');
    const hasBreached = sla.taskslatable_has_breached === 'true' || sla.taskslatable_has_breached === true;
    const slaName = sla.taskslatable_sla || 'SLA';
    
    let statusIcon = '🟢';
    let statusText = 'CUMPRIDO';
    let statusColor = 'text-green-400';
    let barColor = 'bg-green-500';
    
    if (hasBreached) {
      statusIcon = '🔴';
      statusText = 'VIOLADO';
      statusColor = 'text-red-400';
      barColor = 'bg-red-500';
    } else if (percentage > 80) {
      statusIcon = '🟡';
      statusText = 'EM ANDAMENTO';
      statusColor = 'text-yellow-400';
      barColor = 'bg-yellow-500';
    }

    return `
      <div class="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
        <div class="flex items-center justify-between mb-4">
          <h4 class="text-lg font-semibold text-white">${slaName}</h4>
          <span class="flex items-center space-x-2 ${statusColor}">
            <span class="text-lg">${statusIcon}</span>
            <span class="font-medium">${statusText}</span>
          </span>
        </div>
        
        <div class="mb-4">
          <div class="flex justify-between text-sm mb-2">
            <span class="text-gray-400">Progresso</span>
            <span class="text-white font-medium">${percentage.toFixed(1)}%</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-3">
            <div class="${barColor} h-3 rounded-full transition-all duration-300" 
                 style="width: ${Math.min(percentage, 100)}%"></div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-gray-400">Início:</span>
            <div class="text-white">${this.formatDate(sla.taskslatable_start_time)}</div>
          </div>
          <div>
            <span class="text-gray-400">Fim:</span>
            <div class="text-white">${this.formatDate(sla.taskslatable_end_time)}</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate notes tab
   */
  private static generateNotesTab(notes: any[]): string {
    return `
      <div x-show="activeTab === 'notes'" class="p-6">
        <div class="mb-6">
          <button class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            <span>Adicionar Nota</span>
          </button>
        </div>
        
        ${notes.length === 0 ? this.generateEmptyNotes() : this.generateNotesList(notes)}
      </div>
    `;
  }

  /**
   * Generate history tab
   */
  private static generateHistoryTab(history: any[]): string {
    return `
      <div x-show="activeTab === 'history'" class="p-6">
        ${history.length === 0 ? this.generateEmptyHistory() : this.generateHistoryList(history)}
      </div>
    `;
  }

  /**
   * Generate modal action buttons
   */
  private static generateModalActions(ticket: TicketData): string {
    const canResolve = ['1', '2', '3'].includes(ticket.state); // New, In Progress, On Hold
    const canClose = ticket.state === '6'; // Resolved
    const canReopen = ['6', '7'].includes(ticket.state); // Resolved, Closed
    const canAssign = !['7'].includes(ticket.state); // Not Closed

    return `
      <div class="flex justify-between p-6 border-t border-gray-700 bg-gray-800/30">
        <!-- Action Buttons -->
        <div class="flex space-x-2">
          ${canResolve ? `
            <button onclick="window.showResolveModal('${ticket.sys_id}', '${ticket.table}')" 
                    class="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors flex items-center space-x-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
              <span>Resolver</span>
            </button>
          ` : ''}
          
          ${canClose ? `
            <button onclick="window.showCloseModal('${ticket.sys_id}', '${ticket.table}')" 
                    class="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors flex items-center space-x-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
              <span>Fechar</span>
            </button>
          ` : ''}
          
          ${canReopen ? `
            <button onclick="window.showReopenModal('${ticket.sys_id}', '${ticket.table}')" 
                    class="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg transition-colors flex items-center space-x-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              <span>Reabrir</span>
            </button>
          ` : ''}
          
          ${canAssign ? `
            <button onclick="window.showAssignModal('${ticket.sys_id}', '${ticket.table}')" 
                    class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center space-x-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              <span>Atribuir</span>
            </button>
          ` : ''}
          
          <div class="relative">
            <button onclick="window.toggleActionsMenu()" 
                    class="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors flex items-center space-x-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
              </svg>
              <span>Mais</span>
            </button>
            
            <!-- Dropdown Menu -->
            <div id="actionsDropdown" class="hidden absolute bottom-full left-0 mb-2 w-48 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-10">
              <div class="py-1">
                <button onclick="window.showPriorityModal('${ticket.sys_id}', '${ticket.table}')" 
                        class="w-full text-left px-4 py-2 text-white hover:bg-gray-700 flex items-center space-x-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                  </svg>
                  <span>Alterar Prioridade</span>
                </button>
                <button onclick="window.showCategoryModal('${ticket.sys_id}', '${ticket.table}')" 
                        class="w-full text-left px-4 py-2 text-white hover:bg-gray-700 flex items-center space-x-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                  </svg>
                  <span>Alterar Categoria</span>
                </button>
                <button onclick="window.showEscalateModal('${ticket.sys_id}', '${ticket.table}')" 
                        class="w-full text-left px-4 py-2 text-white hover:bg-gray-700 flex items-center space-x-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/>
                  </svg>
                  <span>Escalonar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Close Button -->
        <div class="flex space-x-3">
          <button onclick="window.closeModal()" 
                  class="px-4 py-2 text-gray-400 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition-colors">
            Fechar
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Generate real-time update script for SSE
   */
  private static generateRealTimeScript(sysId: string): string {
    return `
      <script>
        // Real-time updates via Server-Sent Events
        (function() {
          let eventSource = null;
          
          function connectSSE() {
            if (eventSource) {
              eventSource.close();
            }
            
            console.log('📡 Connecting to SSE for ticket:', '${sysId}');
            eventSource = new EventSource('/sse/ticket-updates/${sysId}');
            
            eventSource.onopen = function(event) {
              console.log('✅ SSE connection opened for ticket ${sysId}');
            };
            
            eventSource.onmessage = function(event) {
              const message = JSON.parse(event.data);
              console.log('📡 Real-time update received:', message);
              
              if (message.type === 'ticket-updated') {
                // Show notification of update
                showUpdateNotification(message.data);
                
                // Optionally refresh modal content
                if (message.data.changedFields && message.data.changedFields.length > 0) {
                  refreshModalSection(message.data.changedFields);
                }
              }
            };
            
            eventSource.onerror = function(event) {
              console.warn('❌ SSE connection error:', event);
              // Retry connection after 5 seconds
              setTimeout(connectSSE, 5000);
            };
          }
          
          function showUpdateNotification(data) {
            // Create simple notification
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-300';
            notification.innerHTML = \`
              <div class="flex items-center space-x-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>Ticket \${data.number} foi atualizado</span>
              </div>
            \`;
            
            document.body.appendChild(notification);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
              notification.style.opacity = '0';
              setTimeout(() => {
                document.body.removeChild(notification);
              }, 300);
            }, 5000);
          }
          
          function refreshModalSection(changedFields) {
            // This could trigger HTMX refresh for specific sections
            console.log('🔄 Would refresh sections for fields:', changedFields);
          }
          
          // Cleanup function
          window.cleanupTicketSSE = function() {
            if (eventSource) {
              console.log('🧹 Closing SSE connection');
              eventSource.close();
              eventSource = null;
            }
          };
          
          // Start connection
          connectSSE();
        })();
      </script>
    `;
  }

  // Helper methods for formatting and styling
  private static getPriorityConfig(priority: string) {
    const configs = {
      '1': { color: 'text-red-400', bgColor: 'bg-red-500/20 text-red-300 border-red-500/30' },
      '2': { color: 'text-orange-400', bgColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
      '3': { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
      '4': { color: 'text-green-400', bgColor: 'bg-green-500/20 text-green-300 border-green-500/30' }
    };
    return configs[priority as keyof typeof configs] || configs['3'];
  }

  private static getStatusConfig(state: string) {
    const configs = {
      '1': { label: 'Novo', color: 'text-blue-300', bgColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
      '2': { label: 'Em Andamento', color: 'text-yellow-300', bgColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
      '3': { label: 'Em Espera', color: 'text-orange-300', bgColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
      '6': { label: 'Resolvido', color: 'text-green-300', bgColor: 'bg-green-500/20 text-green-300 border-green-500/30' },
      '7': { label: 'Fechado', color: 'text-gray-300', bgColor: 'bg-gray-500/20 text-gray-300 border-gray-500/30' }
    };
    return configs[state as keyof typeof configs] || configs['1'];
  }

  private static getPriorityLabel(priority: string): string {
    const labels = { '1': 'Crítica', '2': 'Alta', '3': 'Média', '4': 'Baixa' };
    return labels[priority as keyof typeof labels] || 'Média';
  }

  private static formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('pt-BR');
  }

  private static generateEmptyNotes(): string {
    return `
      <div class="text-center py-12">
        <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
        <h3 class="text-lg font-medium text-gray-400 mb-2">Nenhuma nota encontrada</h3>
        <p class="text-gray-500">Seja o primeiro a adicionar uma nota a este ticket.</p>
      </div>
    `;
  }

  private static generateNotesList(notes: any[]): string {
    return notes.map(note => {
      const author = note.sys_created_by?.display_value || note.sys_created_by || 'Sistema';
      const noteContent = note.value || '';
      const isWorkNote = note.work_notes;
      
      return `
        <div class="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div class="flex justify-between items-start mb-2">
            <div class="flex items-center space-x-2">
              <span class="font-medium text-white">${author}</span>
              ${isWorkNote ? '<span class="px-2 py-1 bg-yellow-600/20 text-yellow-300 text-xs rounded-full border border-yellow-600/30">Work Note</span>' : '<span class="px-2 py-1 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-600/30">Public</span>'}
            </div>
            <span class="text-sm text-gray-400">${this.formatDate(note.sys_created_on)}</span>
          </div>
          <p class="text-gray-300 whitespace-pre-wrap leading-relaxed">${noteContent}</p>
        </div>
      `;
    }).join('');
  }

  private static generateEmptyHistory(): string {
    return `
      <div class="text-center py-12">
        <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <h3 class="text-lg font-medium text-gray-400 mb-2">Nenhum histórico encontrado</h3>
        <p class="text-gray-500">O histórico de alterações aparecerá aqui.</p>
      </div>
    `;
  }

  private static generateHistoryList(history: any[]): string {
    return history.map(item => `
      <div class="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div class="flex justify-between items-start mb-2">
          <span class="font-medium text-white">${item.user || 'Sistema'}</span>
          <span class="text-sm text-gray-400">${this.formatDate(item.timestamp)}</span>
        </div>
        <p class="text-gray-300">${item.description || item.change || ''}</p>
      </div>
    `).join('');
  }
}