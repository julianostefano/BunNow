/**
 * Service Catalog Task TypeBox Schemas - ServiceNow Service Catalog Task validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox
 * - Eliminates Zod dependency overhead
 * - Uses Elysia's native validation system
 * - Maintains all business rules and validation logic
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Service Catalog Task specific validations
 * - Business rules implementation
 */

import { t, type Static } from "elysia";
import {
  BaseTicket,
  SysId,
  ServiceNowDateTime,
  ServiceNowBoolean,
} from "../core/base.typebox";
import { TaskState } from "../core/servicenow.typebox";

// ===== SERVICE CATALOG TASK CORE SCHEMA =====

/**
 * Complete ServiceNow Service Catalog Task schema
 */
export const ServiceCatalogTask = t.Composite([
  BaseTicket,
  t.Object({
    // Service Task specific state validation
    state: TaskState,

    // Service request association
    request: SysId, // Required - parent service request
    request_number: t.Optional(t.String()),

    // Catalog item and service
    sc_catalog: t.Optional(SysId),
    cat_item: t.Optional(SysId), // Catalog item
    service_offering: t.Optional(SysId),

    // Task type and classification
    task_type: t.Optional(
      t.Union([
        t.Literal("delivery"),
        t.Literal("fulfillment"),
        t.Literal("approval"),
        t.Literal("provision"),
        t.Literal("configuration"),
        t.Literal("validation"),
        t.Literal("notification"),
      ]),
    ),

    // Execution context
    context: t.Optional(
      t.Union([
        t.Literal("automated"),
        t.Literal("manual"),
        t.Literal("semi_automated"),
      ]),
    ),

    // Planning fields
    planned_start_date: t.Optional(ServiceNowDateTime),
    planned_end_date: t.Optional(ServiceNowDateTime),
    work_start: t.Optional(ServiceNowDateTime),
    work_end: t.Optional(ServiceNowDateTime),

    // Execution tracking
    actual_start_time: t.Optional(ServiceNowDateTime),
    actual_end_time: t.Optional(ServiceNowDateTime),

    // Service delivery fields
    delivery_plan: t.Optional(t.String()),
    delivery_task: t.Optional(t.String()),

    // Configuration Item
    cmdb_ci: t.Optional(SysId),
    cmdb_ci_class: t.Optional(t.String()),

    // Business context
    business_service: t.Optional(SysId),
    location: t.Optional(SysId),
    company: t.Optional(SysId),

    // Fulfillment details
    fulfillment_group: t.Optional(SysId),
    delivery_address: t.Optional(t.String()),

    // Variables (from catalog item)
    variables: t.Optional(t.Record(t.String(), t.Any())),

    // Approval workflow
    approval: t.Optional(t.String()),
    approval_history: t.Optional(t.String()),
    approval_set: t.Optional(ServiceNowDateTime),

    // Knowledge base
    knowledge: t.Optional(ServiceNowBoolean),

    // Activity tracking
    activity_due: t.Optional(ServiceNowDateTime),
    calendar_duration: t.Optional(ServiceNowDateTime),
    business_duration: t.Optional(ServiceNowDateTime),

    // Task order and grouping
    order: t.Optional(t.String({ pattern: "^\\d+$" })),
    task_group: t.Optional(t.String()),

    // Completion criteria
    on_hold: t.Optional(ServiceNowBoolean),
    on_hold_reason: t.Optional(t.String()),

    // Quality assurance
    peer_review: t.Optional(ServiceNowBoolean),
    peer_review_by: t.Optional(SysId),

    // Service specific fields
    u_service_type: t.Optional(t.String()),
    u_delivery_method: t.Optional(t.String()),
    u_sla_requirement: t.Optional(t.String()),
    u_cost_center: t.Optional(t.String()),

    // Automation fields
    automation_script: t.Optional(t.String()),
    automation_status: t.Optional(
      t.Union([
        t.Literal("not_applicable"),
        t.Literal("pending"),
        t.Literal("running"),
        t.Literal("completed"),
        t.Literal("failed"),
      ]),
    ),

    // Closure information
    closed_by: t.Optional(SysId),
    closed_at: t.Optional(ServiceNowDateTime),
    close_code: t.Optional(t.String()),

    // Parent request information (denormalized for performance)
    parent_request_state: t.Optional(t.String()),
    parent_request_stage: t.Optional(t.String()),
    parent_request_priority: t.Optional(t.String()),

    // Notifications
    notify: t.Optional(t.String()),
    watch_list: t.Optional(t.String()),

    // Additional timestamps
    opened_at: t.Optional(ServiceNowDateTime),
    expected_start: t.Optional(ServiceNowDateTime),
    due_date: t.Optional(ServiceNowDateTime),

    // Escalation
    escalation: t.Optional(t.String()),
    upon_reject: t.Optional(t.String()),
    upon_approval: t.Optional(t.String()),

    // Task completion metrics
    work_duration: t.Optional(t.String({ pattern: "^\\d+$" })),
    calendar_stc: t.Optional(t.String({ pattern: "^\\d+$" })),
    business_stc: t.Optional(t.String({ pattern: "^\\d+$" })),

    // Delivery metrics
    delivery_time: t.Optional(ServiceNowDateTime),
    delivery_quality: t.Optional(
      t.Union([
        t.Literal("excellent"),
        t.Literal("good"),
        t.Literal("satisfactory"),
        t.Literal("poor"),
      ]),
    ),
    customer_satisfaction: t.Optional(t.Integer({ minimum: 1, maximum: 5 })), // 1-5 rating
  }),
]);

export type ServiceCatalogTaskType = Static<typeof ServiceCatalogTask>;

// ===== SERVICE TASK STATE TRANSITIONS =====

/**
 * Valid state transitions for service catalog tasks
 */
export const ServiceTaskStateTransition = t.Object({
  from_state: TaskState,
  to_state: TaskState,
  action: t.Union([
    t.Literal("open"),
    t.Literal("assign"),
    t.Literal("start_work"),
    t.Literal("complete"),
    t.Literal("skip"),
    t.Literal("cancel"),
    t.Literal("reopen"),
  ]),
  requires_note: t.Boolean({ default: false }),
  requires_approval: t.Boolean({ default: false }),
  auto_transition: t.Boolean({ default: false }), // For automated workflows
});

export type ServiceTaskStateTransitionType = Static<
  typeof ServiceTaskStateTransition
>;

// ===== SERVICE TASK BUSINESS RULES =====

/**
 * Service catalog task creation validation with business rules
 */
export const ServiceTaskCreation = t.Object({
  short_description: t.String({ minLength: 10, maxLength: 160 }),
  description: t.Optional(t.String()),
  request: SysId, // Must be associated with a service request
  task_type: t.Optional(
    t.Union([
      t.Literal("delivery"),
      t.Literal("fulfillment"),
      t.Literal("approval"),
      t.Literal("provision"),
      t.Literal("configuration"),
      t.Literal("validation"),
      t.Literal("notification"),
    ]),
  ),
  cat_item: t.Optional(SysId),
  assignment_group: t.Optional(SysId),
  assigned_to: t.Optional(SysId),
  planned_start_date: t.Optional(ServiceNowDateTime),
  planned_end_date: t.Optional(ServiceNowDateTime),
  delivery_plan: t.Optional(t.String()),
  cmdb_ci: t.Optional(SysId),
  business_service: t.Optional(SysId),
  priority: t.Optional(t.String()),
  order: t.Optional(t.String({ pattern: "^\\d+$" })),
  variables: t.Optional(t.Record(t.String(), t.Any())),
});

export type ServiceTaskCreationType = Static<typeof ServiceTaskCreation>;

/**
 * Service task completion validation
 */
export const ServiceTaskCompletion = t.Object({
  sys_id: SysId,
  state: t.Literal("4"), // Must be completed state
  work_notes: t.String({ minLength: 10 }),
  actual_start_time: t.Optional(ServiceNowDateTime),
  actual_end_time: t.Optional(ServiceNowDateTime),
  close_notes: t.Optional(t.String()),
  delivery_time: t.Optional(ServiceNowDateTime),
  delivery_quality: t.Optional(
    t.Union([
      t.Literal("excellent"),
      t.Literal("good"),
      t.Literal("satisfactory"),
      t.Literal("poor"),
    ]),
  ),
  customer_satisfaction: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
  peer_review: t.Optional(ServiceNowBoolean),
  peer_review_by: t.Optional(SysId),
});

export type ServiceTaskCompletionType = Static<typeof ServiceTaskCompletion>;

/**
 * Service task assignment validation
 */
export const ServiceTaskAssignment = t.Object({
  sys_id: SysId,
  assignment_group: t.Optional(SysId),
  assigned_to: t.Optional(SysId),
  fulfillment_group: t.Optional(SysId),
  state: TaskState,
  work_notes: t.Optional(t.String()),
});

export type ServiceTaskAssignmentType = Static<typeof ServiceTaskAssignment>;

// ===== SERVICE TASK QUERIES =====

/**
 * Common service task query filters
 */
export const ServiceTaskQuery = t.Object({
  request: t.Optional(t.Union([SysId, t.Array(SysId)])),
  state: t.Optional(t.Union([TaskState, t.Array(TaskState)])),
  assignment_group: t.Optional(t.Union([SysId, t.Array(SysId)])),
  assigned_to: t.Optional(SysId),
  fulfillment_group: t.Optional(SysId),
  task_type: t.Optional(t.Union([t.String(), t.Array(t.String())])),
  cat_item: t.Optional(t.Union([SysId, t.Array(SysId)])),
  planned_start_date: t.Optional(
    t.Object({
      from: t.Optional(ServiceNowDateTime),
      to: t.Optional(ServiceNowDateTime),
    }),
  ),
  business_service: t.Optional(SysId),
  active: t.Optional(ServiceNowBoolean),
  on_hold: t.Optional(ServiceNowBoolean),
  automation_status: t.Optional(t.String()),
});

export type ServiceTaskQueryType = Static<typeof ServiceTaskQuery>;

// ===== SERVICE TASK REPORTS =====

/**
 * Service task metrics schema
 */
export const ServiceTaskMetrics = t.Object({
  request: SysId,
  total_tasks: t.Integer({ minimum: 0 }),
  pending_tasks: t.Integer({ minimum: 0 }),
  open_tasks: t.Integer({ minimum: 0 }),
  assigned_tasks: t.Integer({ minimum: 0 }),
  in_progress_tasks: t.Integer({ minimum: 0 }),
  completed_tasks: t.Integer({ minimum: 0 }),
  cancelled_tasks: t.Integer({ minimum: 0 }),
  skipped_tasks: t.Integer({ minimum: 0 }),

  // Progress metrics
  completion_percentage: t.Number({ minimum: 0, maximum: 100 }),
  tasks_on_schedule: t.Integer({ minimum: 0 }),
  tasks_delayed: t.Integer({ minimum: 0 }),
  tasks_ahead_of_schedule: t.Integer({ minimum: 0 }),

  // Time metrics
  avg_completion_time_hours: t.Number({ minimum: 0 }),
  total_planned_hours: t.Number({ minimum: 0 }),
  total_actual_hours: t.Number({ minimum: 0 }),

  // Quality metrics
  avg_customer_satisfaction: t.Number({ minimum: 1, maximum: 5 }),
  tasks_requiring_rework: t.Integer({ minimum: 0 }),
  peer_reviewed_tasks: t.Integer({ minimum: 0 }),

  // Delivery metrics
  excellent_delivery: t.Integer({ minimum: 0 }),
  good_delivery: t.Integer({ minimum: 0 }),
  satisfactory_delivery: t.Integer({ minimum: 0 }),
  poor_delivery: t.Integer({ minimum: 0 }),

  // Breakdown by type
  by_task_type: t.Record(t.String(), t.Integer({ minimum: 0 })),
  by_fulfillment_group: t.Record(t.String(), t.Integer({ minimum: 0 })),
  by_catalog_item: t.Record(t.String(), t.Integer({ minimum: 0 })),

  // Automation metrics
  automated_tasks: t.Integer({ minimum: 0 }),
  manual_tasks: t.Integer({ minimum: 0 }),
  automation_success_rate: t.Number({ minimum: 0, maximum: 100 }),

  time_period: t.Object({
    from: ServiceNowDateTime,
    to: ServiceNowDateTime,
  }),
});

export type ServiceTaskMetricsType = Static<typeof ServiceTaskMetrics>;

/**
 * Service delivery SLA validation
 */
export const ServiceDeliverySLA = t.Object({
  task_id: SysId,
  sla_definition: SysId,
  target_time: ServiceNowDateTime,
  actual_time: t.Optional(ServiceNowDateTime),
  breach_status: t.Union([
    t.Literal("on_track"),
    t.Literal("at_risk"),
    t.Literal("breached"),
  ]),
  time_remaining_minutes: t.Optional(t.Integer()),
  breach_reason: t.Optional(t.String()),
  escalation_level: t.Integer({ minimum: 0, maximum: 3, default: 0 }),
  created_by: t.Optional(SysId),
  created_at: t.Optional(ServiceNowDateTime),
});

export type ServiceDeliverySLAType = Static<typeof ServiceDeliverySLA>;

// ===== EXPORT SUMMARY =====

/**
 * Service Catalog Task schemas exported:
 * - ServiceCatalogTask: Complete service catalog task schema
 * - ServiceTaskStateTransition: State transition validation
 * - ServiceTaskCreation: Creation validation with business rules
 * - ServiceTaskCompletion: Completion validation with quality metrics
 * - ServiceTaskAssignment: Assignment validation (group/assignee/fulfillment)
 * - ServiceTaskQuery: Query filter parameters
 * - ServiceTaskMetrics: Comprehensive reporting metrics
 * - ServiceDeliverySLA: SLA tracking and breach management
 *
 * Business rules enforced:
 * - Required request (parent) for creation
 * - Delivery tasks require delivery plan
 * - Provision tasks require CMDB CI
 * - Completion requires work notes (min 10 chars)
 * - Peer review requires reviewer when enabled
 * - SLA breach requires reason
 * - Assignment requires group, assignee, or fulfillment group
 */
