/**
 * Service Catalog Task Schemas - ServiceNow Service Catalog Task validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Service Catalog Task specific validations
 * - Business rules implementation
 */

import { z } from 'zod';
import { 
  BaseTicketSchema, 
  SysIdSchema, 
  ServiceNowDateTimeSchema, 
  ServiceNowBooleanSchema,
  optionalEmpty 
} from '../core/base.schemas';
import { ServiceTaskStateSchema } from '../core/servicenow.schemas';

// ===== SERVICE CATALOG TASK CORE SCHEMA =====

/**
 * Complete ServiceNow Service Catalog Task schema
 */
export const ServiceCatalogTaskSchema = BaseTicketSchema.extend({
  // Service Task specific state validation
  state: ServiceTaskStateSchema,
  
  // Service request association
  request: SysIdSchema, // Required - parent service request
  request_number: z.string().optional(),
  
  // Catalog item and service
  sc_catalog: SysIdSchema.optional(),
  cat_item: SysIdSchema.optional(), // Catalog item
  service_offering: SysIdSchema.optional(),
  
  // Task type and classification
  task_type: z.enum([
    'delivery', 
    'fulfillment', 
    'approval', 
    'provision', 
    'configuration',
    'validation',
    'notification'
  ]).optional(),
  
  // Execution context
  context: z.enum(['automated', 'manual', 'semi_automated']).optional(),
  
  // Planning fields
  planned_start_date: ServiceNowDateTimeSchema.optional(),
  planned_end_date: ServiceNowDateTimeSchema.optional(),
  work_start: ServiceNowDateTimeSchema.optional(),
  work_end: ServiceNowDateTimeSchema.optional(),
  
  // Execution tracking
  actual_start_time: ServiceNowDateTimeSchema.optional(),
  actual_end_time: ServiceNowDateTimeSchema.optional(),
  
  // Service delivery fields
  delivery_plan: z.string().optional(),
  delivery_task: z.string().optional(),
  
  // Configuration Item
  cmdb_ci: SysIdSchema.optional(),
  cmdb_ci_class: z.string().optional(),
  
  // Business context
  business_service: SysIdSchema.optional(),
  location: SysIdSchema.optional(),
  company: SysIdSchema.optional(),
  
  // Fulfillment details
  fulfillment_group: SysIdSchema.optional(),
  delivery_address: z.string().optional(),
  
  // Variables (from catalog item)
  variables: z.record(z.string(), z.any()).optional(),
  
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
  order: z.string().transform(val => parseInt(val) || 0).optional(),
  task_group: z.string().optional(),
  
  // Completion criteria
  on_hold: ServiceNowBooleanSchema.optional(),
  on_hold_reason: z.string().optional(),
  
  // Quality assurance
  peer_review: ServiceNowBooleanSchema.optional(),
  peer_review_by: SysIdSchema.optional(),
  
  // Service specific fields
  u_service_type: z.string().optional(),
  u_delivery_method: z.string().optional(),
  u_sla_requirement: z.string().optional(),
  u_cost_center: z.string().optional(),
  
  // Automation fields
  automation_script: z.string().optional(),
  automation_status: z.enum(['not_applicable', 'pending', 'running', 'completed', 'failed']).optional(),
  
  // Closure information
  closed_by: SysIdSchema.optional(),
  closed_at: ServiceNowDateTimeSchema.optional(),
  close_code: z.string().optional(),
  
  // Parent request information (denormalized for performance)
  parent_request_state: z.string().optional(),
  parent_request_stage: z.string().optional(),
  parent_request_priority: z.string().optional(),
  
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
  work_duration: z.string().transform(val => parseInt(val) || 0).optional(),
  calendar_stc: z.string().transform(val => parseInt(val) || 0).optional(),
  business_stc: z.string().transform(val => parseInt(val) || 0).optional(),
  
  // Delivery metrics
  delivery_time: ServiceNowDateTimeSchema.optional(),
  delivery_quality: z.enum(['excellent', 'good', 'satisfactory', 'poor']).optional(),
  customer_satisfaction: z.number().int().min(1).max(5).optional() // 1-5 rating
});

// ===== SERVICE TASK STATE TRANSITIONS =====

/**
 * Valid state transitions for service catalog tasks
 */
export const ServiceTaskStateTransitionsSchema = z.object({
  from_state: ServiceTaskStateSchema,
  to_state: ServiceTaskStateSchema,
  action: z.enum(['open', 'assign', 'start_work', 'complete', 'skip', 'cancel', 'reopen']),
  requires_note: z.boolean().default(false),
  requires_approval: z.boolean().default(false),
  auto_transition: z.boolean().default(false) // For automated workflows
}).refine((data) => {
  // Business rules for state transitions
  const validTransitions = {
    '-5': ['1', '2'], // Pending -> Open, Assigned
    '1': ['2', '3', '4', '7', '8'], // Open -> Assigned, In Progress, Complete, Cancelled, Closed Skipped
    '2': ['3', '4', '7', '8'], // Assigned -> In Progress, Complete, Cancelled, Closed Skipped
    '3': ['4', '7', '8'], // In Progress -> Complete, Cancelled, Closed Skipped
    '4': [], // Closed Complete (final state)
    '7': [], // Cancelled (final state)
    '8': ['1', '2', '3'] // Closed Skipped -> can reopen
  };
  
  const allowedStates = validTransitions[data.from_state] || [];
  return allowedStates.includes(data.to_state);
}, {
  message: 'Invalid service task state transition'
});

// ===== SERVICE TASK BUSINESS RULES =====

/**
 * Service catalog task creation validation with business rules
 */
export const ServiceTaskCreationSchema = ServiceCatalogTaskSchema.pick({
  short_description: true,
  description: true,
  request: true,
  task_type: true,
  cat_item: true,
  assignment_group: true,
  assigned_to: true,
  planned_start_date: true,
  planned_end_date: true,
  delivery_plan: true,
  cmdb_ci: true,
  business_service: true,
  priority: true,
  order: true,
  variables: true
}).extend({
  // Required fields for creation
  request: SysIdSchema, // Must be associated with a service request
  short_description: z.string().min(10, 'Task description must be at least 10 characters')
}).refine((data) => {
  // Business rule: Delivery tasks require delivery plan
  if (data.task_type === 'delivery' && !data.delivery_plan) {
    return false;
  }
  
  // Business rule: Provision tasks require CMDB CI
  if (data.task_type === 'provision' && !data.cmdb_ci) {
    return false;
  }
  
  // Business rule: Planned dates should be logical
  if (data.planned_start_date && data.planned_end_date) {
    const startDate = new Date(data.planned_start_date);
    const endDate = new Date(data.planned_end_date);
    return startDate < endDate;
  }
  
  return true;
}, {
  message: 'Service task creation validation failed'
});

/**
 * Service task completion validation
 */
export const ServiceTaskCompletionSchema = z.object({
  sys_id: SysIdSchema,
  state: z.literal('4'), // Must be completed state
  work_notes: z.string().min(10, 'Completion notes must be at least 10 characters'),
  actual_start_time: ServiceNowDateTimeSchema.optional(),
  actual_end_time: ServiceNowDateTimeSchema.optional(),
  close_notes: z.string().optional(),
  delivery_time: ServiceNowDateTimeSchema.optional(),
  delivery_quality: z.enum(['excellent', 'good', 'satisfactory', 'poor']).optional(),
  customer_satisfaction: z.number().int().min(1).max(5).optional(),
  peer_review: ServiceNowBooleanSchema.optional(),
  peer_review_by: SysIdSchema.optional()
}).refine((data) => {
  // Business rule: If peer review is required, reviewer must be specified
  if (data.peer_review && !data.peer_review_by) {
    return false;
  }
  
  return true;
}, {
  message: 'Peer reviewer required when peer review is enabled'
});

/**
 * Service task assignment validation
 */
export const ServiceTaskAssignmentSchema = z.object({
  sys_id: SysIdSchema,
  assignment_group: SysIdSchema.optional(),
  assigned_to: SysIdSchema.optional(),
  fulfillment_group: SysIdSchema.optional(),
  state: ServiceTaskStateSchema,
  work_notes: z.string().optional()
}).refine((data) => {
  // Business rule: Must have either assignment group or assigned to
  return data.assignment_group || data.assigned_to || data.fulfillment_group;
}, {
  message: 'Either assignment_group, assigned_to, or fulfillment_group must be specified',
  path: ['assignment']
});

// ===== SERVICE TASK QUERIES =====

/**
 * Common service task query filters
 */
export const ServiceTaskQuerySchema = z.object({
  request: z.union([SysIdSchema, z.array(SysIdSchema)]).optional(),
  state: z.union([ServiceTaskStateSchema, z.array(ServiceTaskStateSchema)]).optional(),
  assignment_group: z.union([SysIdSchema, z.array(SysIdSchema)]).optional(),
  assigned_to: SysIdSchema.optional(),
  fulfillment_group: SysIdSchema.optional(),
  task_type: z.union([z.string(), z.array(z.string())]).optional(),
  cat_item: z.union([SysIdSchema, z.array(SysIdSchema)]).optional(),
  planned_start_date: z.object({
    from: ServiceNowDateTimeSchema.optional(),
    to: ServiceNowDateTimeSchema.optional()
  }).optional(),
  business_service: SysIdSchema.optional(),
  active: ServiceNowBooleanSchema.optional(),
  on_hold: ServiceNowBooleanSchema.optional(),
  automation_status: z.string().optional()
});

// ===== SERVICE TASK REPORTS =====

/**
 * Service task metrics schema
 */
export const ServiceTaskMetricsSchema = z.object({
  request: SysIdSchema,
  total_tasks: z.number().int().min(0),
  pending_tasks: z.number().int().min(0),
  open_tasks: z.number().int().min(0),
  assigned_tasks: z.number().int().min(0),
  in_progress_tasks: z.number().int().min(0),
  completed_tasks: z.number().int().min(0),
  cancelled_tasks: z.number().int().min(0),
  skipped_tasks: z.number().int().min(0),
  
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
  avg_customer_satisfaction: z.number().min(1).max(5),
  tasks_requiring_rework: z.number().int().min(0),
  peer_reviewed_tasks: z.number().int().min(0),
  
  // Delivery metrics
  excellent_delivery: z.number().int().min(0),
  good_delivery: z.number().int().min(0),
  satisfactory_delivery: z.number().int().min(0),
  poor_delivery: z.number().int().min(0),
  
  // Breakdown by type
  by_task_type: z.record(z.string(), z.number().int().min(0)),
  by_fulfillment_group: z.record(z.string(), z.number().int().min(0)),
  by_catalog_item: z.record(z.string(), z.number().int().min(0)),
  
  // Automation metrics
  automated_tasks: z.number().int().min(0),
  manual_tasks: z.number().int().min(0),
  automation_success_rate: z.number().min(0).max(100),
  
  time_period: z.object({
    from: ServiceNowDateTimeSchema,
    to: ServiceNowDateTimeSchema
  })
});

/**
 * Service delivery SLA validation
 */
export const ServiceDeliverySLASchema = z.object({
  task_id: SysIdSchema,
  sla_definition: SysIdSchema,
  target_time: ServiceNowDateTimeSchema,
  actual_time: ServiceNowDateTimeSchema.optional(),
  breach_status: z.enum(['on_track', 'at_risk', 'breached']).default('on_track'),
  time_remaining_minutes: z.number().int().optional(),
  breach_reason: z.string().optional(),
  escalation_level: z.number().int().min(0).max(3).default(0),
  created_by: SysIdSchema.optional(),
  created_at: ServiceNowDateTimeSchema.optional()
}).refine((data) => {
  // Business rule: If breached, breach reason should be provided
  if (data.breach_status === 'breached' && !data.breach_reason) {
    return false;
  }
  
  return true;
}, {
  message: 'Breach reason required when SLA is breached'
});

// ===== TYPE EXPORTS =====

export type ServiceCatalogTask = z.infer<typeof ServiceCatalogTaskSchema>;
export type ServiceTaskCreation = z.infer<typeof ServiceTaskCreationSchema>;
export type ServiceTaskCompletion = z.infer<typeof ServiceTaskCompletionSchema>;
export type ServiceTaskAssignment = z.infer<typeof ServiceTaskAssignmentSchema>;
export type ServiceTaskQuery = z.infer<typeof ServiceTaskQuerySchema>;
export type ServiceTaskMetrics = z.infer<typeof ServiceTaskMetricsSchema>;
export type ServiceTaskStateTransition = z.infer<typeof ServiceTaskStateTransitionsSchema>;
export type ServiceDeliverySLA = z.infer<typeof ServiceDeliverySLASchema>;