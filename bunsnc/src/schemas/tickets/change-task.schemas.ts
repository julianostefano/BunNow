/**
 * Change Task Schemas - ServiceNow Change Task validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Change Task specific validations
 * - Business rules implementation
 */

import { z } from "zod";
import {
  BaseTicketSchema,
  SysIdSchema,
  ServiceNowDateTimeSchema,
  ServiceNowBooleanSchema,
  optionalEmpty,
} from "../core/base.schemas";
import { ChangeTaskStateSchema } from "../core/servicenow.schemas";

// ===== CHANGE TASK CORE SCHEMA =====

/**
 * Complete ServiceNow Change Task schema
 */
export const ChangeTaskSchema = BaseTicketSchema.extend({
  // Change Task specific state validation
  state: ChangeTaskStateSchema,

  // Change request association
  change_request: SysIdSchema, // Required - parent change request
  change_request_number: z.string().optional(),

  // Task type and classification
  type: z.enum(["planning", "implementation", "testing", "review"]).optional(),
  task_type: z.string().optional(),

  // Planning fields
  planned_start_date: ServiceNowDateTimeSchema.optional(),
  planned_end_date: ServiceNowDateTimeSchema.optional(),
  work_start: ServiceNowDateTimeSchema.optional(),
  work_end: ServiceNowDateTimeSchema.optional(),

  // Execution tracking
  actual_start_time: ServiceNowDateTimeSchema.optional(),
  actual_end_time: ServiceNowDateTimeSchema.optional(),

  // Dependencies
  depends_on: z.string().optional(), // List of dependent tasks
  blocks: z.string().optional(), // Tasks blocked by this one

  // Configuration Item
  cmdb_ci: SysIdSchema.optional(),
  cmdb_ci_class: z.string().optional(),

  // Business context
  business_service: SysIdSchema.optional(),
  service_offering: SysIdSchema.optional(),

  // Location and company
  location: SysIdSchema.optional(),
  company: SysIdSchema.optional(),

  // Implementation details
  implementation_plan: z.string().optional(),
  test_plan: z.string().optional(),
  rollback_plan: z.string().optional(),

  // Risk assessment
  risk_impact_analysis: z.string().optional(),

  // Approval workflow
  approval: z.string().optional(),
  approval_history: z.string().optional(),
  approval_set: ServiceNowDateTimeSchema.optional(),

  // Knowledge base
  knowledge: ServiceNowBooleanSchema.optional(),

  // Activity tracking
  activity_due: ServiceNowDateTimeSchema.optional(),
  calendar_duration: ServiceNowDateTimeSchema.optional(),
  business_duration: ServiceNowDateTimeSchema.optional(),

  // Task order and grouping
  order: z
    .string()
    .transform((val) => parseInt(val) || 0)
    .optional(),
  task_group: z.string().optional(),

  // Completion criteria
  on_hold: ServiceNowBooleanSchema.optional(),
  on_hold_reason: z.string().optional(),

  // Quality assurance
  peer_review: ServiceNowBooleanSchema.optional(),
  peer_review_by: SysIdSchema.optional(),

  // Custom fields
  u_environment: z.string().optional(),
  u_application: z.string().optional(),
  u_change_type: z.string().optional(),
  u_technical_reviewer: SysIdSchema.optional(),

  // Closure information
  closed_by: SysIdSchema.optional(),
  closed_at: ServiceNowDateTimeSchema.optional(),
  close_code: z.string().optional(),

  // Parent change information (denormalized for performance)
  parent_change_state: z.string().optional(),
  parent_change_phase: z.string().optional(),
  parent_change_risk: z.string().optional(),

  // Notifications
  notify: z.string().optional(),
  watch_list: z.string().optional(),

  // Additional timestamps
  opened_at: ServiceNowDateTimeSchema.optional(),
  expected_start: ServiceNowDateTimeSchema.optional(),
  due_date: ServiceNowDateTimeSchema.optional(),

  // Escalation
  escalation: z.string().optional(),
  upon_reject: z.string().optional(),
  upon_approval: z.string().optional(),

  // Task completion metrics
  work_duration: z
    .string()
    .transform((val) => parseInt(val) || 0)
    .optional(),
  calendar_stc: z
    .string()
    .transform((val) => parseInt(val) || 0)
    .optional(),
  business_stc: z
    .string()
    .transform((val) => parseInt(val) || 0)
    .optional(),
});

// ===== CHANGE TASK STATE TRANSITIONS =====

/**
 * Valid state transitions for change tasks
 */
export const ChangeTaskStateTransitionsSchema = z
  .object({
    from_state: ChangeTaskStateSchema,
    to_state: ChangeTaskStateSchema,
    action: z.enum([
      "open",
      "assign",
      "start_work",
      "complete",
      "skip",
      "incomplete",
      "reopen",
    ]),
    requires_note: z.boolean().default(false),
    requires_approval: z.boolean().default(false),
    auto_transition: z.boolean().default(false), // For automated workflows
  })
  .refine(
    (data) => {
      // Business rules for state transitions
      const validTransitions = {
        "-5": ["1", "2"], // Pending -> Open, Assigned
        "1": ["2", "3", "4", "7", "8"], // Open -> Assigned, In Progress, Complete, Skipped, Incomplete
        "2": ["3", "4", "7", "8"], // Assigned -> In Progress, Complete, Skipped, Incomplete
        "3": ["4", "7", "8"], // In Progress -> Complete, Skipped, Incomplete
        "4": [], // Closed Complete (final state)
        "7": [], // Closed Skipped (final state)
        "8": ["1", "2", "3"], // Closed Incomplete -> can reopen
      };

      const allowedStates = validTransitions[data.from_state] || [];
      return allowedStates.includes(data.to_state);
    },
    {
      message: "Invalid change task state transition",
    },
  );

// ===== CHANGE TASK BUSINESS RULES =====

/**
 * Change task creation validation with business rules
 */
export const ChangeTaskCreationSchema = ChangeTaskSchema.pick({
  short_description: true,
  description: true,
  change_request: true,
  type: true,
  assignment_group: true,
  assigned_to: true,
  planned_start_date: true,
  planned_end_date: true,
  implementation_plan: true,
  test_plan: true,
  rollback_plan: true,
  cmdb_ci: true,
  business_service: true,
  priority: true,
  order: true,
})
  .extend({
    // Required fields for creation
    change_request: SysIdSchema, // Must be associated with a change request
    short_description: z
      .string()
      .min(10, "Task description must be at least 10 characters"),
  })
  .refine(
    (data) => {
      // Business rule: Implementation tasks require implementation plan
      if (data.type === "implementation" && !data.implementation_plan) {
        return false;
      }

      // Business rule: Testing tasks require test plan
      if (data.type === "testing" && !data.test_plan) {
        return false;
      }

      // Business rule: Planned dates should be logical
      if (data.planned_start_date && data.planned_end_date) {
        const startDate = new Date(data.planned_start_date);
        const endDate = new Date(data.planned_end_date);
        return startDate < endDate;
      }

      return true;
    },
    {
      message: "Change task creation validation failed",
    },
  );

/**
 * Change task completion validation
 */
export const ChangeTaskCompletionSchema = z
  .object({
    sys_id: SysIdSchema,
    state: z.literal("4"), // Must be completed state
    work_notes: z
      .string()
      .min(10, "Completion notes must be at least 10 characters"),
    actual_start_time: ServiceNowDateTimeSchema.optional(),
    actual_end_time: ServiceNowDateTimeSchema.optional(),
    close_notes: z.string().optional(),
    peer_review: ServiceNowBooleanSchema.optional(),
    peer_review_by: SysIdSchema.optional(),
  })
  .refine(
    (data) => {
      // Business rule: If peer review is required, reviewer must be specified
      if (data.peer_review && !data.peer_review_by) {
        return false;
      }

      return true;
    },
    {
      message: "Peer reviewer required when peer review is enabled",
    },
  );

/**
 * Change task assignment validation
 */
export const ChangeTaskAssignmentSchema = z
  .object({
    sys_id: SysIdSchema,
    assignment_group: SysIdSchema.optional(),
    assigned_to: SysIdSchema.optional(),
    state: ChangeTaskStateSchema,
    work_notes: z.string().optional(),
  })
  .refine(
    (data) => {
      // Business rule: Must have either assignment group or assigned to
      return data.assignment_group || data.assigned_to;
    },
    {
      message: "Either assignment_group or assigned_to must be specified",
      path: ["assignment"],
    },
  );

// ===== CHANGE TASK QUERIES =====

/**
 * Common change task query filters
 */
export const ChangeTaskQuerySchema = z.object({
  change_request: z.union([SysIdSchema, z.array(SysIdSchema)]).optional(),
  state: z
    .union([ChangeTaskStateSchema, z.array(ChangeTaskStateSchema)])
    .optional(),
  assignment_group: z.union([SysIdSchema, z.array(SysIdSchema)]).optional(),
  assigned_to: SysIdSchema.optional(),
  type: z.union([z.string(), z.array(z.string())]).optional(),
  planned_start_date: z
    .object({
      from: ServiceNowDateTimeSchema.optional(),
      to: ServiceNowDateTimeSchema.optional(),
    })
    .optional(),
  business_service: SysIdSchema.optional(),
  active: ServiceNowBooleanSchema.optional(),
  on_hold: ServiceNowBooleanSchema.optional(),
});

// ===== CHANGE TASK REPORTS =====

/**
 * Change task metrics schema
 */
export const ChangeTaskMetricsSchema = z.object({
  change_request: SysIdSchema,
  total_tasks: z.number().int().min(0),
  pending_tasks: z.number().int().min(0),
  open_tasks: z.number().int().min(0),
  assigned_tasks: z.number().int().min(0),
  in_progress_tasks: z.number().int().min(0),
  completed_tasks: z.number().int().min(0),
  skipped_tasks: z.number().int().min(0),
  incomplete_tasks: z.number().int().min(0),

  // Progress metrics
  completion_percentage: z.number().min(0).max(100),
  tasks_on_schedule: z.number().int().min(0),
  tasks_delayed: z.number().int().min(0),
  tasks_ahead_of_schedule: z.number().int().min(0),

  // Time metrics
  avg_completion_time_hours: z.number().min(0),
  total_planned_hours: z.number().min(0),
  total_actual_hours: z.number().min(0),

  // Quality metrics
  tasks_requiring_rework: z.number().int().min(0),
  peer_reviewed_tasks: z.number().int().min(0),

  // Breakdown by type
  by_task_type: z.record(z.string(), z.number().int().min(0)),
  by_assignment_group: z.record(z.string(), z.number().int().min(0)),

  // Dependencies
  blocked_tasks: z.number().int().min(0),
  dependency_violations: z.number().int().min(0),

  time_period: z.object({
    from: ServiceNowDateTimeSchema,
    to: ServiceNowDateTimeSchema,
  }),
});

/**
 * Change task dependency validation
 */
export const ChangeTaskDependencySchema = z
  .object({
    task_id: SysIdSchema,
    depends_on_task: SysIdSchema,
    dependency_type: z
      .enum([
        "finish_to_start",
        "start_to_start",
        "finish_to_finish",
        "start_to_finish",
      ])
      .default("finish_to_start"),
    lag_days: z.number().int().min(0).default(0),
    mandatory: z.boolean().default(true),
    created_by: SysIdSchema.optional(),
    created_at: ServiceNowDateTimeSchema.optional(),
  })
  .refine(
    (data) => {
      // Business rule: Task cannot depend on itself
      return data.task_id !== data.depends_on_task;
    },
    {
      message: "Task cannot depend on itself",
    },
  );

// ===== TYPE EXPORTS =====

export type ChangeTask = z.infer<typeof ChangeTaskSchema>;
export type ChangeTaskCreation = z.infer<typeof ChangeTaskCreationSchema>;
export type ChangeTaskCompletion = z.infer<typeof ChangeTaskCompletionSchema>;
export type ChangeTaskAssignment = z.infer<typeof ChangeTaskAssignmentSchema>;
export type ChangeTaskQuery = z.infer<typeof ChangeTaskQuerySchema>;
export type ChangeTaskMetrics = z.infer<typeof ChangeTaskMetricsSchema>;
export type ChangeTaskStateTransition = z.infer<
  typeof ChangeTaskStateTransitionsSchema
>;
export type ChangeTaskDependency = z.infer<typeof ChangeTaskDependencySchema>;
