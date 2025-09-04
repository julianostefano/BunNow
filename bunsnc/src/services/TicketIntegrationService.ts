/**
 * Ticket Integration Service - ServiceNow to MongoDB
 * Integrates ServiceNow API with specialized MongoDB collections
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ticketCollectionService } from './TicketCollectionService';
import { ServiceNowClient } from '../client/ServiceNowClient';

export class TicketIntegrationService {
  private serviceNowClient: ServiceNowClient;
  
  constructor(serviceNowClient: ServiceNowClient) {
    this.serviceNowClient = serviceNowClient;
  }

  async syncCurrentMonthTickets(): Promise<{ success: boolean; stats: any }> {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // 2025-09
      const startDate = `${currentMonth}-01`;
      const endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
      
      console.log(`🔄 Starting sync for tickets from ${startDate} to ${endDate}`);
      
      const stats = {
        incidents: { synced: 0, errors: 0 },
        change_tasks: { synced: 0, errors: 0 },
        sc_tasks: { synced: 0, errors: 0 },
        groups: { synced: 0, errors: 0 }
      };

      // Sync incidents
      await this.syncTicketsOfType('incident', startDate, endDate, stats.incidents);
      
      // Sync change tasks
      await this.syncTicketsOfType('change_task', startDate, endDate, stats.change_tasks);
      
      // Sync service catalog tasks
      await this.syncTicketsOfType('sc_task', startDate, endDate, stats.sc_tasks);
      
      // Sync groups
      await this.syncGroups(stats.groups);
      
      console.log(`✅ Sync completed:`, stats);
      
      return { success: true, stats };
      
    } catch (error) {
      console.error('❌ Error during ticket sync:', error);
      return { success: false, stats: null };
    }
  }

  private async syncTicketsOfType(
    ticketType: 'incident' | 'change_task' | 'sc_task', 
    startDate: string, 
    endDate: string, 
    stats: { synced: number; errors: number }
  ): Promise<void> {
    try {
      const tableName = ticketType === 'change_task' ? 'change_task' : 
                       ticketType === 'sc_task' ? 'sc_task' : 'incident';
      
      console.log(`🔍 Syncing ${ticketType} from ${tableName}`);
      
      const tickets = await this.serviceNowClient.query({
        table: tableName,
        query: `sys_created_onBETWEEN${startDate}@00:00:00@${endDate}@23:59:59`,
        limit: 1000
      });

      for (const ticket of tickets) {
        try {
          // Get SLM data for this ticket
          const slms = await ticketCollectionService.getTicketSLMs(ticket.number, ticketType);
          
          // Upsert based on ticket type
          let success = false;
          switch (ticketType) {
            case 'incident':
              success = await ticketCollectionService.upsertIncident(ticket, slms);
              break;
            case 'change_task':
              success = await ticketCollectionService.upsertChangeTask(ticket, slms);
              break;
            case 'sc_task':
              success = await ticketCollectionService.upsertSCTask(ticket, slms);
              break;
          }
          
          if (success) {
            stats.synced++;
          } else {
            stats.errors++;
          }
          
        } catch (error) {
          console.error(`❌ Error syncing ${ticketType} ${ticket.number}:`, error);
          stats.errors++;
        }
      }
      
      console.log(`✅ ${ticketType} sync completed: ${stats.synced} synced, ${stats.errors} errors`);
      
    } catch (error) {
      console.error(`❌ Error syncing ${ticketType} tickets:`, error);
      throw error;
    }
  }

  private async syncGroups(stats: { synced: number; errors: number }): Promise<void> {
    try {
      console.log('🔍 Syncing groups');
      
      const groups = await this.serviceNowClient.query({
        table: 'sys_user_group',
        query: 'active=true',
        limit: 500
      });

      for (const group of groups) {
        try {
          const success = await ticketCollectionService.upsertGroup(group);
          if (success) {
            stats.synced++;
          } else {
            stats.errors++;
          }
        } catch (error) {
          console.error(`❌ Error syncing group ${group.name}:`, error);
          stats.errors++;
        }
      }
      
      console.log(`✅ Groups sync completed: ${stats.synced} synced, ${stats.errors} errors`);
      
    } catch (error) {
      console.error(`❌ Error syncing groups:`, error);
      throw error;
    }
  }

  // Get tickets from MongoDB collections
  async getTicketsFromMongoDB(
    ticketType: 'incident' | 'change_task' | 'sc_task',
    filter: any = {},
    limit: number = 50
  ): Promise<any[]> {
    return await ticketCollectionService.getTickets(ticketType, filter, limit);
  }

  // Get ticket count from MongoDB
  async getTicketCountFromMongoDB(
    ticketType: 'incident' | 'change_task' | 'sc_task',
    filter: any = {}
  ): Promise<number> {
    return await ticketCollectionService.getTicketCount(ticketType, filter);
  }

  // Get collection statistics
  async getCollectionStats(): Promise<any> {
    return await ticketCollectionService.getCollectionStats();
  }

  // Get target groups
  async getTargetGroups(): Promise<string[]> {
    return await ticketCollectionService.getTargetGroups();
  }
}