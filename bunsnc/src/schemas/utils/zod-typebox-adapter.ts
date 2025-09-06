/**
 * Zod to TypeBox Adapter - Hybrid validation system utilities
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Conversion utilities between Zod and TypeBox
 * - Maintains type safety across both systems
 */

import { z } from 'zod';
import { t, TObject } from 'elysia';
import type { TAnySchema } from '@sinclair/typebox';

// ===== TYPE MAPPINGS =====

/**
 * Maps basic Zod types to TypeBox equivalents
 */
const ZOD_TO_TYPEBOX_MAP = {
  string: () => t.String(),
  number: () => t.Number(),
  boolean: () => t.Boolean(),
  date: () => t.Date(),
  array: (items: any) => t.Array(items),
  object: (properties: any) => t.Object(properties),
  union: (...options: any[]) => t.Union(options),
  literal: (value: any) => t.Literal(value),
  enum: (values: any[]) => t.Union(values.map(v => t.Literal(v))),
  optional: (schema: any) => t.Optional(schema),
  nullable: (schema: any) => t.Union([schema, t.Null()]),
  record: (value: any) => t.Record(t.String(), value)
} as const;

/**
 * Type mapping configuration
 */
interface TypeMappingConfig {
  preserveRefinements: boolean;
  preserveTransforms: boolean;
  preserveDefaults: boolean;
  strictMode: boolean;
}

const DEFAULT_CONFIG: TypeMappingConfig = {
  preserveRefinements: false, // TypeBox doesn't support refinements
  preserveTransforms: false, // TypeBox doesn't support transforms
  preserveDefaults: true,
  strictMode: true
};

// ===== CONVERSION UTILITIES =====

/**
 * Converts a Zod schema to TypeBox schema
 * Note: Some Zod features (refinements, transforms) cannot be converted
 */
export function zodToTypeBox<T extends z.ZodTypeAny>(
  zodSchema: T,
  config: Partial<TypeMappingConfig> = {}
): TAnySchema {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  return convertZodToTypeBox(zodSchema._def, mergedConfig);
}

/**
 * Internal conversion function with detailed type analysis
 */
function convertZodToTypeBox(def: any, config: TypeMappingConfig): TAnySchema {
  // Handle ZodString
  if (def.typeName === 'ZodString') {
    let schema = t.String();
    
    // Apply string constraints if possible
    if (def.checks) {
      for (const check of def.checks) {
        switch (check.kind) {
          case 'min':
            schema = t.String({ minLength: check.value });
            break;
          case 'max':
            schema = t.String({ maxLength: check.value });
            break;
          case 'email':
            schema = t.String({ format: 'email' });
            break;
          case 'url':
            schema = t.String({ format: 'uri' });
            break;
          case 'regex':
            schema = t.String({ pattern: check.regex.source });
            break;
        }
      }
    }
    
    return schema;
  }
  
  // Handle ZodNumber
  if (def.typeName === 'ZodNumber') {
    let schema = t.Number();
    
    if (def.checks) {
      for (const check of def.checks) {
        switch (check.kind) {
          case 'min':
            schema = t.Number({ minimum: check.value });
            break;
          case 'max':
            schema = t.Number({ maximum: check.value });
            break;
          case 'int':
            schema = t.Integer();
            break;
        }
      }
    }
    
    return schema;
  }
  
  // Handle ZodBoolean
  if (def.typeName === 'ZodBoolean') {
    return t.Boolean();
  }
  
  // Handle ZodDate
  if (def.typeName === 'ZodDate') {
    return t.Date();
  }
  
  // Handle ZodArray
  if (def.typeName === 'ZodArray') {
    const itemSchema = convertZodToTypeBox(def.type._def, config);
    let schema = t.Array(itemSchema);
    
    if (def.minLength !== null) {
      schema = t.Array(itemSchema, { minItems: def.minLength.value });
    }
    if (def.maxLength !== null) {
      schema = t.Array(itemSchema, { maxItems: def.maxLength.value });
    }
    
    return schema;
  }
  
  // Handle ZodObject
  if (def.typeName === 'ZodObject') {
    const properties: Record<string, TAnySchema> = {};
    
    for (const [key, value] of Object.entries(def.shape())) {
      properties[key] = convertZodToTypeBox((value as any)._def, config);
    }
    
    return t.Object(properties);
  }
  
  // Handle ZodUnion
  if (def.typeName === 'ZodUnion') {
    const options = def.options.map((option: any) => 
      convertZodToTypeBox(option._def, config)
    );
    return t.Union(options);
  }
  
  // Handle ZodEnum
  if (def.typeName === 'ZodEnum') {
    const values = def.values.map((value: any) => t.Literal(value));
    return t.Union(values);
  }
  
  // Handle ZodLiteral
  if (def.typeName === 'ZodLiteral') {
    return t.Literal(def.value);
  }
  
  // Handle ZodOptional
  if (def.typeName === 'ZodOptional') {
    const innerSchema = convertZodToTypeBox(def.innerType._def, config);
    return t.Optional(innerSchema);
  }
  
  // Handle ZodNullable
  if (def.typeName === 'ZodNullable') {
    const innerSchema = convertZodToTypeBox(def.innerType._def, config);
    return t.Union([innerSchema, t.Null()]);
  }
  
  // Handle ZodRecord
  if (def.typeName === 'ZodRecord') {
    const valueSchema = def.valueType 
      ? convertZodToTypeBox(def.valueType._def, config)
      : t.Any();
    return t.Record(t.String(), valueSchema);
  }
  
  // Handle ZodAny (fallback)
  if (def.typeName === 'ZodAny') {
    return t.Any();
  }
  
  // Fallback for unsupported types
  console.warn(`Unsupported Zod type: ${def.typeName}, falling back to t.Any()`);
  return t.Any();
}

// ===== SCHEMA REGISTRY UTILITIES =====

/**
 * Hybrid schema definition that maintains both Zod and TypeBox versions
 */
export interface HybridSchema<T extends z.ZodTypeAny> {
  zod: T;
  typebox: TAnySchema;
  name: string;
  description?: string;
  version?: string;
  metadata?: Record<string, any>;
}

/**
 * Creates a hybrid schema with both Zod and TypeBox versions
 */
export function createHybridSchema<T extends z.ZodTypeAny>(
  name: string,
  zodSchema: T,
  options: {
    description?: string;
    version?: string;
    metadata?: Record<string, any>;
    conversionConfig?: Partial<TypeMappingConfig>;
  } = {}
): HybridSchema<T> {
  const typeboxSchema = zodToTypeBox(zodSchema, options.conversionConfig);
  
  return {
    zod: zodSchema,
    typebox: typeboxSchema,
    name,
    description: options.description,
    version: options.version,
    metadata: options.metadata
  };
}

/**
 * Schema registry for hybrid schemas
 */
export class HybridSchemaRegistry {
  private schemas: Map<string, HybridSchema<any>> = new Map();
  
  /**
   * Register a hybrid schema
   */
  register<T extends z.ZodTypeAny>(schema: HybridSchema<T>): void {
    this.schemas.set(schema.name, schema);
  }
  
  /**
   * Get a registered schema by name
   */
  get<T extends z.ZodTypeAny>(name: string): HybridSchema<T> | undefined {
    return this.schemas.get(name);
  }
  
  /**
   * Get all registered schema names
   */
  list(): string[] {
    return Array.from(this.schemas.keys());
  }
  
  /**
   * Get Zod schema by name
   */
  getZodSchema<T extends z.ZodTypeAny>(name: string): T | undefined {
    const schema = this.schemas.get(name);
    return schema?.zod as T;
  }
  
  /**
   * Get TypeBox schema by name
   */
  getTypeBoxSchema(name: string): TAnySchema | undefined {
    const schema = this.schemas.get(name);
    return schema?.typebox;
  }
  
  /**
   * Check if a schema exists
   */
  has(name: string): boolean {
    return this.schemas.has(name);
  }
  
  /**
   * Remove a schema
   */
  remove(name: string): boolean {
    return this.schemas.delete(name);
  }
  
  /**
   * Clear all schemas
   */
  clear(): void {
    this.schemas.clear();
  }
  
  /**
   * Get schema metadata
   */
  getMetadata(name: string): Record<string, any> | undefined {
    const schema = this.schemas.get(name);
    return schema?.metadata;
  }
  
  /**
   * Update schema metadata
   */
  updateMetadata(name: string, metadata: Record<string, any>): void {
    const schema = this.schemas.get(name);
    if (schema) {
      schema.metadata = { ...schema.metadata, ...metadata };
    }
  }
}

// ===== VALIDATION UTILITIES =====

/**
 * Validation result interface
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
  zodErrors?: z.ZodError;
}

/**
 * Validates data using Zod schema and returns typed result
 */
export function validateWithZod<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const result = schema.parse(data);
    return {
      success: true,
      data: result
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        zodErrors: error
      };
    }
    
    return {
      success: false,
      errors: ['Unknown validation error']
    };
  }
}

/**
 * Safe parse with Zod that doesn't throw
 */
export function safeParseWithZod<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return {
      success: true,
      data: result.data
    };
  }
  
  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
    zodErrors: result.error
  };
}

// ===== UTILITY FUNCTIONS =====

/**
 * Checks if a Zod schema can be safely converted to TypeBox
 */
export function isConvertibleToTypeBox(zodSchema: z.ZodTypeAny): boolean {
  const def = zodSchema._def;
  
  // Check for features that can't be converted
  if (def.typeName === 'ZodEffects') return false; // Refinements and transforms
  if (def.typeName === 'ZodPipeline') return false; // Pipelines
  if (def.typeName === 'ZodIntersection') return false; // Intersections (limited support)
  if (def.typeName === 'ZodDiscriminatedUnion') return false; // Discriminated unions
  
  return true;
}

/**
 * Gets conversion warnings for a Zod schema
 */
export function getConversionWarnings(zodSchema: z.ZodTypeAny): string[] {
  const warnings: string[] = [];
  const def = zodSchema._def;
  
  if (def.typeName === 'ZodString' && def.checks) {
    for (const check of def.checks) {
      if (['regex', 'includes', 'startsWith', 'endsWith'].includes(check.kind)) {
        warnings.push(`String check '${check.kind}' may have limited TypeBox support`);
      }
    }
  }
  
  if (def.typeName === 'ZodEffects') {
    warnings.push('Refinements and transforms will be lost in TypeBox conversion');
  }
  
  return warnings;
}

// ===== EXPORTS =====

// Create global registry instance
export const globalSchemaRegistry = new HybridSchemaRegistry();

// Type exports for better TypeScript support
export type { TypeMappingConfig, HybridSchema, ValidationResult };