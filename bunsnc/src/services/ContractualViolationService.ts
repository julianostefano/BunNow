/**
 * Contractual Violation Service - Validates business rules for contractual violations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient, Db, Collection } from "mongodb";
import { logger } from "../utils/Logger";
import { ContractualSLAService } from "./ContractualSLAService";
import { BusinessHoursCalculator } from "../utils/BusinessHoursCalculator";
import {
  ContractualViolationResult,
  ViolationReason,
  ViolationSeverity,
  SupportGroupData,
  TicketClosureData,
  SLABreachData,
  ViolationMarkingData,
  TicketViolationData,
  ViolationValidationRules,
  ViolationStatistics,
  ViolationReport,
  ViolationTrackingDocument,
} from "../types/ContractualViolation";
import { TicketType, MetricType } from "../types/ContractualSLA";

/**
 * Service for validating contractual violations according to business rules
 */
export class ContractualViolationService {
  private static instance: ContractualViolationService;
  private db: Db;
  private supportGroupsCollection: Collection;
  private incidentsCollection: Collection;
  private ctasksCollection: Collection;
  private sctasksCollection: Collection;
  private violationTrackingCollection: Collection;
  private businessHoursCalculator: BusinessHoursCalculator;
  private supportGroupsCache: Map<string, SupportGroupData> = new Map();
  private cacheLastRefresh: Date = new Date(0);
  private readonly CACHE_TTL_MINUTES = 10;

  constructor(
    private mongoClient: MongoClient,
    private databaseName: string,
    private contractualSLAService: ContractualSLAService,
  ) {
    this.db = this.mongoClient.db(this.databaseName);
    this.supportGroupsCollection = this.db.collection("sn_groups");
    this.incidentsCollection = this.db.collection("sn_incidents_collection");
    this.ctasksCollection = this.db.collection("sn_ctasks_collection");
    this.sctasksCollection = this.db.collection("sn_sctasks_collection");
    this.violationTrackingCollection = this.db.collection(
      "sn_violation_tracking",
    );
    this.businessHoursCalculator = new BusinessHoursCalculator();
  }

  /**
   * Singleton pattern - get or create instance
   */
  public static getInstance(
    mongoClient: MongoClient,
    databaseName: string,
    contractualSLAService: ContractualSLAService,
  ): ContractualViolationService {
    if (!ContractualViolationService.instance) {
      ContractualViolationService.instance = new ContractualViolationService(
        mongoClient,
        databaseName,
        contractualSLAService,
      );
    }
    return ContractualViolationService.instance;
  }

  /**
   * Initialize service and create indexes
   */
  public async initialize(): Promise<void> {
    try {
      // Create indexes for violation tracking collection
      await this.violationTrackingCollection.createIndex(
        { ticket_sys_id: 1 },
        { unique: true },
      );
      await this.violationTrackingCollection.createIndex({ ticket_type: 1 });
      await this.violationTrackingCollection.createIndex({ processed: 1 });
      await this.violationTrackingCollection.createIndex({ created_at: -1 });

      // Load support groups cache
      await this.refreshSupportGroupsCache();

      logger.info(
        " [ContractualViolationService] Service initialized successfully",
      );
    } catch (error) {
      logger.error(
        " [ContractualViolationService] Failed to initialize:",
        error,
      );
      throw error;
    }
  }

  /**
   * Validate contractual violation for a specific ticket
   */
  public async validateContractualViolation(
    ticketId: string,
    ticketType: TicketType,
    rules: ViolationValidationRules = {
      validate_group_closure: true,
      validate_sla_breach: true,
      validate_violation_marking: true,
      strict_validation: true,
    },
  ): Promise<ContractualViolationResult> {
    try {
      logger.info(
        ` [ContractualViolationService] Validating violation for ${ticketType} ${ticketId}`,
      );

      // Get ticket data from appropriate collection
      const ticketData = await this.getTicketData(ticketId, ticketType);
      if (!ticketData) {
        throw new Error(
          `Ticket ${ticketId} not found in ${ticketType} collection`,
        );
      }

      const violationReasons: ViolationReason[] = [];

      // Rule 1: Validate ticket closed by support group member
      if (rules.validate_group_closure) {
        const groupValidation = await this.validateGroupClosure(ticketData);
        violationReasons.push({
          rule_name: "group_closure_validation",
          rule_description: "Ticket must be closed by a member of sn_groups",
          is_compliant: groupValidation.closed_by_group,
          validation_details: groupValidation,
          severity: groupValidation.closed_by_group
            ? ViolationSeverity.LOW
            : ViolationSeverity.HIGH,
        });
      }

      // Rule 2: Validate SLA contractual conditions
      if (rules.validate_sla_breach) {
        const slaValidation = await this.validateSLABreach(ticketData);
        violationReasons.push({
          rule_name: "sla_breach_validation",
          rule_description: "Ticket must meet contractual SLA conditions",
          is_compliant: !slaValidation.has_sla_breach,
          validation_details: slaValidation,
          severity: slaValidation.has_sla_breach
            ? ViolationSeverity.CRITICAL
            : ViolationSeverity.LOW,
        });
      }

      // Rule 3: Validate violation marking
      if (rules.validate_violation_marking) {
        const markingValidation =
          await this.validateViolationMarking(ticketData);
        violationReasons.push({
          rule_name: "violation_marking_validation",
          rule_description: "Ticket must be explicitly marked as violated",
          is_compliant: markingValidation.is_marked_as_violated,
          validation_details: markingValidation,
          severity: markingValidation.is_marked_as_violated
            ? ViolationSeverity.LOW
            : ViolationSeverity.MEDIUM,
        });
      }

      // Determine overall violation status
      const isViolated = rules.strict_validation
        ? violationReasons.every((reason) => !reason.is_compliant)
        : violationReasons.some((reason) => !reason.is_compliant);

      // Calculate penalty if violated
      let penaltyPercentage = 0;
      if (isViolated) {
        const slaConfig = await this.contractualSLAService.getSLA(
          ticketType,
          this.mapPriority(ticketData.priority || ""),
          MetricType.RESOLUTION_TIME,
        );
        penaltyPercentage = slaConfig?.penalty_percentage || 0;
      }

      const result: ContractualViolationResult = {
        is_violated: isViolated,
        violation_reasons: violationReasons,
        validation_timestamp: new Date(),
        ticket_id: ticketData.sys_id,
        ticket_type: ticketType,
        penalty_percentage: penaltyPercentage,
        financial_impact: penaltyPercentage,
      };

      // Store result in tracking collection
      await this.storeViolationResult(result, ticketData);

      logger.info(
        ` [ContractualViolationService] Validation completed for ${ticketId}: ${isViolated ? "VIOLATED" : "COMPLIANT"}`,
      );
      return result;
    } catch (error) {
      logger.error(
        ` [ContractualViolationService] Error validating ${ticketId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Rule 1: Validate ticket closure by support group
   */
  private async validateGroupClosure(
    ticketData: TicketViolationData,
  ): Promise<TicketClosureData> {
    try {
      await this.refreshSupportGroupsCacheIfNeeded();

      const assignmentGroupId = ticketData.assignment_group?.value;
      if (!assignmentGroupId) {
        return {
          closed_by_group: false,
          assignment_group_id: undefined,
          assignment_group_name: undefined,
        };
      }

      // Check if assignment group exists in sn_groups
      const groupExists = this.supportGroupsCache.has(assignmentGroupId);
      const groupData = this.supportGroupsCache.get(assignmentGroupId);

      return {
        closed_by_group: groupExists,
        assignment_group_id: assignmentGroupId,
        assignment_group_name:
          groupData?.nome || ticketData.assignment_group.display_value,
        closure_timestamp: ticketData.closed_at,
        closure_state: ticketData.state,
      };
    } catch (error) {
      logger.error(
        " [ContractualViolationService] Error validating group closure:",
        error,
      );
      return { closed_by_group: false };
    }
  }

  /**
   * Rule 2: Validate SLA breach conditions
   */
  private async validateSLABreach(
    ticketData: TicketViolationData,
  ): Promise<SLABreachData> {
    try {
      const priority = this.mapPriority(ticketData.priority || "");
      const createdAt = new Date(ticketData.sys_created_on);
      const resolvedAt = ticketData.resolved_at
        ? new Date(ticketData.resolved_at)
        : null;

      // Get SLA configurations
      const responseSLA = await this.contractualSLAService.getSLA(
        ticketData.ticket_type,
        priority,
        MetricType.RESPONSE_TIME,
      );

      const resolutionSLA = await this.contractualSLAService.getSLA(
        ticketData.ticket_type,
        priority,
        MetricType.RESOLUTION_TIME,
      );

      let responseTimeBreach = false;
      let resolutionTimeBreach = false;
      const breachDetails: any = {};

      // Check response time breach (assuming first update as response)
      if (responseSLA) {
        const responseTime =
          this.businessHoursCalculator.calculateBusinessHours(
            createdAt,
            new Date(ticketData.sys_updated_on),
          );
        responseTimeBreach = responseTime > responseSLA.sla_hours;
        breachDetails.expected_response_hours = responseSLA.sla_hours;
        breachDetails.actual_response_hours = responseTime;
      }

      // Check resolution time breach
      if (resolutionSLA && resolvedAt) {
        const resolutionTime =
          this.businessHoursCalculator.calculateBusinessHours(
            createdAt,
            resolvedAt,
          );
        resolutionTimeBreach = resolutionTime > resolutionSLA.sla_hours;
        breachDetails.expected_resolution_hours = resolutionSLA.sla_hours;
        breachDetails.actual_resolution_hours = resolutionTime;
      }

      return {
        has_sla_breach: responseTimeBreach || resolutionTimeBreach,
        response_time_breach: responseTimeBreach,
        resolution_time_breach: resolutionTimeBreach,
        breach_details: breachDetails,
      };
    } catch (error) {
      logger.error(
        " [ContractualViolationService] Error validating SLA breach:",
        error,
      );
      return {
        has_sla_breach: false,
        response_time_breach: false,
        resolution_time_breach: false,
        breach_details: {},
      };
    }
  }

  /**
   * Rule 3: Validate violation marking
   */
  private async validateViolationMarking(
    ticketData: TicketViolationData,
  ): Promise<ViolationMarkingData> {
    try {
      const isMarked = ticketData.contractual_violation === true;

      return {
        is_marked_as_violated: isMarked,
        violation_field_value: ticketData.contractual_violation,
        marking_timestamp: isMarked
          ? new Date(ticketData.sys_updated_on)
          : undefined,
      };
    } catch (error) {
      logger.error(
        " [ContractualViolationService] Error validating violation marking:",
        error,
      );
      return { is_marked_as_violated: false };
    }
  }

  /**
   * Get ticket data from appropriate collection
   */
  private async getTicketData(
    ticketId: string,
    ticketType: TicketType,
  ): Promise<TicketViolationData | null> {
    try {
      let collection: Collection;
      let dataPath: string;

      switch (ticketType) {
        case TicketType.INCIDENT:
          collection = this.incidentsCollection;
          dataPath = "data.incident";
          break;
        case TicketType.CTASK:
          collection = this.ctasksCollection;
          dataPath = "data.change_task";
          break;
        case TicketType.SCTASK:
          collection = this.sctasksCollection;
          dataPath = "data.sc_task";
          break;
        default:
          throw new Error(`Unsupported ticket type: ${ticketType}`);
      }

      const document = await collection.findOne({ sys_id: ticketId });
      if (!document) return null;

      // Extract ticket data from nested structure
      const ticketData = this.getNestedValue(document, dataPath);
      if (!ticketData) return null;

      return {
        sys_id: ticketData.sys_id,
        number: ticketData.number,
        ticket_type: ticketType,
        state: ticketData.state,
        assignment_group: ticketData.assignment_group || {
          value: "",
          display_value: "",
        },
        sys_created_on: new Date(ticketData.sys_created_on),
        sys_updated_on: new Date(ticketData.sys_updated_on),
        closed_at: ticketData.closed_at
          ? new Date(ticketData.closed_at)
          : undefined,
        resolved_at: ticketData.resolved_at
          ? new Date(ticketData.resolved_at)
          : undefined,
        priority: ticketData.priority,
        contractual_violation: ticketData.contractual_violation,
        slms: document.data?.slms || [],
      };
    } catch (error) {
      logger.error(
        ` [ContractualViolationService] Error getting ticket data for ${ticketId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Store violation result in tracking collection
   */
  private async storeViolationResult(
    result: ContractualViolationResult,
    ticketData: TicketViolationData,
  ): Promise<void> {
    try {
      const trackingDoc: ViolationTrackingDocument = {
        ticket_sys_id: result.ticket_id,
        ticket_number: ticketData.number,
        ticket_type: result.ticket_type,
        violation_result: result,
        created_at: new Date(),
        updated_at: new Date(),
        processed: true,
        financial_impact_calculated: Boolean(result.financial_impact),
      };

      await this.violationTrackingCollection.replaceOne(
        { ticket_sys_id: result.ticket_id },
        trackingDoc,
        { upsert: true },
      );
    } catch (error) {
      logger.error(
        " [ContractualViolationService] Error storing violation result:",
        error,
      );
    }
  }

  /**
   * Refresh support groups cache
   */
  private async refreshSupportGroupsCache(): Promise<void> {
    try {
      const groups = await this.supportGroupsCollection.find({}).toArray();
      this.supportGroupsCache.clear();

      for (const group of groups) {
        const groupData: SupportGroupData = {
          id: group.id,
          nome: group.data?.nome || "",
          tags: group.data?.tags || [],
          descricao: group.data?.descricao || "",
          responsavel: group.data?.responsavel || "",
          temperatura: group.data?.temperatura || 0,
        };
        this.supportGroupsCache.set(String(group.id), groupData);
      }

      this.cacheLastRefresh = new Date();
      logger.info(
        ` [ContractualViolationService] Support groups cache refreshed: ${groups.length} groups loaded`,
      );
    } catch (error) {
      logger.error(
        " [ContractualViolationService] Error refreshing support groups cache:",
        error,
      );
    }
  }

  /**
   * Refresh cache if needed based on TTL
   */
  private async refreshSupportGroupsCacheIfNeeded(): Promise<void> {
    const now = new Date();
    const cacheAgeMinutes =
      (now.getTime() - this.cacheLastRefresh.getTime()) / (1000 * 60);

    if (cacheAgeMinutes > this.CACHE_TTL_MINUTES) {
      await this.refreshSupportGroupsCache();
    }
  }

  /**
   * Map ServiceNow priority to SLA priority format
   */
  private mapPriority(priority: string): string {
    const priorityMap: Record<string, string> = {
      "1": "P1",
      "2": "P2",
      "3": "P3",
      "4": "P4",
      "5": "P5",
    };
    return priorityMap[priority] || "P3";
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  /**
   * Generate violation statistics for a time period
   */
  public async generateViolationStatistics(
    startDate: Date,
    endDate: Date,
  ): Promise<ViolationStatistics> {
    try {
      const violations = await this.violationTrackingCollection
        .find({
          created_at: { $gte: startDate, $lte: endDate },
          processed: true,
        })
        .toArray();

      const violatedTickets = violations.filter(
        (v) => v.violation_result.is_violated,
      );

      const stats: ViolationStatistics = {
        total_tickets_analyzed: violations.length,
        total_violations_found: violatedTickets.length,
        violation_rate_percentage:
          violations.length > 0
            ? Math.round((violatedTickets.length / violations.length) * 10000) /
              100
            : 0,
        violations_by_ticket_type: {} as Record<TicketType, number>,
        violations_by_severity: {} as Record<ViolationSeverity, number>,
        violations_by_group: {},
        total_financial_impact: violatedTickets.reduce(
          (sum, v) => sum + (v.violation_result.financial_impact || 0),
          0,
        ),
        analysis_period: { start_date: startDate, end_date: endDate },
      };

      // Group by ticket type
      for (const violation of violatedTickets) {
        const ticketType = violation.violation_result.ticket_type;
        stats.violations_by_ticket_type[ticketType] =
          (stats.violations_by_ticket_type[ticketType] || 0) + 1;
      }

      // Group by severity
      for (const violation of violatedTickets) {
        for (const reason of violation.violation_result.violation_reasons) {
          if (!reason.is_compliant) {
            stats.violations_by_severity[reason.severity] =
              (stats.violations_by_severity[reason.severity] || 0) + 1;
          }
        }
      }

      return stats;
    } catch (error) {
      logger.error(
        " [ContractualViolationService] Error generating violation statistics:",
        error,
      );
      throw error;
    }
  }

  /**
   * Health check for the service
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.supportGroupsCollection.findOne({});
      await this.violationTrackingCollection.findOne({});
      return true;
    } catch (error) {
      logger.error(
        " [ContractualViolationService] Health check failed:",
        error,
      );
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): any {
    return {
      support_groups_cached: this.supportGroupsCache.size,
      cache_last_refresh: this.cacheLastRefresh.toISOString(),
      cache_ttl_minutes: this.CACHE_TTL_MINUTES,
    };
  }
}
