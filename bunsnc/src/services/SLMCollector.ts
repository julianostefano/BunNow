/**
 * SLM Collector - Specialized service for collecting SLA/SLM data
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './ServiceNowAuthClient';

export interface SLMData {
  sys_id: string;
  task_number: string;
  task_sys_id: string;
  sla_name: string;
  stage: string;
  state: string;
  active: boolean;
  has_breached: boolean;
  breach_time?: string;
  business_percentage: number;
  business_time_left: string;
  business_duration: string;
  calendar_duration?: string;
  schedule: string;
  start_time: string;
  end_time?: string;
  planned_end_time: string;
  original_breach_time?: string;
  sys_created_on: string;
  sys_updated_on: string;
  raw_data: any;
}

export class SLMCollector {
  private serviceNowClient: ServiceNowAuthClient;
  private cache: Map<string, { data: SLMData[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor(serviceNowClient: ServiceNowAuthClient) {
    this.serviceNowClient = serviceNowClient;
  }

  /**
   * Collect all SLMs for a specific ticket
   */
  async collectSLMsForTicket(sysId: string, ticketNumber?: string): Promise<SLMData[]> {
    try {
      // Check cache first
      const cached = this.cache.get(sysId);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        return cached.data;
      }

      console.log(`🔍 Collecting SLMs for ticket ${sysId}...`);

      // Query task_sla table
      const response = await this.serviceNowClient.makeRequestFullFields(
        'task_sla',
        `task=${sysId}`,
        100
      );

      const rawSLMs = response?.result || [];
      const processedSLMs = rawSLMs.map(sla => this.processSLMRecord(sla));

      // Cache the results
      this.cache.set(sysId, {
        data: processedSLMs,
        timestamp: Date.now()
      });

      console.log(`📊 Found ${processedSLMs.length} SLMs for ticket ${sysId}`);
      return processedSLMs;

    } catch (error) {
      console.error(`❌ Error collecting SLMs for ticket ${sysId}:`, error);
      return [];
    }
  }

  /**
   * Collect SLMs for multiple tickets in batch
   */
  async collectSLMsForTickets(ticketIds: string[]): Promise<Record<string, SLMData[]>> {
    const results: Record<string, SLMData[]> = {};
    
    // Process in batches of 10 to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < ticketIds.length; i += batchSize) {
      const batch = ticketIds.slice(i, i + batchSize);
      
      const promises = batch.map(async (sysId) => {
        const slms = await this.collectSLMsForTicket(sysId);
        return { sysId, slms };
      });

      const batchResults = await Promise.allSettled(promises);
      
      batchResults.forEach((result, index) => {
        const sysId = batch[index];
        if (result.status === 'fulfilled') {
          results[sysId] = result.value.slms;
        } else {
          console.error(`❌ Failed to collect SLMs for ${sysId}:`, result.reason);
          results[sysId] = [];
        }
      });

      // Small delay between batches to be respectful to the API
      if (i + batchSize < ticketIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Process raw SLM record from ServiceNow
   */
  private processSLMRecord(rawSLA: any): SLMData {
    return {
      sys_id: this.extractValue(rawSLA.sys_id),
      task_number: this.extractValue(rawSLA.task?.number || rawSLA.task),
      task_sys_id: this.extractValue(rawSLA.task?.sys_id || rawSLA.task),
      sla_name: this.extractValue(rawSLA.sla?.name || rawSLA.sla),
      stage: this.extractValue(rawSLA.stage),
      state: this.extractValue(rawSLA.state),
      active: this.parseBoolean(rawSLA.active),
      has_breached: this.parseBoolean(rawSLA.has_breached),
      breach_time: this.extractValue(rawSLA.breach_time),
      business_percentage: this.parsePercentage(rawSLA.business_percentage),
      business_time_left: this.extractValue(rawSLA.business_time_left),
      business_duration: this.extractValue(rawSLA.business_duration),
      calendar_duration: this.extractValue(rawSLA.calendar_duration),
      schedule: this.extractValue(rawSLA.schedule?.name || rawSLA.schedule),
      start_time: this.extractValue(rawSLA.start_time),
      end_time: this.extractValue(rawSLA.end_time),
      planned_end_time: this.extractValue(rawSLA.planned_end_time),
      original_breach_time: this.extractValue(rawSLA.original_breach_time),
      sys_created_on: this.extractValue(rawSLA.sys_created_on),
      sys_updated_on: this.extractValue(rawSLA.sys_updated_on),
      raw_data: rawSLA
    };
  }

  /**
   * Get SLA summary statistics for a ticket
   */
  async getSLASummary(sysId: string): Promise<{
    total_slas: number;
    active_slas: number;
    breached_slas: number;
    breach_percentage: number;
    worst_sla?: SLMData;
  }> {
    const slms = await this.collectSLMsForTicket(sysId);
    
    const activeSLAs = slms.filter(sla => sla.active);
    const breachedSLAs = slms.filter(sla => sla.has_breached);
    
    let worstSLA: SLMData | undefined;
    if (slms.length > 0) {
      worstSLA = slms.reduce((worst, current) => 
        current.business_percentage > worst.business_percentage ? current : worst
      );
    }

    return {
      total_slas: slms.length,
      active_slas: activeSLAs.length,
      breached_slas: breachedSLAs.length,
      breach_percentage: slms.length > 0 ? (breachedSLAs.length / slms.length) * 100 : 0,
      worst_sla: worstSLA
    };
  }

  /**
   * Get SLAs that are close to breach (> 80%)
   */
  async getSLAsAtRisk(sysId: string, threshold: number = 80): Promise<SLMData[]> {
    const slms = await this.collectSLMsForTicket(sysId);
    
    return slms.filter(sla => 
      sla.active && 
      !sla.has_breached && 
      sla.business_percentage > threshold
    );
  }

  /**
   * Get all breached SLAs
   */
  async getBreachedSLAs(sysId: string): Promise<SLMData[]> {
    const slms = await this.collectSLMsForTicket(sysId);
    return slms.filter(sla => sla.has_breached);
  }

  /**
   * Clear cache for a specific ticket or all cache
   */
  clearCache(sysId?: string): void {
    if (sysId) {
      this.cache.delete(sysId);
      console.log(`🗑️ Cleared SLM cache for ticket ${sysId}`);
    } else {
      this.cache.clear();
      console.log('🗑️ Cleared all SLM cache');
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Collect SLMs for tickets updated in the last N hours
   */
  async collectRecentSLMs(hoursBack: number = 2): Promise<Record<string, SLMData[]>> {
    try {
      const timeAgo = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString().split('.')[0];
      
      console.log(`🔄 Collecting SLMs for tickets updated since ${timeAgo}...`);
      
      // Query task_sla table for recent updates
      const response = await this.serviceNowClient.makeRequestFullFields(
        'task_sla',
        `sys_updated_on>=${timeAgo}^ORDERBYsys_updated_on`,
        200
      );

      const recentSLAs = response?.result || [];
      console.log(`📊 Found ${recentSLAs.length} recently updated SLAs`);

      // Group by task sys_id
      const groupedByTask: Record<string, any[]> = {};
      recentSLAs.forEach(sla => {
        const taskSysId = this.extractValue(sla.task);
        if (!groupedByTask[taskSysId]) {
          groupedByTask[taskSysId] = [];
        }
        groupedByTask[taskSysId].push(sla);
      });

      // Process each group
      const results: Record<string, SLMData[]> = {};
      for (const [taskSysId, slas] of Object.entries(groupedByTask)) {
        results[taskSysId] = slas.map(sla => this.processSLMRecord(sla));
        
        // Update cache
        this.cache.set(taskSysId, {
          data: results[taskSysId],
          timestamp: Date.now()
        });
      }

      console.log(`✅ Processed SLMs for ${Object.keys(results).length} tickets`);
      return results;

    } catch (error) {
      console.error('❌ Error collecting recent SLMs:', error);
      return {};
    }
  }

  /**
   * Helper methods for data extraction and parsing
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

  private parseBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return false;
  }

  private parsePercentage(value: any): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    
    const stringValue = String(value).replace('%', '').trim();
    const parsed = parseFloat(stringValue);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Export all SLM data for a ticket in JSON format
   */
  async exportSLMsAsJSON(sysId: string): Promise<any> {
    const slms = await this.collectSLMsForTicket(sysId);
    const summary = await this.getSLASummary(sysId);
    
    return {
      ticket_sys_id: sysId,
      collection_timestamp: new Date().toISOString(),
      summary: summary,
      slm_records: slms,
      metadata: {
        total_slms: slms.length,
        source: 'SLMCollector',
        version: '1.0.0'
      }
    };
  }

  /**
   * Monitor SLAs and return alerts
   */
  async monitorSLAs(sysIds: string[]): Promise<{
    breaches: Array<{ sysId: string; sla: SLMData }>;
    warnings: Array<{ sysId: string; sla: SLMData }>;
    summary: { total_tickets: number; total_breaches: number; total_warnings: number };
  }> {
    const breaches: Array<{ sysId: string; sla: SLMData }> = [];
    const warnings: Array<{ sysId: string; sla: SLMData }> = [];

    for (const sysId of sysIds) {
      try {
        const slms = await this.collectSLMsForTicket(sysId);
        
        slms.forEach(sla => {
          if (sla.has_breached) {
            breaches.push({ sysId, sla });
          } else if (sla.active && sla.business_percentage > 80) {
            warnings.push({ sysId, sla });
          }
        });
        
      } catch (error) {
        console.error(`❌ Error monitoring SLAs for ${sysId}:`, error);
      }
    }

    return {
      breaches,
      warnings,
      summary: {
        total_tickets: sysIds.length,
        total_breaches: breaches.length,
        total_warnings: warnings.length
      }
    };
  }
}