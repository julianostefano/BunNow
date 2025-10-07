/**
 * Base TypeBox Schemas - Core reusable validation schemas
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox (Elysia native)
 * - Eliminates Zod dependency overhead
 * - Uses Elysia's native validation system
 * - Improves performance and bundle size
 *
 * Reference: docs/reports/BUNSNC_ELYSIA_ASSESSMENT_v1.0.md - HIGH-1
 */

import { t, type Static } from "elysia";

// ===== COMMON VALIDATION PATTERNS =====

/**
 * ServiceNow sys_id pattern: 32-character hexadecimal
 */
export const SysId = t.String({
  minLength: 32,
  maxLength: 32,
  pattern: "^[0-9a-f]{32}$",
  error: "sys_id must be exactly 32 hexadecimal characters",
});

export type SysIdType = Static<typeof SysId>;

/**
 * ServiceNow number pattern (e.g., INC0000123, CHG0000456)
 */
export const TicketNumber = t.String({
  pattern: "^[A-Z]{3}\\d{7}$",
  error: "Invalid ticket number format (e.g., INC0000123)",
});

export type TicketNumberType = Static<typeof TicketNumber>;

/**
 * ServiceNow datetime strings (ISO format)
 */
export const ServiceNowDateTime = t.String({
  format: "date-time",
  error: "Invalid ServiceNow datetime format (ISO 8601 required)",
});

export type ServiceNowDateTimeType = Static<typeof ServiceNowDateTime>;

/**
 * Optional ServiceNow datetime (can be empty string or null)
 */
export const ServiceNowDateTimeOptional = t.Union([
  ServiceNowDateTime,
  t.Literal(""),
  t.Null(),
]);

export type ServiceNowDateTimeOptionalType = Static<
  typeof ServiceNowDateTimeOptional
>;

/**
 * ServiceNow boolean-like strings ('true', 'false', '1', '0')
 */
export const ServiceNowBoolean = t.Union([
  t.Literal("true"),
  t.Literal("false"),
  t.Literal("1"),
  t.Literal("0"),
  t.Literal(""),
]);

export type ServiceNowBooleanType = Static<typeof ServiceNowBoolean>;

/**
 * Priority levels (1-5, where 1 is highest)
 */
export const Priority = t.Union([
  t.Literal("1"),
  t.Literal("2"),
  t.Literal("3"),
  t.Literal("4"),
  t.Literal("5"),
]);

export type PriorityType = Static<typeof Priority>;

/**
 * Impact levels (1-3, where 1 is highest)
 */
export const Impact = t.Union([t.Literal("1"), t.Literal("2"), t.Literal("3")]);

export type ImpactType = Static<typeof Impact>;

/**
 * Urgency levels (1-3, where 1 is highest)
 */
export const Urgency = t.Union([
  t.Literal("1"),
  t.Literal("2"),
  t.Literal("3"),
]);

export type UrgencyType = Static<typeof Urgency>;

/**
 * State values as strings (ServiceNow uses string states)
 */
export const State = t.String({ minLength: 1, error: "State cannot be empty" });

export type StateType = Static<typeof State>;

// ===== BASE RECORD SCHEMAS =====

/**
 * Base ServiceNow record with common audit fields
 */
export const BaseRecord = t.Object({
  sys_id: SysId,
  sys_created_on: ServiceNowDateTime,
  sys_updated_on: ServiceNowDateTime,
  sys_created_by: t.String(),
  sys_updated_by: t.String(),
  sys_mod_count: t.String({ default: "0" }),
  sys_tags: t.Optional(t.String()),
});

export type BaseRecordType = Static<typeof BaseRecord>;

/**
 * Base ticket schema with common ticket fields
 */
export const BaseTicket = t.Composite([
  BaseRecord,
  t.Object({
    number: TicketNumber,
    short_description: t.String({ minLength: 1, maxLength: 160 }),
    description: t.Optional(t.String()),
    state: State,
    priority: Priority,
    impact: Impact,
    urgency: Urgency,
    assigned_to: t.Optional(SysId),
    assignment_group: t.Optional(SysId),
    caller_id: t.Optional(SysId),
    opened_at: t.Optional(ServiceNowDateTime),
    opened_by: t.Optional(SysId),
    work_notes: t.Optional(t.String()),
    comments: t.Optional(t.String()),
    active: t.Optional(ServiceNowBoolean),
  }),
]);

export type BaseTicketType = Static<typeof BaseTicket>;

// ===== QUERY PARAMETER SCHEMAS =====

/**
 * ServiceNow list query parameters
 */
export const ListQueryParams = t.Object({
  sysparm_query: t.Optional(t.String()),
  sysparm_limit: t.Optional(t.String({ pattern: "^\\d+$", default: "10" })),
  sysparm_offset: t.Optional(t.String({ pattern: "^\\d+$", default: "0" })),
  sysparm_fields: t.Optional(t.String()),
  sysparm_display_value: t.Optional(
    t.Union([t.Literal("true"), t.Literal("false"), t.Literal("all")]),
  ),
  sysparm_exclude_reference_link: t.Optional(
    t.Union([t.Literal("true"), t.Literal("false")]),
  ),
});

export type ListQueryParamsType = Static<typeof ListQueryParams>;

/**
 * ServiceNow record query parameters (single record)
 */
export const RecordQueryParams = t.Object({
  sysparm_fields: t.Optional(t.String()),
  sysparm_display_value: t.Optional(
    t.Union([t.Literal("true"), t.Literal("false"), t.Literal("all")]),
  ),
});

export type RecordQueryParamsType = Static<typeof RecordQueryParams>;

// ===== RESPONSE SCHEMAS =====

/**
 * ServiceNow single record response
 */
export const RecordResponse = <T extends Record<string, any>>(schema: T) =>
  t.Object({
    result: schema,
  });

/**
 * ServiceNow list response
 */
export const ListResponse = <T extends Record<string, any>>(schema: T) =>
  t.Object({
    result: t.Array(schema),
  });

/**
 * ServiceNow error response
 */
export const ErrorResponse = t.Object({
  error: t.Object({
    message: t.String(),
    detail: t.Optional(t.String()),
  }),
  status: t.String(),
});

export type ErrorResponseType = Static<typeof ErrorResponse>;

// ===== UTILITY FUNCTIONS =====

/**
 * Make all properties optional (equivalent to Partial in Zod)
 */
export const Partial = <T extends Record<string, any>>(schema: T) => {
  const partial: any = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    partial[key] = t.Optional(value as any);
  }
  return t.Object(partial);
};

/**
 * Make specific properties required
 */
export const Required = <T extends Record<string, any>, K extends keyof T>(
  schema: T,
  keys: K[],
) => {
  const required: any = { ...schema.properties };
  for (const key of keys) {
    if (required[key]) {
      // Remove Optional wrapper if present
      required[key] = (required[key] as any).schema || required[key];
    }
  }
  return t.Object(required);
};

/**
 * Pick specific properties from schema
 */
export const Pick = <T extends Record<string, any>, K extends keyof T>(
  schema: T,
  keys: K[],
) => {
  const picked: any = {};
  for (const key of keys) {
    if (schema.properties[key]) {
      picked[key] = schema.properties[key];
    }
  }
  return t.Object(picked);
};

/**
 * Omit specific properties from schema
 */
export const Omit = <T extends Record<string, any>, K extends keyof T>(
  schema: T,
  keys: K[],
) => {
  const omitted: any = { ...schema.properties };
  for (const key of keys) {
    delete omitted[key];
  }
  return t.Object(omitted);
};

// ===== EXPORT SUMMARY =====

/**
 * Common validation patterns for ServiceNow fields:
 * - SysId: 32-char hex string
 * - TicketNumber: Format like INC0000123
 * - ServiceNowDateTime: ISO 8601 datetime
 * - ServiceNowBoolean: String booleans
 * - Priority/Impact/Urgency: String numbers 1-5/1-3/1-3
 * - State: Non-empty string
 *
 * Base schemas:
 * - BaseRecord: Common audit fields
 * - BaseTicket: Common ticket fields
 *
 * Query/Response schemas:
 * - ListQueryParams: Query parameters for lists
 * - RecordQueryParams: Query parameters for single records
 * - RecordResponse: Single record wrapper
 * - ListResponse: List response wrapper
 * - ErrorResponse: Error response format
 *
 * Utility functions:
 * - Partial: Make all props optional
 * - Required: Make specific props required
 * - Pick: Select specific props
 * - Omit: Exclude specific props
 */
