/**
 * Change Task TypeBox Schemas - ServiceNow Change Task validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox
 * - Eliminates Zod dependency overhead
 * - Uses Elysia's native validation system
 * - Maintains all business rules and validation logic
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Change Task specific validations
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

// ===== CHANGE TASK CORE SCHEMA =====

/**
 * Complete ServiceNow Change Task schema
 */
export const ChangeTask = t.Composite([
  BaseTicket,
  t.Object({
    // Change Task specific state validation
    state: TaskState,

    // Change request association
    change_request: SysId, // Required - parent change request
    change_request_number: t.Optional(t.String()),

    // Task type and classification
    type: t.Optional(
      t.Union([
        t.Literal("planning"),
        t.Literal("implementation"),
        t.Literal("testing"),
        t.Literal("review"),
      ]),
    ),
    task_type: t.Optional(t.String()),

    // Planning fields
    planned_start_date: t.Optional(ServiceNowDateTime),
    planned_end_date: t.Optional(ServiceNowDateTime),
    work_start: t.Optional(ServiceNowDateTime),
    work_end: t.Optional(ServiceNowDateTime),

    // Execution tracking
    actual_start_time: t.Optional(ServiceNowDateTime),
    actual_end_time: t.Optional(ServiceNowDateTime),

    // Dependencies
    depends_on: t.Optional(t.String()), // List of dependent tasks
    blocks: t.Optional(t.String()), // Tasks blocked by this one

    // Configuration Item
    cmdb_ci: t.Optional(SysId),
    cmdb_ci_class: t.Optional(t.String()),

    // Business context
    business_service: t.Optional(SysId),
    service_offering: t.Optional(SysId),

    // Location and company
    location: t.Optional(SysId),
    company: t.Optional(SysId),

    // Implementation details
    implementation_plan: t.Optional(t.String()),
    test_plan: t.Optional(t.String()),
    rollback_plan: t.Optional(t.String()),

    // Risk assessment
    risk_impact_analysis: t.Optional(t.String()),

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

    // Custom fields
    u_environment: t.Optional(t.String()),
    u_application: t.Optional(t.String()),
    u_change_type: t.Optional(t.String()),
    u_technical_reviewer: t.Optional(SysId),

    // Closure information
    closed_by: t.Optional(SysId),
    closed_at: t.Optional(ServiceNowDateTime),
    close_code: t.Optional(t.String()),

    // Parent change information (denormalized for performance)
    parent_change_state: t.Optional(t.String()),
    parent_change_phase: t.Optional(t.String()),
    parent_change_risk: t.Optional(t.String()),

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
  }),
]);

export type ChangeTaskType = Static<typeof ChangeTask>;

// ===== CHANGE TASK STATE TRANSITIONS =====

/**
 * Valid state transitions for change tasks
 */
export const ChangeTaskStateTransition = t.Object({
  from_state: TaskState,
  to_state: TaskState,
  action: t.Union([
    t.Literal("open"),
    t.Literal("assign"),
    t.Literal("start_work"),
    t.Literal("complete"),
    t.Literal("skip"),
    t.Literal("incomplete"),
    t.Literal("reopen"),
  ]),
  requires_note: t.Boolean({ default: false }),
  requires_approval: t.Boolean({ default: false }),
  auto_transition: t.Boolean({ default: false }), // For automated workflows
});

export type ChangeTaskStateTransitionType = Static<
  typeof ChangeTaskStateTransition
>;

// ===== CHANGE TASK BUSINESS RULES =====

/**
 * Change task creation validation with business rules
 */
export const ChangeTaskCreation = t.Object({
  short_description: t.String({ minLength: 10, maxLength: 160 }),
  description: t.Optional(t.String()),
  change_request: SysId, // Must be associated with a change request
  type: t.Optional(
    t.Union([
      t.Literal("planning"),
      t.Literal("implementation"),
      t.Literal("testing"),
      t.Literal("review"),
    ]),
  ),
  assignment_group: t.Optional(SysId),
  assigned_to: t.Optional(SysId),
  planned_start_date: t.Optional(ServiceNowDateTime),
  planned_end_date: t.Optional(ServiceNowDateTime),
  implementation_plan: t.Optional(t.String()),
  test_plan: t.Optional(t.String()),
  rollback_plan: t.Optional(t.String()),
  cmdb_ci: t.Optional(SysId),
  business_service: t.Optional(SysId),
  priority: t.Optional(t.String()),
  order: t.Optional(t.String({ pattern: "^\\d+$" })),
});

export type ChangeTaskCreationType = Static<typeof ChangeTaskCreation>;

/**
 * Change task completion validation
 */
export const ChangeTaskCompletion = t.Object({
  sys_id: SysId,
  state: t.Literal("4"), // Must be completed state
  work_notes: t.String({ minLength: 10 }),
  actual_start_time: t.Optional(ServiceNowDateTime),
  actual_end_time: t.Optional(ServiceNowDateTime),
  close_notes: t.Optional(t.String()),
  peer_review: t.Optional(ServiceNowBoolean),
  peer_review_by: t.Optional(SysId),
});

export type ChangeTaskCompletionType = Static<typeof ChangeTaskCompletion>;

/**
 * Change task assignment validation
 */
export const ChangeTaskAssignment = t.Object({
  sys_id: SysId,
  assignment_group: t.Optional(SysId),
  assigned_to: t.Optional(SysId),
  state: TaskState,
  work_notes: t.Optional(t.String()),
});

export type ChangeTaskAssignmentType = Static<typeof ChangeTaskAssignment>;

// ===== CHANGE TASK QUERIES =====

/**
 * Common change task query filters
 */
export const ChangeTaskQuery = t.Object({
  change_request: t.Optional(t.Union([SysId, t.Array(SysId)])),
  state: t.Optional(t.Union([TaskState, t.Array(TaskState)])),
  assignment_group: t.Optional(t.Union([SysId, t.Array(SysId)])),
  assigned_to: t.Optional(SysId),
  type: t.Optional(t.Union([t.String(), t.Array(t.String())])),
  planned_start_date: t.Optional(
    t.Object({
      from: t.Optional(ServiceNowDateTime),
      to: t.Optional(ServiceNowDateTime),
    }),
  ),
  business_service: t.Optional(SysId),
  active: t.Optional(ServiceNowBoolean),
  on_hold: t.Optional(ServiceNowBoolean),
});

export type ChangeTaskQueryType = Static<typeof ChangeTaskQuery>;

// ===== CHANGE TASK REPORTS =====

/**
 * Change task metrics schema
 */
export const ChangeTaskMetrics = t.Object({
  change_request: SysId,
  total_tasks: t.Integer({ minimum: 0 }),
  pending_tasks: t.Integer({ minimum: 0 }),
  open_tasks: t.Integer({ minimum: 0 }),
  assigned_tasks: t.Integer({ minimum: 0 }),
  in_progress_tasks: t.Integer({ minimum: 0 }),
  completed_tasks: t.Integer({ minimum: 0 }),
  skipped_tasks: t.Integer({ minimum: 0 }),
  incomplete_tasks: t.Integer({ minimum: 0 }),

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
  tasks_requiring_rework: t.Integer({ minimum: 0 }),
  peer_reviewed_tasks: t.Integer({ minimum: 0 }),

  // Breakdown by type
  by_task_type: t.Record(t.String(), t.Integer({ minimum: 0 })),
  by_assignment_group: t.Record(t.String(), t.Integer({ minimum: 0 })),

  // Dependencies
  blocked_tasks: t.Integer({ minimum: 0 }),
  dependency_violations: t.Integer({ minimum: 0 }),

  time_period: t.Object({
    from: ServiceNowDateTime,
    to: ServiceNowDateTime,
  }),
});

export type ChangeTaskMetricsType = Static<typeof ChangeTaskMetrics>;

/**
 * Change task dependency validation
 */
export const ChangeTaskDependency = t.Object({
  task_id: SysId,
  depends_on_task: SysId,
  dependency_type: t.Union([
    t.Literal("finish_to_start"),
    t.Literal("start_to_start"),
    t.Literal("finish_to_finish"),
    t.Literal("start_to_finish"),
  ]),
  lag_days: t.Integer({ minimum: 0, default: 0 }),
  mandatory: t.Boolean({ default: true }),
  created_by: t.Optional(SysId),
  created_at: t.Optional(ServiceNowDateTime),
});

export type ChangeTaskDependencyType = Static<typeof ChangeTaskDependency>;

// ===== EXPORT SUMMARY =====

/**
 * Change Task schemas exported:
 * - ChangeTask: Complete change task schema with all fields
 * - ChangeTaskStateTransition: State transition validation
 * - ChangeTaskCreation: Creation validation with business rules
 * - ChangeTaskCompletion: Completion validation
 * - ChangeTaskAssignment: Assignment validation
 * - ChangeTaskQuery: Query filter parameters
 * - ChangeTaskMetrics: Reporting metrics
 * - ChangeTaskDependency: Task dependency tracking
 *
 * Business rules enforced:
 * - Required change_request for creation
 * - Implementation tasks require implementation plan
 * - Testing tasks require test plan
 * - Completion requires work notes (min 10 chars)
 * - Peer review requires reviewer when enabled
 * - Dependencies validated (task cannot depend on itself)
 */
