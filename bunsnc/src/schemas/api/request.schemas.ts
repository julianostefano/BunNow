/**
 * API Request Schemas - HTTP request validation for Elysia routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Elysia-compatible TypeBox schemas for route validation
 * - Conversion from Zod schemas for consistency
 */

import { t } from 'elysia';
import { z } from 'zod';
import { SysIdSchema } from '../core/base.schemas';
import { zodToTypeBox } from '../utils/zod-typebox-adapter';

// ===== COMMON REQUEST PATTERNS =====

/**
 * Generic pagination parameters
 */
export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
  order_by: z.string().optional(),
  order_direction: z.enum(['asc', 'desc']).default('asc')
});

export const PaginationTypeBox = zodToTypeBox(PaginationSchema);

/**
 * Common query parameters for ServiceNow tables
 */
export const ServiceNowQuerySchema = z.object({
  sysparm_query: z.string().optional(), // ServiceNow encoded query
  sysparm_fields: z.string().optional(), // Comma-separated field list
  sysparm_limit: z.number().int().min(1).max(10000).optional(),
  sysparm_offset: z.number().int().min(0).optional(),
  sysparm_view: z.string().optional(),
  sysparm_display_value: z.enum(['true', 'false', 'all']).default('false'),
  sysparm_exclude_reference_link: z.boolean().default(false),
  sysparm_no_count: z.boolean().default(false)
});

export const ServiceNowQueryTypeBox = zodToTypeBox(ServiceNowQuerySchema);

// ===== RECORD OPERATIONS =====

/**
 * Create record request
 */
export const CreateRecordRequestSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  data: z.record(z.string(), z.any()),
  options: z.object({
    display_value: z.boolean().default(false),
    exclude_reference_link: z.boolean().default(false),
    suppress_auto_sys_field: z.boolean().default(false),
    input_display_value: z.boolean().default(false)
  }).optional()
});

export const CreateRecordRequestTypeBox = t.Object({
  table: t.String({ minLength: 1 }),
  data: t.Record(t.String(), t.Any()),
  options: t.Optional(t.Object({
    display_value: t.Optional(t.Boolean({ default: false })),
    exclude_reference_link: t.Optional(t.Boolean({ default: false })),
    suppress_auto_sys_field: t.Optional(t.Boolean({ default: false })),
    input_display_value: t.Optional(t.Boolean({ default: false }))
  }))
});

/**
 * Update record request
 */
export const UpdateRecordRequestSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  sys_id: SysIdSchema,
  data: z.record(z.string(), z.any()),
  options: z.object({
    display_value: z.boolean().default(false),
    exclude_reference_link: z.boolean().default(false),
    suppress_auto_sys_field: z.boolean().default(false),
    input_display_value: z.boolean().default(false)
  }).optional()
});

export const UpdateRecordRequestTypeBox = t.Object({
  table: t.String({ minLength: 1 }),
  sys_id: t.String({ minLength: 32, maxLength: 32, pattern: '^[0-9a-f]{32}$' }),
  data: t.Record(t.String(), t.Any()),
  options: t.Optional(t.Object({
    display_value: t.Optional(t.Boolean({ default: false })),
    exclude_reference_link: t.Optional(t.Boolean({ default: false })),
    suppress_auto_sys_field: t.Optional(t.Boolean({ default: false })),
    input_display_value: t.Optional(t.Boolean({ default: false }))
  }))
});

/**
 * Delete record request
 */
export const DeleteRecordRequestSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  sys_id: SysIdSchema,
  options: z.object({
    cascade: z.boolean().default(false),
    force: z.boolean().default(false)
  }).optional()
});

export const DeleteRecordRequestTypeBox = t.Object({
  table: t.String({ minLength: 1 }),
  sys_id: t.String({ minLength: 32, maxLength: 32, pattern: '^[0-9a-f]{32}$' }),
  options: t.Optional(t.Object({
    cascade: t.Optional(t.Boolean({ default: false })),
    force: t.Optional(t.Boolean({ default: false }))
  }))
});

/**
 * Get record request
 */
export const GetRecordRequestSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  sys_id: SysIdSchema,
  options: z.object({
    sysparm_fields: z.string().optional(),
    sysparm_display_value: z.enum(['true', 'false', 'all']).default('false'),
    sysparm_exclude_reference_link: z.boolean().default(false),
    sysparm_view: z.string().optional()
  }).optional()
});

export const GetRecordRequestTypeBox = t.Object({
  table: t.String({ minLength: 1 }),
  sys_id: t.String({ minLength: 32, maxLength: 32, pattern: '^[0-9a-f]{32}$' }),
  options: t.Optional(t.Object({
    sysparm_fields: t.Optional(t.String()),
    sysparm_display_value: t.Optional(t.Union([t.Literal('true'), t.Literal('false'), t.Literal('all')])),
    sysparm_exclude_reference_link: t.Optional(t.Boolean({ default: false })),
    sysparm_view: t.Optional(t.String())
  }))
});

/**
 * List records request
 */
export const ListRecordsRequestSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  query: ServiceNowQuerySchema.optional(),
  pagination: PaginationSchema.optional()
});

export const ListRecordsRequestTypeBox = t.Object({
  table: t.String({ minLength: 1 }),
  query: t.Optional(ServiceNowQueryTypeBox),
  pagination: t.Optional(PaginationTypeBox)
});

// ===== BATCH OPERATIONS =====

/**
 * Batch operation request
 */
export const BatchOperationSchema = z.object({
  operation: z.enum(['create', 'update', 'delete', 'get']),
  table: z.string().min(1, 'Table name is required'),
  sys_id: SysIdSchema.optional(), // Required for update, delete, get
  data: z.record(z.string(), z.any()).optional(), // Required for create, update
  options: z.object({
    display_value: z.boolean().default(false),
    exclude_reference_link: z.boolean().default(false),
    suppress_auto_sys_field: z.boolean().default(false),
    input_display_value: z.boolean().default(false)
  }).optional()
}).refine((data) => {
  // Business rules for operations
  if (['update', 'delete', 'get'].includes(data.operation) && !data.sys_id) {
    return false;
  }
  
  if (['create', 'update'].includes(data.operation) && !data.data) {
    return false;
  }
  
  return true;
}, {
  message: 'Invalid batch operation parameters'
});

export const BatchRequestSchema = z.object({
  operations: z.array(BatchOperationSchema).min(1, 'At least one operation required').max(100, 'Maximum 100 operations allowed'),
  options: z.object({
    atomic: z.boolean().default(false), // All operations succeed or fail together
    stop_on_error: z.boolean().default(true),
    parallel: z.boolean().default(false)
  }).optional()
});

export const BatchRequestTypeBox = t.Object({
  operations: t.Array(t.Object({
    operation: t.Union([t.Literal('create'), t.Literal('update'), t.Literal('delete'), t.Literal('get')]),
    table: t.String({ minLength: 1 }),
    sys_id: t.Optional(t.String({ minLength: 32, maxLength: 32, pattern: '^[0-9a-f]{32}$' })),
    data: t.Optional(t.Record(t.String(), t.Any())),
    options: t.Optional(t.Object({
      display_value: t.Optional(t.Boolean({ default: false })),
      exclude_reference_link: t.Optional(t.Boolean({ default: false })),
      suppress_auto_sys_field: t.Optional(t.Boolean({ default: false })),
      input_display_value: t.Optional(t.Boolean({ default: false }))
    }))
  }), { minItems: 1, maxItems: 100 }),
  options: t.Optional(t.Object({
    atomic: t.Optional(t.Boolean({ default: false })),
    stop_on_error: t.Optional(t.Boolean({ default: true })),
    parallel: t.Optional(t.Boolean({ default: false }))
  }))
});

// ===== ATTACHMENT OPERATIONS =====

/**
 * Upload attachment request
 */
export const UploadAttachmentRequestSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  sys_id: SysIdSchema,
  file_name: z.string().min(1, 'File name is required'),
  content_type: z.string().optional(),
  encryption_context: z.string().optional(),
  table_sys_id: SysIdSchema.optional() // For attachment to specific record
});

export const UploadAttachmentRequestTypeBox = t.Object({
  table: t.String({ minLength: 1 }),
  sys_id: t.String({ minLength: 32, maxLength: 32, pattern: '^[0-9a-f]{32}$' }),
  file_name: t.String({ minLength: 1 }),
  content_type: t.Optional(t.String()),
  encryption_context: t.Optional(t.String()),
  table_sys_id: t.Optional(t.String({ minLength: 32, maxLength: 32, pattern: '^[0-9a-f]{32}$' }))
});

/**
 * Download attachment request
 */
export const DownloadAttachmentRequestSchema = z.object({
  attachment_id: SysIdSchema,
  options: z.object({
    decrypt: z.boolean().default(false),
    include_metadata: z.boolean().default(false)
  }).optional()
});

export const DownloadAttachmentRequestTypeBox = t.Object({
  attachment_id: t.String({ minLength: 32, maxLength: 32, pattern: '^[0-9a-f]{32}$' }),
  options: t.Optional(t.Object({
    decrypt: t.Optional(t.Boolean({ default: false })),
    include_metadata: t.Optional(t.Boolean({ default: false }))
  }))
});

// ===== AUTHENTICATION =====

/**
 * Login request
 */
export const LoginRequestSchema = z.object({
  instance_url: z.string().url('Invalid ServiceNow instance URL'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  options: z.object({
    remember: z.boolean().default(false),
    timeout: z.number().int().positive().default(3600) // seconds
  }).optional()
});

export const LoginRequestTypeBox = t.Object({
  instance_url: t.String({ format: 'uri' }),
  username: t.String({ minLength: 1 }),
  password: t.String({ minLength: 1 }),
  options: t.Optional(t.Object({
    remember: t.Optional(t.Boolean({ default: false })),
    timeout: t.Optional(t.Integer({ minimum: 1, default: 3600 }))
  }))
});

/**
 * Token validation request
 */
export const ValidateTokenRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  instance_url: z.string().url('Invalid ServiceNow instance URL').optional()
});

export const ValidateTokenRequestTypeBox = t.Object({
  token: t.String({ minLength: 1 }),
  instance_url: t.Optional(t.String({ format: 'uri' }))
});

// ===== SEARCH AND ANALYTICS =====

/**
 * Search request
 */
export const SearchRequestSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  tables: z.array(z.string()).optional(), // Specific tables to search
  fields: z.array(z.string()).optional(), // Specific fields to search
  filters: z.object({
    date_range: z.object({
      from: z.date().optional(),
      to: z.date().optional()
    }).optional(),
    priority: z.array(z.string()).optional(),
    state: z.array(z.string()).optional(),
    assignment_group: z.array(z.string()).optional()
  }).optional(),
  pagination: PaginationSchema.optional(),
  options: z.object({
    highlight: z.boolean().default(false),
    fuzzy: z.boolean().default(false),
    case_sensitive: z.boolean().default(false)
  }).optional()
});

export const SearchRequestTypeBox = t.Object({
  query: t.String({ minLength: 1 }),
  tables: t.Optional(t.Array(t.String())),
  fields: t.Optional(t.Array(t.String())),
  filters: t.Optional(t.Object({
    date_range: t.Optional(t.Object({
      from: t.Optional(t.Date()),
      to: t.Optional(t.Date())
    })),
    priority: t.Optional(t.Array(t.String())),
    state: t.Optional(t.Array(t.String())),
    assignment_group: t.Optional(t.Array(t.String()))
  })),
  pagination: t.Optional(PaginationTypeBox),
  options: t.Optional(t.Object({
    highlight: t.Optional(t.Boolean({ default: false })),
    fuzzy: t.Optional(t.Boolean({ default: false })),
    case_sensitive: t.Optional(t.Boolean({ default: false }))
  }))
});

// ===== TYPE EXPORTS =====

export type PaginationRequest = z.infer<typeof PaginationSchema>;
export type ServiceNowQuery = z.infer<typeof ServiceNowQuerySchema>;
export type CreateRecordRequest = z.infer<typeof CreateRecordRequestSchema>;
export type UpdateRecordRequest = z.infer<typeof UpdateRecordRequestSchema>;
export type DeleteRecordRequest = z.infer<typeof DeleteRecordRequestSchema>;
export type GetRecordRequest = z.infer<typeof GetRecordRequestSchema>;
export type ListRecordsRequest = z.infer<typeof ListRecordsRequestSchema>;
export type BatchOperation = z.infer<typeof BatchOperationSchema>;
export type BatchRequest = z.infer<typeof BatchRequestSchema>;
export type UploadAttachmentRequest = z.infer<typeof UploadAttachmentRequestSchema>;
export type DownloadAttachmentRequest = z.infer<typeof DownloadAttachmentRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type ValidateTokenRequest = z.infer<typeof ValidateTokenRequestSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;