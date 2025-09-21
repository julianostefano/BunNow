/**
 * Schemas Index - Central export point for all validation schemas
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Centralized exports
 * - Clear schema organization
 */

// ===== CORE SCHEMAS =====
export * from "./core/base.schemas";
export * from "./core/servicenow.schemas";

// ===== TICKET SCHEMAS =====
export * from "./tickets/incident.schemas";
export * from "./tickets/change-task.schemas";
export * from "./tickets/sc-task.schemas";

// ===== INFRASTRUCTURE SCHEMAS =====
export * from "./infrastructure/mongodb.schemas";
export * from "./infrastructure/redis.schemas";
export * from "./infrastructure/opensearch.schemas";
export * from "./infrastructure/hadoop.schemas";

// ===== API SCHEMAS =====
export * from "./api/request.schemas";
export * from "./api/response.schemas";

// ===== VALIDATIONS =====
export * from "./validations/advanced.validations";

// ===== EXAMPLES =====
export * from "./examples/zod-integration.examples";

// ===== UTILITIES =====
export * from "./utils/zod-typebox-adapter";
export * from "./utils/schema-registry";

// ===== RE-EXPORTS FROM REGISTRY =====
export {
  unifiedRegistry,
  CommonSchemas,
  ElysiaSchemas,
  getSchemaForTable,
  SchemaCategory,
} from "./utils/schema-registry";

// ===== TYPE EXPORTS =====
export type {
  HybridSchema,
  ValidationResult,
  SchemaMetadata,
} from "./utils/schema-registry";

export type { TypeMappingConfig } from "./utils/zod-typebox-adapter";

// ===== CONVENIENCE FUNCTIONS =====

/**
 * Quick validation using the unified registry
 */
export function validateSchema<T = any>(schemaName: string, data: unknown) {
  return unifiedRegistry.validate<T>(schemaName, data);
}

/**
 * Safe validation using the unified registry
 */
export function safeValidateSchema<T = any>(schemaName: string, data: unknown) {
  return unifiedRegistry.safeValidate<T>(schemaName, data);
}

/**
 * Get available schemas by category
 */
export function getSchemasByCategory(category: string) {
  return unifiedRegistry.getSchemasByCategory(category as any);
}

/**
 * Get schema metadata
 */
export function getSchemaInfo(schemaName: string) {
  return unifiedRegistry.getMetadata(schemaName);
}

/**
 * List all available schemas
 */
export function listAllSchemas() {
  return unifiedRegistry.listSchemas();
}

/**
 * Get registry statistics
 */
export function getRegistryStats() {
  return unifiedRegistry.getStatistics();
}

// ===== DEFAULT EXPORT =====
export default unifiedRegistry;
