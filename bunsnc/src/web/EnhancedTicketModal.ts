/**
 * Enhanced Ticket Modal - Professional Modal with SLA Tabs
 * Based on MONGODB_REDIS_STREAMS_ARCHITECTURE.md Phase 2
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketData } from "../services/ConsolidatedDataService";
import { ServiceNowNote } from "../services/ConsolidatedServiceNowService";
import type { HistoryEntry } from "../types/TicketTypes";

export interface SLAData {
  sys_id: string;
  task_number: string;
  taskslatable_business_percentage: string;
  taskslatable_sla: string;
  taskslatable_stage: string;
  taskslatable_has_breached: boolean;
  taskslatable_start_time: string;
  taskslatable_end_time: string;
  assignment_group: string;
}

export interface EnhancedModalProps {
  ticket: TicketData;
  slaData: SLAData[];
  notes: ServiceNowNote[];
  history: HistoryEntry[];
  showRealTime?: boolean;
}

export class EnhancedTicketModalView {
  /**
   * Generate complete professional modal with tabs
   */
  static generateModal(props: EnhancedModalProps): string {
    return `
      <div id="ticket-modal" data-sys-id="${props.ticket.sys_id}" data-table="${props.ticket.table}" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 modal-professional">
        <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
          <!-- Modal Header -->
          ${this.generateModalHeader(props.ticket)}
          
          <!-- Modal Tabs -->
          ${this.generateTabs()}
          
          <!-- Modal Content -->
          <div class="flex-1 overflow-hidden">
            <!-- Detalhes Tab -->
            <div id="tab-detalhes" class="tab-content active overflow-y-auto p-6 h-full">
              ${this.generateDetailsTab(props.ticket)}
            </div>
            
            <!-- SLA Tab -->
            <div id="tab-sla" class="tab-content hidden overflow-y-auto p-6 h-full">
              ${this.generateSLATab(props.slaData)}
            </div>
            
            <!-- Notas Tab -->
            <div id="tab-notas" class="tab-content hidden overflow-y-auto p-6 h-full">
              ${this.generateNotesTab(props.notes, props.ticket)}
            </div>
            
            <!-- Histórico Tab -->
            <div id="tab-historico" class="tab-content hidden overflow-y-auto p-6 h-full">
              ${this.generateHistoryTab(props.history)}
            </div>
          </div>
          
          <!-- Modal Footer -->
          ${this.generateModalFooter(props.ticket)}
        </div>
        
        ${props.showRealTime ? this.generateRealTimeScript(props.ticket.sys_id) : ""}
      </div>
      
      <!-- Modal Styles -->
      ${this.generateModalStyles()}
      
      <!-- Modal JavaScript -->
      ${this.generateModalScript()}
    `;
  }

  private static generateModalHeader(ticket: TicketData): string {
    const priorityColor = this.getPriorityColor(ticket.priority);
    const stateColor = this.getStateColor(ticket.state);
    const stateText = this.getStateText(ticket.state);

    return `
      <div class="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 rounded-full bg-${priorityColor}-500"></div>
            <h2 class="text-xl font-bold text-gray-800">${ticket.number}</h2>
          </div>
          
          <div class="flex items-center space-x-2">
            <span class="px-3 py-1 text-xs font-medium bg-${stateColor}-100 text-${stateColor}-800 rounded-full">
              ${stateText}
            </span>
            <span class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
              P${ticket.priority}
            </span>
          </div>
        </div>
        
        <div class="flex items-center space-x-2">
          <button id="refresh-modal" class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </button>
          <button onclick="closeModal()" class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  private static generateTabs(): string {
    return `
      <div class="bg-white border-b border-gray-200">
        <nav class="flex space-x-8 px-6" aria-label="Tabs">
          <button onclick="switchTab('detalhes')" class="tab-button active border-b-2 border-blue-500 py-2 px-1 text-sm font-medium text-blue-600">
            <div class="flex items-center space-x-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span>Detalhes</span>
            </div>
          </button>
          
          <button onclick="switchTab('sla')" class="tab-button border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
            <div class="flex items-center space-x-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>SLA</span>
            </div>
          </button>
          
          <button onclick="switchTab('notas')" class="tab-button border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
            <div class="flex items-center space-x-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10m0 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m10 0v10a2 2 0 01-2 2H9a2 2 0 01-2-2V8m10 0H7"></path>
              </svg>
              <span>Notas</span>
            </div>
          </button>
          
          <button onclick="switchTab('historico')" class="tab-button border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
            <div class="flex items-center space-x-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>Histórico</span>
            </div>
          </button>
        </nav>
      </div>
    `;
  }

  /**
   * Generate details tab content (public for HTMX refresh)
   * Used by ModalRoutes refresh endpoint for partial updates
   */
  public static generateDetailsTab(ticket: TicketData): string {
    return `
      <div class="space-y-6">
        <!-- Short Description with Edit Mode -->
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Descrição Curta</h3>

          <!-- View Mode -->
          <div class="view-mode-field">
            <p class="text-gray-900">${ticket.short_description || "Sem descrição"}</p>
          </div>

          <!-- Edit Mode (Hidden by default) -->
          <div class="edit-mode-field hidden">
            <input
              type="text"
              id="edit-short-description"
              data-field="short_description"
              data-original-value="${ticket.short_description || ""}"
              value="${ticket.short_description || ""}"
              maxlength="160"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              oninput="updateCharCounter('short-description', this.value, 160)"
            />
            <p class="text-xs text-gray-500 mt-1">
              <span id="short-description-counter">0</span>/160 caracteres
            </p>
          </div>
        </div>

        <!-- Priority, State, Urgency, Impact Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Priority -->
          <div class="bg-white border border-gray-200 rounded-lg p-4">
            <h3 class="text-sm font-semibold text-gray-900 mb-3">Prioridade</h3>

            <div class="view-mode-field">
              <span class="px-3 py-1 text-sm font-medium bg-${this.getPriorityColor(ticket.priority)}-100 text-${this.getPriorityColor(ticket.priority)}-800 rounded-full">
                P${ticket.priority}
              </span>
            </div>

            <div class="edit-mode-field hidden">
              <select
                id="edit-priority"
                data-field="priority"
                data-original-value="${ticket.priority}"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="1" ${ticket.priority === "1" ? "selected" : ""}>P1 - Crítica</option>
                <option value="2" ${ticket.priority === "2" ? "selected" : ""}>P2 - Alta</option>
                <option value="3" ${ticket.priority === "3" ? "selected" : ""}>P3 - Moderada</option>
                <option value="4" ${ticket.priority === "4" ? "selected" : ""}>P4 - Baixa</option>
                <option value="5" ${ticket.priority === "5" ? "selected" : ""}>P5 - Planejamento</option>
              </select>
            </div>
          </div>

          <!-- State -->
          <div class="bg-white border border-gray-200 rounded-lg p-4">
            <h3 class="text-sm font-semibold text-gray-900 mb-3">Estado</h3>

            <div class="view-mode-field">
              <span class="px-3 py-1 text-sm font-medium bg-${this.getStateColor(ticket.state)}-100 text-${this.getStateColor(ticket.state)}-800 rounded-full">
                ${this.getStateText(ticket.state)}
              </span>
            </div>

            <div class="edit-mode-field hidden">
              <select
                id="edit-state"
                data-field="state"
                data-original-value="${ticket.state}"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="1" ${ticket.state === "1" ? "selected" : ""}>Novo</option>
                <option value="2" ${ticket.state === "2" ? "selected" : ""}>Em Andamento</option>
                <option value="3" ${ticket.state === "3" ? "selected" : ""}>Em Espera</option>
                <option value="6" ${ticket.state === "6" ? "selected" : ""}>Resolvido</option>
                <option value="7" ${ticket.state === "7" ? "selected" : ""}>Fechado</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Description (Long) -->
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Descrição Detalhada</h3>

          <div class="view-mode-field">
            <div class="bg-gray-50 p-4 rounded-md">
              <p class="text-gray-900 whitespace-pre-wrap">${ticket.description || "Sem descrição disponível"}</p>
            </div>
          </div>

          <div class="edit-mode-field hidden">
            <textarea
              id="edit-description"
              data-field="description"
              data-original-value="${ticket.description || ""}"
              rows="6"
              maxlength="4000"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              oninput="updateCharCounter('description', this.value, 4000)"
            >${ticket.description || ""}</textarea>
            <p class="text-xs text-gray-500 mt-1">
              <span id="description-counter">0</span>/4000 caracteres
            </p>
          </div>
        </div>

        <!-- Work Notes (Only in Edit Mode) -->
        <div id="work-notes-section" class="edit-mode-field hidden bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center">
            <svg class="w-5 h-5 mr-2 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
            Notas de Trabalho (Opcional)
          </h3>

          <textarea
            id="edit-work-notes"
            data-field="work_notes"
            data-original-value=""
            rows="4"
            maxlength="4000"
            placeholder="Adicione uma nota explicando as mudanças realizadas..."
            class="w-full px-3 py-2 text-sm border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-500"
            oninput="updateCharCounter('work-notes', this.value, 4000)"
          ></textarea>
          <p class="text-xs text-gray-600 mt-2">
            <span id="work-notes-counter">0</span>/4000 caracteres
            <br>
            💡 Esta nota será registrada no histórico do ticket como trabalho realizado.
          </p>
        </div>

        <!-- Read-only Fields -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">Informações do Sistema</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600">Número:</span>
                <span class="font-medium">${ticket.number}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Criado:</span>
                <span class="font-medium">${this.formatDateTime(ticket.sys_created_on)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Atualizado:</span>
                <span class="font-medium">${this.formatDateTime(ticket.sys_updated_on)}</span>
              </div>
            </div>
          </div>

          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">Atribuição</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600">Grupo:</span>
                <span class="font-medium">${ticket.assignment_group?.display_value || "Não atribuído"}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Atribuído a:</span>
                <span class="font-medium">${ticket.assigned_to?.display_value || "Não atribuído"}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Solicitante:</span>
                <span class="font-medium">${ticket.caller_id?.display_value || "N/A"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate SLA tab content (public for HTMX refresh)
   * Used by ModalRoutes refresh endpoint for partial updates
   */
  public static generateSLATab(slaData: SLAData[]): string {
    if (!slaData || slaData.length === 0) {
      return `
        <div class="text-center py-8">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">Nenhum SLA encontrado</h3>
          <p class="mt-1 text-sm text-gray-500">Este ticket não possui SLAs configurados.</p>
        </div>
      `;
    }

    const slaCards = slaData
      .map(
        (sla) => `
      <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-lg font-semibold text-gray-900">${sla.taskslatable_sla}</h3>
          <div class="flex items-center space-x-2">
            ${this.generateSLAStatusIcon(sla)}
            <span class="text-sm font-medium ${this.getSLAStatusColor(sla)}">
              ${this.getSLAStatusText(sla)}
            </span>
          </div>
        </div>
        
        <div class="space-y-4">
          <!-- Progress Bar -->
          <div class="w-full bg-gray-200 rounded-full h-4 relative">
            <div class="bg-${this.getSLAProgressColor(sla)}-500 h-4 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                 style="width: ${sla.taskslatable_business_percentage}%">
              <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 animate-pulse"></div>
            </div>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xs font-bold ${parseFloat(sla.taskslatable_business_percentage) > 50 ? "text-white" : "text-gray-700"}">
                ${sla.taskslatable_business_percentage}%
              </span>
            </div>
          </div>
          
          <!-- SLA Details -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-sm font-medium text-gray-500">Início:</span>
              <p class="text-sm text-gray-900">${this.formatDateTime(sla.taskslatable_start_time)}</p>
            </div>
            
            <div>
              <span class="text-sm font-medium text-gray-500">Prazo:</span>
              <p class="text-sm text-gray-900">${this.formatDateTime(sla.taskslatable_end_time)}</p>
            </div>
            
            <div>
              <span class="text-sm font-medium text-gray-500">Estágio:</span>
              <p class="text-sm text-gray-900">${sla.taskslatable_stage}</p>
            </div>
            
            <div>
              <span class="text-sm font-medium text-gray-500">Grupo:</span>
              <p class="text-sm text-gray-900">${sla.assignment_group || "N/A"}</p>
            </div>
          </div>
          
          <!-- Time Remaining -->
          <div class="bg-gray-50 p-3 rounded-md">
            <div class="flex justify-between items-center">
              <span class="text-sm font-medium text-gray-700">Tempo Restante:</span>
              <span class="text-sm font-bold ${this.getSLATimeColor(sla)}">
                ${this.calculateTimeRemaining(sla.taskslatable_end_time)}
              </span>
            </div>
          </div>
        </div>
      </div>
    `,
      )
      .join("");

    return `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-bold text-gray-900">Service Level Agreements</h2>
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              <div class="w-3 h-3 bg-green-500 rounded-full"></div>
              <span class="text-sm text-gray-600">Cumprido</span>
            </div>
            <div class="flex items-center space-x-2">
              <div class="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span class="text-sm text-gray-600">Em Andamento</span>
            </div>
            <div class="flex items-center space-x-2">
              <div class="w-3 h-3 bg-red-500 rounded-full"></div>
              <span class="text-sm text-gray-600">Violado</span>
            </div>
          </div>
        </div>
        
        <div class="grid gap-6">
          ${slaCards}
        </div>
      </div>
    `;
  }

  /**
   * Generate notes tab content (public for HTMX refresh)
   * Used by ModalRoutes refresh endpoint for partial updates
   */
  public static generateNotesTab(
    notes: ServiceNowNote[],
    ticket: TicketData,
  ): string {
    const notesHtml =
      notes && notes.length > 0
        ? notes
            .map(
              (note) => `
          <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center space-x-2">
                <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-900">${note.sys_created_by || "Sistema"}</p>
                  <p class="text-xs text-gray-500">${this.formatDateTime(note.sys_created_on)}</p>
                </div>
              </div>
              
              <span class="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                ${note.element || "Nota"}
              </span>
            </div>
            
            <div class="prose prose-sm max-w-none">
              <p class="text-gray-700 whitespace-pre-wrap">${note.value || "Nota vazia"}</p>
            </div>
          </div>
        `,
            )
            .join("")
        : `
        <div class="text-center py-8">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10m0 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m10 0v10a2 2 0 01-2 2H9a2 2 0 01-2-2V8m10 0H7"></path>
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">Nenhuma nota encontrada</h3>
          <p class="mt-1 text-sm text-gray-500">Este ticket ainda não possui notas.</p>
        </div>
      `;

    return `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-bold text-gray-900">Notas e Comentários</h2>
          <button onclick="addNewNote('${ticket.sys_id}', '${ticket.table}')" class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
            Adicionar Nota
          </button>
        </div>
        
        <div class="space-y-4 max-h-96 overflow-y-auto">
          ${notesHtml}
        </div>
      </div>
    `;
  }

  private static generateHistoryTab(history: HistoryEntry[]): string {
    if (!history || history.length === 0) {
      return `
        <div class="space-y-6">
          <h2 class="text-xl font-bold text-gray-900">Histórico de Mudanças</h2>

          <div class="text-center py-8">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900">Nenhum histórico disponível</h3>
            <p class="mt-1 text-sm text-gray-500">Não foram encontradas mudanças registradas para este ticket.</p>
          </div>
        </div>
      `;
    }

    const timelineItems = history.map((entry) => this.generateHistoryTimelineItem(entry)).join("");

    return `
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold text-gray-900">Histórico de Mudanças</h2>
          <span class="text-sm text-gray-500">${history.length} mudanças registradas</span>
        </div>

        <div class="flow-root">
          <ul role="list" class="-mb-8">
            ${timelineItems}
          </ul>
        </div>
      </div>
    `;
  }

  private static generateHistoryTimelineItem(entry: HistoryEntry): string {
    const fieldLabel = this.getFieldLabel(entry.fieldname);
    const changeIcon = this.getChangeIcon(entry.fieldname);
    const formattedTime = this.formatDateTime(entry.sys_created_on);
    const userDisplay = entry.sys_created_by || "Sistema";

    return `
      <li>
        <div class="relative pb-8">
          <span class="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
          <div class="relative flex space-x-3">
            <div>
              <span class="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white">
                ${changeIcon}
              </span>
            </div>
            <div class="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
              <div class="flex-1">
                <p class="text-sm font-medium text-gray-900">
                  ${fieldLabel}
                </p>
                <div class="mt-2 space-y-1">
                  ${entry.oldvalue ? `
                    <div class="flex items-start space-x-2">
                      <span class="text-xs text-gray-500 font-medium">De:</span>
                      <span class="text-xs text-gray-700 line-through">${this.escapeHtml(entry.oldvalue)}</span>
                    </div>
                  ` : ""}
                  <div class="flex items-start space-x-2">
                    <span class="text-xs text-gray-500 font-medium">Para:</span>
                    <span class="text-xs text-gray-900 font-semibold">${this.escapeHtml(entry.newvalue)}</span>
                  </div>
                </div>
                <div class="mt-2 flex items-center space-x-2 text-xs text-gray-500">
                  <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                  </svg>
                  <span>${userDisplay}</span>
                </div>
              </div>
              <div class="whitespace-nowrap text-right text-sm text-gray-500">
                <time datetime="${entry.sys_created_on}">${formattedTime}</time>
              </div>
            </div>
          </div>
        </div>
      </li>
    `;
  }

  private static getFieldLabel(fieldname: string): string {
    const fieldLabels: Record<string, string> = {
      state: "Estado",
      priority: "Prioridade",
      assigned_to: "Atribuído a",
      assignment_group: "Grupo de Atribuição",
      short_description: "Descrição Curta",
      description: "Descrição",
      work_notes: "Notas de Trabalho",
      comments: "Comentários",
      close_notes: "Notas de Fechamento",
      resolution_code: "Código de Resolução",
      impact: "Impacto",
      urgency: "Urgência",
      category: "Categoria",
      subcategory: "Subcategoria",
      caller_id: "Solicitante",
      opened_at: "Aberto em",
      resolved_at: "Resolvido em",
      closed_at: "Fechado em",
    };

    return fieldLabels[fieldname] || fieldname;
  }

  private static getChangeIcon(fieldname: string): string {
    const criticalFields = ["state", "priority", "assigned_to", "assignment_group"];

    if (criticalFields.includes(fieldname)) {
      return `
        <svg class="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd" />
        </svg>
      `;
    }

    return `
      <svg class="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    `;
  }

  private static generateModalFooter(ticket: TicketData): string {
    return `
      <div class="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-between items-center">
        <div class="flex items-center space-x-4">
          <span class="text-sm text-gray-500">
            Última atualização: ${this.formatDateTime(ticket.sys_updated_on)}
          </span>
          <div id="real-time-indicator" class="flex items-center space-x-2 text-green-600">
            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span class="text-xs">Tempo real ativo</span>
          </div>
        </div>

        <!-- View Mode Buttons -->
        <div id="view-mode-buttons" class="flex items-center space-x-3">
          <button
            onclick="toggleEditMode()"
            class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
            Editar Ticket
          </button>

          <button
            onclick="openServiceNow('${ticket.sys_id}', '${ticket.table}')"
            class="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
            Abrir no ServiceNow
          </button>

          <button
            onclick="closeModal()"
            class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gray-600 border border-transparent rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Fechar
          </button>
        </div>

        <!-- Edit Mode Buttons (Hidden by default) -->
        <div id="edit-mode-buttons" class="hidden flex items-center space-x-3">
          <button
            onclick="saveTicketChanges()"
            id="save-ticket-btn"
            class="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span id="save-btn-text">Salvar Alterações</span>
          </button>

          <button
            onclick="cancelEdit()"
            class="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Cancelar
          </button>
        </div>
      </div>
    `;
  }

  private static generateRealTimeScript(sysId: string): string {
    return `
      <script>
        (function() {
          // Redis Streams subscription for real-time updates
          const eventSource = new EventSource('/events/ticket-updates/${sysId}');
          
          eventSource.onmessage = function(event) {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'ticket-updated') {
                console.log('📡 Real-time update received:', data);
                
                // Update modal content dynamically
                updateModalContent(data);
                
                // Show notification
                showUpdateNotification(data);
              }
            } catch (error: unknown) {
              console.error('Error processing real-time update:', error);
            }
          };
          
          eventSource.onerror = function(error) {
            console.warn('Real-time connection error:', error);
            document.getElementById('real-time-indicator').innerHTML = 
              '<div class="w-2 h-2 bg-red-500 rounded-full"></div><span class="text-xs text-red-600">Conexão perdida</span>';
          };
          
          // Cleanup on modal close
          window.addEventListener('beforeunload', function() {
            eventSource.close();
          });
          
          function updateModalContent(data) {
            // Update header if state or priority changed
            if (data.state || data.priority) {
              // Trigger HTMX refresh for specific sections
              htmx.trigger('#ticket-modal', 'refresh-header');
            }
            
            // Update SLA if needed
            if (data.sla_updates) {
              htmx.trigger('#tab-sla', 'refresh-sla');
            }
          }
          
          function showUpdateNotification(data) {
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-md shadow-lg z-50 transform translate-x-full transition-transform';
            notification.textContent = 'Ticket atualizado em tempo real';
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
              notification.classList.remove('translate-x-full');
            }, 100);
            
            setTimeout(() => {
              notification.classList.add('translate-x-full');
              setTimeout(() => notification.remove(), 300);
            }, 3000);
          }
        })();
      </script>
    `;
  }

  private static generateModalStyles(): string {
    return `
      <style>
        .modal-professional {
          backdrop-filter: blur(4px);
        }
        
        .tab-content {
          min-height: 400px;
          max-height: 60vh;
        }
        
        .tab-content.active {
          display: block !important;
        }
        
        .tab-button.active {
          border-color: #3b82f6 !important;
          color: #3b82f6 !important;
        }
        
        .sla-progress-bar {
          background: linear-gradient(90deg, #10b981 0%, #f59e0b 70%, #ef4444 100%);
        }
        
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: .5;
          }
        }
        
        /* Custom scrollbar for tab content */
        .tab-content::-webkit-scrollbar {
          width: 6px;
        }
        
        .tab-content::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        
        .tab-content::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        
        .tab-content::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        
        /* Edit Mode Styles */
        .view-mode-field {
          display: block;
        }

        .edit-mode-field {
          display: none;
        }

        body.edit-mode .view-mode-field {
          display: none;
        }

        body.edit-mode .edit-mode-field {
          display: block;
        }

        #view-mode-buttons {
          display: flex;
        }

        #edit-mode-buttons {
          display: none;
        }

        body.edit-mode #view-mode-buttons {
          display: none;
        }

        body.edit-mode #edit-mode-buttons {
          display: flex;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .modal-professional .max-w-6xl {
            max-width: calc(100vw - 2rem);
          }

          .grid-cols-2 {
            grid-template-columns: 1fr;
          }
        }
      </style>
    `;
  }

  private static generateModalScript(): string {
    return `
      <script>
        function switchTab(tabName) {
          // Hide all tab contents
          document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.add('hidden');
            tab.classList.remove('active');
          });
          
          // Show selected tab
          document.getElementById('tab-' + tabName).classList.remove('hidden');
          document.getElementById('tab-' + tabName).classList.add('active');
          
          // Update tab buttons
          document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active', 'border-blue-500', 'text-blue-600');
            button.classList.add('border-transparent', 'text-gray-500');
          });
          
          // Activate current tab button
          event.target.closest('.tab-button').classList.add('active', 'border-blue-500', 'text-blue-600');
          event.target.closest('.tab-button').classList.remove('border-transparent', 'text-gray-500');
        }
        
        function closeModal() {
          const modal = document.getElementById('ticket-modal');
          if (modal) {
            modal.remove();
          }
        }
        
        function openServiceNow(sysId, table) {
          const baseUrl = '${process.env.SNC_INSTANCE_URL || "https://iberdrola.service-now.com"}';
          const url = \`\${baseUrl}/nav_to.do?uri=\${table}.do?sys_id=\${sysId}\`;
          window.open(url, '_blank');
        }

        // Edit Mode Functions
        function toggleEditMode() {
          document.body.classList.add('edit-mode');
          // Initialize character counters
          updateCharCounter('short-description', document.getElementById('edit-short-description').value, 160);
          updateCharCounter('description', document.getElementById('edit-description').value, 4000);
        }

        function cancelEdit() {
          // Restore original values
          document.querySelectorAll('[data-original-value]').forEach(field => {
            const originalValue = field.getAttribute('data-original-value');
            if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
              field.value = originalValue;
            } else if (field.tagName === 'SELECT') {
              field.value = originalValue;
            }
          });

          document.body.classList.remove('edit-mode');
        }

        function updateCharCounter(fieldId, value, maxLength) {
          const counter = document.getElementById(fieldId + '-counter');
          if (counter) {
            counter.textContent = value.length;
            counter.style.color = value.length >= maxLength * 0.9 ? '#ef4444' : '#6b7280';
          }
        }

        async function saveTicketChanges() {
          const saveBtn = document.getElementById('save-ticket-btn');
          const saveBtnText = document.getElementById('save-btn-text');

          // Disable button
          saveBtn.disabled = true;
          saveBtnText.textContent = 'Salvando...';

          try {
            // Collect changed fields
            const changes = {};
            document.querySelectorAll('[data-field][data-original-value]').forEach(field => {
              const fieldName = field.getAttribute('data-field');
              const originalValue = field.getAttribute('data-original-value');
              const currentValue = field.value;

              if (currentValue !== originalValue && currentValue.trim() !== '') {
                changes[fieldName] = currentValue;
              }
            });

            if (Object.keys(changes).length === 0) {
              alert('Nenhuma alteração detectada.');
              saveBtn.disabled = false;
              saveBtnText.textContent = 'Salvar Alterações';
              return;
            }

            // Get ticket info from URL or data attributes
            const modal = document.getElementById('ticket-modal');
            const table = modal.getAttribute('data-table') || 'incident';
            const sysId = modal.getAttribute('data-sys-id');

            // Send PUT request
            const response = await fetch(\`/modal/ticket/\${table}/\${sysId}\`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(changes),
            });

            const result = await response.json();

            if (result.success) {
              alert('✅ Ticket atualizado com sucesso!');
              // Reload modal
              window.location.reload();
            } else {
              alert('❌ Erro ao atualizar ticket: ' + (result.error || 'Erro desconhecido'));
              saveBtn.disabled = false;
              saveBtnText.textContent = 'Salvar Alterações';
            }
          } catch (error) {
            console.error('Error saving ticket:', error);
            alert('❌ Erro ao salvar alterações: ' + error.message);
            saveBtn.disabled = false;
            saveBtnText.textContent = 'Salvar Alterações';
          }
        }

        async function addNewNote(sysId, table) {
          // Create note input dialog
          const noteText = prompt('Digite a nota (work note) para adicionar ao ticket:');

          if (!noteText || noteText.trim() === '') {
            return;
          }

          try {
            const response = await fetch(\`/api/incident/add-note/\${sysId}\`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                note: noteText,
                noteType: 'work_notes'  // Default to work_notes
              })
            });

            const result = await response.json();

            if (result.success) {
              alert('✅ Nota adicionada com sucesso!');
              // Reload modal to show new note
              if (window.openTicketModal) {
                window.openTicketModal(sysId, table);
              }
            } else {
              alert('❌ Erro ao adicionar nota: ' + (result.error || 'Erro desconhecido'));
            }
          } catch (error) {
            console.error('Error adding note:', error);
            alert('❌ Erro ao adicionar nota: ' + error.message);
          }
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
          if (document.getElementById('ticket-modal')) {
            switch(e.key) {
              case 'Escape':
                closeModal();
                break;
              case '1':
                if (e.altKey) switchTab('detalhes');
                break;
              case '2':
                if (e.altKey) switchTab('sla');
                break;
              case '3':
                if (e.altKey) switchTab('notas');
                break;
              case '4':
                if (e.altKey) switchTab('historico');
                break;
            }
          }
        });
        
        // Click outside to close
        document.addEventListener('click', function(e) {
          const modal = document.getElementById('ticket-modal');
          if (modal && e.target === modal) {
            closeModal();
          }
        });
      </script>
    `;
  }

  // Utility methods
  private static getPriorityColor(priority: string): string {
    switch (priority) {
      case "1":
        return "red";
      case "2":
        return "yellow";
      case "3":
        return "blue";
      case "4":
        return "green";
      default:
        return "gray";
    }
  }

  private static getStateColor(state: string): string {
    switch (state) {
      case "1":
        return "blue"; // New
      case "2":
        return "yellow"; // In Progress
      case "3":
        return "orange"; // On Hold
      case "6":
        return "green"; // Resolved
      case "7":
        return "gray"; // Closed
      default:
        return "gray";
    }
  }

  private static getStateText(state: string): string {
    switch (state) {
      case "1":
        return "Novo";
      case "2":
        return "Em Andamento";
      case "3":
        return "Em Espera";
      case "6":
        return "Resolvido";
      case "7":
        return "Fechado";
      default:
        return `Estado ${state}`;
    }
  }

  private static getSLAStatusColor(sla: SLAData): string {
    if (sla.taskslatable_has_breached) return "text-red-600";
    const percentage = parseFloat(sla.taskslatable_business_percentage);
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 70) return "text-yellow-600";
    return "text-green-600";
  }

  private static getSLAStatusText(sla: SLAData): string {
    if (sla.taskslatable_has_breached) return "VIOLADO";
    const percentage = parseFloat(sla.taskslatable_business_percentage);
    if (percentage >= 100) return "CUMPRIDO";
    return "EM ANDAMENTO";
  }

  private static generateSLAStatusIcon(sla: SLAData): string {
    if (sla.taskslatable_has_breached) {
      return '<div class="w-3 h-3 bg-red-500 rounded-full"></div>';
    }
    const percentage = parseFloat(sla.taskslatable_business_percentage);
    if (percentage >= 100) {
      return '<div class="w-3 h-3 bg-green-500 rounded-full"></div>';
    }
    return '<div class="w-3 h-3 bg-yellow-500 rounded-full"></div>';
  }

  private static getSLAProgressColor(sla: SLAData): string {
    if (sla.taskslatable_has_breached) return "red";
    const percentage = parseFloat(sla.taskslatable_business_percentage);
    if (percentage >= 90) return "red";
    if (percentage >= 70) return "yellow";
    return "green";
  }

  private static getSLATimeColor(sla: SLAData): string {
    if (sla.taskslatable_has_breached) return "text-red-600";
    const endTime = new Date(sla.taskslatable_end_time).getTime();
    const now = Date.now();
    const remaining = endTime - now;

    if (remaining <= 0) return "text-red-600";
    if (remaining <= 3600000) return "text-yellow-600"; // 1 hour
    return "text-green-600";
  }

  private static calculateTimeRemaining(endTime: string): string {
    const end = new Date(endTime).getTime();
    const now = Date.now();
    const remaining = end - now;

    if (remaining <= 0) return "Expirado";

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }

    return `${hours}h ${minutes}m`;
  }

  private static formatDateTime(dateTime: string): string {
    if (!dateTime) return "N/A";
    try {
      return new Date(dateTime).toLocaleString("pt-BR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateTime;
    }
  }
}
