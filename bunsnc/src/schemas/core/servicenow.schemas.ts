/**
 * ServiceNow Core Schemas - ServiceNow specific validation patterns
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - ServiceNow-specific validations
 * - Modular organization
 */

import { z } from 'zod';
import { 
  SysIdSchema, 
  ServiceNowDateTimeSchema, 
  ServiceNowBooleanSchema,
  BaseRecordSchema,
  optionalEmpty
} from './base.schemas';

// ===== SERVICENOW TABLE SCHEMAS =====

/**
 * ServiceNow User (sys_user) schema
 */
export const ServiceNowUserSchema = BaseRecordSchema.extend({
  user_name: z.string().min(1, 'Username is required'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  name: z.string().optional(), // Display name
  email: z.string().email().optional(),
  phone: z.string().optional(),
  active: ServiceNowBooleanSchema.optional(),
  locked_out: ServiceNowBooleanSchema.optional(),
  manager: SysIdSchema.optional(),
  department: SysIdSchema.optional(),
  location: SysIdSchema.optional(),
  company: SysIdSchema.optional(),
  title: z.string().optional()
});

/**
 * ServiceNow Group (sys_user_group) schema
 */
export const ServiceNowGroupSchema = BaseRecordSchema.extend({
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional(),
  active: ServiceNowBooleanSchema.optional(),
  manager: SysIdSchema.optional(),
  parent: SysIdSchema.optional(),
  type: z.string().optional(),
  source: z.string().optional(),
  cost_center: z.string().optional()
});

/**
 * ServiceNow Configuration Item (cmdb_ci) schema
 */
export const ServiceNowCISchema = BaseRecordSchema.extend({
  name: z.string().min(1, 'CI name is required'),
  asset_tag: z.string().optional(),
  serial_number: z.string().optional(),
  model_id: SysIdSchema.optional(),
  location: SysIdSchema.optional(),
  assigned_to: SysIdSchema.optional(),
  assignment_group: SysIdSchema.optional(),
  operational_status: z.string().optional(),
  install_status: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  manufacturer: SysIdSchema.optional(),
  vendor: SysIdSchema.optional(),
  support_group: SysIdSchema.optional(),
  owned_by: SysIdSchema.optional()
});

/**
 * ServiceNow Business Service schema
 */
export const ServiceNowBusinessServiceSchema = BaseRecordSchema.extend({
  name: z.string().min(1, 'Service name is required'),
  description: z.string().optional(),
  operational_status: z.string().optional(),
  service_owner: SysIdSchema.optional(),
  service_classification: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  version: z.string().optional(),
  lifecycle_stage: z.string().optional(),
  business_criticality: z.string().optional()
});

// ===== SERVICENOW STATE MAPPINGS =====

/**
 * Incident states validation
 */
export const IncidentStateSchema = z.enum(['1', '2', '3', '6', '7', '8', '18'], {
  errorMap: () => ({ 
    message: 'Invalid incident state. Must be: 1(New), 2(In Progress), 3(On Hold), 6(Resolved), 7(Closed), 8(Cancelled), 18(Assigned)' 
  })
});

/**
 * Change Task states validation
 */
export const ChangeTaskStateSchema = z.enum(['-5', '1', '2', '3', '4', '7', '8'], {
  errorMap: () => ({ 
    message: 'Invalid change task state. Must be: -5(Pending), 1(Open), 2(Assigned), 3(In Progress), 4(Closed Complete), 7(Closed Skipped), 8(Closed Incomplete)' 
  })
});

/**
 * Service Catalog Task states validation
 */
export const ServiceTaskStateSchema = z.enum(['-5', '1', '2', '3', '4', '7'], {
  errorMap: () => ({ 
    message: 'Invalid service task state. Must be: -5(Pending), 1(Open), 2(Assigned), 3(In Progress), 4(Closed Complete), 7(Closed Skipped)' 
  })
});

// ===== SERVICENOW QUERY FILTERS =====

/**
 * ServiceNow encoded query validation
 */
export const EncodedQuerySchema = z.string()
  .refine(query => {
    // Basic validation for encoded query syntax
    const validOperators = ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'STARTSWITH', 'ENDSWITH', 'CONTAINS', 'DOESNOTCONTAIN', 'IN', 'NOT IN'];
    const validConnectors = ['^', '^OR', '^NQ'];
    
    // Allow empty queries
    if (query.trim() === '') return true;
    
    // Check for basic query structure
    return query.includes('=') || query.includes('!=') || validConnectors.some(conn => query.includes(conn));
  }, {
    message: 'Invalid ServiceNow encoded query format'
  });

/**
 * ServiceNow display value options
 */
export const DisplayValueSchema = z.enum(['true', 'false', 'all'], {
  errorMap: () => ({ message: 'Display value must be: true, false, or all' })
});

// ===== SERVICENOW API SCHEMAS =====

/**
 * ServiceNow Table API request schema
 */
export const ServiceNowTableRequestSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  sys_id: SysIdSchema.optional(),
  sysparm_query: EncodedQuerySchema.optional(),
  sysparm_limit: z.number().int().min(1).max(10000).optional(),
  sysparm_offset: z.number().int().min(0).optional(),
  sysparm_fields: z.string().optional(),
  sysparm_display_value: DisplayValueSchema.optional(),
  sysparm_exclude_reference_link: z.boolean().optional(),
  sysparm_suppress_pagination_header: z.boolean().optional(),
  sysparm_view: z.string().optional(),
  sysparm_query_no_domain: z.boolean().optional()
});

/**
 * ServiceNow attachment request schema
 */
export const ServiceNowAttachmentRequestSchema = z.object({
  table_name: z.string().min(1, 'Table name is required'),
  table_sys_id: SysIdSchema,
  file_name: z.string().min(1, 'File name is required'),
  content_type: z.string().min(1, 'Content type is required')
});

/**
 * ServiceNow batch request schema
 */
export const ServiceNowBatchRequestSchema = z.object({
  batch_request_id: z.string().optional(),
  rest_requests: z.array(z.object({
    id: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    body: z.any().optional()
  })).min(1, 'At least one request is required').max(100, 'Maximum 100 requests allowed')
});

// ===== AUTHENTICATION SCHEMAS =====

/**
 * ServiceNow authentication configuration
 */
export const ServiceNowAuthConfigSchema = z.object({
  instance_url: z.string().url('Invalid ServiceNow instance URL'),
  username: z.string().min(1, 'Username is required').optional(),
  password: z.string().min(1, 'Password is required').optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  refresh_token: z.string().optional(),
  access_token: z.string().optional(),
  auth_type: z.enum(['basic', 'oauth', 'bearer']).default('basic')
}).refine((data) => {
  // Ensure required fields based on auth type
  if (data.auth_type === 'basic') {
    return data.username && data.password;
  }
  if (data.auth_type === 'oauth') {
    return data.client_id && data.client_secret;
  }
  if (data.auth_type === 'bearer') {
    return data.access_token;
  }
  return false;
}, {
  message: 'Required authentication fields missing for selected auth type'
});

// ===== TYPE INFERENCE EXPORTS =====

export type ServiceNowUser = z.infer<typeof ServiceNowUserSchema>;
export type ServiceNowGroup = z.infer<typeof ServiceNowGroupSchema>;
export type ServiceNowCI = z.infer<typeof ServiceNowCISchema>;
export type ServiceNowBusinessService = z.infer<typeof ServiceNowBusinessServiceSchema>;
export type IncidentState = z.infer<typeof IncidentStateSchema>;
export type ChangeTaskState = z.infer<typeof ChangeTaskStateSchema>;
export type ServiceTaskState = z.infer<typeof ServiceTaskStateSchema>;
export type ServiceNowTableRequest = z.infer<typeof ServiceNowTableRequestSchema>;
export type ServiceNowAuthConfig = z.infer<typeof ServiceNowAuthConfigSchema>;