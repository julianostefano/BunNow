/**
 * Enhanced Ticket Controller - Professional Modal with ConsolidatedDataService
 * Simple, clean implementation following dev guidelines
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ConsolidatedDataService } from '../services/ConsolidatedDataService';
import { ConsolidatedDataService } from '../services/ConsolidatedDataService';
import { ServiceNowAuthClient } from '../services/ServiceNowAuthClient';
import { ServiceNowStreams } from '../config/redis-streams';
import { EnhancedTicketModalView } from '../views/EnhancedTicketModalView';

export class EnhancedTicketController {
  private hybridDataService: ConsolidatedDataService;

  constructor(
    serviceNowAuthClient: ServiceNowAuthClient,
    mongoService: ConsolidatedDataService,
    redisStreams: ServiceNowStreams
  ) {
    this.hybridDataService = new ConsolidatedDataService(
      mongoService,
      serviceNowAuthClient,
      redisStreams
    );
  }

  /**
   * Get enhanced modal HTML with tabs and SLA data
   * Uses ConsolidatedDataService for transparent data access
   */
  async getEnhancedModal(sysId: string, table: string): Promise<string> {
    try {
      console.log(`🎯 Getting enhanced modal for ${table}/${sysId}`);

      // Get ticket data with SLMs and Notes using ConsolidatedDataService
      const ticketData = await this.hybridDataService.getTicketDetails(sysId, table, {
        includeSLMs: true,
        includeNotes: true
      });

      if (!ticketData) {
        return this.generateErrorModal(`Ticket ${table}/${sysId} não encontrado`);
      }

      // Generate enhanced modal with SLA tabs and Notes
      return EnhancedTicketModalView.generateModal({
        ticket: ticketData,
        slaData: ticketData.slms || [],
        notes: ticketData.notes || [],
        history: [],
        isRealTime: true
      });

    } catch (error) {
      console.error(` Error generating enhanced modal for ${table}/${sysId}:`, error);
      return this.generateErrorModal(`Erro ao carregar ticket: ${error.message}`);
    }
  }

  /**
   * Generate error modal
   */
  private generateErrorModal(message: string): string {
    return `
      <div id="ticketModal" class="fixed inset-0 z-50 overflow-y-auto bg-black/50">
        <div class="flex items-center justify-center min-h-screen p-4">
          <div class="relative w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg shadow-2xl">
            <div class="p-6 text-center">
              <svg class="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 18.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
              <h3 class="text-lg font-medium text-white mb-2">Erro</h3>
              <p class="text-gray-400 mb-6">${message}</p>
              <button onclick="window.closeModal()" 
                      class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}