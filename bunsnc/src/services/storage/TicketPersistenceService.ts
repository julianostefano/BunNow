/**
 * Ticket Persistence Service - Handles CRUD operations and SLA processing
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketStorageCore, BaseTicketDocument, TicketDocument, IncidentDocument, ChangeTaskDocument, SCTaskDocument } from './TicketStorageCore';
import type { SLMRecord, TicketSLASummary } from '../../types/servicenow';

export class TicketPersistenceService extends TicketStorageCore {

  /**
   * Advanced upsert with change tracking and validation
   */
  async upsertTicket(ticketData: any, ticketType: 'incident' | 'change_task' | 'sc_task', slmData: SLMRecord[] = []): Promise<boolean> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      // Normalize and enrich the ticket data
      const normalizedTicket = this.normalizeTicketData(ticketData, ticketType);

      // Add SLM data following Python reference pattern
      normalizedTicket.slms = slmData;

      // Generate SLA summary from SLM data
      if (slmData.length > 0) {
        normalizedTicket.sla_summary = this.generateSLASummary(ticketData.number, slmData);
      }

      // Calculate hash for change detection (including ticket + SLM data)
      const currentHash = this.calculateDataHash(normalizedTicket);
      const currentSlmsHash = this.calculateSLMHash(slmData);

      // Check for existing ticket
      const existingTicket = await this.ticketsCollection.findOne({ sys_id: ticketData.sys_id });

      if (existingTicket) {
        // Skip if no changes detected in either ticket or SLM data
        if (existingTicket._hash === currentHash && existingTicket._slmsHash === currentSlmsHash) {
          return true; // No changes, skip update
        }

        // Track changes for audit
        await this.recordAuditTrail(existingTicket, normalizedTicket);

        // Update with incremented version
        normalizedTicket._version = (existingTicket._version || 1) + 1;
      }

      normalizedTicket._hash = currentHash;
      normalizedTicket._slmsHash = currentSlmsHash;

      // Perform upsert
      const result = await this.ticketsCollection.replaceOne(
        { sys_id: ticketData.sys_id },
        normalizedTicket,
        { upsert: true }
      );

      return result.acknowledged;

    } catch (error) {
      console.error(`❌ Error upserting ${ticketType} ticket ${ticketData.sys_id}:`, error);
      return false;
    }
  }

  /**
   * Upsert ticket with SLMs - Enhanced version following Python reference pattern
   */
  async upsertTicketWithSLMs(ticketData: any, ticketType: 'incident' | 'change_task' | 'sc_task', slmData: SLMRecord[]): Promise<boolean> {
    return this.upsertTicket(ticketData, ticketType, slmData);
  }

  /**
   * Normalize ticket data according to type
   */
  private normalizeTicketData(ticketData: any, ticketType: 'incident' | 'change_task' | 'sc_task'): TicketDocument {
    const baseTicket: BaseTicketDocument = {
      sys_id: ticketData.sys_id,
      number: ticketData.number,
      ticketType,
      short_description: ticketData.short_description || '',
      description: ticketData.description || null,
      state: parseInt(ticketData.state) || 1,
      priority: ticketData.priority ? parseInt(ticketData.priority) : null,
      assignment_group: ticketData.assignment_group || '',
      assigned_to: ticketData.assigned_to || null,
      caller_id: ticketData.caller_id || null,
      opened_at: ticketData.opened_at ? new Date(ticketData.opened_at) : null,
      closed_at: ticketData.closed_at ? new Date(ticketData.closed_at) : null,
      resolved_at: ticketData.resolved_at ? new Date(ticketData.resolved_at) : null,
      sys_created_on: new Date(ticketData.sys_created_on),
      sys_updated_on: new Date(ticketData.sys_updated_on),
      sys_created_by: ticketData.sys_created_by || null,
      sys_updated_by: ticketData.sys_updated_by || null,
      active: ticketData.active !== 'false' && ticketData.active !== false,
      category: ticketData.category || null,
      subcategory: ticketData.subcategory || null,
      slms: [],
      _syncedAt: new Date(),
      _version: 1,
      _source: 'servicenow'
    };

    // Type-specific field handling
    switch (ticketType) {
      case 'incident':
        return {
          ...baseTicket,
          ticketType: 'incident',
          incident_state: ticketData.incident_state ? parseInt(ticketData.incident_state) : null,
          severity: ticketData.severity ? parseInt(ticketData.severity) : null,
          urgency: ticketData.urgency ? parseInt(ticketData.urgency) : null,
          impact: ticketData.impact ? parseInt(ticketData.impact) : null,
          problem_id: ticketData.problem_id || null,
          caused_by: ticketData.caused_by || null,
          close_code: ticketData.close_code || null,
          close_notes: ticketData.close_notes || null,
          resolution_code: ticketData.resolution_code || null,
          resolution_notes: ticketData.resolution_notes || null,
          cmdb_ci: ticketData.cmdb_ci || null,
          business_service: ticketData.business_service || null,
          location: ticketData.location || null,
          company: ticketData.company || null,
          contact_type: ticketData.contact_type || null,
          sla_due: ticketData.sla_due ? new Date(ticketData.sla_due) : null,
          business_duration: ticketData.business_duration ? parseInt(ticketData.business_duration) : null,
          calendar_duration: ticketData.calendar_duration ? parseInt(ticketData.calendar_duration) : null
        } as IncidentDocument;

      case 'change_task':
        return {
          ...baseTicket,
          ticketType: 'change_task',
          change_request: ticketData.change_request || '',
          change_task_type: ticketData.change_task_type || null,
          planned_start_date: ticketData.planned_start_date ? new Date(ticketData.planned_start_date) : null,
          planned_end_date: ticketData.planned_end_date ? new Date(ticketData.planned_end_date) : null,
          actual_start_date: ticketData.actual_start_date ? new Date(ticketData.actual_start_date) : null,
          actual_end_date: ticketData.actual_end_date ? new Date(ticketData.actual_end_date) : null,
          implementation_plan: ticketData.implementation_plan || null,
          test_plan: ticketData.test_plan || null,
          rollback_plan: ticketData.rollback_plan || null,
          risk_impact_analysis: ticketData.risk_impact_analysis || null,
          approval_history: ticketData.approval_history || null,
          approval_set: ticketData.approval_set || null,
          change_type: ticketData.change_type ? parseInt(ticketData.change_type) : null,
          risk: ticketData.risk ? parseInt(ticketData.risk) : null,
          cab_required: ticketData.cab_required === 'true' || ticketData.cab_required === true,
          cab_recommendation: ticketData.cab_recommendation || null
        } as ChangeTaskDocument;

      case 'sc_task':
        return {
          ...baseTicket,
          ticketType: 'sc_task',
          request: ticketData.request || '',
          request_item: ticketData.request_item || '',
          catalog_item: ticketData.catalog_item || null,
          requested_for: ticketData.requested_for || '',
          price: ticketData.price ? parseFloat(ticketData.price) : null,
          quantity: ticketData.quantity ? parseInt(ticketData.quantity) : null,
          delivery_plan: ticketData.delivery_plan || null,
          delivery_task: ticketData.delivery_task || null,
          order: ticketData.order ? parseInt(ticketData.order) : null,
          stage: ticketData.stage || null,
          variables: ticketData.variables || null,
          delivery_address: ticketData.delivery_address || null,
          special_instructions: ticketData.special_instructions || null
        } as SCTaskDocument;

      default:
        throw new Error(`Unsupported ticket type: ${ticketType}`);
    }
  }

  /**
   * Calculate hash for change detection
   */
  private calculateDataHash(data: any): string {
    // Simple hash calculation for change detection
    const str = JSON.stringify(data, Object.keys(data).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Calculate hash specifically for SLM data to detect changes
   */
  private calculateSLMHash(slmData: SLMRecord[]): string {
    if (!slmData || slmData.length === 0) return '';

    // Sort SLMs by sys_id for consistent hashing
    const sortedSLMs = [...slmData].sort((a, b) => a.sys_id.localeCompare(b.sys_id));
    return this.calculateDataHash(sortedSLMs);
  }

  /**
   * Generate SLA summary from SLM data following Python patterns
   */
  private generateSLASummary(ticketNumber: string, slmData: SLMRecord[]): TicketSLASummary {
    const breachedSLAs = slmData.filter(slm => this.parseBoolean(slm.taskslatable_has_breached));
    const activeSLAs = slmData.filter(slm => slm.taskslatable_stage && slm.taskslatable_stage !== 'completed');

    // Find the worst breached SLA (highest business percentage)
    const worstSLA = breachedSLAs
      .map(slm => ({
        sla_name: slm.taskslatable_sla || 'Unknown SLA',
        has_breached: true,
        business_percentage: this.parsePercentage(slm.taskslatable_business_percentage),
        start_time: slm.taskslatable_start_time,
        end_time: slm.taskslatable_end_time,
        stage: slm.taskslatable_stage || 'unknown',
        breach_time: slm.taskslatable_end_time
      }))
      .sort((a, b) => b.business_percentage - a.business_percentage)[0] || null;

    const allSLAs = slmData.map(slm => ({
      sla_name: slm.taskslatable_sla || 'Unknown SLA',
      has_breached: this.parseBoolean(slm.taskslatable_has_breached),
      business_percentage: this.parsePercentage(slm.taskslatable_business_percentage),
      start_time: slm.taskslatable_start_time,
      end_time: slm.taskslatable_end_time,
      stage: slm.taskslatable_stage || 'unknown',
      breach_time: this.parseBoolean(slm.taskslatable_has_breached) ? slm.taskslatable_end_time : undefined
    }));

    return {
      ticket_number: ticketNumber,
      total_slas: slmData.length,
      active_slas: activeSLAs.length,
      breached_slas: breachedSLAs.length,
      breach_percentage: slmData.length > 0 ? (breachedSLAs.length / slmData.length) * 100 : 0,
      worst_sla: worstSLA,
      all_slas: allSLAs
    };
  }

  /**
   * Helper methods for SLM data processing
   */
  private parseBoolean(value: string | boolean): boolean {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  }

  private parsePercentage(value: string | null): number {
    if (!value) return 0;
    const cleaned = value.replace('%', '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Record audit trail for ticket changes
   */
  private async recordAuditTrail(oldTicket: TicketDocument, newTicket: TicketDocument): Promise<void> {
    if (!this.db) return;

    try {
      const auditCollection = this.db.collection('ticket_audit');

      // Find changed fields
      const changes: any[] = [];

      for (const [key, newValue] of Object.entries(newTicket)) {
        if (key.startsWith('_')) continue; // Skip internal fields

        const oldValue = (oldTicket as any)[key];
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push({
            field: key,
            oldValue,
            newValue,
            type: this.getChangeType(oldValue, newValue)
          });
        }
      }

      if (changes.length > 0) {
        await auditCollection.insertOne({
          ticketId: newTicket.sys_id,
          ticketNumber: newTicket.number,
          ticketType: newTicket.ticketType,
          changes,
          changedAt: new Date(),
          syncVersion: newTicket._version,
          source: 'servicenow_sync'
        });
      }

    } catch (error) {
      console.error('❌ Error recording audit trail:', error);
      // Don't throw - audit failure shouldn't break sync
    }
  }

  private getChangeType(oldValue: any, newValue: any): string {
    if (oldValue === null || oldValue === undefined) return 'create';
    if (newValue === null || newValue === undefined) return 'delete';
    return 'update';
  }

  /**
   * Bulk upsert operation for improved performance
   */
  async bulkUpsertTickets(tickets: Array<{
    ticketData: any;
    ticketType: 'incident' | 'change_task' | 'sc_task';
    slmData?: SLMRecord[];
  }>): Promise<{ successful: number; failed: number }> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    let successful = 0;
    let failed = 0;

    // Process in batches of 100 for memory efficiency
    const batchSize = 100;
    for (let i = 0; i < tickets.length; i += batchSize) {
      const batch = tickets.slice(i, i + batchSize);

      const promises = batch.map(async ({ ticketData, ticketType, slmData = [] }) => {
        try {
          const result = await this.upsertTicket(ticketData, ticketType, slmData);
          return result;
        } catch (error) {
          console.error(`Bulk upsert failed for ticket ${ticketData.sys_id}:`, error);
          return false;
        }
      });

      const results = await Promise.all(promises);
      successful += results.filter(r => r).length;
      failed += results.filter(r => !r).length;
    }

    return { successful, failed };
  }

  /**
   * Delete ticket by sys_id
   */
  async deleteTicket(sysId: string): Promise<boolean> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      const result = await this.ticketsCollection.deleteOne({ sys_id: sysId });
      return result.deletedCount > 0;
    } catch (error) {
      console.error(`❌ Error deleting ticket ${sysId}:`, error);
      return false;
    }
  }

  /**
   * Get ticket by sys_id
   */
  async getTicketById(sysId: string): Promise<TicketDocument | null> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      return await this.ticketsCollection.findOne({ sys_id: sysId });
    } catch (error) {
      console.error(`❌ Error getting ticket ${sysId}:`, error);
      return null;
    }
  }

  /**
   * Ping database connection
   */
  async ping(): Promise<void> {
    await this.ensureConnected();
    if (!this.client) throw new Error('Client not initialized');

    await this.client.db('admin').command({ ping: 1 });
    console.log('🏓 MongoDB connection is healthy');
  }
}