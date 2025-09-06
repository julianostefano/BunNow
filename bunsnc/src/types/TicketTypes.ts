/**
 * TypeScript interfaces for ticket data structures
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

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

export interface ModalProps {
  ticket: TicketData;
  statusLabel: string;
  priorityLabel: string;
}