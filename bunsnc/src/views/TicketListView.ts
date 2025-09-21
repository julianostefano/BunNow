/**
 * Ticket List View - Template generation following Development Guidelines
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following guidelines:
 * - Extract HTML generation to separate functions
 * - Simple template patterns
 * - Avoid complex template literals
 */

export class TicketListView {
  /**
   * Generate ticket cards HTML
   */
  static generateTicketCards(tickets: any[]): string {
    if (!tickets || tickets.length === 0) {
      return this.generateEmptyState();
    }

    const cards = tickets
      .map((ticket) => this.generateSingleCard(ticket))
      .join("");

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${cards}
      </div>
    `;
  }

  /**
   * Generate single ticket card
   */
  static generateSingleCard(ticket: any): string {
    const number = ticket.number || "N/A";
    const shortDescription = ticket.short_description || "Sem descricao";
    const state = ticket.state || "1";
    const priority = ticket.priority || "3";
    const assignedTo = ticket.assigned_to || "Nao atribuido";
    const sysId = ticket.sys_id || "";
    const table = ticket.sys_class_name || "incident";

    const stateClass = this.getStateClass(state);
    const priorityClass = this.getPriorityClass(priority);

    return `
      <div class="bg-gray-800 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors">
        <div class="flex justify-between items-start mb-3">
          <h3 class="text-sm font-medium text-white">${number}</h3>
          <span class="px-2 py-1 rounded text-xs ${stateClass}">
            ${this.getStateLabel(state)}
          </span>
        </div>
        
        <p class="text-gray-300 text-sm mb-3 line-clamp-2">
          ${shortDescription}
        </p>
        
        <div class="flex justify-between items-center">
          <span class="px-2 py-1 rounded text-xs ${priorityClass}">
            ${this.getPriorityLabel(priority)}
          </span>
          
          <button onclick="openTicketModal('${sysId}', '${table}')" 
                  class="text-blue-400 hover:text-blue-300 text-sm">
            Ver detalhes
          </button>
        </div>
        
        <div class="mt-2 text-xs text-gray-400">
          Responsavel: ${assignedTo}
        </div>
      </div>
    `;
  }

  /**
   * Generate empty state
   */
  static generateEmptyState(): string {
    return `
      <div class="text-center py-8 text-gray-400">
        <div class="w-16 h-16 mx-auto mb-4 opacity-50">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-16 h-16">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" 
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <p>Nenhum ticket encontrado</p>
      </div>
    `;
  }

  /**
   * Generate count badge
   */
  static generateCountBadge(count: number): string {
    return `
      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        ${count}
      </span>
    `;
  }

  /**
   * Generate error badge
   */
  static generateErrorBadge(): string {
    return `
      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        !
      </span>
    `;
  }

  /**
   * Generate error card
   */
  static generateErrorCard(message: string): string {
    return `
      <div class="bg-red-900/20 border border-red-700 rounded-lg p-4 text-center">
        <div class="text-red-400 mb-2">
          <svg class="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
        </div>
        <p class="text-red-300">${message}</p>
        <button onclick="location.reload()" class="mt-2 px-3 py-1 bg-red-700 text-white rounded text-sm hover:bg-red-600">
          Tentar novamente
        </button>
      </div>
    `;
  }

  /**
   * Get state CSS class
   */
  private static getStateClass(state: string): string {
    const stateClasses: Record<string, string> = {
      "1": "bg-blue-100 text-blue-800",
      "2": "bg-yellow-100 text-yellow-800",
      "3": "bg-green-100 text-green-800",
      "6": "bg-gray-100 text-gray-800",
      "7": "bg-red-100 text-red-800",
    };

    return stateClasses[state] || "bg-gray-100 text-gray-800";
  }

  /**
   * Get priority CSS class
   */
  private static getPriorityClass(priority: string): string {
    const priorityClasses: Record<string, string> = {
      "1": "bg-red-100 text-red-800",
      "2": "bg-orange-100 text-orange-800",
      "3": "bg-yellow-100 text-yellow-800",
      "4": "bg-green-100 text-green-800",
      "5": "bg-blue-100 text-blue-800",
    };

    return priorityClasses[priority] || "bg-gray-100 text-gray-800";
  }

  /**
   * Get state label
   */
  private static getStateLabel(state: string): string {
    const stateLabels: Record<string, string> = {
      "1": "Novo",
      "2": "Em Progresso",
      "3": "Resolvido",
      "6": "Fechado",
      "7": "Cancelado",
    };

    return stateLabels[state] || "Desconhecido";
  }

  /**
   * Get priority label
   */
  private static getPriorityLabel(priority: string): string {
    const priorityLabels: Record<string, string> = {
      "1": "Critica",
      "2": "Alta",
      "3": "Media",
      "4": "Baixa",
      "5": "Planejamento",
    };

    return priorityLabels[priority] || "Desconhecida";
  }
}
