/**
 * Ticket MongoDB Schemas and Validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface BaseTicketSchema {
  _id?: string;
  sys_id: string;
  number: string;
  table: string;
  state: string;
  short_description: string;
  description?: string;
  priority: string;
  category?: string;
  subcategory?: string;
  assignment_group?: string;
  assigned_to?: string;
  caller_id?: string;
  opened_at: Date;
  sys_created_on: Date;
  sys_updated_on: Date;
  resolved_at?: Date;
  closed_at?: Date;
  resolution_code?: string;
  close_code?: string;
  work_notes?: string;
  comments?: string;
  location?: string;
  company?: string;
  business_service?: string;
  configuration_item?: string;
  impact?: string;
  urgency?: string;
  correlation_id?: string;
  correlation_display?: string;
  // Metadados de sincronização
  last_synced: Date;
  sync_status: "synced" | "pending" | "error";
  sync_error?: string;
}

export interface IncidentSchema extends BaseTicketSchema {
  table: "incident";
  problem_id?: string;
  rfc?: string;
  caused_by?: string;
  u_root_cause?: string;
  u_workaround?: string;
}

export interface ChangeTaskSchema extends BaseTicketSchema {
  table: "change_task";
  change_request?: string;
  change_request_number?: string;
  task_type?: string;
  planned_start_date?: Date;
  planned_end_date?: Date;
  actual_start_date?: Date;
  actual_end_date?: Date;
  implementation_plan?: string;
  test_plan?: string;
  backout_plan?: string;
}

export interface ServiceRequestTaskSchema extends BaseTicketSchema {
  table: "sc_task";
  request?: string;
  request_number?: string;
  catalog_item?: string;
  requested_for?: string;
  delivery_plan?: string;
  delivery_task?: string;
}

export type TicketSchema =
  | IncidentSchema
  | ChangeTaskSchema
  | ServiceRequestTaskSchema;

// Validation schemas for different ticket types
export const TicketValidation = {
  required: {
    all: [
      "sys_id",
      "number",
      "table",
      "state",
      "short_description",
      "priority",
      "opened_at",
    ],
    incident: ["caller_id"],
    change_task: ["change_request"],
    sc_task: ["request", "requested_for"],
  },

  states: {
    incident: ["1", "2", "3", "6", "7", "8"], // New, In Progress, On Hold, Resolved, Closed, Canceled
    change_task: ["-5", "1", "2", "3", "4", "7"], // Pending, Open, Work in Progress, Closed Complete, Closed Incomplete, Closed Skipped
    sc_task: ["1", "2", "3", "4", "7"], // Pending, Open, Work in Progress, Closed Complete, Closed Incomplete
  },

  priorities: ["1", "2", "3", "4", "5"], // Critical, High, Moderate, Low, Planning

  syncStatuses: ["synced", "pending", "error"] as const,
};

// MongoDB collection names
export const TicketCollections = {
  INCIDENTS: "incidents",
  CHANGE_TASKS: "change_tasks",
  SERVICE_REQUESTS: "service_request_tasks",
  AUDIT_LOG: "ticket_audit_log",
} as const;

// Audit log schema for tracking changes
export interface TicketAuditLog {
  _id?: string;
  ticket_sys_id: string;
  ticket_table: string;
  ticket_number: string;
  action:
    | "created"
    | "updated"
    | "resolved"
    | "closed"
    | "reopened"
    | "assigned"
    | "priority_changed"
    | "category_changed";
  changes: Record<string, { old_value?: any; new_value: any }>;
  performed_by: string;
  performed_at: Date;
  source: "servicenow" | "bunsnc" | "sync";
  metadata?: Record<string, any>;
}
