/**
 * Enhanced Metrics Service - Integrates contractual SLA calculations with real ticket data
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Collection, MongoClient } from "mongodb";
import { logger } from "../utils/Logger";
import { ContractualSLAService } from "./ContractualSLAService";
import { BusinessHoursCalculator } from "../utils/BusinessHoursCalculator";
import {
  TicketType,
  MetricType,
  SLAPriority,
  SLAMetrics,
  SLAComplianceResult,
  TicketSLAStatus,
  SLADashboardData,
  SLAAlert,
  DEFAULT_BUSINESS_HOURS,
} from "../types/ContractualSLA";

interface TicketRecord {
  sys_id: string;
  number: string;
  priority?: string;
  state: string;
  sys_created_on: Date;
  sys_updated_on: Date;
  first_response_date?: Date;
  resolved_at?: Date;
  closed_at?: Date;
  assignment_group?: {
    value: string;
    display_value: string;
  };
  assigned_to?: string;
  short_description?: string;
}

interface MongoTicketDocument {
  _id?: any;
  sys_id: string;
  number: string;
  created_at: Date;
  updated_at: Date;
  sys_id_prefix: string;
  data: {
    incident?: TicketRecord;
    change_task?: TicketRecord;
    sc_task?: TicketRecord;
    slms?: any[];
    sync_timestamp?: string;
    collection_version?: string;
  };
}

export class EnhancedMetricsService {
  private static instance: EnhancedMetricsService;
  private contractualSLAService: ContractualSLAService;
  private businessHoursCalculator: BusinessHoursCalculator;
  private incidentCollection: Collection<MongoTicketDocument>;
  private ctaskCollection: Collection<MongoTicketDocument>;
  private sctaskCollection: Collection<MongoTicketDocument>;

  constructor(
    private mongoClient: MongoClient,
    private databaseName: string,
    contractualSLAService: ContractualSLAService,
  ) {
    this.contractualSLAService = contractualSLAService;
    this.businessHoursCalculator = new BusinessHoursCalculator(
      DEFAULT_BUSINESS_HOURS,
    );

    const db = this.mongoClient.db(this.databaseName);
    this.incidentCollection =
      db.collection<MongoTicketDocument>("sn_incidents");
    this.ctaskCollection = db.collection<MongoTicketDocument>("sn_ctasks");
    this.sctaskCollection = db.collection<MongoTicketDocument>("sn_sctasks");
  }

  static getInstance(
    mongoClient?: MongoClient,
    databaseName?: string,
    contractualSLAService?: ContractualSLAService,
  ): EnhancedMetricsService {
    if (
      !EnhancedMetricsService.instance &&
      mongoClient &&
      databaseName &&
      contractualSLAService
    ) {
      EnhancedMetricsService.instance = new EnhancedMetricsService(
        mongoClient,
        databaseName,
        contractualSLAService,
      );
    }
    return EnhancedMetricsService.instance;
  }

  /**
   * Calculate SLA compliance for a specific ticket
   */
  async calculateTicketSLA(
    ticketId: string,
    ticketType: TicketType,
  ): Promise<TicketSLAStatus | null> {
    try {
      const ticket = await this.getTicketRecord(ticketId, ticketType);
      if (!ticket) {
        logger.warn(` [EnhancedMetrics] Ticket not found: ${ticketId}`);
        return null;
      }

      const priority = this.mapPriority(ticket.priority, ticketType);
      if (!priority) {
        logger.warn(
          ` [EnhancedMetrics] Invalid priority ${ticket.priority} for ticket ${ticketId}`,
        );
        return null;
      }

      // Calculate response time compliance
      let responseSLA: SLAComplianceResult | null = null;
      if (ticket.first_response_date) {
        const responseHours = this.calculateHoursDifference(
          ticket.sys_created_on,
          ticket.first_response_date,
        );

        responseSLA = await this.contractualSLAService.calculateCompliance(
          ticketId,
          ticketType,
          priority,
          MetricType.RESPONSE_TIME,
          responseHours,
          {
            include_business_hours_only: true,
            penalty_calculation_enabled: true,
          },
        );
      }

      // Calculate resolution time compliance
      let resolutionSLA: SLAComplianceResult | null = null;
      const resolutionDate = ticket.resolved_at || ticket.closed_at;
      if (resolutionDate) {
        const resolutionHours = this.calculateHoursDifference(
          ticket.sys_created_on,
          resolutionDate,
        );

        resolutionSLA = await this.contractualSLAService.calculateCompliance(
          ticketId,
          ticketType,
          priority,
          MetricType.RESOLUTION_TIME,
          resolutionHours,
          {
            include_business_hours_only: true,
            penalty_calculation_enabled: true,
          },
        );
      }

      const overallCompliance =
        (!responseSLA || responseSLA.is_compliant) &&
        (!resolutionSLA || resolutionSLA.is_compliant);

      const totalPenalty =
        (responseSLA?.penalty_percentage || 0) +
        (resolutionSLA?.penalty_percentage || 0);

      return {
        ticket_id: ticketId,
        ticket_number: ticket.number,
        ticket_type: ticketType,
        priority: priority,
        created_at: ticket.sys_created_on,
        first_response_at: ticket.first_response_date,
        resolved_at: resolutionDate,
        response_sla: responseSLA,
        resolution_sla: resolutionSLA,
        overall_compliance: overallCompliance,
        total_penalty_percentage: totalPenalty,
      };
    } catch (error: unknown) {
      logger.error(
        ` [EnhancedMetrics] Error calculating SLA for ticket ${ticketId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate SLA metrics for a time period
   */
  async generateSLAMetrics(
    startDate: Date,
    endDate: Date,
    ticketType?: TicketType,
  ): Promise<SLAMetrics[]> {
    try {
      const ticketTypes = ticketType
        ? [ticketType]
        : [TicketType.INCIDENT, TicketType.CTASK, TicketType.SCTASK];
      const metricsResults: SLAMetrics[] = [];

      for (const type of ticketTypes) {
        const tickets = await this.getTicketsInPeriod(startDate, endDate, type);

        if (tickets.length === 0) {
          continue;
        }

        const slaResults: TicketSLAStatus[] = [];
        for (const ticket of tickets) {
          const slaStatus = await this.calculateTicketSLA(ticket.sys_id, type);
          if (slaStatus) {
            slaResults.push(slaStatus);
          }
        }

        const metrics = this.aggregateSLAMetrics(
          slaResults,
          startDate,
          endDate,
          type,
        );
        metricsResults.push(metrics);
      }

      return metricsResults;
    } catch (error: unknown) {
      logger.error(` [EnhancedMetrics] Error generating SLA metrics:`, error);
      return [];
    }
  }

  /**
   * Get comprehensive SLA dashboard data
   */
  async getDashboardData(
    startDate: Date,
    endDate: Date,
  ): Promise<SLADashboardData> {
    try {
      const metricsResults = await this.generateSLAMetrics(startDate, endDate);
      const recentBreaches = await this.getRecentBreaches(10);
      const alerts = await this.generateSLAAlerts();

      // Calculate overall metrics
      let totalTickets = 0;
      let compliantTickets = 0;
      let totalPenalties = 0;

      const byTicketType: Record<TicketType, SLAMetrics> = {} as Record<
        TicketType,
        SLAMetrics
      >;

      for (const metrics of metricsResults) {
        totalTickets += metrics.total_tickets;
        compliantTickets += metrics.compliant_tickets;
        totalPenalties += metrics.total_penalty_percentage;
        byTicketType[metrics.ticket_type] = metrics;
      }

      const overallCompliance =
        totalTickets > 0 ? (compliantTickets / totalTickets) * 100 : 0;

      return {
        overall_metrics: {
          total_tickets: totalTickets,
          compliant_tickets: compliantTickets,
          breach_tickets: totalTickets - compliantTickets,
          compliance_percentage: Math.round(overallCompliance * 100) / 100,
          total_penalties: Math.round(totalPenalties * 100) / 100,
        },
        by_ticket_type: byTicketType,
        recent_breaches: recentBreaches,
        trending_metrics: {
          period: "30d",
          compliance_trend: await this.getComplianceTrend(30),
          penalty_trend: await this.getPenaltyTrend(30),
          volume_trend: await this.getVolumeTrend(30),
        },
        alerts: alerts,
      };
    } catch (error: unknown) {
      logger.error(
        ` [EnhancedMetrics] Error generating dashboard data:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get recent SLA breaches
   */
  private async getRecentBreaches(limit: number): Promise<TicketSLAStatus[]> {
    try {
      const breaches: TicketSLAStatus[] = [];
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 7); // Last 7 days

      for (const ticketType of [
        TicketType.INCIDENT,
        TicketType.CTASK,
        TicketType.SCTASK,
      ]) {
        const tickets = await this.getTicketsInPeriod(
          recentDate,
          new Date(),
          ticketType,
        );

        for (const ticket of tickets.slice(0, limit)) {
          const slaStatus = await this.calculateTicketSLA(
            ticket.sys_id,
            ticketType,
          );
          if (slaStatus && !slaStatus.overall_compliance) {
            breaches.push(slaStatus);
          }
        }
      }

      return breaches
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, limit);
    } catch (error: unknown) {
      logger.error(" [EnhancedMetrics] Error getting recent breaches:", error);
      return [];
    }
  }

  /**
   * Generate SLA alerts based on current status
   */
  private async generateSLAAlerts(): Promise<SLAAlert[]> {
    const alerts: SLAAlert[] = [];

    try {
      // Check for high penalty rate
      const recentMetrics = await this.generateSLAMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        new Date(),
      );

      for (const metrics of recentMetrics) {
        if (metrics.compliance_percentage < 80) {
          alerts.push({
            id: `compliance-${metrics.ticket_type}-${Date.now()}`,
            type: "warning",
            severity: metrics.compliance_percentage < 60 ? "critical" : "high",
            ticket_type: metrics.ticket_type,
            priority: "P1" as SLAPriority,
            message: `${metrics.ticket_type.toUpperCase()} SLA compliance is ${metrics.compliance_percentage.toFixed(1)}% (last 24h)`,
            created_at: new Date(),
            acknowledged: false,
          });
        }

        if (metrics.total_penalty_percentage > 2.0) {
          alerts.push({
            id: `penalty-${metrics.ticket_type}-${Date.now()}`,
            type: "breach",
            severity: "critical",
            ticket_type: metrics.ticket_type,
            priority: "P1" as SLAPriority,
            message: `High penalty rate: ${metrics.total_penalty_percentage.toFixed(2)}% for ${metrics.ticket_type.toUpperCase()}`,
            created_at: new Date(),
            acknowledged: false,
          });
        }
      }
    } catch (error: unknown) {
      logger.error(" [EnhancedMetrics] Error generating alerts:", error);
    }

    return alerts;
  }

  /**
   * Helper methods
   */
  private async getTicketRecord(
    ticketId: string,
    ticketType: TicketType,
  ): Promise<TicketRecord | null> {
    const collection = this.getCollectionForTicketType(ticketType);
    const document = await collection.findOne({ sys_id: ticketId });

    if (!document) return null;

    // Extract ticket data from the nested structure
    let ticketData: TicketRecord | undefined;
    switch (ticketType) {
      case TicketType.INCIDENT:
        ticketData = document.data.incident;
        break;
      case TicketType.CTASK:
        ticketData = document.data.change_task;
        break;
      case TicketType.SCTASK:
        ticketData = document.data.sc_task;
        break;
    }

    if (!ticketData) return null;

    // Convert date strings to Date objects
    return {
      ...ticketData,
      sys_created_on: new Date(ticketData.sys_created_on),
      sys_updated_on: new Date(ticketData.sys_updated_on),
      resolved_at: ticketData.resolved_at
        ? new Date(ticketData.resolved_at)
        : undefined,
      closed_at: ticketData.closed_at
        ? new Date(ticketData.closed_at)
        : undefined,
      first_response_date: ticketData.first_response_date
        ? new Date(ticketData.first_response_date)
        : undefined,
    };
  }

  private getCollectionForTicketType(
    ticketType: TicketType,
  ): Collection<MongoTicketDocument> {
    switch (ticketType) {
      case TicketType.INCIDENT:
        return this.incidentCollection;
      case TicketType.CTASK:
        return this.ctaskCollection;
      case TicketType.SCTASK:
        return this.sctaskCollection;
    }
  }

  private async getTicketsInPeriod(
    startDate: Date,
    endDate: Date,
    ticketType: TicketType,
  ): Promise<TicketRecord[]> {
    const collection = this.getCollectionForTicketType(ticketType);

    // Create the field path based on ticket type
    const fieldPath = this.getFieldPath(ticketType, "sys_created_on");

    const documents = await collection
      .find({
        [fieldPath]: {
          $gte: startDate.toISOString(),
          $lte: endDate.toISOString(),
        },
      })
      .sort({ [fieldPath]: -1 })
      .toArray();

    // Extract and convert ticket records from documents
    const tickets: TicketRecord[] = [];
    for (const doc of documents) {
      const ticketData = this.extractTicketDataFromDocument(doc, ticketType);
      if (ticketData) {
        tickets.push(ticketData);
      }
    }

    return tickets;
  }

  private getFieldPath(ticketType: TicketType, field: string): string {
    switch (ticketType) {
      case TicketType.INCIDENT:
        return `data.incident.${field}`;
      case TicketType.CTASK:
        return `data.change_task.${field}`;
      case TicketType.SCTASK:
        return `data.sc_task.${field}`;
    }
  }

  private extractTicketDataFromDocument(
    document: MongoTicketDocument,
    ticketType: TicketType,
  ): TicketRecord | null {
    let ticketData: TicketRecord | undefined;

    switch (ticketType) {
      case TicketType.INCIDENT:
        ticketData = document.data.incident;
        break;
      case TicketType.CTASK:
        ticketData = document.data.change_task;
        break;
      case TicketType.SCTASK:
        ticketData = document.data.sc_task;
        break;
    }

    if (!ticketData) return null;

    // Convert date strings to Date objects
    return {
      ...ticketData,
      sys_created_on: new Date(ticketData.sys_created_on),
      sys_updated_on: new Date(ticketData.sys_updated_on),
      resolved_at: ticketData.resolved_at
        ? new Date(ticketData.resolved_at)
        : undefined,
      closed_at: ticketData.closed_at
        ? new Date(ticketData.closed_at)
        : undefined,
      first_response_date: ticketData.first_response_date
        ? new Date(ticketData.first_response_date)
        : undefined,
    };
  }

  private mapPriority(
    priority: string,
    ticketType: TicketType,
  ): SLAPriority | null {
    // Map ServiceNow priority values to our SLA priority types
    const priorityMap: Record<
      string,
      Record<TicketType, SLAPriority | null>
    > = {
      "1": {
        [TicketType.INCIDENT]: "P1" as SLAPriority,
        [TicketType.CTASK]: "P1" as SLAPriority,
        [TicketType.SCTASK]: "P1" as SLAPriority,
      },
      "2": {
        [TicketType.INCIDENT]: "P2" as SLAPriority,
        [TicketType.CTASK]: "P2" as SLAPriority,
        [TicketType.SCTASK]: "P2" as SLAPriority,
      },
      "3": {
        [TicketType.INCIDENT]: "P3" as SLAPriority,
        [TicketType.CTASK]: "P3" as SLAPriority,
        [TicketType.SCTASK]: "P3" as SLAPriority,
      },
      "4": {
        [TicketType.INCIDENT]: "P4" as SLAPriority,
        [TicketType.CTASK]: "P4" as SLAPriority,
        [TicketType.SCTASK]: null,
      },
      Normal: {
        [TicketType.INCIDENT]: null,
        [TicketType.CTASK]: null,
        [TicketType.SCTASK]: "Normal" as SLAPriority,
      },
      Standard: {
        [TicketType.INCIDENT]: null,
        [TicketType.CTASK]: null,
        [TicketType.SCTASK]: "Standard" as SLAPriority,
      },
    };

    return priorityMap[priority]?.[ticketType] || null;
  }

  private calculateHoursDifference(startDate: Date, endDate: Date): number {
    const diffMs = endDate.getTime() - startDate.getTime();
    return diffMs / (1000 * 60 * 60); // Convert to hours
  }

  private aggregateSLAMetrics(
    slaResults: TicketSLAStatus[],
    periodStart: Date,
    periodEnd: Date,
    ticketType: TicketType,
  ): SLAMetrics {
    const totalTickets = slaResults.length;
    const compliantTickets = slaResults.filter(
      (r) => r.overall_compliance,
    ).length;
    const breachedTickets = totalTickets - compliantTickets;
    const compliancePercentage =
      totalTickets > 0 ? (compliantTickets / totalTickets) * 100 : 0;

    const totalPenalty = slaResults.reduce(
      (sum, r) => sum + r.total_penalty_percentage,
      0,
    );
    const totalResponseTime = slaResults
      .filter((r) => r.response_sla)
      .reduce((sum, r) => sum + (r.response_sla?.actual_hours || 0), 0);
    const totalResolutionTime = slaResults
      .filter((r) => r.resolution_sla)
      .reduce((sum, r) => sum + (r.resolution_sla?.actual_hours || 0), 0);

    const responseTickets = slaResults.filter((r) => r.response_sla).length;
    const resolutionTickets = slaResults.filter((r) => r.resolution_sla).length;

    return {
      period_start: periodStart,
      period_end: periodEnd,
      ticket_type: ticketType,
      total_tickets: totalTickets,
      compliant_tickets: compliantTickets,
      breached_tickets: breachedTickets,
      compliance_percentage: Math.round(compliancePercentage * 100) / 100,
      total_penalty_percentage: Math.round(totalPenalty * 100) / 100,
      average_response_time:
        responseTickets > 0
          ? Math.round((totalResponseTime / responseTickets) * 100) / 100
          : 0,
      average_resolution_time:
        resolutionTickets > 0
          ? Math.round((totalResolutionTime / resolutionTickets) * 100) / 100
          : 0,
      metrics_by_priority: this.aggregateByPriority(slaResults),
    };
  }

  private aggregateByPriority(slaResults: TicketSLAStatus[]) {
    const priorityGroups = new Map();

    for (const result of slaResults) {
      if (!priorityGroups.has(result.priority)) {
        priorityGroups.set(result.priority, []);
      }
      priorityGroups.get(result.priority).push(result);
    }

    return Array.from(priorityGroups.entries()).map(([priority, results]) => {
      const total = results.length;
      const compliant = results.filter(
        (r: TicketSLAStatus) => r.overall_compliance,
      ).length;
      const totalPenalty = results.reduce(
        (sum: number, r: TicketSLAStatus) => sum + r.total_penalty_percentage,
        0,
      );

      return {
        priority,
        total_tickets: total,
        compliant_tickets: compliant,
        breached_tickets: total - compliant,
        compliance_percentage:
          total > 0 ? Math.round((compliant / total) * 10000) / 100 : 0,
        penalty_percentage: Math.round(totalPenalty * 100) / 100,
        average_response_time: 0, // TODO: Calculate from results
        average_resolution_time: 0, // TODO: Calculate from results
      };
    });
  }

  private async getComplianceTrend(days: number): Promise<number[]> {
    // TODO: Implement trend calculation
    return Array.from({ length: days }, () => Math.random() * 100);
  }

  private async getPenaltyTrend(days: number): Promise<number[]> {
    // TODO: Implement penalty trend calculation
    return Array.from({ length: days }, () => Math.random() * 5);
  }

  private async getVolumeTrend(days: number): Promise<number[]> {
    // TODO: Implement volume trend calculation
    return Array.from({ length: days }, () => Math.floor(Math.random() * 100));
  }
}
