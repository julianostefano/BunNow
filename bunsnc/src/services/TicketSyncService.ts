/**
 * Ticket Synchronization Service - ServiceNow to MongoDB
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketRepository } from '../repositories/TicketRepository';
import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { TicketSchema, IncidentSchema, ChangeTaskSchema, ServiceRequestTaskSchema } from '../schemas/TicketSchemas';

export interface SyncOptions {
  batchSize?: number;
  maxRetries?: number;
  syncInterval?: number;
  tables?: string[];
}

export interface SyncResult {
  table: string;
  processed: number;
  saved: number;
  updated: number;
  errors: number;
  duration: number;
  errorDetails: Array<{ sys_id: string; error: string }>;
}

export class TicketSyncService {
  private repository: TicketRepository;
  private serviceNowClient: ServiceNowAuthClient;
  private isRunning: boolean = false;
  private syncIntervalId: NodeJS.Timeout | null = null;

  constructor(repository: TicketRepository, serviceNowClient: ServiceNowAuthClient) {
    this.repository = repository;
    this.serviceNowClient = serviceNowClient;
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(options: SyncOptions = {}): void {
    if (this.isRunning) {
      console.warn('⚠️ Sync service already running');
      return;
    }

    const {
      syncInterval = 300000, // 5 minutes default
      tables = ['incident', 'change_task', 'sc_task']
    } = options;

    this.isRunning = true;
    console.log(`🔄 Starting auto-sync every ${syncInterval / 1000}s for tables: ${tables.join(', ')}`);

    // Initial sync
    this.syncAllTables(options);

    // Setup interval
    this.syncIntervalId = setInterval(() => {
      this.syncAllTables(options);
    }, syncInterval);
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    this.isRunning = false;
    console.log('🛑 Auto-sync stopped');
  }

  /**
   * Sync all tables
   */
  async syncAllTables(options: SyncOptions = {}): Promise<SyncResult[]> {
    const { tables = ['incident', 'change_task', 'sc_task'] } = options;
    const results: SyncResult[] = [];

    console.log('🔄 Starting full table synchronization...');

    for (const table of tables) {
      try {
        const result = await this.syncTable(table, options);
        results.push(result);
        
        console.log(`✅ Sync completed for ${table}: ${result.saved} saved, ${result.updated} updated, ${result.errors} errors`);
      } catch (error) {
        console.error(`❌ Sync failed for ${table}:`, error);
        results.push({
          table,
          processed: 0,
          saved: 0,
          updated: 0,
          errors: 1,
          duration: 0,
          errorDetails: [{ sys_id: 'N/A', error: String(error) }]
        });
      }
    }

    return results;
  }

  /**
   * Sync specific table
   */
  async syncTable(table: string, options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const { batchSize = 100, maxRetries = 3 } = options;

    console.log(`🎯 Starting sync for table: ${table}`);

    const result: SyncResult = {
      table,
      processed: 0,
      saved: 0,
      updated: 0,
      errors: 0,
      duration: 0,
      errorDetails: []
    };

    try {
      // Get updated records from ServiceNow
      const query = this.buildSyncQuery(table);
      const response = await this.serviceNowClient.makeRequestFullFields(table, query, 0);

      if (!response?.result || !Array.isArray(response.result)) {
        throw new Error('Invalid ServiceNow response');
      }

      const tickets = response.result;
      result.processed = tickets.length;

      // Process in batches
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize);
        
        for (const rawTicket of batch) {
          let retries = 0;
          let success = false;

          while (retries < maxRetries && !success) {
            try {
              const ticket = this.transformTicket(rawTicket, table);
              const existingTicket = await this.repository.getTicket(ticket.sys_id, table);

              if (existingTicket) {
                if (this.shouldUpdate(existingTicket, ticket)) {
                  await this.repository.updateTicket(ticket.sys_id, table, ticket, 'sync');
                  result.updated++;
                }
              } else {
                await this.repository.saveTicket(ticket);
                result.saved++;
              }

              success = true;
            } catch (error) {
              retries++;
              if (retries >= maxRetries) {
                result.errors++;
                result.errorDetails.push({
                  sys_id: rawTicket.sys_id?.value || 'unknown',
                  error: String(error)
                });
                console.error(`❌ Failed to sync ticket ${rawTicket.sys_id?.value}:`, error);
              }
            }
          }
        }

        // Progress logging
        if (i % (batchSize * 10) === 0) {
          console.log(`📊 Processed ${i}/${tickets.length} tickets for ${table}`);
        }
      }

    } catch (error) {
      console.error(`❌ Table sync failed for ${table}:`, error);
      result.errors++;
      result.errorDetails.push({ sys_id: 'N/A', error: String(error) });
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Sync specific ticket by sys_id
   */
  async syncTicket(sysId: string, table: string): Promise<boolean> {
    try {
      console.log(`🎯 Syncing individual ticket: ${table}/${sysId}`);

      const response = await this.serviceNowClient.makeRequestFullFields(table, `sys_id=${sysId}`, 1);
      
      if (!response?.result?.[0]) {
        console.warn(`⚠️ Ticket not found in ServiceNow: ${table}/${sysId}`);
        return false;
      }

      const ticket = this.transformTicket(response.result[0], table);
      const existingTicket = await this.repository.getTicket(sysId, table);

      if (existingTicket) {
        if (this.shouldUpdate(existingTicket, ticket)) {
          await this.repository.updateTicket(sysId, table, ticket, 'sync');
          console.log(`✏️ Updated ticket: ${table}/${sysId}`);
        } else {
          console.log(`ℹ️ No changes for ticket: ${table}/${sysId}`);
        }
      } else {
        await this.repository.saveTicket(ticket);
        console.log(`💾 Saved new ticket: ${table}/${sysId}`);
      }

      return true;
    } catch (error) {
      console.error(`❌ Failed to sync ticket ${table}/${sysId}:`, error);
      await this.repository.markSyncStatus(sysId, table, 'error', String(error));
      return false;
    }
  }

  /**
   * Build ServiceNow query for sync
   */
  private buildSyncQuery(table: string): string {
    // Get records updated in the last hour by default
    const lastHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // Active states only (not closed/canceled)
    const activeStates = {
      incident: ['1', '2', '3', '6'], // New, In Progress, On Hold, Resolved
      change_task: ['-5', '1', '2', '3'], // Pending, Open, Work in Progress, Closed Complete
      sc_task: ['1', '2', '3'] // Pending, Open, Work in Progress
    };

    const states = activeStates[table as keyof typeof activeStates] || [];
    const stateQuery = states.map(state => `state=${state}`).join('^OR');
    
    return `sys_updated_on>=${lastHour}^${stateQuery}`;
  }

  /**
   * Transform ServiceNow ticket to our schema
   */
  private transformTicket(rawTicket: any, table: string): TicketSchema {
    const baseTicket = {
      sys_id: this.extractValue(rawTicket.sys_id),
      number: this.extractValue(rawTicket.number),
      table,
      state: this.extractValue(rawTicket.state),
      short_description: this.extractValue(rawTicket.short_description),
      description: this.extractValue(rawTicket.description),
      priority: this.extractValue(rawTicket.priority),
      category: this.extractValue(rawTicket.category),
      subcategory: this.extractValue(rawTicket.subcategory),
      assignment_group: this.extractValue(rawTicket.assignment_group),
      assigned_to: this.extractValue(rawTicket.assigned_to),
      caller_id: this.extractValue(rawTicket.caller_id),
      opened_at: this.parseDate(rawTicket.opened_at),
      sys_created_on: this.parseDate(rawTicket.sys_created_on),
      sys_updated_on: this.parseDate(rawTicket.sys_updated_on),
      resolved_at: this.parseDate(rawTicket.resolved_at),
      closed_at: this.parseDate(rawTicket.closed_at),
      resolution_code: this.extractValue(rawTicket.resolution_code),
      close_code: this.extractValue(rawTicket.close_code),
      work_notes: this.extractValue(rawTicket.work_notes),
      comments: this.extractValue(rawTicket.comments),
      location: this.extractValue(rawTicket.location),
      company: this.extractValue(rawTicket.company),
      business_service: this.extractValue(rawTicket.business_service),
      configuration_item: this.extractValue(rawTicket.configuration_item),
      impact: this.extractValue(rawTicket.impact),
      urgency: this.extractValue(rawTicket.urgency),
      correlation_id: this.extractValue(rawTicket.correlation_id),
      correlation_display: this.extractValue(rawTicket.correlation_display),
      last_synced: new Date(),
      sync_status: 'synced' as const
    };

    // Add table-specific fields
    switch (table) {
      case 'incident':
        return {
          ...baseTicket,
          table: 'incident',
          problem_id: this.extractValue(rawTicket.problem_id),
          rfc: this.extractValue(rawTicket.rfc),
          caused_by: this.extractValue(rawTicket.caused_by),
          u_root_cause: this.extractValue(rawTicket.u_root_cause),
          u_workaround: this.extractValue(rawTicket.u_workaround)
        } as IncidentSchema;

      case 'change_task':
        return {
          ...baseTicket,
          table: 'change_task',
          change_request: this.extractValue(rawTicket.change_request),
          change_request_number: this.extractValue(rawTicket.change_request_number),
          task_type: this.extractValue(rawTicket.task_type),
          planned_start_date: this.parseDate(rawTicket.planned_start_date),
          planned_end_date: this.parseDate(rawTicket.planned_end_date),
          actual_start_date: this.parseDate(rawTicket.actual_start_date),
          actual_end_date: this.parseDate(rawTicket.actual_end_date),
          implementation_plan: this.extractValue(rawTicket.implementation_plan),
          test_plan: this.extractValue(rawTicket.test_plan),
          backout_plan: this.extractValue(rawTicket.backout_plan)
        } as ChangeTaskSchema;

      case 'sc_task':
        return {
          ...baseTicket,
          table: 'sc_task',
          request: this.extractValue(rawTicket.request),
          request_number: this.extractValue(rawTicket.request_number),
          catalog_item: this.extractValue(rawTicket.catalog_item),
          requested_for: this.extractValue(rawTicket.requested_for),
          delivery_plan: this.extractValue(rawTicket.delivery_plan),
          delivery_task: this.extractValue(rawTicket.delivery_task)
        } as ServiceRequestTaskSchema;

      default:
        throw new Error(`Unsupported table type: ${table}`);
    }
  }

  /**
   * Check if ticket should be updated
   */
  private shouldUpdate(existingTicket: TicketSchema, newTicket: TicketSchema): boolean {
    const existingUpdated = existingTicket.sys_updated_on;
    const newUpdated = newTicket.sys_updated_on;
    
    // Update if ServiceNow has newer data
    return newUpdated > existingUpdated;
  }

  /**
   * Extract value from ServiceNow field
   */
  private extractValue(field: any): string {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (typeof field === 'object' && field.display_value !== undefined) 
      return String(field.display_value);
    if (typeof field === 'object' && field.value !== undefined) 
      return String(field.value);
    return String(field);
  }

  /**
   * Parse date from ServiceNow format
   */
  private parseDate(dateField: any): Date {
    if (!dateField) return new Date();
    
    const dateStr = this.extractValue(dateField);
    if (!dateStr) return new Date();
    
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? new Date() : date;
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(): Promise<any> {
    const repoStats = await this.repository.getStats();
    
    return {
      isRunning: this.isRunning,
      repository: repoStats,
      lastSync: new Date().toISOString()
    };
  }
}