/**
 * ServiceNow Types with SLA/SLM Integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface ServiceNowRecord {
  [key: string]: any;
}

export interface QueryOptions {
  table: string;
  filter?: string;
  fields?: string[];
  limit?: number;
  offset?: number;
  orderBy?: string;
}

// SLA/SLM Type Definitions
export interface SLMRecord {
  sys_id: string;
  task_number: string;
  taskslatable_business_percentage: string | null;
  taskslatable_start_time: string | null;
  taskslatable_end_time: string | null;
  taskslatable_sla: string | null;
  taskslatable_stage: string | null;
  taskslatable_has_breached: string | boolean;
  task_assignment_group: string | null;
  raw_data: ServiceNowRecord;
}

export interface TaskSLAQueryOptions {
  taskNumber: string;
  includeDisplayValues?: boolean;
  limit?: number;
}

export interface TaskSLAResponse {
  result: SLMRecord[];
  totalCount?: number;
  hasMore?: boolean;
}

// Enhanced Ticket Types with SLM Integration
export interface BaseTicketRecord {
  sys_id: string;
  number: string;
  state: string;
  assignment_group: string;
  opened_at: string;
  sys_updated_on: string;
  priority: string;
  short_description: string;
  description?: string;
  [key: string]: any;
}

export interface IncidentRecord extends BaseTicketRecord {
  category: string;
  subcategory?: string;
  impact: string;
  urgency: string;
  caller_id: string;
  business_service?: string;
}

export interface ChangeTaskRecord extends BaseTicketRecord {
  change_request: string;
  planned_start_date?: string;
  planned_end_date?: string;
  work_notes?: string;
  close_notes?: string;
}

export interface ServiceCatalogTaskRecord extends BaseTicketRecord {
  request: string;
  request_item: string;
  catalog_item?: string;
  variables?: Record<string, any>;
}

// Combined Ticket + SLM Documents
export interface TicketWithSLMs<T = BaseTicketRecord> {
  ticket: T;
  slms: SLMRecord[];
  sync_timestamp: string;
  collection_version: string;
}

export interface IncidentWithSLMs extends TicketWithSLMs<IncidentRecord> {}
export interface ChangeTaskWithSLMs extends TicketWithSLMs<ChangeTaskRecord> {}
export interface ServiceCatalogTaskWithSLMs extends TicketWithSLMs<ServiceCatalogTaskRecord> {}

// SLA Analysis Types
export interface SLABreachInfo {
  sla_name: string;
  has_breached: boolean;
  business_percentage: number;
  start_time: string | null;
  end_time: string | null;
  stage: string;
  breach_time?: string;
}

export interface TicketSLASummary {
  ticket_number: string;
  total_slas: number;
  active_slas: number;
  breached_slas: number;
  breach_percentage: number;
  worst_sla: SLABreachInfo | null;
  all_slas: SLABreachInfo[];
}

// ServiceNow API Response Types
export interface ServiceNowAPIResponse<T = ServiceNowRecord> {
  result: T[];
  error?: {
    message: string;
    detail: string;
  };
}

export interface ServiceNowSingleResponse<T = ServiceNowRecord> {
  result: T;
  error?: {
    message: string;
    detail: string;
  };
}

// Query Builder Types
export interface ServiceNowQuery {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: string | string[];
}

export interface ServiceNowQueryBuilder {
  table: string;
  queries: ServiceNowQuery[];
  fields?: string[];
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

// Collection Types for Storage Services
export interface TicketCollectionDocument {
  id?: string;
  sys_id: string;
  number: string;
  ticket_type: 'incident' | 'change_task' | 'sc_task';
  data: TicketWithSLMs;
  created_at: Date;
  updated_at: Date;
  sys_id_prefix: string;
}

// SLM-specific Query Types
export interface SLMQueryFilters {
  taskNumbers?: string[];
  slaNames?: string[];
  breached?: boolean;
  assignmentGroups?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
}

export interface SLMCollectionOptions {
  includeRawData?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'start_time' | 'end_time' | 'business_percentage';
  sortOrder?: 'asc' | 'desc';
}