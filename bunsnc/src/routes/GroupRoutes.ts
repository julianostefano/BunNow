/**
 * Group Routes - REST API endpoints for ServiceNow groups management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import { dataService, GroupFilter } from '../services/ConsolidatedDataService';
import { GroupData } from '../config/mongodb-collections';
import { logger } from '../utils/Logger';
import {
  GroupsAPIError,
  GroupValidationError,
  GroupNotFoundError,
  GroupServiceInitializationError,
  MongoDBConnectionError,
  ElysiaFrameworkError
} from '../utils/GroupsErrors';

export const createGroupRoutes = () => {
  const hybridDataService = dataService();
  
  return new Elysia({ prefix: '/api/groups' })
    // Register custom error types
    .error({
      GroupsAPIError,
      GroupValidationError, 
      GroupNotFoundError,
      GroupServiceInitializationError,
      MongoDBConnectionError,
      ElysiaFrameworkError
    })
    
    // Global error handler with custom error class support
    .onError({ as: 'global' }, (context) => {
      const { code, error, set } = context;
      
      logger.error(`🚨 [GROUP-API-GLOBAL-ERROR] Code: ${code}, Error: ${error?.message || 'Unknown'}`);
      
      // Handle custom error classes
      if (error instanceof GroupsAPIError) {
        set.status = error.statusCode;
        set.headers['content-type'] = 'application/json';
        
        return {
          success: false,
          error: error.name,
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }
      
      // Handle NOT_FOUND errors that trigger the _r_r bug
      if (code === 'NOT_FOUND') {
        set.status = 404;
        set.headers['content-type'] = 'application/json';
        
        return {
          success: false,
          error: 'Endpoint not found',
          message: 'The requested Groups API endpoint does not exist',
          timestamp: new Date().toISOString()
        };
      }
      
      // Handle VALIDATION errors
      if (code === 'VALIDATION') {
        set.status = 400;
        set.headers['content-type'] = 'application/json';
        
        return {
          success: false,
          error: 'Validation failed',
          message: error?.message || 'Request validation failed',
          timestamp: new Date().toISOString()
        };
      }
      
      // Handle specific Elysia "_r_r is not defined" error
      if (error?.message && error.message.includes('_r_r is not defined')) {
        logger.error('🚨 [ELYSIA-BUG] Detected _r_r is not defined error - applying workaround');
        const frameworkError = new ElysiaFrameworkError('_r_r is not defined bug detected', error);
        
        set.status = frameworkError.statusCode;
        set.headers['content-type'] = 'application/json';
        
        return {
          success: false,
          error: frameworkError.name,
          code: frameworkError.code,
          message: frameworkError.message,
          timestamp: new Date().toISOString(),
          debug: process.env.NODE_ENV === 'development' ? {
            framework: 'Elysia v1.3.21',
            workaround: 'Global error handler applied',
            originalStack: error.stack
          } : undefined
        };
      }
      
      // Default error handler
      set.status = 500;
      set.headers['content-type'] = 'application/json';
      
      return {
        success: false,
        error: 'Internal server error',
        message: error?.message || 'An unexpected error occurred in the Groups API',
        timestamp: new Date().toISOString()
      };
    })
    // Request logging middleware
    .onRequest(({ request, path }) => {
      const timestamp = new Date().toISOString();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      logger.info(` [GROUP-API-REQUEST] ${request.method} ${path} - ${timestamp} - UA: ${userAgent.substring(0, 50)}`);
    })
    
    // Initialization middleware 
    .onBeforeHandle(async ({ request, path }) => {
      try {
        // Ensure MongoDB is connected and GroupService is initialized
        if (!mongoClient.isConnected()) {
          logger.info(' [GROUP-API] Establishing MongoDB connection...');
          await mongoClient.connect();
          logger.info(' [GROUP-API] MongoDB connected successfully');
        }
        
        // ConsolidatedDataService initialization handled internally
        logger.debug(' [GROUP-API] GroupService initialized for request:', `${request.method} ${path}`);
      } catch (error) {
        logger.error(' [GROUP-API] Failed to initialize:', error);
        throw new Error(`Groups API initialization failed: ${error}`);
      }
    })
    
    // Response transformation middleware
    .onAfterHandle(({ response, path, request }) => {
      // Add standard response format if not already formatted
      if (typeof response === 'object' && response !== null) {
        // Check if response already has success field (our standard format)
        if (!('success' in response)) {
          return {
            success: true,
            data: response,
            timestamp: new Date().toISOString(),
            requestId: crypto.randomUUID(),
            endpoint: `${request.method} ${path}`
          };
        }
        // Add metadata to existing responses
        if ('success' in response && !('timestamp' in response)) {
          return {
            ...response,
            timestamp: new Date().toISOString(),
            requestId: crypto.randomUUID(),
            endpoint: `${request.method} ${path}`
          };
        }
      }
      return response;
    })
    
    // Performance monitoring middleware
    .onAfterResponse(({ request, path, elapsed }) => {
      const method = request.method;
      logger.info(` [GROUP-API-RESPONSE] ${method} ${path} completed in ${elapsed.toFixed(2)}ms`);
      
      // Log performance warnings
      if (elapsed > 1000) {
        logger.warn(` [GROUP-API-SLOW] Slow request detected: ${method} ${path} took ${elapsed.toFixed(2)}ms`);
      }
      
      // Log successful operations
      if (elapsed < 100) {
        logger.debug(` [GROUP-API-FAST] Fast request: ${method} ${path} took ${elapsed.toFixed(2)}ms`);
      }
    })
    .get('/', async ({ query }) => {
      try {
        logger.info('📋 [API] GET /api/groups - Fetching all groups');
        
        // Build filter from query parameters
        const filter: GroupFilter = {};
        
        if (query.nome) filter.nome = String(query.nome);
        if (query.responsavel) filter.responsavel = String(query.responsavel);
        if (query.temperatura) filter.temperatura = Number(query.temperatura);
        if (query.temperaturaMin) filter.temperaturaMin = Number(query.temperaturaMin);
        if (query.temperaturaMax) filter.temperaturaMax = Number(query.temperaturaMax);
        
        // Handle tags array
        if (query.tags) {
          const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
          filter.tags = tags.map(tag => String(tag));
        }
        
        const groups = await hybridDataService.getAllGroups(filter);
        
        return {
          success: true,
          data: groups,
          count: groups.length,
          filter: filter
        };
      } catch (error) {
        logger.error(' [API] Error fetching groups:', error);
        return {
          success: false,
          error: 'Failed to fetch groups',
          message: String(error)
        };
      }
    }, {
      query: t.Optional(t.Object({
        nome: t.Optional(t.String()),
        responsavel: t.Optional(t.String()),
        temperatura: t.Optional(t.String()),
        temperaturaMin: t.Optional(t.String()),
        temperaturaMax: t.Optional(t.String()),
        tags: t.Optional(t.Union([t.String(), t.Array(t.String())]))
      }))
    })
    .get('/dropdown', async () => {
      try {
        logger.info('📋 [API] GET /api/groups/dropdown - Fetching dropdown options');
        
        const allGroups = await hybridDataService.getAllGroups();
        const dropdownOptions = allGroups.map(group => ({
          value: group.nome,
          label: group.nome,
          emoji: group.temperatura <= 2 ? '🔥' : group.temperatura <= 4 ? '' : ''
        }));
        
        return {
          success: true,
          data: dropdownOptions,
          count: dropdownOptions.length
        };
      } catch (error) {
        logger.error(' [API] Error fetching group dropdown:', error);
        return {
          success: false,
          error: 'Failed to fetch group dropdown options',
          message: String(error)
        };
      }
    })
    .get('/stats', async () => {
      try {
        logger.info(' [API] GET /api/groups/stats - Fetching collection statistics');
        
        const stats = await hybridDataService.getGroupsStats();
        
        return {
          success: true,
          data: stats
        };
      } catch (error) {
        logger.error(' [API] Error fetching group stats:', error);
        return {
          success: false,
          error: 'Failed to fetch group statistics',
          message: String(error)
        };
      }
    })
    .get('/:id', async ({ params }) => {
      try {
        const groupId = Number(params.id);
        if (isNaN(groupId)) {
          return {
            success: false,
            error: 'Invalid group ID format',
            message: 'Group ID must be a number'
          };
        }
        
        logger.info(`📋 [API] GET /api/groups/${groupId} - Fetching group by ID`);
        
        const group = await hybridDataService.getGroupById(groupId);
        
        if (!group) {
          return {
            success: false,
            error: 'Group not found',
            message: `Group with ID ${groupId} does not exist`
          };
        }
        
        return {
          success: true,
          data: group
        };
      } catch (error) {
        logger.error(` [API] Error fetching group ${params.id}:`, error);
        return {
          success: false,
          error: 'Failed to fetch group',
          message: String(error)
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      })
    })
    .get('/name/:name', async ({ params }) => {
      try {
        const groupName = decodeURIComponent(params.name);
        logger.info(`📋 [API] GET /api/groups/name/${groupName} - Fetching group by name`);
        
        const groups = await hybridDataService.getAllGroups({ nome: groupName });
        const group = groups.length > 0 ? await hybridDataService.getGroupById(groups[0].id) : null;
        
        if (!group) {
          return {
            success: false,
            error: 'Group not found',
            message: `Group with name '${groupName}' does not exist`
          };
        }
        
        return {
          success: true,
          data: group
        };
      } catch (error) {
        logger.error(` [API] Error fetching group by name ${params.name}:`, error);
        return {
          success: false,
          error: 'Failed to fetch group by name',
          message: String(error)
        };
      }
    }, {
      params: t.Object({
        name: t.String()
      })
    })
    .get('/tag/:tag', async ({ params }) => {
      try {
        const tag = decodeURIComponent(params.tag);
        logger.info(`📋 [API] GET /api/groups/tag/${tag} - Fetching groups by tag`);
        
        const groups = await hybridDataService.getAllGroups({ tags: [tag] });
        
        return {
          success: true,
          data: groups,
          count: groups.length,
          tag: tag
        };
      } catch (error) {
        logger.error(` [API] Error fetching groups by tag ${params.tag}:`, error);
        return {
          success: false,
          error: 'Failed to fetch groups by tag',
          message: String(error)
        };
      }
    }, {
      params: t.Object({
        tag: t.String()
      })
    })
    .get('/responsavel/:responsavel', async ({ params }) => {
      try {
        const responsavel = decodeURIComponent(params.responsavel);
        logger.info(`📋 [API] GET /api/groups/responsavel/${responsavel} - Fetching groups by responsavel`);
        
        const groups = await hybridDataService.getAllGroups({ responsavel });
        
        return {
          success: true,
          data: groups,
          count: groups.length,
          responsavel: responsavel
        };
      } catch (error) {
        logger.error(` [API] Error fetching groups by responsavel ${params.responsavel}:`, error);
        return {
          success: false,
          error: 'Failed to fetch groups by responsavel',
          message: String(error)
        };
      }
    }, {
      params: t.Object({
        responsavel: t.String()
      })
    })
    .post('/', async ({ body }) => {
      try {
        logger.info(' [API] POST /api/groups - Creating new group');
        
        const groupData: GroupData = {
          nome: body.nome,
          tags: body.tags,
          descricao: body.descricao,
          responsavel: body.responsavel,
          temperatura: body.temperatura
        };
        
        const createdGroup = await hybridDataService.createGroup(groupData);
        
        return {
          success: true,
          data: createdGroup,
          message: `Group '${groupData.nome}' created successfully`
        };
      } catch (error) {
        logger.error(' [API] Error creating group:', error);
        return {
          success: false,
          error: 'Failed to create group',
          message: String(error)
        };
      }
    }, {
      body: t.Object({
        nome: t.String({ minLength: 1 }),
        tags: t.Array(t.String()),
        descricao: t.String(),
        responsavel: t.String({ minLength: 1 }),
        temperatura: t.Number({ minimum: 1, maximum: 10 })
      })
    })
    .put('/:id', async ({ params, body }) => {
      try {
        const groupId = Number(params.id);
        if (isNaN(groupId)) {
          return {
            success: false,
            error: 'Invalid group ID format',
            message: 'Group ID must be a number'
          };
        }
        
        logger.info(`✏️ [API] PUT /api/groups/${groupId} - Updating group`);
        
        const updated = await hybridDataService.updateGroup(groupId, body);
        
        if (!updated) {
          return {
            success: false,
            error: 'Group not found',
            message: `Group with ID ${groupId} does not exist`
          };
        }
        
        return {
          success: true,
          message: `Group ${groupId} updated successfully`
        };
      } catch (error) {
        logger.error(` [API] Error updating group ${params.id}:`, error);
        return {
          success: false,
          error: 'Failed to update group',
          message: String(error)
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        nome: t.Optional(t.String({ minLength: 1 })),
        tags: t.Optional(t.Array(t.String())),
        descricao: t.Optional(t.String()),
        responsavel: t.Optional(t.String({ minLength: 1 })),
        temperatura: t.Optional(t.Number({ minimum: 1, maximum: 10 }))
      })
    })
    .delete('/:id', async ({ params }) => {
      try {
        const groupId = Number(params.id);
        if (isNaN(groupId)) {
          return {
            success: false,
            error: 'Invalid group ID format',
            message: 'Group ID must be a number'
          };
        }
        
        logger.info(`🗑️ [API] DELETE /api/groups/${groupId} - Deleting group`);
        
        const deleted = await hybridDataService.deleteGroup(groupId);
        
        if (!deleted) {
          return {
            success: false,
            error: 'Group not found',
            message: `Group with ID ${groupId} does not exist`
          };
        }
        
        return {
          success: true,
          message: `Group ${groupId} deleted successfully`
        };
      } catch (error) {
        logger.error(` [API] Error deleting group ${params.id}:`, error);
        return {
          success: false,
          error: 'Failed to delete group',
          message: String(error)
        };
      }
    }, {
      params: t.Object({
        id: t.String()
      })
    });
};