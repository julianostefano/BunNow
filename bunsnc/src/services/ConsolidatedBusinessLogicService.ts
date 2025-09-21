/**
 * Consolidated Business Logic Service - Complete Business Operations
 * Consolidates: ConsolidatedServiceNowService, SLATrackingService, TicketCollectionService, business workflow logic
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { logger } from "../utils/Logger";
import { ServiceNowAuthClient } from "./ServiceNowAuthClient";
import { TicketDataCore } from "./ticket/TicketDataCore";
import {
  TicketQueryService,
  HybridQueryParams,
  HybridQueryResult,
} from "./ticket/TicketQueryService";
import {
  TicketSyncService,
  TicketSyncResult,
} from "./ticket/TicketSyncService";
import type { TicketData } from "../types/TicketTypes";

// ==================== INTERFACES ====================

// SLA Management
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
  status: "active" | "resolved" | "breached";
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
    };
  };
}

export interface SLAConfig {
  priorities: {
    [priority: string]: {
      target_hours: number;
      escalation_hours?: number;
    };
  };
  business_hours: {
    start: number;
    end: number;
    days: number[];
  };
  check_interval: number;
}

// Ticket Business Logic
export interface TicketCollectionStats {
  incidents: number;
  changeTasks: number;
  scTasks: number;
  groups: number;
  lastSync: string;
}

export interface BusinessRule {
  id: string;
  name: string;
  description: string;
  conditions: BusinessCondition[];
  actions: BusinessAction[];
  enabled: boolean;
  priority: number;
}

export interface BusinessCondition {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "greater_than"
    | "less_than"
    | "in"
    | "not_in";
  value: any;
}

export interface BusinessAction {
  type:
    | "set_field"
    | "send_notification"
    | "create_task"
    | "escalate"
    | "assign";
  parameters: Record<string, any>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: "approval" | "task" | "notification" | "condition" | "automation";
  conditions?: BusinessCondition[];
  actions?: BusinessAction[];
  nextSteps: string[];
  assignedTo?: string;
  dueDate?: Date;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
}

export interface WorkflowInstance {
  id: string;
  workflowId: string;
  ticketId: string;
  currentStep: string;
  steps: WorkflowStep[];
  status: "active" | "completed" | "failed" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
  variables: Record<string, any>;
}

export interface BusinessLogicConfig {
  sla: SLAConfig;
  rules: BusinessRule[];
  workflows: {
    enabled: boolean;
    maxConcurrent: number;
    timeoutMinutes: number;
  };
  escalation: {
    enabled: boolean;
    levels: Array<{
      priority: string;
      hours: number;
      assignTo: string;
      notify: string[];
    }>;
  };
}

// ==================== SLA MANAGER ====================

class SLAManager extends EventEmitter {
  private config: SLAConfig;
  private isRunning = false;
  private checkInterval?: Timer;
  private slaDocuments: Map<string, SLADocument> = new Map();

  constructor(config: SLAConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    logger.info(" [BusinessLogic] Initializing SLA Manager...");

    // Load existing SLA documents
    await this.loadExistingSLAs();

    logger.info(" [BusinessLogic] SLA Manager initialized");
    logger.info(
      `   - Priority SLAs: ${Object.entries(this.config.priorities)
        .map(([p, c]) => `P${p}: ${c.target_hours}h`)
        .join(", ")}`,
    );
    logger.info(
      `   - Business hours: ${this.config.business_hours.start}:00 - ${this.config.business_hours.end}:00`,
    );
    logger.info(`   - Check interval: ${this.config.check_interval} minutes`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(" [BusinessLogic] SLA Manager already running");
      return;
    }

    this.isRunning = true;

    this.checkInterval = setInterval(
      () => {
        this.performSLACheck();
      },
      this.config.check_interval * 60 * 1000,
    );

    logger.info(" [BusinessLogic] SLA Manager started");
  }

  async stop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    this.isRunning = false;
    logger.info(" [BusinessLogic] SLA Manager stopped");
  }

  async createSLAForTicket(ticket: TicketData): Promise<SLADocument> {
    const priorityConfig = this.config.priorities[ticket.priority];
    if (!priorityConfig) {
      throw new Error(`No SLA configuration for priority: ${ticket.priority}`);
    }

    const slaDoc: SLADocument = {
      sys_id: `sla_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      ticket_sys_id: ticket.sys_id,
      ticket_number: ticket.number,
      ticket_table: ticket.table,
      priority: ticket.priority,
      sla_target_hours: priorityConfig.target_hours,
      created_at: new Date(),
      updated_at: new Date(),
      breached: false,
      status: "active",
      business_hours_elapsed: 0,
      calendar_hours_elapsed: 0,
    };

    this.slaDocuments.set(slaDoc.sys_id, slaDoc);

    logger.info(
      ` [BusinessLogic] SLA created for ticket ${ticket.number}: ${priorityConfig.target_hours}h target`,
    );
    this.emit("slaCreated", { slaDoc, ticket });

    return slaDoc;
  }

  async updateSLAStatus(
    slaId: string,
    status: "active" | "resolved" | "breached",
    resolutionTime?: number,
  ): Promise<void> {
    const slaDoc = this.slaDocuments.get(slaId);
    if (!slaDoc) {
      logger.warn(` [BusinessLogic] SLA not found: ${slaId}`);
      return;
    }

    const previousStatus = slaDoc.status;
    slaDoc.status = status;
    slaDoc.updated_at = new Date();

    if (status === "resolved" && resolutionTime) {
      slaDoc.resolution_time_hours = resolutionTime;
    }

    if (status === "breached" && !slaDoc.breached) {
      slaDoc.breached = true;
      slaDoc.breach_time = new Date();
      logger.warn(
        `🚨 [BusinessLogic] SLA BREACHED: ${slaDoc.ticket_number} (${slaDoc.sla_target_hours}h target)`,
      );
      this.emit("slaBreach", { slaDoc });
    }

    logger.info(
      ` [BusinessLogic] SLA status updated: ${slaDoc.ticket_number} ${previousStatus} → ${status}`,
    );
    this.emit("slaUpdated", { slaDoc, previousStatus });
  }

  private async loadExistingSLAs(): Promise<void> {
    // Placeholder for loading existing SLAs from database
    logger.debug(" [BusinessLogic] Loading existing SLA documents...");
  }

  private async performSLACheck(): Promise<void> {
    if (!this.isRunning) return;

    logger.debug(" [BusinessLogic] Performing SLA compliance check...");

    const now = new Date();
    let breachCount = 0;

    for (const [slaId, slaDoc] of this.slaDocuments) {
      if (slaDoc.status !== "active") continue;

      const elapsedHours =
        (now.getTime() - slaDoc.created_at.getTime()) / (1000 * 60 * 60);
      const businessHours = this.calculateBusinessHours(slaDoc.created_at, now);

      slaDoc.calendar_hours_elapsed = elapsedHours;
      slaDoc.business_hours_elapsed = businessHours;
      slaDoc.remaining_time_hours = Math.max(
        0,
        slaDoc.sla_target_hours - businessHours,
      );

      if (businessHours >= slaDoc.sla_target_hours && !slaDoc.breached) {
        await this.updateSLAStatus(slaId, "breached");
        breachCount++;
      }
    }

    if (breachCount > 0) {
      logger.warn(
        `🚨 [BusinessLogic] SLA check completed: ${breachCount} new breaches detected`,
      );
    } else {
      logger.debug(" [BusinessLogic] SLA check completed: No new breaches");
    }
  }

  private calculateBusinessHours(start: Date, end: Date): number {
    // Simplified business hours calculation
    let businessHours = 0;
    let current = new Date(start);

    while (current < end) {
      const dayOfWeek = current.getDay();
      const hour = current.getHours();

      if (
        this.config.business_hours.days.includes(dayOfWeek) &&
        hour >= this.config.business_hours.start &&
        hour < this.config.business_hours.end
      ) {
        businessHours += 1;
      }

      current.setHours(current.getHours() + 1);
    }

    return businessHours;
  }

  async getSLAMetrics(): Promise<SLAMetrics> {
    const allSLAs = Array.from(this.slaDocuments.values());
    const breachedSLAs = allSLAs.filter((s) => s.breached);
    const resolvedSLAs = allSLAs.filter((s) => s.status === "resolved");

    const priorityMetrics: SLAMetrics["by_priority"] = {};

    for (const priority of Object.keys(this.config.priorities)) {
      const prioritySLAs = allSLAs.filter((s) => s.priority === priority);
      const priorityBreached = prioritySLAs.filter((s) => s.breached);
      const priorityResolved = prioritySLAs.filter(
        (s) => s.status === "resolved",
      );

      priorityMetrics[priority] = {
        total: prioritySLAs.length,
        breached: priorityBreached.length,
        resolved: priorityResolved.length,
        breach_rate:
          prioritySLAs.length > 0
            ? (priorityBreached.length / prioritySLAs.length) * 100
            : 0,
      };
    }

    const totalResolutionHours = resolvedSLAs.reduce(
      (sum, sla) => sum + (sla.resolution_time_hours || 0),
      0,
    );

    return {
      total_tickets: allSLAs.length,
      breached_tickets: breachedSLAs.length,
      resolved_within_sla: resolvedSLAs.filter((s) => !s.breached).length,
      average_resolution_hours:
        resolvedSLAs.length > 0
          ? totalResolutionHours / resolvedSLAs.length
          : 0,
      breach_percentage:
        allSLAs.length > 0 ? (breachedSLAs.length / allSLAs.length) * 100 : 0,
      by_priority: priorityMetrics,
    };
  }

  getSLAForTicket(ticketId: string): SLADocument | null {
    for (const slaDoc of this.slaDocuments.values()) {
      if (slaDoc.ticket_sys_id === ticketId) {
        return slaDoc;
      }
    }
    return null;
  }
}

// ==================== BUSINESS RULES ENGINE ====================

class BusinessRulesEngine extends EventEmitter {
  private rules: Map<string, BusinessRule> = new Map();
  private isEnabled = true;

  constructor(rules: BusinessRule[] = []) {
    super();
    rules.forEach((rule) => this.rules.set(rule.id, rule));
  }

  async evaluateRules(
    ticket: TicketData,
    event: "created" | "updated" | "assigned",
  ): Promise<void> {
    if (!this.isEnabled) return;

    const applicableRules = Array.from(this.rules.values())
      .filter((rule) => rule.enabled)
      .sort((a, b) => a.priority - b.priority);

    logger.debug(
      ` [BusinessLogic] Evaluating ${applicableRules.length} business rules for ticket ${ticket.number}`,
    );

    for (const rule of applicableRules) {
      try {
        const matches = await this.evaluateConditions(rule.conditions, ticket);

        if (matches) {
          logger.info(
            ` [BusinessLogic] Rule matched: ${rule.name} for ticket ${ticket.number}`,
          );
          await this.executeActions(rule.actions, ticket);
          this.emit("ruleExecuted", { rule, ticket, event });
        }
      } catch (error) {
        logger.error(
          ` [BusinessLogic] Rule execution failed: ${rule.name}`,
          error,
        );
        this.emit("ruleError", { rule, ticket, error });
      }
    }
  }

  private async evaluateConditions(
    conditions: BusinessCondition[],
    ticket: TicketData,
  ): Promise<boolean> {
    for (const condition of conditions) {
      const fieldValue = this.getFieldValue(ticket, condition.field);
      const conditionMet = this.evaluateCondition(
        fieldValue,
        condition.operator,
        condition.value,
      );

      if (!conditionMet) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(
    fieldValue: any,
    operator: BusinessCondition["operator"],
    expectedValue: any,
  ): boolean {
    switch (operator) {
      case "equals":
        return fieldValue === expectedValue;
      case "not_equals":
        return fieldValue !== expectedValue;
      case "contains":
        return String(fieldValue)
          .toLowerCase()
          .includes(String(expectedValue).toLowerCase());
      case "not_contains":
        return !String(fieldValue)
          .toLowerCase()
          .includes(String(expectedValue).toLowerCase());
      case "greater_than":
        return Number(fieldValue) > Number(expectedValue);
      case "less_than":
        return Number(fieldValue) < Number(expectedValue);
      case "in":
        return (
          Array.isArray(expectedValue) && expectedValue.includes(fieldValue)
        );
      case "not_in":
        return (
          Array.isArray(expectedValue) && !expectedValue.includes(fieldValue)
        );
      default:
        return false;
    }
  }

  private getFieldValue(ticket: TicketData, field: string): any {
    return field.split(".").reduce((obj, key) => obj?.[key], ticket);
  }

  private async executeActions(
    actions: BusinessAction[],
    ticket: TicketData,
  ): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(action, ticket);
      } catch (error) {
        logger.error(` [BusinessLogic] Action execution failed:`, error);
      }
    }
  }

  private async executeAction(
    action: BusinessAction,
    ticket: TicketData,
  ): Promise<void> {
    switch (action.type) {
      case "set_field":
        logger.info(
          ` [BusinessLogic] Setting field ${action.parameters.field} = ${action.parameters.value} for ticket ${ticket.number}`,
        );
        // Would integrate with data service to update ticket
        break;
      case "send_notification":
        logger.info(
          `📧 [BusinessLogic] Sending notification to ${action.parameters.recipient} for ticket ${ticket.number}`,
        );
        // Would integrate with notification service
        break;
      case "create_task":
        logger.info(
          `📋 [BusinessLogic] Creating task for ticket ${ticket.number}`,
        );
        // Would integrate with task service
        break;
      case "escalate":
        logger.info(
          `⬆️ [BusinessLogic] Escalating ticket ${ticket.number} to ${action.parameters.level}`,
        );
        // Would integrate with escalation logic
        break;
      case "assign":
        logger.info(
          ` [BusinessLogic] Assigning ticket ${ticket.number} to ${action.parameters.assignee}`,
        );
        // Would integrate with assignment service
        break;
    }
  }

  addRule(rule: BusinessRule): void {
    this.rules.set(rule.id, rule);
    logger.info(` [BusinessLogic] Business rule added: ${rule.name}`);
  }

  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      logger.info(`➖ [BusinessLogic] Business rule removed: ${ruleId}`);
    }
    return removed;
  }

  enableRules(): void {
    this.isEnabled = true;
    logger.info(" [BusinessLogic] Business rules engine enabled");
  }

  disableRules(): void {
    this.isEnabled = false;
    logger.info(" [BusinessLogic] Business rules engine disabled");
  }
}

// ==================== CONSOLIDATED BUSINESS LOGIC SERVICE ====================

export class ConsolidatedBusinessLogicService extends EventEmitter {
  private static instance: ConsolidatedBusinessLogicService;
  private dataCore: TicketDataCore;
  private queryService: TicketQueryService;
  private syncService: TicketSyncService;
  private slaManager: SLAManager;
  private rulesEngine: BusinessRulesEngine;
  private serviceNowClient: ServiceNowAuthClient;
  private config: BusinessLogicConfig;
  private isInitialized = false;

  private constructor(
    serviceNowClient: ServiceNowAuthClient,
    config: BusinessLogicConfig,
  ) {
    super();
    this.serviceNowClient = serviceNowClient;
    this.config = config;

    // Initialize modular components
    this.dataCore = new TicketDataCore();
    this.queryService = new TicketQueryService(serviceNowClient);
    this.syncService = new TicketSyncService(serviceNowClient);
    this.slaManager = new SLAManager(config.sla);
    this.rulesEngine = new BusinessRulesEngine(config.rules);

    this.setupEventListeners();
  }

  static getInstance(
    serviceNowClient?: ServiceNowAuthClient,
    config?: BusinessLogicConfig,
  ): ConsolidatedBusinessLogicService {
    if (
      !ConsolidatedBusinessLogicService.instance &&
      serviceNowClient &&
      config
    ) {
      ConsolidatedBusinessLogicService.instance =
        new ConsolidatedBusinessLogicService(serviceNowClient, config);
    }
    return ConsolidatedBusinessLogicService.instance;
  }

  private setupEventListeners(): void {
    // SLA events
    this.slaManager.on("slaBreach", (event) => {
      logger.warn(
        `🚨 [BusinessLogic] SLA breach detected: ${event.slaDoc.ticket_number}`,
      );
      this.emit("slaBreach", event);
    });

    // Business rules events
    this.rulesEngine.on("ruleExecuted", (event) => {
      logger.info(
        ` [BusinessLogic] Business rule executed: ${event.rule.name}`,
      );
      this.emit("ruleExecuted", event);
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.info(
        " [BusinessLogic] Initializing Consolidated Business Logic Service...",
      );

      // Initialize all components
      await this.dataCore.initialize();
      await this.slaManager.initialize();

      // Start SLA monitoring
      await this.slaManager.start();

      this.isInitialized = true;
      logger.info(
        " [BusinessLogic] Consolidated Business Logic Service initialized",
      );
      this.emit("initialized");
    } catch (error) {
      logger.error(" [BusinessLogic] Initialization failed:", error);
      throw error;
    }
  }

  // ==================== TICKET OPERATIONS ====================

  async getTicketDetails(
    sysId: string,
    table: string,
  ): Promise<TicketData | null> {
    return this.queryService.getTicketDetails(sysId, table);
  }

  async hybridQuery(params: HybridQueryParams): Promise<HybridQueryResult> {
    return this.queryService.hybridQuery(params);
  }

  async syncCurrentMonthTickets(): Promise<TicketSyncResult> {
    return this.syncService.syncCurrentMonthTickets();
  }

  getStatusLabel(state: string): string {
    return this.dataCore.getStatusLabel(state);
  }

  getPriorityLabel(priority: string): string {
    return this.dataCore.getPriorityLabel(priority);
  }

  async getStats(): Promise<TicketCollectionStats> {
    return this.dataCore.getStats();
  }

  // ==================== SLA OPERATIONS ====================

  async createSLAForTicket(ticket: TicketData): Promise<SLADocument> {
    const slaDoc = await this.slaManager.createSLAForTicket(ticket);

    // Apply business rules for new ticket
    await this.rulesEngine.evaluateRules(ticket, "created");

    return slaDoc;
  }

  async updateTicketSLA(
    ticketId: string,
    status: "active" | "resolved" | "breached",
    resolutionTime?: number,
  ): Promise<void> {
    const slaDoc = this.slaManager.getSLAForTicket(ticketId);
    if (slaDoc) {
      await this.slaManager.updateSLAStatus(
        slaDoc.sys_id,
        status,
        resolutionTime,
      );
    }
  }

  async getSLAMetrics(): Promise<SLAMetrics> {
    return this.slaManager.getSLAMetrics();
  }

  getSLAForTicket(ticketId: string): SLADocument | null {
    return this.slaManager.getSLAForTicket(ticketId);
  }

  // ==================== BUSINESS RULES ====================

  async processTicketEvent(
    ticket: TicketData,
    event: "created" | "updated" | "assigned",
  ): Promise<void> {
    await this.rulesEngine.evaluateRules(ticket, event);

    // Update SLA if ticket is updated
    if (event === "updated" && ["6", "7"].includes(ticket.state)) {
      const resolutionTime = this.calculateResolutionTime(ticket);
      await this.updateTicketSLA(ticket.sys_id, "resolved", resolutionTime);
    }
  }

  private calculateResolutionTime(ticket: TicketData): number {
    // Calculate resolution time based on created and updated timestamps
    const created = new Date(ticket.sys_created_on);
    const updated = new Date(ticket.sys_updated_on);
    return (updated.getTime() - created.getTime()) / (1000 * 60 * 60); // hours
  }

  addBusinessRule(rule: BusinessRule): void {
    this.rulesEngine.addRule(rule);
  }

  removeBusinessRule(ruleId: string): boolean {
    return this.rulesEngine.removeRule(ruleId);
  }

  enableBusinessRules(): void {
    this.rulesEngine.enableRules();
  }

  disableBusinessRules(): void {
    this.rulesEngine.disableRules();
  }

  // ==================== HEALTH AND STATS ====================

  async getComprehensiveStats(): Promise<any> {
    try {
      const [ticketStats, slaMetrics] = await Promise.all([
        this.getStats(),
        this.getSLAMetrics(),
      ]);

      return {
        tickets: ticketStats,
        sla: slaMetrics,
        business_logic: {
          rules_count: this.rulesEngine["rules"].size,
          rules_enabled: this.rulesEngine["isEnabled"],
          sla_manager_running: this.slaManager["isRunning"],
        },
        is_initialized: this.isInitialized,
      };
    } catch (error) {
      logger.error(
        " [BusinessLogic] Failed to get comprehensive stats:",
        error,
      );
      return {};
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) return false;

      // Check if all components are functioning
      const slaRunning = this.slaManager["isRunning"];
      const dataStatsAvailable = await this.dataCore.getStats();

      return slaRunning && !!dataStatsAvailable;
    } catch (error) {
      logger.error(" [BusinessLogic] Health check failed:", error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.slaManager.stop();
      this.rulesEngine.disableRules();

      if (this.dataCore) {
        // Cleanup data core if needed
      }

      this.isInitialized = false;
      logger.info("🧹 [BusinessLogic] Cleanup completed");
    } catch (error) {
      logger.error(" [BusinessLogic] Cleanup failed:", error);
      throw error;
    }
  }
}

// Export factory function for dependency injection
export const createBusinessLogicService = (
  serviceNowClient: ServiceNowAuthClient,
  config: BusinessLogicConfig,
) => {
  return ConsolidatedBusinessLogicService.getInstance(serviceNowClient, config);
};

// Export singleton for global use (will be initialized by main service)
export const businessLogicService =
  ConsolidatedBusinessLogicService.getInstance();
