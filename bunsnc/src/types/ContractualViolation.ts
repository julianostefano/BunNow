/**
 * Contractual Violation Types and Interfaces
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketType } from "./ContractualSLA";

/**
 * Contractual violation validation result
 */
export interface ContractualViolationResult {
  is_violated: boolean;
  violation_reasons: ViolationReason[];
  validation_timestamp: Date;
  ticket_id: string;
  ticket_type: TicketType;
  penalty_percentage?: number;
  financial_impact?: number;
}

/**
 * Individual violation reason with validation details
 */
export interface ViolationReason {
  rule_name: string;
  rule_description: string;
  is_compliant: boolean;
  validation_details: Record<string, any>;
  severity: ViolationSeverity;
}

/**
 * Severity levels for violations
 */
export enum ViolationSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * Support group validation data
 */
export interface SupportGroupData {
  id: number;
  nome: string;
  tags: string[];
  descricao: string;
  responsavel: string;
  temperatura: number;
}

/**
 * Ticket closure validation data
 */
export interface TicketClosureData {
  closed_by_group: boolean;
  assignment_group_id?: string;
  assignment_group_name?: string;
  closure_timestamp?: Date;
  closure_state?: string;
}

/**
 * SLA breach validation data
 */
export interface SLABreachData {
  has_sla_breach: boolean;
  response_time_breach: boolean;
  resolution_time_breach: boolean;
  breach_details: {
    expected_response_hours?: number;
    actual_response_hours?: number;
    expected_resolution_hours?: number;
    actual_resolution_hours?: number;
  };
}

/**
 * Violation marking validation data
 */
export interface ViolationMarkingData {
  is_marked_as_violated: boolean;
  violation_field_value?: boolean;
  marking_timestamp?: Date;
  marked_by?: string;
}

/**
 * Complete ticket data for violation validation
 */
export interface TicketViolationData {
  sys_id: string;
  number: string;
  ticket_type: TicketType;
  state: string;
  assignment_group: {
    value: string;
    display_value: string;
  };
  sys_created_on: Date;
  sys_updated_on: Date;
  closed_at?: Date;
  resolved_at?: Date;
  priority?: string;
  contractual_violation?: boolean;
  slms?: any[];
}

/**
 * Violation validation rules configuration
 */
export interface ViolationValidationRules {
  validate_group_closure: boolean;
  validate_sla_breach: boolean;
  validate_violation_marking: boolean;
  strict_validation: boolean;
}

/**
 * Violation statistics for reporting
 */
export interface ViolationStatistics {
  total_tickets_analyzed: number;
  total_violations_found: number;
  violation_rate_percentage: number;
  violations_by_ticket_type: Record<TicketType, number>;
  violations_by_severity: Record<ViolationSeverity, number>;
  violations_by_group: Record<string, number>;
  total_financial_impact: number;
  analysis_period: {
    start_date: Date;
    end_date: Date;
  };
}

/**
 * Violation report data
 */
export interface ViolationReport {
  report_id: string;
  generated_at: Date;
  statistics: ViolationStatistics;
  violations: ContractualViolationResult[];
  summary: {
    most_violated_ticket_type: TicketType;
    most_violated_group: string;
    highest_financial_impact_ticket: string;
    recommendations: string[];
  };
}

/**
 * MongoDB document structure for violation tracking
 */
export interface ViolationTrackingDocument {
  _id?: any;
  ticket_sys_id: string;
  ticket_number: string;
  ticket_type: TicketType;
  violation_result: ContractualViolationResult;
  created_at: Date;
  updated_at: Date;
  processed: boolean;
  financial_impact_calculated: boolean;
}
