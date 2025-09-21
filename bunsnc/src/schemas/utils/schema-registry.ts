/**
 * Unified Schema Registry - Central management for all schemas
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Centralized schema management
 * - Integration point for both Zod and TypeBox
 */

import { z } from "zod";
import { t } from "elysia";
import {
  globalSchemaRegistry,
  createHybridSchema,
  type HybridSchema,
  type ValidationResult,
  validateWithZod,
  safeParseWithZod,
} from "./zod-typebox-adapter";

// Import all Zod schemas
import {
  BaseRecordSchema,
  BaseTicketSchema,
  SysIdSchema,
  ServiceNowDateTimeSchema,
  QueryParamsSchema,
} from "../core/base.schemas";

import {
  ServiceNowUserSchema,
  ServiceNowGroupSchema,
  ServiceNowAuthConfigSchema,
  IncidentStateSchema,
  ChangeTaskStateSchema,
  ServiceTaskStateSchema,
} from "../core/servicenow.schemas";

import {
  IncidentSchema,
  IncidentCreationSchema,
  IncidentResolutionSchema,
  IncidentAssignmentSchema,
  IncidentQuerySchema,
} from "../tickets/incident.schemas";

import {
  ChangeTaskSchema,
  ChangeTaskCreationSchema,
  ChangeTaskCompletionSchema,
  ChangeTaskAssignmentSchema,
  ChangeTaskQuerySchema,
  ChangeTaskMetricsSchema,
} from "../tickets/change-task.schemas";

import {
  ServiceCatalogTaskSchema,
  ServiceTaskCreationSchema,
  ServiceTaskCompletionSchema,
  ServiceTaskAssignmentSchema,
  ServiceTaskQuerySchema,
  ServiceTaskMetricsSchema,
} from "../tickets/sc-task.schemas";

import {
  MongoDBConfigSchema,
  TicketDocumentSchema,
  SLADocumentSchema,
  MongoQueryOptionsSchema,
} from "../infrastructure/mongodb.schemas";

import {
  RedisConfigSchema,
  TicketCacheSchema,
  ServiceNowEventSchema,
  NotificationMessageSchema,
} from "../infrastructure/redis.schemas";

import {
  OpenSearchConfigSchema,
  TicketSearchDocumentSchema,
  SearchRequestSchema,
  ClusterHealthSchema,
} from "../infrastructure/opensearch.schemas";

import {
  HadoopConfigSchema,
  HDFSFileStatusSchema,
  ProcessingJobSchema,
  JobExecutionSchema,
} from "../infrastructure/hadoop.schemas";

// Import existing TypeBox schemas for backward compatibility
import { schemaRegistry as legacySchemaRegistry } from "../../types/schemaRegistry";

// ===== SCHEMA CATEGORIES =====

/**
 * Schema categories for better organization
 */
export enum SchemaCategory {
  CORE = "core",
  SERVICENOW = "servicenow",
  TICKETS = "tickets",
  INFRASTRUCTURE = "infrastructure",
  API = "api",
  LEGACY = "legacy",
}

/**
 * Schema metadata interface
 */
export interface SchemaMetadata {
  category: SchemaCategory;
  table?: string;
  version: string;
  description: string;
  tags: string[];
  deprecated?: boolean;
  replacedBy?: string;
}

// ===== UNIFIED SCHEMA REGISTRY =====

/**
 * Unified schema registry that manages both Zod and TypeBox schemas
 */
export class UnifiedSchemaRegistry {
  private hybridSchemas = new Map<string, HybridSchema<any>>();
  private metadata = new Map<string, SchemaMetadata>();

  constructor() {
    this.initializeDefaultSchemas();
  }

  /**
   * Initialize default schemas from imported modules
   */
  private initializeDefaultSchemas(): void {
    // Core schemas
    this.registerSchema("base-record", BaseRecordSchema, {
      category: SchemaCategory.CORE,
      version: "1.0.0",
      description: "Base ServiceNow record with audit fields",
      tags: ["base", "audit", "core"],
    });

    this.registerSchema("base-ticket", BaseTicketSchema, {
      category: SchemaCategory.CORE,
      version: "1.0.0",
      description: "Base ticket schema shared across all ticket types",
      tags: ["ticket", "base", "core"],
    });

    this.registerSchema("sys-id", SysIdSchema, {
      category: SchemaCategory.CORE,
      version: "1.0.0",
      description: "ServiceNow sys_id validation",
      tags: ["validation", "core", "id"],
    });

    // ServiceNow schemas
    this.registerSchema("servicenow-user", ServiceNowUserSchema, {
      category: SchemaCategory.SERVICENOW,
      table: "sys_user",
      version: "1.0.0",
      description: "ServiceNow user record validation",
      tags: ["user", "authentication"],
    });

    this.registerSchema("servicenow-group", ServiceNowGroupSchema, {
      category: SchemaCategory.SERVICENOW,
      table: "sys_user_group",
      version: "1.0.0",
      description: "ServiceNow group record validation",
      tags: ["group", "assignment"],
    });

    this.registerSchema("servicenow-auth", ServiceNowAuthConfigSchema, {
      category: SchemaCategory.SERVICENOW,
      version: "1.0.0",
      description: "ServiceNow authentication configuration",
      tags: ["config", "authentication"],
    });

    // Ticket schemas
    this.registerSchema("incident", IncidentSchema, {
      category: SchemaCategory.TICKETS,
      table: "incident",
      version: "1.0.0",
      description: "Complete ServiceNow incident validation",
      tags: ["ticket", "incident"],
    });

    this.registerSchema("incident-creation", IncidentCreationSchema, {
      category: SchemaCategory.TICKETS,
      table: "incident",
      version: "1.0.0",
      description: "Incident creation validation with business rules",
      tags: ["ticket", "incident", "creation"],
    });

    this.registerSchema("incident-resolution", IncidentResolutionSchema, {
      category: SchemaCategory.TICKETS,
      table: "incident",
      version: "1.0.0",
      description: "Incident resolution validation",
      tags: ["ticket", "incident", "resolution"],
    });

    // Change Task schemas
    this.registerSchema("change-task", ChangeTaskSchema, {
      category: SchemaCategory.TICKETS,
      table: "change_task",
      version: "1.0.0",
      description: "Complete ServiceNow change task validation",
      tags: ["ticket", "change_task"],
    });

    this.registerSchema("change-task-creation", ChangeTaskCreationSchema, {
      category: SchemaCategory.TICKETS,
      table: "change_task",
      version: "1.0.0",
      description: "Change task creation validation with business rules",
      tags: ["ticket", "change_task", "creation"],
    });

    this.registerSchema("change-task-completion", ChangeTaskCompletionSchema, {
      category: SchemaCategory.TICKETS,
      table: "change_task",
      version: "1.0.0",
      description: "Change task completion validation",
      tags: ["ticket", "change_task", "completion"],
    });

    this.registerSchema("change-task-assignment", ChangeTaskAssignmentSchema, {
      category: SchemaCategory.TICKETS,
      table: "change_task",
      version: "1.0.0",
      description: "Change task assignment validation",
      tags: ["ticket", "change_task", "assignment"],
    });

    this.registerSchema("change-task-metrics", ChangeTaskMetricsSchema, {
      category: SchemaCategory.TICKETS,
      table: "change_task",
      version: "1.0.0",
      description: "Change task metrics and reporting",
      tags: ["ticket", "change_task", "metrics"],
    });

    // Service Catalog Task schemas
    this.registerSchema("service-task", ServiceCatalogTaskSchema, {
      category: SchemaCategory.TICKETS,
      table: "sc_task",
      version: "1.0.0",
      description: "Complete ServiceNow service catalog task validation",
      tags: ["ticket", "sc_task", "service_catalog"],
    });

    this.registerSchema("service-task-creation", ServiceTaskCreationSchema, {
      category: SchemaCategory.TICKETS,
      table: "sc_task",
      version: "1.0.0",
      description: "Service task creation validation with business rules",
      tags: ["ticket", "sc_task", "creation", "service_catalog"],
    });

    this.registerSchema(
      "service-task-completion",
      ServiceTaskCompletionSchema,
      {
        category: SchemaCategory.TICKETS,
        table: "sc_task",
        version: "1.0.0",
        description: "Service task completion validation",
        tags: ["ticket", "sc_task", "completion", "service_catalog"],
      },
    );

    this.registerSchema(
      "service-task-assignment",
      ServiceTaskAssignmentSchema,
      {
        category: SchemaCategory.TICKETS,
        table: "sc_task",
        version: "1.0.0",
        description: "Service task assignment validation",
        tags: ["ticket", "sc_task", "assignment", "service_catalog"],
      },
    );

    this.registerSchema("service-task-metrics", ServiceTaskMetricsSchema, {
      category: SchemaCategory.TICKETS,
      table: "sc_task",
      version: "1.0.0",
      description: "Service task metrics and reporting",
      tags: ["ticket", "sc_task", "metrics", "service_catalog"],
    });

    // Infrastructure schemas
    this.registerSchema("mongodb-config", MongoDBConfigSchema, {
      category: SchemaCategory.INFRASTRUCTURE,
      version: "1.0.0",
      description: "MongoDB connection configuration",
      tags: ["config", "database", "mongodb"],
    });

    this.registerSchema("redis-config", RedisConfigSchema, {
      category: SchemaCategory.INFRASTRUCTURE,
      version: "1.0.0",
      description: "Redis connection configuration",
      tags: ["config", "cache", "redis"],
    });

    this.registerSchema("opensearch-config", OpenSearchConfigSchema, {
      category: SchemaCategory.INFRASTRUCTURE,
      version: "1.0.0",
      description: "OpenSearch connection configuration",
      tags: ["config", "search", "opensearch"],
    });

    this.registerSchema("hadoop-config", HadoopConfigSchema, {
      category: SchemaCategory.INFRASTRUCTURE,
      version: "1.0.0",
      description: "Hadoop HDFS configuration",
      tags: ["config", "bigdata", "hadoop"],
    });

    // Document schemas
    this.registerSchema("ticket-document", TicketDocumentSchema, {
      category: SchemaCategory.INFRASTRUCTURE,
      version: "1.0.0",
      description: "ServiceNow ticket document for MongoDB",
      tags: ["document", "mongodb", "ticket"],
    });

    this.registerSchema("ticket-cache", TicketCacheSchema, {
      category: SchemaCategory.INFRASTRUCTURE,
      version: "1.0.0",
      description: "Ticket cache entry for Redis",
      tags: ["cache", "redis", "ticket"],
    });

    this.registerSchema("ticket-search", TicketSearchDocumentSchema, {
      category: SchemaCategory.INFRASTRUCTURE,
      version: "1.0.0",
      description: "Ticket search document for OpenSearch",
      tags: ["search", "opensearch", "ticket"],
    });
  }

  /**
   * Register a new schema with metadata
   */
  registerSchema<T extends z.ZodTypeAny>(
    name: string,
    zodSchema: T,
    metadata: Omit<SchemaMetadata, "category"> & { category: SchemaCategory },
  ): void {
    const hybridSchema = createHybridSchema(name, zodSchema, {
      description: metadata.description,
      version: metadata.version,
      metadata: {
        category: metadata.category,
        table: metadata.table,
        tags: metadata.tags,
      },
    });

    this.hybridSchemas.set(name, hybridSchema);
    this.metadata.set(name, metadata);
  }

  /**
   * Get a hybrid schema by name
   */
  getSchema<T extends z.ZodTypeAny>(name: string): HybridSchema<T> | undefined {
    return this.hybridSchemas.get(name);
  }

  /**
   * Get Zod schema by name
   */
  getZodSchema<T extends z.ZodTypeAny>(name: string): T | undefined {
    const schema = this.hybridSchemas.get(name);
    return schema?.zod;
  }

  /**
   * Get TypeBox schema by name (for Elysia compatibility)
   */
  getTypeBoxSchema(name: string): any {
    const schema = this.hybridSchemas.get(name);
    return schema?.typebox;
  }

  /**
   * Get schema metadata
   */
  getMetadata(name: string): SchemaMetadata | undefined {
    return this.metadata.get(name);
  }

  /**
   * List schemas by category
   */
  getSchemasByCategory(category: SchemaCategory): string[] {
    return Array.from(this.metadata.entries())
      .filter(([, metadata]) => metadata.category === category)
      .map(([name]) => name);
  }

  /**
   * List schemas by table
   */
  getSchemasByTable(table: string): string[] {
    return Array.from(this.metadata.entries())
      .filter(([, metadata]) => metadata.table === table)
      .map(([name]) => name);
  }

  /**
   * Get all schema names
   */
  listSchemas(): string[] {
    return Array.from(this.hybridSchemas.keys());
  }

  /**
   * Validate data using a registered schema
   */
  validate<T>(schemaName: string, data: unknown): ValidationResult<T> {
    const zodSchema = this.getZodSchema<z.ZodSchema<T>>(schemaName);

    if (!zodSchema) {
      return {
        success: false,
        errors: [`Schema '${schemaName}' not found`],
      };
    }

    return validateWithZod(zodSchema, data);
  }

  /**
   * Safe validate data using a registered schema
   */
  safeValidate<T>(schemaName: string, data: unknown): ValidationResult<T> {
    const zodSchema = this.getZodSchema<z.ZodSchema<T>>(schemaName);

    if (!zodSchema) {
      return {
        success: false,
        errors: [`Schema '${schemaName}' not found`],
      };
    }

    return safeParseWithZod(zodSchema, data);
  }

  /**
   * Check if schema exists
   */
  hasSchema(name: string): boolean {
    return this.hybridSchemas.has(name);
  }

  /**
   * Get schema statistics
   */
  getStatistics() {
    const categories = {} as Record<SchemaCategory, number>;
    const tags = {} as Record<string, number>;

    for (const metadata of this.metadata.values()) {
      categories[metadata.category] = (categories[metadata.category] || 0) + 1;

      for (const tag of metadata.tags) {
        tags[tag] = (tags[tag] || 0) + 1;
      }
    }

    return {
      total: this.hybridSchemas.size,
      byCategory: categories,
      byTags: tags,
      deprecated: Array.from(this.metadata.entries())
        .filter(([, meta]) => meta.deprecated)
        .map(([name]) => name),
    };
  }
}

// ===== BACKWARD COMPATIBILITY =====

/**
 * Enhanced schema registry that extends the existing one
 */
export function getSchemaForTable(table: string) {
  // First try to get from unified registry
  const schemas = unifiedRegistry.getSchemasByTable(table);
  if (schemas.length > 0) {
    return unifiedRegistry.getTypeBoxSchema(schemas[0]);
  }

  // Fallback to legacy registry
  return legacySchemaRegistry[table] || t.Object({});
}

// ===== GLOBAL REGISTRY INSTANCE =====

/**
 * Global unified schema registry instance
 */
export const unifiedRegistry = new UnifiedSchemaRegistry();

// ===== CONVENIENCE EXPORTS =====

/**
 * Quick access to common schemas
 */
export const CommonSchemas = {
  // Core
  SysId: () => unifiedRegistry.getZodSchema("sys-id"),
  BaseRecord: () => unifiedRegistry.getZodSchema("base-record"),
  BaseTicket: () => unifiedRegistry.getZodSchema("base-ticket"),

  // ServiceNow
  User: () => unifiedRegistry.getZodSchema("servicenow-user"),
  Group: () => unifiedRegistry.getZodSchema("servicenow-group"),
  AuthConfig: () => unifiedRegistry.getZodSchema("servicenow-auth"),

  // Tickets
  Incident: () => unifiedRegistry.getZodSchema("incident"),
  IncidentCreation: () => unifiedRegistry.getZodSchema("incident-creation"),
  IncidentResolution: () => unifiedRegistry.getZodSchema("incident-resolution"),

  ChangeTask: () => unifiedRegistry.getZodSchema("change-task"),
  ChangeTaskCreation: () =>
    unifiedRegistry.getZodSchema("change-task-creation"),
  ChangeTaskCompletion: () =>
    unifiedRegistry.getZodSchema("change-task-completion"),

  ServiceTask: () => unifiedRegistry.getZodSchema("service-task"),
  ServiceTaskCreation: () =>
    unifiedRegistry.getZodSchema("service-task-creation"),
  ServiceTaskCompletion: () =>
    unifiedRegistry.getZodSchema("service-task-completion"),

  // Infrastructure
  MongoConfig: () => unifiedRegistry.getZodSchema("mongodb-config"),
  RedisConfig: () => unifiedRegistry.getZodSchema("redis-config"),
  OpenSearchConfig: () => unifiedRegistry.getZodSchema("opensearch-config"),
  HadoopConfig: () => unifiedRegistry.getZodSchema("hadoop-config"),
} as const;

/**
 * Quick access to TypeBox schemas for Elysia
 */
export const ElysiaSchemas = {
  // Core
  SysId: () => unifiedRegistry.getTypeBoxSchema("sys-id"),
  BaseRecord: () => unifiedRegistry.getTypeBoxSchema("base-record"),
  BaseTicket: () => unifiedRegistry.getTypeBoxSchema("base-ticket"),

  // Tickets
  Incident: () => unifiedRegistry.getTypeBoxSchema("incident"),
  IncidentCreation: () => unifiedRegistry.getTypeBoxSchema("incident-creation"),

  ChangeTask: () => unifiedRegistry.getTypeBoxSchema("change-task"),
  ChangeTaskCreation: () =>
    unifiedRegistry.getTypeBoxSchema("change-task-creation"),

  ServiceTask: () => unifiedRegistry.getTypeBoxSchema("service-task"),
  ServiceTaskCreation: () =>
    unifiedRegistry.getTypeBoxSchema("service-task-creation"),

  // Documents
  TicketDocument: () => unifiedRegistry.getTypeBoxSchema("ticket-document"),
  TicketCache: () => unifiedRegistry.getTypeBoxSchema("ticket-cache"),
  TicketSearch: () => unifiedRegistry.getTypeBoxSchema("ticket-search"),
} as const;

// Type exports
export type { SchemaMetadata, ValidationResult, HybridSchema };
