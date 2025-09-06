/**
 * Base Zod Schemas - Core reusable validation schemas
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Modular organization
 * - Reusable base schemas
 */

import { z } from 'zod';

// ===== COMMON VALIDATION PATTERNS =====

/**
 * ServiceNow sys_id pattern: 32-character hexadecimal
 */
export const SysIdSchema = z.string()
  .length(32, 'sys_id must be exactly 32 characters')
  .regex(/^[0-9a-f]{32}$/i, 'sys_id must be hexadecimal');

/**
 * ServiceNow number pattern (e.g., INC0000123, CHG0000456)
 */
export const TicketNumberSchema = z.string()
  .regex(/^[A-Z]{3}\d{7}$/, 'Invalid ticket number format');

/**
 * ServiceNow datetime strings (ISO format)
 */
export const ServiceNowDateTimeSchema = z.string()
  .datetime({ message: 'Invalid ServiceNow datetime format' })
  .or(z.literal(''))
  .transform(val => val === '' ? null : val);

/**
 * ServiceNow boolean-like strings ('true', 'false', '1', '0')
 */
export const ServiceNowBooleanSchema = z.string()
  .refine(val => ['true', 'false', '1', '0', ''].includes(val.toLowerCase()), {
    message: 'Must be true, false, 1, 0, or empty string'
  })
  .transform(val => val === 'true' || val === '1');

/**
 * Priority levels (1-5, where 1 is highest)
 */
export const PrioritySchema = z.string()
  .refine(val => ['1', '2', '3', '4', '5'].includes(val), {
    message: 'Priority must be 1-5'
  })
  .transform(val => parseInt(val));

/**
 * State values as strings (ServiceNow uses string states)
 */
export const StateSchema = z.string().min(1, 'State cannot be empty');

// ===== BASE RECORD SCHEMAS =====

/**
 * Base ServiceNow record with common audit fields
 */
export const BaseRecordSchema = z.object({
  sys_id: SysIdSchema,
  sys_created_on: ServiceNowDateTimeSchema,
  sys_updated_on: ServiceNowDateTimeSchema,
  sys_created_by: z.string(),
  sys_updated_by: z.string(),
  sys_mod_count: z.string().transform(val => parseInt(val) || 0),
  sys_tags: z.string().optional()
});

/**
 * Base ticket fields shared across all ticket types
 */
export const BaseTicketSchema = BaseRecordSchema.extend({
  number: TicketNumberSchema,
  state: StateSchema,
  short_description: z.string().min(1, 'Short description is required'),
  description: z.string().optional(),
  priority: PrioritySchema.optional(),
  urgency: PrioritySchema.optional(),
  impact: PrioritySchema.optional(),
  assignment_group: z.string().optional(),
  assigned_to: z.string().optional(),
  opened_by: z.string().optional(),
  caller_id: z.string().optional(),
  work_notes: z.string().optional(),
  close_notes: z.string().optional()
});

// ===== REFERENCE FIELD SCHEMAS =====

/**
 * ServiceNow reference field schema
 */
export const ReferenceFieldSchema = z.object({
  value: SysIdSchema.optional(),
  display_value: z.string().optional(),
  link: z.string().url().optional()
});

/**
 * Assignment group reference
 */
export const AssignmentGroupSchema = z.object({
  sys_id: SysIdSchema,
  name: z.string(),
  manager: ReferenceFieldSchema.optional(),
  active: ServiceNowBooleanSchema.optional()
});

// ===== QUERY AND RESPONSE SCHEMAS =====

/**
 * ServiceNow query parameters
 */
export const QueryParamsSchema = z.object({
  sysparm_query: z.string().optional(),
  sysparm_limit: z.string().regex(/^\d+$/).transform(val => parseInt(val)).optional(),
  sysparm_offset: z.string().regex(/^\d+$/).transform(val => parseInt(val)).optional(),
  sysparm_fields: z.string().optional(),
  sysparm_display_value: z.enum(['true', 'false', 'all']).optional(),
  sysparm_exclude_reference_link: ServiceNowBooleanSchema.optional(),
  sysparm_suppress_pagination_header: ServiceNowBooleanSchema.optional()
});

/**
 * ServiceNow API response wrapper
 */
export const ServiceNowResponseSchema = <T extends z.ZodTypeAny>(resultSchema: T) => z.object({
  result: z.array(resultSchema)
});

// ===== VALIDATION UTILITIES =====

/**
 * Create optional field that accepts empty strings
 */
export const optionalEmpty = <T extends z.ZodTypeAny>(schema: T) => 
  schema.optional().or(z.literal('').transform(() => undefined));

/**
 * Parse ServiceNow date with fallback
 */
export const parseServiceNowDate = (dateString: string | null): Date | null => {
  if (!dateString || dateString === '') return null;
  try {
    return new Date(dateString);
  } catch {
    return null;
  }
};

/**
 * Type inference helpers
 */
export type SysId = z.infer<typeof SysIdSchema>;
export type TicketNumber = z.infer<typeof TicketNumberSchema>;
export type BaseRecord = z.infer<typeof BaseRecordSchema>;
export type BaseTicket = z.infer<typeof BaseTicketSchema>;
export type ReferenceField = z.infer<typeof ReferenceFieldSchema>;
export type QueryParams = z.infer<typeof QueryParamsSchema>;