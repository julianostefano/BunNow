/**
 * API Response TypeBox Schemas - HTTP response validation for Elysia routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox
 * - Eliminates Zod dependency overhead
 * - Uses Elysia's native validation system
 * - Maintains standardized response patterns
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Standardized API response patterns
 * - Error handling and status codes
 */

import { t, type Static } from "elysia";
import { SysId, ServiceNowDateTime } from "../core/base.typebox";

// ===== COMMON RESPONSE PATTERNS =====

/**
 * Standard API error response
 */
export const ErrorResponse = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Record(t.String(), t.Any())),
    timestamp: t.String({ format: "date-time" }),
    request_id: t.Optional(t.String({ format: "uuid" })),
  }),
  success: t.Literal(false),
});

export type ErrorResponseType = Static<typeof ErrorResponse>;

/**
 * Standard success response wrapper factory
 */
export const SuccessResponse = <T extends ReturnType<typeof t.Object>>(
  dataSchema: T,
) =>
  t.Object({
    data: dataSchema,
    success: t.Literal(true),
    metadata: t.Optional(
      t.Object({
        timestamp: t.String({ format: "date-time" }),
        request_id: t.Optional(t.String({ format: "uuid" })),
        execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
      }),
    ),
  });

/**
 * Paginated response wrapper factory
 */
export const PaginatedResponse = <T extends ReturnType<typeof t.Any>>(
  itemSchema: T,
) =>
  t.Object({
    data: t.Array(itemSchema),
    pagination: t.Object({
      total: t.Integer({ minimum: 0 }),
      limit: t.Integer({ minimum: 1 }),
      offset: t.Integer({ minimum: 0 }),
      has_next: t.Boolean(),
      has_previous: t.Boolean(),
      page_count: t.Integer({ minimum: 0 }),
    }),
    success: t.Literal(true),
    metadata: t.Optional(
      t.Object({
        timestamp: t.String({ format: "date-time" }),
        request_id: t.Optional(t.String({ format: "uuid" })),
        execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
      }),
    ),
  });

// ===== SERVICENOW RECORD RESPONSES =====

/**
 * ServiceNow record response
 */
export const ServiceNowRecord = t.Object({
  sys_id: SysId,
  sys_created_on: ServiceNowDateTime,
  sys_updated_on: ServiceNowDateTime,
  sys_created_by: t.String(),
  sys_updated_by: t.String(),
  sys_mod_count: t.Integer({ minimum: 0 }),
  sys_tags: t.Optional(t.String()),
});

export type ServiceNowRecordType = Static<typeof ServiceNowRecord>;

/**
 * Create record response
 */
export const CreateRecordResponse = t.Object({
  data: t.Object({
    record: ServiceNowRecord,
    operation: t.Literal("create"),
    table: t.String(),
  }),
  success: t.Literal(true),
  metadata: t.Optional(
    t.Object({
      timestamp: t.String({ format: "date-time" }),
      request_id: t.Optional(t.String({ format: "uuid" })),
      execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
    }),
  ),
});

export type CreateRecordResponseType = Static<typeof CreateRecordResponse>;

/**
 * Update record response
 */
export const UpdateRecordResponse = t.Object({
  data: t.Object({
    record: ServiceNowRecord,
    operation: t.Literal("update"),
    table: t.String(),
    changes: t.Optional(
      t.Record(
        t.String(),
        t.Object({
          old_value: t.Any(),
          new_value: t.Any(),
        }),
      ),
    ),
  }),
  success: t.Literal(true),
  metadata: t.Optional(
    t.Object({
      timestamp: t.String({ format: "date-time" }),
      request_id: t.Optional(t.String({ format: "uuid" })),
      execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
    }),
  ),
});

export type UpdateRecordResponseType = Static<typeof UpdateRecordResponse>;

/**
 * Delete record response
 */
export const DeleteRecordResponse = t.Object({
  data: t.Object({
    sys_id: SysId,
    operation: t.Literal("delete"),
    table: t.String(),
    deleted_at: t.String({ format: "date-time" }),
  }),
  success: t.Literal(true),
  metadata: t.Optional(
    t.Object({
      timestamp: t.String({ format: "date-time" }),
      request_id: t.Optional(t.String({ format: "uuid" })),
      execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
    }),
  ),
});

export type DeleteRecordResponseType = Static<typeof DeleteRecordResponse>;

/**
 * Get record response
 */
export const GetRecordResponse = t.Object({
  data: t.Object({
    record: ServiceNowRecord,
    operation: t.Literal("get"),
    table: t.String(),
  }),
  success: t.Literal(true),
  metadata: t.Optional(
    t.Object({
      timestamp: t.String({ format: "date-time" }),
      request_id: t.Optional(t.String({ format: "uuid" })),
      execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
    }),
  ),
});

export type GetRecordResponseType = Static<typeof GetRecordResponse>;

/**
 * List records response
 */
export const ListRecordsResponse = PaginatedResponse(ServiceNowRecord);

export type ListRecordsResponseType = Static<typeof ListRecordsResponse>;

// ===== BATCH OPERATIONS =====

/**
 * Batch operation result
 */
export const BatchOperationResult = t.Object({
  operation: t.Union([
    t.Literal("create"),
    t.Literal("update"),
    t.Literal("delete"),
    t.Literal("get"),
  ]),
  table: t.String(),
  sys_id: t.Optional(SysId),
  success: t.Boolean(),
  record: t.Optional(ServiceNowRecord),
  error: t.Optional(
    t.Object({
      code: t.String(),
      message: t.String(),
      details: t.Optional(t.Record(t.String(), t.Any())),
    }),
  ),
  execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
});

export type BatchOperationResultType = Static<typeof BatchOperationResult>;

/**
 * Batch response
 */
export const BatchResponse = t.Object({
  data: t.Object({
    results: t.Array(BatchOperationResult),
    summary: t.Object({
      total_operations: t.Integer({ minimum: 0 }),
      successful_operations: t.Integer({ minimum: 0 }),
      failed_operations: t.Integer({ minimum: 0 }),
      total_execution_time_ms: t.Number({ minimum: 0 }),
    }),
  }),
  success: t.Literal(true),
  metadata: t.Optional(
    t.Object({
      timestamp: t.String({ format: "date-time" }),
      request_id: t.Optional(t.String({ format: "uuid" })),
      execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
    }),
  ),
});

export type BatchResponseType = Static<typeof BatchResponse>;

// ===== ATTACHMENT RESPONSES =====

/**
 * Attachment metadata
 */
export const AttachmentMetadata = t.Object({
  sys_id: SysId,
  file_name: t.String(),
  content_type: t.String(),
  size_bytes: t.Integer({ minimum: 0 }),
  size_compressed: t.Integer({ minimum: 0 }),
  compressed: t.Boolean(),
  state: t.Union([
    t.Literal("pending"),
    t.Literal("available"),
    t.Literal("processing"),
    t.Literal("error"),
  ]),
  hash: t.Optional(t.String()),
  table_name: t.String(),
  table_sys_id: SysId,
  sys_created_on: ServiceNowDateTime,
  sys_created_by: t.String(),
});

export type AttachmentMetadataType = Static<typeof AttachmentMetadata>;

/**
 * Upload attachment response
 */
export const UploadAttachmentResponse = t.Object({
  data: t.Object({
    attachment: AttachmentMetadata,
    operation: t.Literal("upload"),
  }),
  success: t.Literal(true),
  metadata: t.Optional(
    t.Object({
      timestamp: t.String({ format: "date-time" }),
      request_id: t.Optional(t.String({ format: "uuid" })),
      execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
    }),
  ),
});

export type UploadAttachmentResponseType = Static<
  typeof UploadAttachmentResponse
>;

// ===== AUTHENTICATION RESPONSES =====

/**
 * Login response
 */
export const LoginResponse = t.Object({
  data: t.Object({
    token: t.String(),
    token_type: t.Literal("Bearer"),
    expires_in: t.Integer({ minimum: 1 }),
    expires_at: t.String({ format: "date-time" }),
    user: t.Object({
      sys_id: SysId,
      user_name: t.String(),
      first_name: t.String(),
      last_name: t.String(),
      email: t.String({ format: "email" }),
      roles: t.Array(t.String()),
    }),
    instance_info: t.Object({
      name: t.String(),
      version: t.String(),
      build: t.Optional(t.String()),
    }),
  }),
  success: t.Literal(true),
  metadata: t.Optional(
    t.Object({
      timestamp: t.String({ format: "date-time" }),
      request_id: t.Optional(t.String({ format: "uuid" })),
      execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
    }),
  ),
});

export type LoginResponseType = Static<typeof LoginResponse>;

/**
 * Token validation response
 */
export const ValidateTokenResponse = t.Object({
  data: t.Object({
    valid: t.Boolean(),
    expires_at: t.Optional(t.String({ format: "date-time" })),
    user: t.Optional(
      t.Object({
        sys_id: SysId,
        user_name: t.String(),
        active: t.Boolean(),
      }),
    ),
  }),
  success: t.Literal(true),
  metadata: t.Optional(
    t.Object({
      timestamp: t.String({ format: "date-time" }),
      request_id: t.Optional(t.String({ format: "uuid" })),
      execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
    }),
  ),
});

export type ValidateTokenResponseType = Static<typeof ValidateTokenResponse>;

// ===== HEALTH AND STATUS =====

/**
 * Health check response
 */
export const HealthResponse = t.Object({
  status: t.Union([
    t.Literal("healthy"),
    t.Literal("unhealthy"),
    t.Literal("degraded"),
  ]),
  timestamp: t.String({ format: "date-time" }),
  version: t.String(),
  uptime_seconds: t.Number({ minimum: 0 }),
  checks: t.Object({
    database: t.Union([
      t.Literal("ok"),
      t.Literal("error"),
      t.Literal("warning"),
    ]),
    servicenow: t.Union([
      t.Literal("ok"),
      t.Literal("error"),
      t.Literal("warning"),
    ]),
    redis: t.Optional(
      t.Union([t.Literal("ok"), t.Literal("error"), t.Literal("warning")]),
    ),
    opensearch: t.Optional(
      t.Union([t.Literal("ok"), t.Literal("error"), t.Literal("warning")]),
    ),
  }),
});

export type HealthResponseType = Static<typeof HealthResponse>;

// ===== EXPORT SUMMARY =====

/**
 * API Response schemas exported:
 *
 * Common patterns:
 * - ErrorResponse: Standard error format
 * - SuccessResponse: Success wrapper factory
 * - PaginatedResponse: Paginated data wrapper factory
 *
 * ServiceNow records:
 * - ServiceNowRecord: Base record with sys fields
 * - CreateRecordResponse: Creation response
 * - UpdateRecordResponse: Update response with change tracking
 * - DeleteRecordResponse: Deletion confirmation
 * - GetRecordResponse: Single record retrieval
 * - ListRecordsResponse: Multiple records with pagination
 *
 * Batch operations:
 * - BatchOperationResult: Individual operation result
 * - BatchResponse: Multiple operation results with summary
 *
 * Attachments:
 * - AttachmentMetadata: File metadata
 * - UploadAttachmentResponse: Upload confirmation
 *
 * Authentication:
 * - LoginResponse: Login with token and user info
 * - ValidateTokenResponse: Token validation result
 *
 * Health:
 * - HealthResponse: System health status
 *
 * All schemas use TypeBox for Elysia native validation
 */
