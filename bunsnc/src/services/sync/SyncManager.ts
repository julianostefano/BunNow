/**
 * Sync Manager - Core synchronization logic
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from '../ServiceNowAuthClient';
import { EnhancedTicketStorageService } from '../EnhancedTicketStorageService';
import { ConflictResolver, ConflictData } from './ConflictResolver';
import { IncidentDocument, ChangeTaskDocument, SCTaskDocument } from '../../config/mongodb-collections';

export interface SyncResult {
  table: string;
  processed: number;
  updated: number;
  created: number;
  errors: number;
  conflicts: number;
  duration: number;
  lastSyncTime: string;
}

export interface SyncBatchOptions {
  batchSize: number;
  enableDeltaSync: boolean;
  deltaHours: number;
}

export class SyncManager {
  private mongoService: EnhancedTicketStorageService;
  private serviceNowService: ServiceNowAuthClient;
  private conflictResolver: ConflictResolver;

  constructor(
    mongoService: EnhancedTicketStorageService,
    serviceNowService: ServiceNowAuthClient,
    conflictResolver: ConflictResolver
  ) {
    this.mongoService = mongoService;
    this.serviceNowService = serviceNowService;
    this.conflictResolver = conflictResolver;
  }

  /**
   * Synchronize a specific table
   */
  async syncTable(table: string, options: SyncBatchOptions): Promise<SyncResult> {
    const startTime = Date.now();
    console.log(`📋 Syncing table: ${table}`);

    const result: SyncResult = {
      table,
      processed: 0,
      updated: 0,
      created: 0,
      errors: 0,
      conflicts: 0,
      duration: 0,
      lastSyncTime: new Date().toISOString()
    };

    try {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const batch = await this.getServiceNowBatch(table, offset, options);
        
        if (!batch || batch.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`📦 Processing batch: ${offset + 1}-${offset + batch.length} for ${table}`);

        for (const ticket of batch) {
          try {
            await this.syncTicket(ticket, table, result);
            result.processed++;
          } catch (error) {
            console.error(`❌ Error syncing ${table}/${ticket.sys_id}:`, error);
            result.errors++;
          }
        }

        offset += batch.length;
        hasMore = batch.length === options.batchSize;

        // Rate limiting delay
        await this.delay(500);
      }

    } catch (error) {
      console.error(`❌ Table sync failed for ${table}:`, error);
      result.errors++;
    }

    result.duration = Date.now() - startTime;
    console.log(`✅ Table sync completed for ${table}: ${result.processed} processed, ${result.updated} updated, ${result.created} created, ${result.errors} errors in ${result.duration}ms`);

    return result;
  }

  /**
   * Get batch of tickets from ServiceNow
   */
  private async getServiceNowBatch(
    table: string, 
    offset: number, 
    options: SyncBatchOptions
  ): Promise<any[]> {
    try {
      let query = '';
      
      if (options.enableDeltaSync) {
        const since = new Date(Date.now() - options.deltaHours * 60 * 60 * 1000).toISOString().split('.')[0];
        query = `sys_updated_on>=${since}`;
      } else {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('.')[0];
        query = `sys_updated_on>=${weekAgo}`;
      }
      
      const response = await this.serviceNowService.makeRequest(table, 'GET', {
        sysparm_query: query,
        sysparm_display_value: 'all',
        sysparm_exclude_reference_link: 'true',
        sysparm_limit: options.batchSize,
        sysparm_offset: offset
      });

      return response?.result || [];
    } catch (error) {
      console.error(`❌ Error fetching ${table} batch:`, error);
      return [];
    }
  }

  /**
   * Synchronize individual ticket
   */
  private async syncTicket(ticket: any, table: string, result: SyncResult): Promise<void> {
    try {
      // Check if ticket exists in MongoDB
      const existingDoc = await this.getExistingDocument(ticket.sys_id, table);
      
      if (!existingDoc) {
        // Create new document
        await this.createDocument(ticket, table);
        result.created++;
        console.log(`➕ Created ${table}/${ticket.sys_id}`);
      } else {
        // Check for conflicts
        const conflict = this.conflictResolver.checkForConflicts(
          existingDoc.data[table], 
          ticket, 
          table
        );
        
        if (conflict) {
          result.conflicts++;
          // Try to resolve automatically
          try {
            const resolution = this.conflictResolver.resolveConflict(conflict);
            await this.updateDocument(existingDoc, resolution.data, table);
            result.updated++;
          } catch (error) {
            console.log(`🔧 Manual resolution needed for ${table}/${ticket.sys_id}`);
          }
        } else {
          // Update existing document
          await this.updateDocument(existingDoc, ticket, table);
          result.updated++;
          console.log(`📝 Updated ${table}/${ticket.sys_id}`);
        }
      }

    } catch (error) {
      console.error(`❌ Error syncing ticket ${table}/${ticket.sys_id}:`, error);
      throw error;
    }
  }

  /**
   * Get existing document from MongoDB
   */
  private async getExistingDocument(sysId: string, table: string): Promise<any> {
    try {
      switch (table) {
        case 'incident':
          return await this.mongoService.findIncidentBySysId(sysId);
        case 'change_task':
          return await this.mongoService.findChangeTaskBySysId(sysId);
        case 'sc_task':
          return await this.mongoService.findSCTaskBySysId(sysId);
        default:
          return null;
      }
    } catch (error) {
      console.error(`❌ Error finding existing document ${table}/${sysId}:`, error);
      return null;
    }
  }

  /**
   * Create new document in MongoDB
   */
  private async createDocument(ticket: any, table: string): Promise<void> {
    const documentData = {
      sys_id: ticket.sys_id,
      number: ticket.number,
      data: {
        [table]: ticket,
        slms: [],
        sync_timestamp: new Date().toISOString(),
        collection_version: '2.0.0'
      },
      created_at: new Date(),
      updated_at: new Date(),
      sys_id_prefix: ticket.sys_id.substring(0, 8)
    };

    switch (table) {
      case 'incident':
        await this.mongoService.saveIncident(documentData as IncidentDocument);
        break;
      case 'change_task':
        await this.mongoService.saveChangeTask(documentData as ChangeTaskDocument);
        break;
      case 'sc_task':
        await this.mongoService.saveSCTask(documentData as SCTaskDocument);
        break;
    }
  }

  /**
   * Update existing document in MongoDB
   */
  private async updateDocument(existingDoc: any, ticket: any, table: string): Promise<void> {
    existingDoc.data[table] = ticket;
    existingDoc.data.sync_timestamp = new Date().toISOString();
    existingDoc.updated_at = new Date();

    switch (table) {
      case 'incident':
        await this.mongoService.saveIncident(existingDoc);
        break;
      case 'change_task':
        await this.mongoService.saveChangeTask(existingDoc);
        break;
      case 'sc_task':
        await this.mongoService.saveSCTask(existingDoc);
        break;
    }
  }

  /**
   * Force sync for specific ticket
   */
  async forceSyncTicket(sysId: string, table: string): Promise<boolean> {
    try {
      const response = await this.serviceNowService.makeRequestFullFields(
        table,
        `sys_id=${sysId}`,
        1
      );

      const tickets = response?.result;
      if (tickets && tickets.length > 0) {
        const result: SyncResult = {
          table,
          processed: 0,
          updated: 0,
          created: 0,
          errors: 0,
          conflicts: 0,
          duration: 0,
          lastSyncTime: new Date().toISOString()
        };

        await this.syncTicket(tickets[0], table, result);
        console.log(`🔄 Force sync completed for ${table}/${sysId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Force sync failed for ${table}/${sysId}:`, error);
      return false;
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}