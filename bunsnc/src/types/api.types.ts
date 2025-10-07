/**
 * Central API Types for OpenAPI Generation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (CRITICAL-3): Type-based OpenAPI documentation
 * This file exports all API types for automatic schema generation via fromTypes()
 * Reference: docs/reports/BUNSNC_ELYSIA_ASSESSMENT_v1.0.md - CRITICAL-3
 * Reference: docs/ELYSIA_OPENAPI_APPENDIX.md:56-127
 */

// ===== ServiceNow Types =====
export interface ServiceNowRecord {
  sys_id: string;
  sys_created_on: string;
  sys_updated_on: string;
  sys_created_by: string;
  sys_updated_by: string;
  [key: string]: any;
}

export interface Incident extends ServiceNowRecord {
  number: string;
  short_description: string;
  description?: string;
  state: "1" | "2" | "3" | "4" | "5" | "6" | "7";
  priority: "1" | "2" | "3" | "4" | "5";
  impact: "1" | "2" | "3";
  urgency: "1" | "2" | "3";
  assigned_to?: string;
  assignment_group?: string;
  caller_id: string;
  category?: string;
  subcategory?: string;
  opened_at?: string;
  resolved_at?: string;
  closed_at?: string;
  resolution_code?: string;
  resolution_notes?: string;
  close_notes?: string;
}

export interface Problem extends ServiceNowRecord {
  number: string;
  short_description: string;
  description?: string;
  state: "1" | "2" | "3" | "4" | "5";
  priority: "1" | "2" | "3" | "4" | "5";
  impact: "1" | "2" | "3";
  urgency: "1" | "2" | "3";
  assigned_to?: string;
  assignment_group?: string;
  category?: string;
  subcategory?: string;
  opened_at?: string;
  resolved_at?: string;
  closed_at?: string;
}

export interface ChangeRequest extends ServiceNowRecord {
  number: string;
  short_description: string;
  description?: string;
  state: "0" | "1" | "2" | "3" | "4" | "5" | "6";
  priority: "1" | "2" | "3" | "4";
  impact: "1" | "2" | "3";
  risk: "1" | "2" | "3" | "4";
  assigned_to?: string;
  assignment_group?: string;
  start_date?: string;
  end_date?: string;
  implementation_plan?: string;
  backout_plan?: string;
  test_plan?: string;
}

// ===== Request/Response Types =====

export interface ListQueryParams {
  limit?: number;
  offset?: number;
  sysparm_query?: string;
  sysparm_fields?: string;
  sysparm_display_value?: boolean;
}

export interface RecordResponse<T = ServiceNowRecord> {
  result: T;
}

export interface ListResponse<T = ServiceNowRecord> {
  result: T[];
  total?: number;
  hasMore?: boolean;
}

export interface CreateRecordRequest {
  table: string;
  data: Record<string, any>;
}

export interface UpdateRecordRequest {
  table: string;
  sys_id: string;
  data: Record<string, any>;
}

export interface DeleteRecordRequest {
  table: string;
  sys_id: string;
}

export interface BatchOperation {
  op: "create" | "update" | "delete" | "read";
  table: string;
  sys_id?: string;
  data?: Record<string, any>;
}

export interface BatchRequest {
  operations: BatchOperation[];
}

export interface BatchOperationResult {
  op: string;
  table: string;
  sys_id?: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface BatchResponse {
  results: BatchOperationResult[];
  total: number;
  successful: number;
  failed: number;
}

// ===== Attachment Types =====

export interface AttachmentMetadata {
  sys_id: string;
  file_name: string;
  table_name: string;
  table_sys_id: string;
  size_bytes: number;
  content_type: string;
  sys_created_on: string;
  sys_created_by: string;
}

export interface UploadAttachmentRequest {
  table: string;
  sys_id: string;
  fileName: string;
  file: Blob | File;
}

export interface UploadAttachmentResponse {
  success: boolean;
  attachment?: AttachmentMetadata;
  error?: string;
}

// ===== Error Types =====

export interface APIError {
  error: string;
  message: string;
  code?: string;
  details?: any;
  timestamp: string;
}

export interface ValidationError extends APIError {
  fields?: Record<string, string[]>;
}

// ===== Health & Monitoring Types =====

export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  services: {
    api: string;
    database?: string;
    cache?: string;
    queue?: string;
  };
  uptime?: number;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentUsed: number;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    avgResponseTime: number;
  };
  timestamp: string;
}

// ===== Dashboard Types =====

export interface DashboardStats {
  incident_count: number;
  problem_count: number;
  change_count: number;
  task_count: number;
  sla_compliance: number;
  avg_resolution_time: number;
  timestamp: string;
}

export interface TicketSummary {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  by_priority: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
  };
  by_state: Record<string, number>;
}

// ===== Search Types =====

export interface SearchQuery {
  q: string;
  tables?: string[];
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  sys_id: string;
  number: string;
  title: string;
  description: string;
  table: string;
  state: string;
  priority: string;
  confidence: number;
  created: string;
  updated: string;
  url: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  took: number;
}

// ===== Authentication Types =====

export interface LoginRequest {
  username: string;
  password: string;
  instance?: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    username: string;
    name: string;
    email: string;
    role: string;
  };
  error?: string;
}

export interface TokenRefreshRequest {
  refreshToken: string;
}

export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ===== Analytics Types =====

export interface TimeSeriesDataPoint {
  timestamp: string;
  value: number;
}

export interface TimeSeriesData {
  metric: string;
  dataPoints: TimeSeriesDataPoint[];
  aggregation?: "sum" | "avg" | "min" | "max" | "count";
}

export interface AnalyticsQuery {
  metric: string;
  startDate: string;
  endDate: string;
  interval?: "hour" | "day" | "week" | "month";
  filters?: Record<string, any>;
}

export interface AnalyticsResponse {
  query: AnalyticsQuery;
  data: TimeSeriesData[];
  total: number;
  took: number;
}

// All types exported via 'export interface' declarations above