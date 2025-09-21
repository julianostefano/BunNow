/**
 * API Response Schemas - HTTP response validation for Elysia routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Standardized API response patterns
 * - Error handling and status codes
 */

import { t } from "elysia";
import { z } from "zod";
import { SysIdSchema, ServiceNowDateTimeSchema } from "../core/base.schemas";
import { zodToTypeBox } from "../utils/zod-typebox-adapter";

// ===== COMMON RESPONSE PATTERNS =====

/**
 * Standard API error response
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.any()).optional(),
    timestamp: z.string().datetime(),
    request_id: z.string().uuid().optional(),
  }),
  success: z.literal(false),
});

export const ErrorResponseTypeBox = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Record(t.String(), t.Any())),
    timestamp: t.String({ format: "date-time" }),
    request_id: t.Optional(t.String({ format: "uuid" })),
  }),
  success: t.Literal(false),
});

/**
 * Standard success response wrapper
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    success: z.literal(true),
    metadata: z
      .object({
        timestamp: z.string().datetime(),
        request_id: z.string().uuid().optional(),
        execution_time_ms: z.number().min(0).optional(),
      })
      .optional(),
  });

/**
 * Paginated response wrapper
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      total: z.number().int().min(0),
      limit: z.number().int().min(1),
      offset: z.number().int().min(0),
      has_next: z.boolean(),
      has_previous: z.boolean(),
      page_count: z.number().int().min(0),
    }),
    success: z.literal(true),
    metadata: z
      .object({
        timestamp: z.string().datetime(),
        request_id: z.string().uuid().optional(),
        execution_time_ms: z.number().min(0).optional(),
      })
      .optional(),
  });

// TypeBox versions for Elysia
export const PaginatedResponseTypeBox = (itemSchema: any) =>
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
export const ServiceNowRecordSchema = z
  .object({
    sys_id: SysIdSchema,
    sys_created_on: ServiceNowDateTimeSchema,
    sys_updated_on: ServiceNowDateTimeSchema,
    sys_created_by: z.string(),
    sys_updated_by: z.string(),
    sys_mod_count: z.number().int().min(0),
    sys_tags: z.string().optional(),
  })
  .passthrough(); // Allow additional fields

export const ServiceNowRecordTypeBox = t.Object({
  sys_id: t.String({ minLength: 32, maxLength: 32, pattern: "^[0-9a-f]{32}$" }),
  sys_created_on: t.String(),
  sys_updated_on: t.String(),
  sys_created_by: t.String(),
  sys_updated_by: t.String(),
  sys_mod_count: t.Integer({ minimum: 0 }),
  sys_tags: t.Optional(t.String()),
});

/**
 * Create record response
 */
export const CreateRecordResponseSchema = SuccessResponseSchema(
  z.object({
    record: ServiceNowRecordSchema,
    operation: z.literal("create"),
    table: z.string(),
  }),
);

export const CreateRecordResponseTypeBox = t.Object({
  data: t.Object({
    record: ServiceNowRecordTypeBox,
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

/**
 * Update record response
 */
export const UpdateRecordResponseSchema = SuccessResponseSchema(
  z.object({
    record: ServiceNowRecordSchema,
    operation: z.literal("update"),
    table: z.string(),
    changes: z
      .record(
        z.string(),
        z.object({
          old_value: z.any(),
          new_value: z.any(),
        }),
      )
      .optional(),
  }),
);

export const UpdateRecordResponseTypeBox = t.Object({
  data: t.Object({
    record: ServiceNowRecordTypeBox,
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

/**
 * Delete record response
 */
export const DeleteRecordResponseSchema = SuccessResponseSchema(
  z.object({
    sys_id: SysIdSchema,
    operation: z.literal("delete"),
    table: z.string(),
    deleted_at: z.string().datetime(),
  }),
);

export const DeleteRecordResponseTypeBox = t.Object({
  data: t.Object({
    sys_id: t.String({
      minLength: 32,
      maxLength: 32,
      pattern: "^[0-9a-f]{32}$",
    }),
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

/**
 * Get record response
 */
export const GetRecordResponseSchema = SuccessResponseSchema(
  z.object({
    record: ServiceNowRecordSchema,
    operation: z.literal("get"),
    table: z.string(),
  }),
);

export const GetRecordResponseTypeBox = t.Object({
  data: t.Object({
    record: ServiceNowRecordTypeBox,
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

/**
 * List records response
 */
export const ListRecordsResponseSchema = PaginatedResponseSchema(
  ServiceNowRecordSchema,
);

export const ListRecordsResponseTypeBox = PaginatedResponseTypeBox(
  ServiceNowRecordTypeBox,
);

// ===== BATCH OPERATIONS =====

/**
 * Batch operation result
 */
export const BatchOperationResultSchema = z.object({
  operation: z.enum(["create", "update", "delete", "get"]),
  table: z.string(),
  sys_id: SysIdSchema.optional(),
  success: z.boolean(),
  record: ServiceNowRecordSchema.optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
  execution_time_ms: z.number().min(0).optional(),
});

export const BatchOperationResultTypeBox = t.Object({
  operation: t.Union([
    t.Literal("create"),
    t.Literal("update"),
    t.Literal("delete"),
    t.Literal("get"),
  ]),
  table: t.String(),
  sys_id: t.Optional(
    t.String({ minLength: 32, maxLength: 32, pattern: "^[0-9a-f]{32}$" }),
  ),
  success: t.Boolean(),
  record: t.Optional(ServiceNowRecordTypeBox),
  error: t.Optional(
    t.Object({
      code: t.String(),
      message: t.String(),
      details: t.Optional(t.Record(t.String(), t.Any())),
    }),
  ),
  execution_time_ms: t.Optional(t.Number({ minimum: 0 })),
});

/**
 * Batch response
 */
export const BatchResponseSchema = SuccessResponseSchema(
  z.object({
    results: z.array(BatchOperationResultSchema),
    summary: z.object({
      total_operations: z.number().int().min(0),
      successful_operations: z.number().int().min(0),
      failed_operations: z.number().int().min(0),
      total_execution_time_ms: z.number().min(0),
    }),
  }),
);

export const BatchResponseTypeBox = t.Object({
  data: t.Object({
    results: t.Array(BatchOperationResultTypeBox),
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

// ===== ATTACHMENT RESPONSES =====

/**
 * Attachment metadata
 */
export const AttachmentMetadataSchema = z.object({
  sys_id: SysIdSchema,
  file_name: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().min(0),
  size_compressed: z.number().int().min(0),
  compressed: z.boolean(),
  state: z.enum(["pending", "available", "processing", "error"]),
  hash: z.string().optional(),
  table_name: z.string(),
  table_sys_id: SysIdSchema,
  sys_created_on: ServiceNowDateTimeSchema,
  sys_created_by: z.string(),
});

export const AttachmentMetadataTypeBox = t.Object({
  sys_id: t.String({ minLength: 32, maxLength: 32, pattern: "^[0-9a-f]{32}$" }),
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
  table_sys_id: t.String({
    minLength: 32,
    maxLength: 32,
    pattern: "^[0-9a-f]{32}$",
  }),
  sys_created_on: t.String(),
  sys_created_by: t.String(),
});

/**
 * Upload attachment response
 */
export const UploadAttachmentResponseSchema = SuccessResponseSchema(
  z.object({
    attachment: AttachmentMetadataSchema,
    operation: z.literal("upload"),
  }),
);

export const UploadAttachmentResponseTypeBox = t.Object({
  data: t.Object({
    attachment: AttachmentMetadataTypeBox,
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

// ===== AUTHENTICATION RESPONSES =====

/**
 * Login response
 */
export const LoginResponseSchema = SuccessResponseSchema(
  z.object({
    token: z.string(),
    token_type: z.literal("Bearer"),
    expires_in: z.number().int().positive(),
    expires_at: z.string().datetime(),
    user: z.object({
      sys_id: SysIdSchema,
      user_name: z.string(),
      first_name: z.string(),
      last_name: z.string(),
      email: z.string().email(),
      roles: z.array(z.string()),
    }),
    instance_info: z.object({
      name: z.string(),
      version: z.string(),
      build: z.string().optional(),
    }),
  }),
);

export const LoginResponseTypeBox = t.Object({
  data: t.Object({
    token: t.String(),
    token_type: t.Literal("Bearer"),
    expires_in: t.Integer({ minimum: 1 }),
    expires_at: t.String({ format: "date-time" }),
    user: t.Object({
      sys_id: t.String({
        minLength: 32,
        maxLength: 32,
        pattern: "^[0-9a-f]{32}$",
      }),
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

/**
 * Token validation response
 */
export const ValidateTokenResponseSchema = SuccessResponseSchema(
  z.object({
    valid: z.boolean(),
    expires_at: z.string().datetime().optional(),
    user: z
      .object({
        sys_id: SysIdSchema,
        user_name: z.string(),
        active: z.boolean(),
      })
      .optional(),
  }),
);

export const ValidateTokenResponseTypeBox = t.Object({
  data: t.Object({
    valid: t.Boolean(),
    expires_at: t.Optional(t.String({ format: "date-time" })),
    user: t.Optional(
      t.Object({
        sys_id: t.String({
          minLength: 32,
          maxLength: 32,
          pattern: "^[0-9a-f]{32}$",
        }),
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

// ===== HEALTH AND STATUS =====

/**
 * Health check response
 */
export const HealthResponseSchema = z.object({
  status: z.enum(["healthy", "unhealthy", "degraded"]),
  timestamp: z.string().datetime(),
  version: z.string(),
  uptime_seconds: z.number().min(0),
  checks: z.object({
    database: z.enum(["ok", "error", "warning"]),
    servicenow: z.enum(["ok", "error", "warning"]),
    redis: z.enum(["ok", "error", "warning"]).optional(),
    opensearch: z.enum(["ok", "error", "warning"]).optional(),
  }),
});

export const HealthResponseTypeBox = t.Object({
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

// ===== TYPE EXPORTS =====

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ServiceNowRecord = z.infer<typeof ServiceNowRecordSchema>;
export type CreateRecordResponse = z.infer<typeof CreateRecordResponseSchema>;
export type UpdateRecordResponse = z.infer<typeof UpdateRecordResponseSchema>;
export type DeleteRecordResponse = z.infer<typeof DeleteRecordResponseSchema>;
export type GetRecordResponse = z.infer<typeof GetRecordResponseSchema>;
export type BatchOperationResult = z.infer<typeof BatchOperationResultSchema>;
export type BatchResponse = z.infer<typeof BatchResponseSchema>;
export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>;
export type UploadAttachmentResponse = z.infer<
  typeof UploadAttachmentResponseSchema
>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type ValidateTokenResponse = z.infer<typeof ValidateTokenResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
