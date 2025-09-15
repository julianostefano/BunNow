/**
 * Contractual SLA Types and Interfaces
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export enum TicketType {
  INCIDENT = 'incident',
  CTASK = 'ctask',
  SCTASK = 'sctask'
}

export enum MetricType {
  RESPONSE_TIME = 'response_time',
  RESOLUTION_TIME = 'resolution_time'
}

export enum IncidentPriority {
  SEVERIDADE_1 = 'Severidade 1',
  SEVERIDADE_2 = 'Severidade 2',
  SEVERIDADE_3 = 'Severidade 3',
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4'
}

export enum ChangeTaskPriority {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4'
}

export enum ServiceCatalogPriority {
  NORMAL = 'Normal',
  STANDARD = 'Standard',
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3'
}

export type SLAPriority = IncidentPriority | ChangeTaskPriority | ServiceCatalogPriority;

export interface ContractualSLA {
  id: number;
  ticket_type: TicketType;
  metric_type: MetricType;
  priority: SLAPriority;
  sla_hours: number;
  penalty_percentage: number;
  description: string;
  business_hours_only: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SLAComplianceResult {
  ticket_id: string;
  ticket_type: TicketType;
  priority: SLAPriority;
  metric_type: MetricType;
  sla_hours: number;
  actual_hours: number;
  is_compliant: boolean;
  breach_hours: number;
  penalty_percentage: number;
  business_hours_only: boolean;
  calculated_at: Date;
}

export interface SLAMetrics {
  period_start: Date;
  period_end: Date;
  ticket_type: TicketType;
  total_tickets: number;
  compliant_tickets: number;
  breached_tickets: number;
  compliance_percentage: number;
  total_penalty_percentage: number;
  average_response_time: number;
  average_resolution_time: number;
  metrics_by_priority: SLAPriorityMetrics[];
}

export interface SLAPriorityMetrics {
  priority: SLAPriority;
  total_tickets: number;
  compliant_tickets: number;
  breached_tickets: number;
  compliance_percentage: number;
  penalty_percentage: number;
  average_response_time: number;
  average_resolution_time: number;
}

export interface BusinessHoursConfig {
  monday: { start: string; end: string; };
  tuesday: { start: string; end: string; };
  wednesday: { start: string; end: string; };
  thursday: { start: string; end: string; };
  friday: { start: string; end: string; };
  saturday?: { start: string; end: string; };
  sunday?: { start: string; end: string; };
  holidays: string[];
  timezone: string;
}

export interface SLACalculationOptions {
  include_business_hours_only?: boolean;
  business_hours_config?: BusinessHoursConfig;
  penalty_calculation_enabled?: boolean;
  custom_penalties?: Record<string, number>;
}

export interface TicketSLAStatus {
  ticket_id: string;
  ticket_number: string;
  ticket_type: TicketType;
  priority: SLAPriority;
  created_at: Date;
  first_response_at?: Date;
  resolved_at?: Date;
  response_sla: SLAComplianceResult | null;
  resolution_sla: SLAComplianceResult | null;
  overall_compliance: boolean;
  total_penalty_percentage: number;
}

export interface SLADashboardData {
  overall_metrics: {
    total_tickets: number;
    compliant_tickets: number;
    breach_tickets: number;
    compliance_percentage: number;
    total_penalties: number;
  };
  by_ticket_type: Record<TicketType, SLAMetrics>;
  recent_breaches: TicketSLAStatus[];
  trending_metrics: {
    period: string;
    compliance_trend: number[];
    penalty_trend: number[];
    volume_trend: number[];
  };
  alerts: SLAAlert[];
}

export interface SLAAlert {
  id: string;
  type: 'breach' | 'warning' | 'trend';
  severity: 'low' | 'medium' | 'high' | 'critical';
  ticket_id?: string;
  ticket_type: TicketType;
  priority: SLAPriority;
  message: string;
  created_at: Date;
  acknowledged: boolean;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  monday: { start: '08:00', end: '17:00' },
  tuesday: { start: '08:00', end: '17:00' },
  wednesday: { start: '08:00', end: '17:00' },
  thursday: { start: '08:00', end: '17:00' },
  friday: { start: '08:00', end: '17:00' },
  holidays: [],
  timezone: 'America/Sao_Paulo'
};

export const SLA_PRIORITY_MAPPING = {
  [TicketType.INCIDENT]: [
    IncidentPriority.SEVERIDADE_1,
    IncidentPriority.SEVERIDADE_2,
    IncidentPriority.SEVERIDADE_3,
    IncidentPriority.P1,
    IncidentPriority.P2,
    IncidentPriority.P3,
    IncidentPriority.P4
  ],
  [TicketType.CTASK]: [
    ChangeTaskPriority.P1,
    ChangeTaskPriority.P2,
    ChangeTaskPriority.P3,
    ChangeTaskPriority.P4
  ],
  [TicketType.SCTASK]: [
    ServiceCatalogPriority.NORMAL,
    ServiceCatalogPriority.STANDARD,
    ServiceCatalogPriority.P1,
    ServiceCatalogPriority.P2,
    ServiceCatalogPriority.P3
  ]
};