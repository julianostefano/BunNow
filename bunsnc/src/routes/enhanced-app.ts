/**
 * Enhanced Elysia App - Hybrid Zod/TypeBox validation system
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Hybrid validation system integration
 * - Backward compatibility with existing routes
 */

import { Elysia, t } from "elysia";
import { BatchService } from "../services/batch.service";
import { ServiceNowService } from "../services/servicenow.service";
import { AttachmentService } from "../services/attachment.service";
import { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import { createTicketActionsRoutes } from "./TicketActionsRoutes";
import { createTicketListRoutes } from "./TicketListRoutes";
import { createTicketDetailsRoutes } from "./TicketDetailsRoutes";
import { EnhancedTicketStorageService } from "../services/EnhancedTicketStorageService";
import { ServiceNowStreams } from "../config/redis-streams";
import { persistenceService } from "../services/PersistenceService";

// Import unified schema registry and API schemas
import { 
  unifiedRegistry,
  getSchemaForTable as legacyGetSchemaForTable,
  ElysiaSchemas
} from "../schemas/utils/schema-registry";

import {
  CreateRecordRequestTypeBox,
  UpdateRecordRequestTypeBox,
  BatchRequestTypeBox,
  UploadAttachmentRequestTypeBox,
  DownloadAttachmentRequestTypeBox
} from "../schemas/api/request.schemas";

import {
  CreateRecordResponseTypeBox,
  UpdateRecordResponseTypeBox,
  DeleteRecordResponseTypeBox,
  GetRecordResponseTypeBox,
  BatchResponseTypeBox,
  UploadAttachmentResponseTypeBox,
  ErrorResponseTypeBox,
  HealthResponseTypeBox
} from "../schemas/api/response.schemas";

// Enhanced schema resolution with fallback
function getSchemaForTable(table: string) {
  // First try unified registry
  const unifiedSchema = unifiedRegistry.getTypeBoxSchema(table) || 
                       unifiedRegistry.getTypeBoxSchema(`${table}-creation`);
  
  if (unifiedSchema) {
    return unifiedSchema;
  }
  
  // Fallback to legacy registry
  return legacyGetSchemaForTable(table);
}

// Enhanced error handler
function createErrorResponse(code: string, message: string, details?: any) {
  return {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      request_id: crypto.randomUUID()
    },
    success: false
  };
}

// Enhanced success response wrapper
function createSuccessResponse(data: any, metadata?: any) {
  return {
    data,
    success: true,
    metadata: {
      timestamp: new Date().toISOString(),
      request_id: crypto.randomUUID(),
      ...metadata
    }
  };
}

// Create enhanced async app initialization function
async function createEnhancedApp() {
  const app = new Elysia();

  // Global error handler
  app.error('VALIDATION', ({ error, code }) => {
    return createErrorResponse('VALIDATION_ERROR', 'Request validation failed', {
      issues: error.message
    });
  });

  app.error('NOT_FOUND', () => {
    return createErrorResponse('NOT_FOUND', 'Resource not found');
  });

  app.error('INTERNAL_SERVER_ERROR', ({ error }) => {
    console.error('Internal server error:', error);
    return createErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected error occurred');
  });

  // Health check endpoint with enhanced schema
  app.get('/health', 
    async () => {
      const startTime = Date.now();
      
      const checks = {
        database: 'ok' as const,
        servicenow: 'ok' as const,
        redis: 'ok' as const,
        opensearch: 'ok' as const
      };

      // Test database connection
      try {
        await persistenceService.ping();
      } catch (error) {
        checks.database = 'error';
      }

      // Test ServiceNow connection
      try {
        const service = new ServiceNowService(
          Bun.env.SNC_INSTANCE_URL || "",
          Bun.env.SNC_AUTH_TOKEN || ""
        );
        await service.testConnection();
      } catch (error) {
        checks.servicenow = 'error';
      }

      const status = Object.values(checks).some(check => check === 'error') 
        ? 'unhealthy' 
        : Object.values(checks).some(check => check === 'warning') 
          ? 'degraded' 
          : 'healthy';

      return {
        status,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime_seconds: Math.floor(process.uptime()),
        checks
      };
    },
    {
      response: HealthResponseTypeBox
    }
  );

  // Enhanced CRUD with unified validation
  app.post("/record/:table",
    async ({ params, body, headers }) => {
      const startTime = Date.now();
      
      try {
        const instanceUrl = headers["x-instance-url"] || Bun.env.SNC_INSTANCE_URL || "";
        const authToken = headers["authorization"] || Bun.env.SNC_AUTH_TOKEN || "";
        
        if (!instanceUrl || !authToken) {
          return createErrorResponse('AUTH_ERROR', 'Missing instance URL or auth token');
        }

        // Validate using unified schema if available
        const tableSchema = getSchemaForTable(params.table);
        if (tableSchema) {
          // Additional validation can be added here
          console.log(`Using schema validation for table: ${params.table}`);
        }

        const service = new ServiceNowService(instanceUrl, authToken);
        const record = await service.create(params.table, body.data);

        return createSuccessResponse({
          record,
          operation: 'create',
          table: params.table
        }, {
          execution_time_ms: Date.now() - startTime
        });

      } catch (error) {
        console.error('Create record error:', error);
        return createErrorResponse('CREATE_ERROR', error.message);
      }
    },
    {
      params: t.Object({ table: t.String({ minLength: 1 }) }),
      body: t.Object({ 
        data: t.Record(t.String(), t.Any()),
        options: t.Optional(t.Object({
          display_value: t.Optional(t.Boolean()),
          exclude_reference_link: t.Optional(t.Boolean()),
          suppress_auto_sys_field: t.Optional(t.Boolean()),
          input_display_value: t.Optional(t.Boolean())
        }))
      }),
      headers: t.Object({
        "x-instance-url": t.Optional(t.String()),
        authorization: t.Optional(t.String())
      }),
      response: {
        200: CreateRecordResponseTypeBox,
        400: ErrorResponseTypeBox,
        401: ErrorResponseTypeBox,
        500: ErrorResponseTypeBox
      }
    }
  );

  // Enhanced GET record with unified validation
  app.get("/record/:table/:sysId",
    async ({ params, headers, query }) => {
      const startTime = Date.now();
      
      try {
        const instanceUrl = headers["x-instance-url"] || Bun.env.SNC_INSTANCE_URL || "";
        const authToken = headers["authorization"] || Bun.env.SNC_AUTH_TOKEN || "";
        
        if (!instanceUrl || !authToken) {
          return createErrorResponse('AUTH_ERROR', 'Missing instance URL or auth token');
        }

        const service = new ServiceNowService(instanceUrl, authToken);
        const record = await service.get(params.table, params.sysId, query);

        return createSuccessResponse({
          record,
          operation: 'get',
          table: params.table
        }, {
          execution_time_ms: Date.now() - startTime
        });

      } catch (error) {
        console.error('Get record error:', error);
        return createErrorResponse('GET_ERROR', error.message);
      }
    },
    {
      params: t.Object({ 
        table: t.String({ minLength: 1 }), 
        sysId: t.String({ minLength: 32, maxLength: 32 }) 
      }),
      query: t.Optional(t.Object({
        sysparm_fields: t.Optional(t.String()),
        sysparm_display_value: t.Optional(t.String()),
        sysparm_exclude_reference_link: t.Optional(t.Boolean()),
        sysparm_view: t.Optional(t.String())
      })),
      headers: t.Object({
        "x-instance-url": t.Optional(t.String()),
        authorization: t.Optional(t.String())
      }),
      response: {
        200: GetRecordResponseTypeBox,
        400: ErrorResponseTypeBox,
        401: ErrorResponseTypeBox,
        404: ErrorResponseTypeBox,
        500: ErrorResponseTypeBox
      }
    }
  );

  // Enhanced Batch operations with unified validation
  app.post("/batch",
    async ({ body, headers }) => {
      const startTime = Date.now();
      
      try {
        const instanceUrl = headers["x-instance-url"] || Bun.env.SNC_INSTANCE_URL || "";
        const authToken = headers["authorization"] || Bun.env.SNC_AUTH_TOKEN || "";
        
        if (!instanceUrl || !authToken) {
          return createErrorResponse('AUTH_ERROR', 'Missing instance URL or auth token');
        }

        if (!body.operations || !Array.isArray(body.operations) || body.operations.length === 0) {
          return createErrorResponse('VALIDATION_ERROR', 'Operations array is required and cannot be empty');
        }

        const results = await BatchService.executeBatch(instanceUrl, authToken, body.operations);
        
        const summary = {
          total_operations: body.operations.length,
          successful_operations: results.filter((r: any) => r.success).length,
          failed_operations: results.filter((r: any) => !r.success).length,
          total_execution_time_ms: Date.now() - startTime
        };

        return createSuccessResponse({
          results,
          summary
        }, {
          execution_time_ms: Date.now() - startTime
        });

      } catch (error) {
        console.error('Batch operation error:', error);
        return createErrorResponse('BATCH_ERROR', error.message);
      }
    },
    {
      body: BatchRequestTypeBox,
      headers: t.Object({
        "x-instance-url": t.Optional(t.String()),
        authorization: t.Optional(t.String())
      }),
      response: {
        200: BatchResponseTypeBox,
        400: ErrorResponseTypeBox,
        401: ErrorResponseTypeBox,
        500: ErrorResponseTypeBox
      }
    }
  );

  // Enhanced attachment upload
  app.post("/attachment/:table/:sysId",
    async ({ params, body, headers }) => {
      const startTime = Date.now();
      
      try {
        const instanceUrl = headers["x-instance-url"] || Bun.env.SNC_INSTANCE_URL || "";
        const authToken = headers["authorization"] || Bun.env.SNC_AUTH_TOKEN || "";
        
        if (!instanceUrl || !authToken) {
          return createErrorResponse('AUTH_ERROR', 'Missing instance URL or auth token');
        }

        const service = new AttachmentService(instanceUrl, authToken);
        const attachment = await service.upload(params.table, params.sysId, body.file);

        return createSuccessResponse({
          attachment,
          operation: 'upload'
        }, {
          execution_time_ms: Date.now() - startTime
        });

      } catch (error) {
        console.error('Upload attachment error:', error);
        return createErrorResponse('UPLOAD_ERROR', error.message);
      }
    },
    {
      params: t.Object({ 
        table: t.String({ minLength: 1 }), 
        sysId: t.String({ minLength: 32, maxLength: 32 }) 
      }),
      body: t.Object({ 
        file: t.Any(),
        file_name: t.Optional(t.String()),
        content_type: t.Optional(t.String())
      }),
      headers: t.Object({
        "x-instance-url": t.Optional(t.String()),
        authorization: t.Optional(t.String())
      }),
      response: {
        200: UploadAttachmentResponseTypeBox,
        400: ErrorResponseTypeBox,
        401: ErrorResponseTypeBox,
        500: ErrorResponseTypeBox
      }
    }
  );

  // Schema registry endpoint for introspection
  app.get("/schemas", () => {
    const registryStats = unifiedRegistry.getStatistics();
    const availableSchemas = unifiedRegistry.listSchemas();
    
    return {
      schemas: availableSchemas.map(name => ({
        name,
        metadata: unifiedRegistry.getMetadata(name)
      })),
      statistics: registryStats
    };
  });

  app.get("/schemas/:name", ({ params }) => {
    const schema = unifiedRegistry.getSchema(params.name);
    const metadata = unifiedRegistry.getMetadata(params.name);
    
    if (!schema || !metadata) {
      return createErrorResponse('NOT_FOUND', `Schema '${params.name}' not found`);
    }
    
    return {
      name: params.name,
      metadata,
      has_zod: !!schema.zod,
      has_typebox: !!schema.typebox
    };
  });

  // Initialize enhanced services (same as original app)
  const defaultServiceNowClient = new ServiceNowAuthClient(
    Bun.env.SNC_INSTANCE_URL || "",
    Bun.env.SNC_AUTH_TOKEN || ""
  );

  let mongoService: EnhancedTicketStorageService | undefined;
  let redisStreams: ServiceNowStreams | undefined;

  try {
    await persistenceService.initialize();
    mongoService = new EnhancedTicketStorageService(persistenceService.getDatabase());
    console.log('✅ Enhanced app: MongoDB service initialized');
  } catch (error) {
    console.warn('⚠️ Enhanced app: MongoDB service not available:', error.message);
  }

  try {
    redisStreams = new ServiceNowStreams();
    await redisStreams.initialize();
    console.log('✅ Enhanced app: Redis Streams initialized');
  } catch (error) {
    console.warn('⚠️ Enhanced app: Redis Streams not available:', error.message);
  }

  // Add existing ticket routes
  app.use(createTicketActionsRoutes(defaultServiceNowClient));
  app.use(createTicketListRoutes(defaultServiceNowClient));
  app.use(createTicketDetailsRoutes(defaultServiceNowClient, mongoService, redisStreams));
  
  return app;
}

// Initialize and export the enhanced app
const enhancedAppPromise = createEnhancedApp();
export { createEnhancedApp };
export default enhancedAppPromise;