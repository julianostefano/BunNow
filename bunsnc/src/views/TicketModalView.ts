/**
 * Ticket Modal View - HTML template generation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { TicketData, ModalProps } from '../types/TicketTypes';

export class TicketModalView {
  
  /**
   * Generate complete modal HTML for ticket details
   * @param props - Modal properties with ticket data and labels
   * @returns Complete HTML string for modal
   */
  static generateModal(props: ModalProps): string {
    const { ticket, statusLabel, priorityLabel } = props;
    
    return `
      <div id="ticketModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick="closeModal()">
        <div class="bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 rounded-xl border border-gray-600 shadow-2xl max-w-6xl w-full max-h-[95vh] flex flex-col" onclick="event.stopPropagation()">
          
          ${this.generateHeader(ticket, statusLabel, priorityLabel)}
          ${this.generateContent(ticket)}
          
        </div>
        ${this.generateScript()}
      </div>
    `;
  }

  /**
   * Generate modal header section
   * @param ticket - Ticket data
   * @param statusLabel - Readable status label
   * @param priorityLabel - Readable priority label
   * @returns Header HTML string
   */
  private static generateHeader(ticket: TicketData, statusLabel: string, priorityLabel: string): string {
    return `
      <div class="border-b border-gray-600 p-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <div class="p-3 bg-blue-500/20 rounded-lg">
              <i data-lucide="ticket" class="w-6 h-6 text-blue-400"></i>
            </div>
            <div>
              <h2 class="text-2xl font-bold text-white">${ticket.number}</h2>
              <p class="text-gray-300">${ticket.shortDescription}</p>
              <div class="flex items-center space-x-4 mt-2">
                <span class="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-300">${statusLabel}</span>
                <span class="text-xs text-yellow-400">Prioridade: ${priorityLabel}</span>
              </div>
            </div>
          </div>
          <button onclick="closeModal()" class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <i data-lucide="x" class="w-6 h-6"></i>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Generate modal content section with proper scroll handling
   * @param ticket - Ticket data
   * @returns Content HTML string
   */
  private static generateContent(ticket: TicketData): string {
    return `
      <div class="flex-1 overflow-y-auto p-6 max-h-[calc(95vh-160px)]">
        <div class="space-y-6">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            ${this.generateBasicInfo(ticket)}
            ${this.generateAssignmentInfo(ticket)}
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            ${this.generatePriorityInfo(ticket)}
            ${this.generateSLAInfo(ticket)}
          </div>
          ${this.generateDescription(ticket)}
        </div>
      </div>
      ${this.generateActionButtons(ticket)}
    `;
  }

  /**
   * Generate basic information section
   * @param ticket - Ticket data
   * @returns Basic info HTML string
   */
  private static generateBasicInfo(ticket: TicketData): string {
    return `
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
          <i data-lucide="info" class="w-5 h-5 mr-2"></i>
          Informações Básicas
        </h3>
        <div class="space-y-3">
          ${this.generateInfoRow('ID do Sistema', ticket.sysId)}
          ${this.generateInfoRow('Número', ticket.number)}
          ${this.generateInfoRow('Tabela', ticket.table)}
          ${this.generateInfoRow('Categoria', ticket.category)}
          ${this.generateInfoRow('Subcategoria', ticket.subcategory)}
          ${this.generateInfoRow('Criado em', ticket.createdOn)}
          ${this.generateInfoRow('Atualizado em', ticket.updatedOn)}
        </div>
      </div>
    `;
  }

  /**
   * Generate assignment information section
   * @param ticket - Ticket data
   * @returns Assignment info HTML string
   */
  private static generateAssignmentInfo(ticket: TicketData): string {
    return `
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
          <i data-lucide="users" class="w-5 h-5 mr-2"></i>
          Atribuições
        </h3>
        <div class="space-y-3">
          ${this.generateInfoRow('Atribuído para', ticket.assignedTo)}
          ${this.generateInfoRow('Grupo', ticket.assignmentGroup)}
          ${this.generateInfoRow('Solicitante', ticket.caller)}
        </div>
      </div>
    `;
  }

  /**
   * Generate priority and urgency information section
   * @param ticket - Ticket data
   * @returns Priority info HTML string
   */
  private static generatePriorityInfo(ticket: TicketData): string {
    const priorityLabel = this.getPriorityLabel(ticket.priority);
    const urgencyLabel = this.getUrgencyLabel(ticket.urgency);
    const impactLabel = this.getImpactLabel(ticket.impact);
    
    return `
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
          <i data-lucide="alert-triangle" class="w-5 h-5 mr-2"></i>
          Prioridade e Impacto
        </h3>
        <div class="space-y-3">
          ${this.generateInfoRow('Prioridade', priorityLabel)}
          ${this.generateInfoRow('Urgência', urgencyLabel)}
          ${this.generateInfoRow('Impacto', impactLabel)}
        </div>
      </div>
    `;
  }

  /**
   * Generate description section
   * @param ticket - Ticket data
   * @returns Description HTML string
   */
  private static generateDescription(ticket: TicketData): string {
    return `
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
          <i data-lucide="file-text" class="w-5 h-5 mr-2"></i>
          Descrição
        </h3>
        <div class="text-white max-h-40 overflow-y-auto text-sm bg-gray-800 p-3 rounded border">
          ${ticket.description.replace(/\n/g, '<br>')}
        </div>
      </div>
    `;
  }

  /**
   * Generate SLA information section
   * @param ticket - Ticket data
   * @returns SLA info HTML string
   */
  private static generateSLAInfo(ticket: TicketData): string {
    return `
      <div class="bg-gray-800/50 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center">
          <i data-lucide="timer" class="w-5 h-5 mr-2"></i>
          Informações SLA
        </h3>
        <div class="space-y-3">
          ${this.generateInfoRow('Vencimento SLA', ticket.slaDue || 'N/A')}
          ${this.generateInfoRow('Tempo de Negócio', ticket.businessStc || 'N/A')}
          ${this.generateInfoRow('Tempo de Resolução', ticket.resolveTime || 'N/A')}
        </div>
      </div>
    `;
  }

  /**
   * Generate action buttons section
   * @param ticket - Ticket data
   * @returns Action buttons HTML string
   */
  private static generateActionButtons(ticket: TicketData): string {
    return `
      <div class="border-t border-gray-600 p-6">
        <div class="flex justify-end gap-3">
          <button onclick="closeModal()" 
                  class="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors">
            Fechar
          </button>
          <button onclick="editTicket('${ticket.sysId}', '${ticket.table}')" 
                  class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Editar Ticket
          </button>
          <button onclick="addNote('${ticket.sysId}', '${ticket.table}')" 
                  class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
            Adicionar Nota
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Generate information row with label and value
   * @param label - Field label
   * @param value - Field value (already processed by controller)
   * @returns Info row HTML string
   */
  private static generateInfoRow(label: string, value: string): string {
    return `
      <div class="border-b border-gray-700 pb-2">
        <span class="text-gray-400 text-sm">${label}:</span>
        <div class="text-white">${value}</div>
      </div>
    `;
  }

  /**
   * Generate JavaScript for modal functionality
   * @returns Script HTML string
   */
  private static generateScript(): string {
    return `
      <script>
        window.closeModal = function() {
          const modal = document.getElementById('ticketModal');
          if (modal) modal.remove();
        };
        
        window.editTicket = function(sysId, table) {
          console.log('Editando ticket:', sysId, table);
          // TODO: Implementar edicao de ticket
          alert('Funcionalidade de edicao em desenvolvimento');
        };
        
        window.addNote = function(sysId, table) {
          const note = prompt('Digite a nota para o ticket:');
          if (note) {
            console.log('Adicionando nota ao ticket:', sysId, table, note);
            // TODO: Implementar adicao de nota
            alert('Funcionalidade de nota em desenvolvimento');
          }
        };
        
        // Close modal on Escape key
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') closeModal();
        });
        
        // Initialize Lucide icons if available
        if (typeof lucide !== 'undefined') {
          setTimeout(() => lucide.createIcons(), 100);
        }
      </script>
    `;
  }

  /**
   * Generate error modal HTML
   * @param message - Error message to display
   * @returns Error modal HTML string
   */
  static generateErrorModal(message: string): string {
    return `
      <div id="ticketModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-gray-900 rounded-xl border border-gray-600 p-8 max-w-md w-full">
          <div class="text-center">
            <h3 class="text-lg font-medium text-red-400 mb-2">Erro</h3>
            <p class="text-gray-300 mb-4">${message}</p>
            <button onclick="closeModal()" class="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg">Fechar</button>
          </div>
        </div>
        <script>
          window.closeModal = function() {
            const modal = document.getElementById('ticketModal');
            if (modal) modal.remove();
          };
        </script>
      </div>
    `;
  }

  /**
   * Generate not found modal HTML
   * @returns Not found modal HTML string
   */
  static generateNotFoundModal(): string {
    return this.generateErrorModal('Ticket não encontrado');
  }

  /**
   * Get priority label
   */
  private static getPriorityLabel(priority: string): string {
    const priorityLabels: Record<string, string> = {
      '1': 'Crítica',
      '2': 'Alta',
      '3': 'Média',
      '4': 'Baixa',
      '5': 'Planejamento'
    };
    return priorityLabels[priority] || 'Desconhecida';
  }

  /**
   * Get urgency label
   */
  private static getUrgencyLabel(urgency: string): string {
    const urgencyLabels: Record<string, string> = {
      '1': 'Alta',
      '2': 'Média',
      '3': 'Baixa'
    };
    return urgencyLabels[urgency] || 'Desconhecida';
  }

  /**
   * Get impact label
   */
  private static getImpactLabel(impact: string): string {
    const impactLabels: Record<string, string> = {
      '1': 'Alto',
      '2': 'Médio',
      '3': 'Baixo'
    };
    return impactLabels[impact] || 'Desconhecido';
  }
}