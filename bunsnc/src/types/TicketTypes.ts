/**
 * TypeScript interfaces for ticket data structures
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { t } from "elysia";

export interface TicketData {
  sysId: string;
  number: string;
  shortDescription: string;
  description: string;
  state: string;
  priority: string;
  assignedTo: string;
  assignmentGroup: string;
  caller: string;
  createdOn: string;
  table: string;
  slaDue: string | null;
  businessStc: string | null;
  resolveTime: string | null;
  updatedOn: string;
  category: string;
  subcategory: string;
  urgency: string;
  impact: string;
}

export interface TicketResponse {
  result: any[];
}

export interface TicketDetailParams {
  sysId: string;
  table: string;
}

export interface HistoryEntry {
  sys_id: string;
  documentkey: string;
  tablename: string;
  fieldname: string;
  oldvalue: string;
  newvalue: string;
  user: string;
  sys_created_on: string;
  sys_created_by: string;
  reason: string;
  record_checkpoint: string;
}

export interface HistoryResponse {
  success: boolean;
  sys_id: string;
  history: HistoryEntry[];
  total: number;
  limit: number;
  offset: number;
  retrieved_at: string;
  error?: string;
  message?: string;
}

export interface ModalProps {
  ticket: TicketData;
  statusLabel: string;
  priorityLabel: string;
}

// TypeBox Schema for Ticket Update Validation
export const UpdateTicketSchema = t.Object({
  short_description: t.Optional(t.String({ minLength: 3, maxLength: 160 })),
  description: t.Optional(t.String({ maxLength: 4000 })),
  priority: t.Optional(t.String({ pattern: "^[1-5]$" })),
  state: t.Optional(t.String()),
  assignment_group: t.Optional(t.String()),
  assigned_to: t.Optional(t.String()),
  category: t.Optional(t.String()),
  subcategory: t.Optional(t.String()),
  urgency: t.Optional(t.String({ pattern: "^[1-3]$" })),
  impact: t.Optional(t.String({ pattern: "^[1-3]$" })),
  work_notes: t.Optional(t.String({ maxLength: 4000 })),
});

export type UpdateTicketRequest = typeof UpdateTicketSchema.static;

export interface UpdateTicketResponse {
  success: boolean;
  sys_id: string;
  updated_fields: string[];
  timestamp: string;
  error?: string;
  validation_errors?: Record<string, string>;
}
