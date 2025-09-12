/**
 * SLA Tracking Service - Monitor and calculate SLA compliance for tickets
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Features:
 * - Automatic SLA calculation based on priority
 * - Business hours calculation
 * - SLA breach detection and alerting  
 * - Historical SLA metrics
 * - Real-time compliance monitoring
 */

import { enhancedTicketStorageService } from './EnhancedTicketStorageService';
import { TicketDocument } from '../config/mongodb';

export interface SLADocument {
  _id?: string;
  sys_id: string;
  ticket_sys_id: string;
  ticket_number: string;
  ticket_table: string;
  priority: string;
  sla_target_hours: number;
  created_at: Date;
  updated_at: Date;
  breached: boolean;
  breach_time?: Date;
  resolution_time_hours?: number;
  remaining_time_hours?: number;
  status: 'active' | 'resolved' | 'breached';
  business_hours_elapsed: number;
  calendar_hours_elapsed: number;
}

export interface SLAMetrics {
  total_tickets: number;
  breached_tickets: number;
  resolved_within_sla: number;
  average_resolution_hours: number;
  breach_percentage: number;
  by_priority: {
    [priority: string]: {
      total: number;
      breached: number;
      resolved: number;
      breach_rate: number;
    }
  };
}

export interface SLAConfig {
  priorities: {
    [priority: string]: {
      target_hours: number;
      escalation_hours?: number;
    }
  };
  business_hours: {
    start: number; // 0-23
    end: number;   // 0-23
    days: number[]; // 0=Sunday, 1=Monday, etc
  };
  check_interval: number; // minutes
}

export class SLATrackingService {
  private config: SLAConfig;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<SLAConfig>) {
    this.config = {
      priorities: {
        '1': { target_hours: 4, escalation_hours: 2 },   // Critical
        '2': { target_hours: 8, escalation_hours: 4 },   // High
        '3': { target_hours: 24, escalation_hours: 12 }, // Moderate
        '4': { target_hours: 72, escalation_hours: 48 }, // Low
        '5': { target_hours: 168, escalation_hours: 120 } // Planning
      },
      business_hours: {
        start: 8,    // 8 AM
        end: 18,     // 6 PM
        days: [1, 2, 3, 4, 5] // Monday to Friday
      },
      check_interval: 15, // 15 minutes
      ...config
    };

    console.log('📊 SLATrackingService initialized');
    console.log('   - Priority SLAs:', Object.entries(this.config.priorities).map(([p, c]) => `P${p}: ${c.target_hours}h`).join(', '));
    console.log(`   - Business hours: ${this.config.business_hours.start}:00 - ${this.config.business_hours.end}:00`);
    console.log(`   - Check interval: ${this.config.check_interval} minutes`);
  }

  /**
   * Start SLA monitoring service
   */
  public start(): void {
    if (this.isRunning) {
      console.log('⚠️ SLA Tracking Service already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting SLA Tracking Service...');

    // Initial check
    this.performSLACheck();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.performSLACheck();
    }, this.config.check_interval * 60 * 1000);

    console.log(`✅ SLA Tracking Service started - checking every ${this.config.check_interval} minutes`);
  }

  /**
   * Stop SLA monitoring
   */
  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    console.log('⏹️ SLA Tracking Service stopped');
  }

  /**
   * Process SLA for a specific ticket
   */
  public async processSLA(ticket: TicketDocument): Promise<SLADocument> {
    console.log(`📊 [SLA] Processing SLA for ticket ${ticket.number}`);

    // Check if SLA already exists
    let slaDoc = await this.getSLAByTicket(ticket.sys_id);

    if (!slaDoc) {
      // Create new SLA record
      slaDoc = await this.createSLA(ticket);
    } else {
      // Update existing SLA
      slaDoc = await this.updateSLA(slaDoc, ticket);
    }

    return slaDoc;
  }

  /**
   * Get SLA metrics for reporting
   */
  public async getSLAMetrics(
    startDate?: Date,
    endDate?: Date,
    tableName?: string
  ): Promise<SLAMetrics> {
    console.log('📊 [SLA] Calculating SLA metrics...');

    try {
      const db = enhancedTicketStorageService.getDatabase();
      const collection = db.collection('slas');

      // Build query filter
      const filter: any = {};
      
      if (startDate || endDate) {
        filter.created_at = {};
        if (startDate) filter.created_at.$gte = startDate;
        if (endDate) filter.created_at.$lte = endDate;
      }

      if (tableName) {
        filter.ticket_table = tableName;
      }

      const slas = await collection.find(filter).toArray() as SLADocument[];

      // Calculate metrics
      const totalTickets = slas.length;
      const breachedTickets = slas.filter(sla => sla.breached).length;
      const resolvedWithinSla = slas.filter(sla => 
        sla.status === 'resolved' && !sla.breached
      ).length;

      const resolvedSLAs = slas.filter(sla => 
        sla.status === 'resolved' && sla.resolution_time_hours
      );
      
      const averageResolutionHours = resolvedSLAs.length > 0
        ? resolvedSLAs.reduce((sum, sla) => sum + (sla.resolution_time_hours || 0), 0) / resolvedSLAs.length
        : 0;

      const breachPercentage = totalTickets > 0 ? (breachedTickets / totalTickets) * 100 : 0;

      // Calculate by priority
      const byPriority: any = {};
      for (const priority of ['1', '2', '3', '4', '5']) {
        const prioritySLAs = slas.filter(sla => sla.priority === priority);
        const priorityBreached = prioritySLAs.filter(sla => sla.breached).length;
        const priorityResolved = prioritySLAs.filter(sla => sla.status === 'resolved').length;

        byPriority[priority] = {
          total: prioritySLAs.length,
          breached: priorityBreached,
          resolved: priorityResolved,
          breach_rate: prioritySLAs.length > 0 ? (priorityBreached / prioritySLAs.length) * 100 : 0
        };
      }

      return {
        total_tickets: totalTickets,
        breached_tickets: breachedTickets,
        resolved_within_sla: resolvedWithinSla,
        average_resolution_hours: Math.round(averageResolutionHours * 100) / 100,
        breach_percentage: Math.round(breachPercentage * 100) / 100,
        by_priority: byPriority
      };

    } catch (error) {
      console.error('❌ [SLA] Error calculating metrics:', error);
      throw error;
    }
  }

  /**
   * Get SLA status for specific ticket
   */
  public async getSLAStatus(ticketSysId: string): Promise<SLADocument | null> {
    return await this.getSLAByTicket(ticketSysId);
  }

  /**
   * Get tickets approaching SLA breach
   */
  public async getTicketsNearBreach(hoursThreshold: number = 2): Promise<SLADocument[]> {
    try {
      const db = enhancedTicketStorageService.getDatabase();
      const collection = db.collection('slas');

      const slas = await collection.find({
        status: 'active',
        breached: false,
        remaining_time_hours: { $lte: hoursThreshold, $gt: 0 }
      }).toArray() as SLADocument[];

      return slas;
    } catch (error) {
      console.error('❌ [SLA] Error getting tickets near breach:', error);
      return [];
    }
  }

  /**
   * Private method to perform periodic SLA check
   */
  private async performSLACheck(): Promise<void> {
    if (!this.isRunning) return;

    console.log('📊 [SLA] Performing scheduled SLA check...');

    try {
      // Get all active tickets from MongoDB
      const db = enhancedTicketStorageService.getDatabase();
      const ticketsCollection = db.collection('tickets');
      
      const activeTickets = await ticketsCollection.find({
        state: { $in: ['1', '2', '3', '6'] }, // Active states
        expires_at: { $gt: new Date() }
      }).toArray() as TicketDocument[];

      console.log(`📊 [SLA] Found ${activeTickets.length} active tickets to check`);

      for (const ticket of activeTickets) {
        await this.processSLA(ticket);
      }

      console.log('✅ [SLA] Scheduled SLA check completed');
    } catch (error) {
      console.error('❌ [SLA] Error during scheduled check:', error);
    }
  }

  /**
   * Create new SLA record
   */
  private async createSLA(ticket: TicketDocument): Promise<SLADocument> {
    const priorityConfig = this.config.priorities[ticket.priority] || this.config.priorities['3'];
    
    const slaDoc: SLADocument = {
      sys_id: `sla_${ticket.sys_id}_${Date.now()}`,
      ticket_sys_id: ticket.sys_id,
      ticket_number: ticket.number,
      ticket_table: ticket.table_name,
      priority: ticket.priority,
      sla_target_hours: priorityConfig.target_hours,
      created_at: new Date(ticket.sys_created_on),
      updated_at: new Date(),
      breached: false,
      status: 'active',
      business_hours_elapsed: 0,
      calendar_hours_elapsed: 0
    };

    // Calculate current elapsed time and status
    const now = new Date();
    const createdTime = new Date(ticket.sys_created_on);
    
    slaDoc.calendar_hours_elapsed = (now.getTime() - createdTime.getTime()) / (1000 * 60 * 60);
    slaDoc.business_hours_elapsed = this.calculateBusinessHours(createdTime, now);
    slaDoc.remaining_time_hours = Math.max(0, slaDoc.sla_target_hours - slaDoc.business_hours_elapsed);
    
    // Check for breach
    if (slaDoc.business_hours_elapsed > slaDoc.sla_target_hours) {
      slaDoc.breached = true;
      slaDoc.status = 'breached';
      slaDoc.breach_time = now;
    }

    // Check if resolved
    if (ticket.state === '6' || ticket.state === '7') { // Resolved/Closed
      slaDoc.status = 'resolved';
      slaDoc.resolution_time_hours = slaDoc.business_hours_elapsed;
    }

    // Save to MongoDB
    const db = enhancedTicketStorageService.getDatabase();
    const collection = db.collection('slas');
    await collection.insertOne(slaDoc);

    console.log(`📊 [SLA] Created SLA for ${ticket.number}: ${slaDoc.business_hours_elapsed.toFixed(2)}h elapsed, target: ${slaDoc.sla_target_hours}h`);

    return slaDoc;
  }

  /**
   * Update existing SLA record
   */
  private async updateSLA(slaDoc: SLADocument, ticket: TicketDocument): Promise<SLADocument> {
    const now = new Date();
    const createdTime = new Date(ticket.sys_created_on);

    // Recalculate elapsed time
    slaDoc.calendar_hours_elapsed = (now.getTime() - createdTime.getTime()) / (1000 * 60 * 60);
    slaDoc.business_hours_elapsed = this.calculateBusinessHours(createdTime, now);
    slaDoc.remaining_time_hours = Math.max(0, slaDoc.sla_target_hours - slaDoc.business_hours_elapsed);
    slaDoc.updated_at = now;

    // Check for breach (if not already breached)
    if (!slaDoc.breached && slaDoc.business_hours_elapsed > slaDoc.sla_target_hours) {
      slaDoc.breached = true;
      slaDoc.status = 'breached';
      slaDoc.breach_time = now;
      console.log(`🚨 [SLA] BREACH DETECTED for ${ticket.number}: ${slaDoc.business_hours_elapsed.toFixed(2)}h > ${slaDoc.sla_target_hours}h`);
    }

    // Check if resolved
    if ((ticket.state === '6' || ticket.state === '7') && slaDoc.status === 'active') {
      slaDoc.status = 'resolved';
      slaDoc.resolution_time_hours = slaDoc.business_hours_elapsed;
      console.log(`✅ [SLA] Ticket resolved: ${ticket.number} in ${slaDoc.resolution_time_hours.toFixed(2)}h (target: ${slaDoc.sla_target_hours}h)`);
    }

    // Update in MongoDB
    const db = enhancedTicketStorageService.getDatabase();
    const collection = db.collection('slas');
    await collection.replaceOne(
      { ticket_sys_id: ticket.sys_id },
      slaDoc,
      { upsert: true }
    );

    return slaDoc;
  }

  /**
   * Get SLA by ticket sys_id
   */
  private async getSLAByTicket(ticketSysId: string): Promise<SLADocument | null> {
    try {
      const db = enhancedTicketStorageService.getDatabase();
      const collection = db.collection('slas');
      const sla = await collection.findOne({ ticket_sys_id: ticketSysId }) as SLADocument | null;
      return sla;
    } catch (error) {
      console.error('❌ [SLA] Error getting SLA by ticket:', error);
      return null;
    }
  }

  /**
   * Calculate business hours between two dates
   */
  private calculateBusinessHours(startDate: Date, endDate: Date): number {
    let totalHours = 0;
    const current = new Date(startDate);
    
    while (current < endDate) {
      const dayOfWeek = current.getDay();
      const hour = current.getHours();
      
      // Check if current time is within business hours and business days
      if (this.config.business_hours.days.includes(dayOfWeek) &&
          hour >= this.config.business_hours.start &&
          hour < this.config.business_hours.end) {
        totalHours += 1;
      }
      
      current.setHours(current.getHours() + 1);
    }
    
    return totalHours;
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isRunning: boolean;
    config: SLAConfig;
    lastCheck: Date;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      lastCheck: new Date()
    };
  }
}