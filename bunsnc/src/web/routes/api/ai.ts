/**
 * AI Services API Routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import { logger } from '../../../utils/Logger';
import { TicketAnalysisController } from '../../../controllers/ai/TicketAnalysisController';
import { DocumentIntelligenceController } from '../../../controllers/ai/DocumentIntelligenceController';

// Type definitions for API requests/responses
const TicketAnalysisRequestSchema = t.Object({
  ticket_id: t.Optional(t.String()),
  ticket_number: t.Optional(t.String()),
  description: t.String({ minLength: 10 }),
  short_description: t.Optional(t.String()),
  category: t.Optional(t.String()),
  subcategory: t.Optional(t.String()),
  priority: t.Optional(t.String()),
  urgency: t.Optional(t.String()),
  impact: t.Optional(t.String()),
  caller_id: t.Optional(t.String()),
  assignment_group: t.Optional(t.String()),
  attachments: t.Optional(t.Array(t.Object({
    file_name: t.String(),
    content_type: t.String(),
    content_buffer: t.Any()
  })))
});

const DocumentProcessingRequestSchema = t.Object({
  document_id: t.Optional(t.String()),
  filename: t.String(),
  content_type: t.String(),
  content_buffer: t.Any(),
  metadata: t.Optional(t.Record(t.String(), t.Any()))
});

const DocumentSearchRequestSchema = t.Object({
  query: t.String({ minLength: 3 }),
  max_results: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
  search_type: t.Optional(t.Union([
    t.Literal('semantic'),
    t.Literal('hybrid'),
    t.Literal('neural_sparse')
  ])),
  filters: t.Optional(t.Object({
    document_type: t.Optional(t.String()),
    technology_stack: t.Optional(t.Array(t.String())),
    date_range: t.Optional(t.Object({
      from: t.String(),
      to: t.String()
    }))
  }))
});

export const aiRoutes = new Elysia({ prefix: '/api/ai' })
  .decorate('ticketAnalysis', new TicketAnalysisController())
  .decorate('documentIntelligence', new DocumentIntelligenceController())

  // Ticket Analysis Endpoints
  .post('/tickets/analyze', async ({ body, ticketAnalysis, set }) => {
    try {
      logger.info('🎯 [AI-API] Received ticket analysis request');

      const result = await ticketAnalysis.analyzeTicket(body as any);

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(' [AI-API] Ticket analysis failed:', error);

      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      };
    }
  }, {
    body: TicketAnalysisRequestSchema,
    detail: {
      summary: 'Analyze ServiceNow ticket using AI',
      description: 'Analyzes a ServiceNow ticket to predict priority, category, assignment group, and provide resolution recommendations based on similar tickets',
      tags: ['AI', 'Tickets']
    }
  })

  .get('/tickets/analyze/config', async ({ ticketAnalysis }) => {
    try {
      const config = await ticketAnalysis.getConfig();
      return {
        success: true,
        data: config,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(' [AI-API] Failed to get ticket analysis config:', error);
      throw error;
    }
  }, {
    detail: {
      summary: 'Get ticket analysis configuration',
      description: 'Returns current configuration for ticket analysis AI service',
      tags: ['AI', 'Configuration']
    }
  })

  .put('/tickets/analyze/config', async ({ body, ticketAnalysis, set }) => {
    try {
      await ticketAnalysis.updateConfig(body as any);

      return {
        success: true,
        message: 'Configuration updated successfully',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(' [AI-API] Failed to update ticket analysis config:', error);

      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      };
    }
  }, {
    body: t.Partial(t.Object({
      similarity_threshold: t.Number({ minimum: 0, maximum: 1 }),
      max_similar_tickets: t.Number({ minimum: 1, maximum: 50 }),
      enable_priority_prediction: t.Boolean(),
      enable_category_prediction: t.Boolean(),
      enable_assignment_prediction: t.Boolean(),
      search_types: t.Array(t.String())
    })),
    detail: {
      summary: 'Update ticket analysis configuration',
      description: 'Updates configuration parameters for ticket analysis AI service',
      tags: ['AI', 'Configuration']
    }
  })

  // Document Intelligence Endpoints
  .post('/documents/process', async ({ body, documentIntelligence, set }) => {
    try {
      logger.info(`📄 [AI-API] Processing document: ${(body as any).filename}`);

      const result = await documentIntelligence.processDocument(body as any);

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(' [AI-API] Document processing failed:', error);

      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      };
    }
  }, {
    body: DocumentProcessingRequestSchema,
    detail: {
      summary: 'Process document with AI',
      description: 'Processes a document using Apache Tika for content extraction, NER for entity recognition, and classification for categorization',
      tags: ['AI', 'Documents']
    }
  })

  .post('/documents/search', async ({ body, documentIntelligence, set }) => {
    try {
      logger.info(` [AI-API] Document search: "${(body as any).query}"`);

      const result = await documentIntelligence.searchDocuments(body as any);

      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(' [AI-API] Document search failed:', error);

      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      };
    }
  }, {
    body: DocumentSearchRequestSchema,
    detail: {
      summary: 'Search documents using AI',
      description: 'Performs hybrid semantic search across technical documents with neural reranking for improved relevance',
      tags: ['AI', 'Search']
    }
  })

  .get('/documents/config', async ({ documentIntelligence }) => {
    try {
      const config = await documentIntelligence.getConfig();
      return {
        success: true,
        data: config,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(' [AI-API] Failed to get document intelligence config:', error);
      throw error;
    }
  }, {
    detail: {
      summary: 'Get document intelligence configuration',
      description: 'Returns current configuration for document intelligence AI service',
      tags: ['AI', 'Configuration']
    }
  })

  .put('/documents/config', async ({ body, documentIntelligence, set }) => {
    try {
      await documentIntelligence.updateConfig(body as any);

      return {
        success: true,
        message: 'Configuration updated successfully',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(' [AI-API] Failed to update document intelligence config:', error);

      set.status = 500;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      };
    }
  }, {
    body: t.Partial(t.Object({
      max_document_size: t.Number({ minimum: 1024 }),
      supported_formats: t.Array(t.String()),
      extraction_timeout: t.Number({ minimum: 1000 }),
      classification_threshold: t.Number({ minimum: 0, maximum: 1 }),
      ner_confidence_threshold: t.Number({ minimum: 0, maximum: 1 }),
      chunk_size: t.Number({ minimum: 100 }),
      chunk_overlap: t.Number({ minimum: 0 })
    })),
    detail: {
      summary: 'Update document intelligence configuration',
      description: 'Updates configuration parameters for document intelligence AI service',
      tags: ['AI', 'Configuration']
    }
  })

  // Health Check Endpoints
  .get('/health', async ({ ticketAnalysis, documentIntelligence, set }) => {
    try {
      const services = [
        { name: 'ticket_analysis', status: 'healthy' },
        { name: 'document_intelligence', status: 'healthy' }
      ];

      const overallStatus = services.every(s => s.status === 'healthy') ? 'healthy' : 'degraded';

      return {
        success: true,
        status: overallStatus,
        services,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(' [AI-API] Health check failed:', error);

      set.status = 503;
      return {
        success: false,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Service unavailable',
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'AI services health check',
      description: 'Returns the health status of all AI services',
      tags: ['AI', 'Health']
    }
  })

  .get('/services/status', async ({ set }) => {
    try {
      logger.info('🏥 [AI-API] Checking AI services status');

      // Import clients for health checks
      const { TikaClient } = await import('../../../clients/TikaClient');
      const { EmbeddingClient } = await import('../../../clients/EmbeddingClient');
      const { RerankClient } = await import('../../../clients/RerankClient');
      const { LLMClient } = await import('../../../clients/LLMClient');
      const { OpenSearchClient } = await import('../../../clients/OpenSearchClient');

      const clients = {
        tika: new TikaClient(),
        embedding: new EmbeddingClient(),
        rerank: new RerankClient(),
        llm: new LLMClient(),
        opensearch: new OpenSearchClient({
          host: process.env.OPENSEARCH_HOST || '10.219.8.210',
          port: parseInt(process.env.OPENSEARCH_PORT || '9200'),
          ssl: false,
          timeout: 30000
        })
      };

      const statusChecks = await Promise.allSettled([
        clients.tika.healthCheck(),
        clients.embedding.healthCheck(),
        clients.rerank.healthCheck(),
        clients.llm.healthCheck(),
        clients.opensearch.ping()
      ]);

      const serviceStatus = {
        tika: { status: statusChecks[0].status === 'fulfilled' && statusChecks[0].value ? 'healthy' : 'unhealthy' },
        embedding: { status: statusChecks[1].status === 'fulfilled' && statusChecks[1].value ? 'healthy' : 'unhealthy' },
        rerank: { status: statusChecks[2].status === 'fulfilled' && statusChecks[2].value ? 'healthy' : 'unhealthy' },
        llm: { status: statusChecks[3].status === 'fulfilled' && statusChecks[3].value ? 'healthy' : 'unhealthy' },
        opensearch: { status: statusChecks[4].status === 'fulfilled' && statusChecks[4].value ? 'healthy' : 'unhealthy' }
      };

      const healthyCount = Object.values(serviceStatus).filter(s => s.status === 'healthy').length;
      const overallStatus = healthyCount === Object.keys(serviceStatus).length ? 'all_healthy' :
                           healthyCount > 0 ? 'partially_healthy' : 'all_unhealthy';

      return {
        success: true,
        overall_status: overallStatus,
        services: serviceStatus,
        healthy_services: healthyCount,
        total_services: Object.keys(serviceStatus).length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(' [AI-API] Service status check failed:', error);

      set.status = 503;
      return {
        success: false,
        overall_status: 'unknown',
        error: error instanceof Error ? error.message : 'Status check failed',
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'Detailed AI services status',
      description: 'Returns detailed health status of all underlying AI services (Tika, OpenSearch, Embedding, Rerank, LLM)',
      tags: ['AI', 'Health']
    }
  });