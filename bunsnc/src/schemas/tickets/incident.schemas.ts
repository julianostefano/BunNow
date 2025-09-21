/**
 * Incident Schemas - ServiceNow Incident Table validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Incident-specific validations
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
import { IncidentStateSchema } from "../core/servicenow.schemas";

// ===== INCIDENT CORE SCHEMA =====

/**
 * Complete ServiceNow Incident schema
 */
export const IncidentSchema = BaseTicketSchema.extend({
  // Incident-specific state validation
  state: IncidentStateSchema,

  // Incident categories
  category: z.string().optional(),
  subcategory: z.string().optional(),
  u_category: z.string().optional(), // Custom category field

  // Business impact fields
  business_service: SysIdSchema.optional(),
  cmdb_ci: SysIdSchema.optional(),

  // Resolution fields
  resolved_by: SysIdSchema.optional(),
  resolved_at: ServiceNowDateTimeSchema.optional(),
  resolution_code: z.string().optional(),
  resolution_notes: z.string().optional(),

  // Closure fields
  closed_by: SysIdSchema.optional(),
  closed_at: ServiceNowDateTimeSchema.optional(),
  close_code: z.string().optional(),

  // SLA fields
  due_date: ServiceNowDateTimeSchema.optional(),
  sla_due: ServiceNowDateTimeSchema.optional(),
  made_sla: ServiceNowBooleanSchema.optional(),

  // Communication fields
  contact_type: z.string().optional(),
  notify: z.string().optional(),

  // Location and company
  location: SysIdSchema.optional(),
  company: SysIdSchema.optional(),

  // Problem linking
  problem_id: SysIdSchema.optional(),
  rfc: SysIdSchema.optional(), // Related change request

  // Escalation
  escalation: z.string().optional(),
  upon_reject: z.string().optional(),
  upon_approval: z.string().optional(),

  // Knowledge base
  knowledge: ServiceNowBooleanSchema.optional(),

  // Approval
  approval: z.string().optional(),
  approval_history: z.string().optional(),
  approval_set: ServiceNowDateTimeSchema.optional(),

  // Custom fields commonly used
  u_environment: z.string().optional(),
  u_application: z.string().optional(),
  u_severity: z.string().optional(),

  // Child incident tracking
  child_incidents: z.string().optional(),
  parent_incident: SysIdSchema.optional(),
  incident_state: z.string().optional(),

  // Correlation fields
  correlation_id: z.string().optional(),
  correlation_display: z.string().optional(),

  // User experience
  user_input: z.string().optional(),
  watch_list: z.string().optional(),

  // Additional timestamps
  opened_at: ServiceNowDateTimeSchema.optional(),
  expected_start: ServiceNowDateTimeSchema.optional(),
  work_start: ServiceNowDateTimeSchema.optional(),
  work_end: ServiceNowDateTimeSchema.optional(),
  calendar_duration: ServiceNowDateTimeSchema.optional(),
  business_duration: ServiceNowDateTimeSchema.optional(),

  // Activity tracking
  activity_due: ServiceNowDateTimeSchema.optional(),
  additional_assignee_list: z.string().optional(),

  // Service offering
  service_offering: SysIdSchema.optional(),

  // Reassignment count
  reassignment_count: z
    .string()
    .transform((val) => parseInt(val) || 0)
    .optional(),
  reopen_count: z
    .string()
    .transform((val) => parseInt(val) || 0)
    .optional(),
});

// ===== INCIDENT STATE TRANSITIONS =====

/**
 * Valid state transitions for incidents
 */
export const IncidentStateTransitionsSchema = z
  .object({
    from_state: IncidentStateSchema,
    to_state: IncidentStateSchema,
    action: z.enum([
      "assign",
      "work",
      "hold",
      "resolve",
      "close",
      "cancel",
      "reopen",
    ]),
    requires_note: z.boolean().default(false),
    requires_resolution: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // Business rules for state transitions
      const validTransitions = {
        "1": ["2", "18", "6", "8"], // New -> In Progress, Assigned, Resolved, Cancelled
        "2": ["3", "6", "8"], // In Progress -> On Hold, Resolved, Cancelled
        "3": ["2", "6", "8"], // On Hold -> In Progress, Resolved, Cancelled
        "6": ["2", "7"], // Resolved -> In Progress (reopen), Closed
        "7": [], // Closed (final state)
        "8": [], // Cancelled (final state)
        "18": ["2", "3", "6", "8"], // Assigned -> In Progress, On Hold, Resolved, Cancelled
      };

      const allowedStates = validTransitions[data.from_state] || [];
      return allowedStates.includes(data.to_state);
    },
    {
      message: "Invalid state transition",
    },
  );

// ===== INCIDENT BUSINESS RULES =====

/**
 * Incident creation validation with business rules
 */
export const IncidentCreationSchema = IncidentSchema.pick({
  short_description: true,
  description: true,
  caller_id: true,
  category: true,
  subcategory: true,
  priority: true,
  urgency: true,
  impact: true,
  assignment_group: true,
  assigned_to: true,
  location: true,
  company: true,
  business_service: true,
  cmdb_ci: true,
  contact_type: true,
})
  .extend({
    // Override required fields for creation
    caller_id: SysIdSchema, // Required for incident creation
    category: z.string().min(1, "Category is required for incident creation"),
  })
  .refine(
    (data) => {
      // Business rule: If priority is not set, it should be calculated from urgency and impact
      if (!data.priority && data.urgency && data.impact) {
        // Priority calculation matrix (1=highest, 5=lowest)
        const priorityMatrix = {
          "1": { "1": 1, "2": 1, "3": 2 }, // High urgency
          "2": { "1": 1, "2": 2, "3": 3 }, // Medium urgency
          "3": { "1": 2, "2": 3, "3": 3 }, // Low urgency
        };
        return true; // Allow priority to be calculated
      }
      return true;
    },
    {
      message: "Priority calculation validation failed",
    },
  );

/**
 * Incident resolution validation
 */
export const IncidentResolutionSchema = z.object({
  sys_id: SysIdSchema,
  state: z.literal("6"), // Must be resolved state
  resolution_code: z.string().min(1, "Resolution code is required"),
  resolution_notes: z
    .string()
    .min(10, "Resolution notes must be at least 10 characters"),
  resolved_by: SysIdSchema.optional(),
  resolved_at: ServiceNowDateTimeSchema.optional(),
  close_notes: z.string().optional(),
});

/**
 * Incident assignment validation
 */
export const IncidentAssignmentSchema = z
  .object({
    sys_id: SysIdSchema,
    assignment_group: SysIdSchema.optional(),
    assigned_to: SysIdSchema.optional(),
    state: IncidentStateSchema,
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

// ===== INCIDENT QUERIES =====

/**
 * Common incident query filters
 */
export const IncidentQuerySchema = z.object({
  state: z
    .union([IncidentStateSchema, z.array(IncidentStateSchema)])
    .optional(),
  assignment_group: z.union([SysIdSchema, z.array(SysIdSchema)]).optional(),
  assigned_to: SysIdSchema.optional(),
  caller_id: SysIdSchema.optional(),
  category: z.string().optional(),
  priority: z.union([z.string(), z.array(z.string())]).optional(),
  opened_at: z
    .object({
      from: ServiceNowDateTimeSchema.optional(),
      to: ServiceNowDateTimeSchema.optional(),
    })
    .optional(),
  business_service: SysIdSchema.optional(),
  active: ServiceNowBooleanSchema.optional(),
});

// ===== INCIDENT REPORTS =====

/**
 * Incident metrics schema
 */
export const IncidentMetricsSchema = z.object({
  total_incidents: z.number().int().min(0),
  open_incidents: z.number().int().min(0),
  resolved_incidents: z.number().int().min(0),
  closed_incidents: z.number().int().min(0),
  cancelled_incidents: z.number().int().min(0),
  avg_resolution_time: z.number().min(0), // in hours
  sla_breached: z.number().int().min(0),
  sla_met: z.number().int().min(0),
  by_priority: z.record(z.string(), z.number().int().min(0)),
  by_category: z.record(z.string(), z.number().int().min(0)),
  by_assignment_group: z.record(z.string(), z.number().int().min(0)),
  time_period: z.object({
    from: ServiceNowDateTimeSchema,
    to: ServiceNowDateTimeSchema,
  }),
});

// ===== TYPE EXPORTS =====

export type Incident = z.infer<typeof IncidentSchema>;
export type IncidentCreation = z.infer<typeof IncidentCreationSchema>;
export type IncidentResolution = z.infer<typeof IncidentResolutionSchema>;
export type IncidentAssignment = z.infer<typeof IncidentAssignmentSchema>;
export type IncidentQuery = z.infer<typeof IncidentQuerySchema>;
export type IncidentMetrics = z.infer<typeof IncidentMetricsSchema>;
export type IncidentStateTransition = z.infer<
  typeof IncidentStateTransitionsSchema
>;
