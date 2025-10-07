/**
 * API Request TypeBox Schemas - HTTP request validation for Elysia routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox
 * - Eliminates Zod dependency overhead
 * - Uses Elysia's native validation system
 * - Maintains all validation logic
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Elysia-compatible TypeBox schemas for route validation
 */

import { t, type Static } from "elysia";
import { SysId } from "../core/base.typebox";

// ===== COMMON REQUEST PATTERNS =====

/**
 * Generic pagination parameters
 */
export const Pagination = t.Object({
  limit: t.Integer({ minimum: 1, maximum: 1000, default: 100 }),
  offset: t.Integer({ minimum: 0, default: 0 }),
  order_by: t.Optional(t.String()),
  order_direction: t.Union([t.Literal("asc"), t.Literal("desc")]),
});

export type PaginationType = Static<typeof Pagination>;

/**
 * Common query parameters for ServiceNow tables
 */
export const ServiceNowQuery = t.Object({
  sysparm_query: t.Optional(t.String()), // ServiceNow encoded query
  sysparm_fields: t.Optional(t.String()), // Comma-separated field list
  sysparm_limit: t.Optional(t.Integer({ minimum: 1, maximum: 10000 })),
  sysparm_offset: t.Optional(t.Integer({ minimum: 0 })),
  sysparm_view: t.Optional(t.String()),
  sysparm_display_value: t.Union([
    t.Literal("true"),
    t.Literal("false"),
    t.Literal("all"),
  ]),
  sysparm_exclude_reference_link: t.Boolean({ default: false }),
  sysparm_no_count: t.Boolean({ default: false }),
});

export type ServiceNowQueryType = Static<typeof ServiceNowQuery>;

// ===== RECORD OPERATIONS =====

/**
 * Create record request
 */
export const CreateRecordRequest = t.Object({
  table: t.String({ minLength: 1 }),
  data: t.Record(t.String(), t.Any()),
  options: t.Optional(
    t.Object({
      display_value: t.Boolean({ default: false }),
      exclude_reference_link: t.Boolean({ default: false }),
      suppress_auto_sys_field: t.Boolean({ default: false }),
      input_display_value: t.Boolean({ default: false }),
    }),
  ),
});

export type CreateRecordRequestType = Static<typeof CreateRecordRequest>;

/**
 * Update record request
 */
export const UpdateRecordRequest = t.Object({
  table: t.String({ minLength: 1 }),
  sys_id: SysId,
  data: t.Record(t.String(), t.Any()),
  options: t.Optional(
    t.Object({
      display_value: t.Boolean({ default: false }),
      exclude_reference_link: t.Boolean({ default: false }),
      suppress_auto_sys_field: t.Boolean({ default: false }),
      input_display_value: t.Boolean({ default: false }),
    }),
  ),
});

export type UpdateRecordRequestType = Static<typeof UpdateRecordRequest>;

/**
 * Delete record request
 */
export const DeleteRecordRequest = t.Object({
  table: t.String({ minLength: 1 }),
  sys_id: SysId,
  options: t.Optional(
    t.Object({
      cascade: t.Boolean({ default: false }),
      force: t.Boolean({ default: false }),
    }),
  ),
});

export type DeleteRecordRequestType = Static<typeof DeleteRecordRequest>;

/**
 * Get record request
 */
export const GetRecordRequest = t.Object({
  table: t.String({ minLength: 1 }),
  sys_id: SysId,
  options: t.Optional(
    t.Object({
      sysparm_fields: t.Optional(t.String()),
      sysparm_display_value: t.Union([
        t.Literal("true"),
        t.Literal("false"),
        t.Literal("all"),
      ]),
      sysparm_exclude_reference_link: t.Boolean({ default: false }),
      sysparm_view: t.Optional(t.String()),
    }),
  ),
});

export type GetRecordRequestType = Static<typeof GetRecordRequest>;

/**
 * List records request
 */
export const ListRecordsRequest = t.Object({
  table: t.String({ minLength: 1 }),
  query: t.Optional(ServiceNowQuery),
  pagination: t.Optional(Pagination),
});

export type ListRecordsRequestType = Static<typeof ListRecordsRequest>;

// ===== BATCH OPERATIONS =====

/**
 * Batch operation request
 */
export const BatchOperation = t.Object({
  operation: t.Union([
    t.Literal("create"),
    t.Literal("update"),
    t.Literal("delete"),
    t.Literal("get"),
  ]),
  table: t.String({ minLength: 1 }),
  sys_id: t.Optional(SysId), // Required for update, delete, get
  data: t.Optional(t.Record(t.String(), t.Any())), // Required for create, update
  options: t.Optional(
    t.Object({
      display_value: t.Boolean({ default: false }),
      exclude_reference_link: t.Boolean({ default: false }),
      suppress_auto_sys_field: t.Boolean({ default: false }),
      input_display_value: t.Boolean({ default: false }),
    }),
  ),
});

export type BatchOperationType = Static<typeof BatchOperation>;

/**
 * Batch request with multiple operations
 */
export const BatchRequest = t.Object({
  operations: t.Array(BatchOperation, { minItems: 1, maxItems: 100 }),
  options: t.Optional(
    t.Object({
      atomic: t.Boolean({ default: false }), // All operations succeed or fail together
      stop_on_error: t.Boolean({ default: true }),
      parallel: t.Boolean({ default: false }),
    }),
  ),
});

export type BatchRequestType = Static<typeof BatchRequest>;

// ===== ATTACHMENT OPERATIONS =====

/**
 * Upload attachment request
 */
export const UploadAttachmentRequest = t.Object({
  table: t.String({ minLength: 1 }),
  sys_id: SysId,
  file_name: t.String({ minLength: 1 }),
  content_type: t.Optional(t.String()),
  encryption_context: t.Optional(t.String()),
  table_sys_id: t.Optional(SysId), // For attachment to specific record
});

export type UploadAttachmentRequestType = Static<
  typeof UploadAttachmentRequest
>;

/**
 * Download attachment request
 */
export const DownloadAttachmentRequest = t.Object({
  attachment_id: SysId,
  options: t.Optional(
    t.Object({
      decrypt: t.Boolean({ default: false }),
      include_metadata: t.Boolean({ default: false }),
    }),
  ),
});

export type DownloadAttachmentRequestType = Static<
  typeof DownloadAttachmentRequest
>;

// ===== AUTHENTICATION =====

/**
 * Login request
 */
export const LoginRequest = t.Object({
  instance_url: t.String({ format: "uri" }),
  username: t.String({ minLength: 1 }),
  password: t.String({ minLength: 1 }),
  options: t.Optional(
    t.Object({
      remember: t.Boolean({ default: false }),
      timeout: t.Integer({ minimum: 1, default: 3600 }), // seconds
    }),
  ),
});

export type LoginRequestType = Static<typeof LoginRequest>;

/**
 * Token validation request
 */
export const ValidateTokenRequest = t.Object({
  token: t.String({ minLength: 1 }),
  instance_url: t.Optional(t.String({ format: "uri" })),
});

export type ValidateTokenRequestType = Static<typeof ValidateTokenRequest>;

// ===== SEARCH AND ANALYTICS =====

/**
 * Search request
 */
export const SearchRequest = t.Object({
  query: t.String({ minLength: 1 }),
  tables: t.Optional(t.Array(t.String())), // Specific tables to search
  fields: t.Optional(t.Array(t.String())), // Specific fields to search
  filters: t.Optional(
    t.Object({
      date_range: t.Optional(
        t.Object({
          from: t.Optional(t.Date()),
          to: t.Optional(t.Date()),
        }),
      ),
      priority: t.Optional(t.Array(t.String())),
      state: t.Optional(t.Array(t.String())),
      assignment_group: t.Optional(t.Array(t.String())),
    }),
  ),
  pagination: t.Optional(Pagination),
  options: t.Optional(
    t.Object({
      highlight: t.Boolean({ default: false }),
      fuzzy: t.Boolean({ default: false }),
      case_sensitive: t.Boolean({ default: false }),
    }),
  ),
});

export type SearchRequestType = Static<typeof SearchRequest>;

// ===== EXPORT SUMMARY =====

/**
 * API Request schemas exported:
 *
 * Common patterns:
 * - Pagination: Limit, offset, ordering
 * - ServiceNowQuery: Standard ServiceNow query parameters
 *
 * Record operations:
 * - CreateRecordRequest: Create new records
 * - UpdateRecordRequest: Update existing records
 * - DeleteRecordRequest: Delete records
 * - GetRecordRequest: Retrieve single record
 * - ListRecordsRequest: List multiple records
 *
 * Batch operations:
 * - BatchOperation: Single operation in batch
 * - BatchRequest: Multiple operations (1-100)
 *
 * Attachments:
 * - UploadAttachmentRequest: Upload files
 * - DownloadAttachmentRequest: Download files
 *
 * Authentication:
 * - LoginRequest: User authentication
 * - ValidateTokenRequest: Token validation
 *
 * Search:
 * - SearchRequest: Full-text search with filters
 *
 * All schemas use TypeBox for Elysia native validation
 */
