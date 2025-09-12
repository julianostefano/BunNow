/**
 * ServiceNow Web Interface Server - Modular MVC Architecture
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import htmxDashboardClean from './htmx-dashboard-clean';
import htmxDashboardEnhanced from './htmx-dashboard-enhanced';
import waitingAnalysisHtmx from './waiting-analysis-htmx';
import { createTicketDetailsRoutes } from '../routes/TicketDetailsRoutes';
import { createTicketActionsRoutes } from '../routes/TicketActionsRoutes';
import { createTicketListRoutes } from '../routes/TicketListRoutes';
import { createIncidentNotesRoutes } from '../routes/IncidentNotesRoutes';

import { WebServerController, WebServerConfig } from '../controllers/WebServerController';
import { APIController } from '../controllers/APIController';
import { DashboardController } from '../controllers/DashboardController';
import { StreamingController } from '../controllers/StreamingController';

export { WebServerConfig } from '../controllers/WebServerController';

export class ServiceNowWebServer {
  private webServerController: WebServerController;
  private apiController: APIController;
  private dashboardController: DashboardController;
  private streamingController: StreamingController;

  constructor(config: WebServerConfig) {
    console.log('🏗️ Initializing modular ServiceNow Web Server...');

    this.webServerController = new WebServerController(config);
    
    this.apiController = new APIController(
      this.webServerController.getServiceNowClient(),
      this.webServerController.getTicketIntegrationService(),
      this.webServerController.getConfig()
    );
    
    this.dashboardController = new DashboardController(config);
    
    this.streamingController = new StreamingController(this.apiController);

    this.setupRoutes();
    
    console.log('✅ Modular ServiceNow Web Server initialized');
  }

  private setupRoutes(): void {
    const app = this.webServerController.setupServer();

    app
      .use(htmxDashboardClean)
      .use(htmxDashboardEnhanced)
      .use(waitingAnalysisHtmx)
      .use(createTicketActionsRoutes(this.webServerController.getServiceNowAuthClient()))
      .use(createTicketListRoutes(this.webServerController.getServiceNowAuthClient()))
      .use(createTicketDetailsRoutes(
        this.webServerController.getServiceNowAuthClient(),
        this.webServerController.getEnhancedTicketStorageService(),
        this.webServerController.getRedisStreams()
      ))
      .use(createIncidentNotesRoutes(
        this.webServerController.getServiceNowAuthClient(),
        this.webServerController.getSLATrackingService()
      ))
      
      .get('/', ({ set }) => {
        set.headers['Location'] = '/htmx/';
        set.status = 302;
        return;
      })
      
      .get('/dashboard/incidents', () => ({ 
        message: 'Incidents dashboard - modularized version', 
        incidents: [] 
      }))
      .get('/dashboard/problems', () => ({ 
        message: 'Problems dashboard - modularized version', 
        problems: [] 
      }))
      .get('/dashboard/changes', () => ({ 
        message: 'Changes dashboard - modularized version', 
        changes: [] 
      }))
      
      .get('/events/stream', (context) => this.streamingController.handleSSEStream(context))
      
      .ws('/ws/control', {
        message: (ws, message) => this.streamingController.handleWebSocketMessage(ws, message),
        open: (ws) => this.streamingController.handleWebSocketOpen(ws),
        close: (ws) => this.streamingController.handleWebSocketClose(ws),
      })
      
      .group('/api/v1', (app) => app
        .get('/incidents', () => this.apiController.getIncidents())
        .get('/problems', () => this.apiController.getProblems())
        .get('/changes', () => this.apiController.getChanges())
        .post('/process/parquet/:table', ({ params }) => this.apiController.processToParquet(params.table))
        .post('/process/pipeline/:pipeline', ({ params }) => this.apiController.executePipeline(params.pipeline))
        .get('/analytics/dashboard', () => this.apiController.getDashboardAnalytics())
        .post('/mongodb/sync', () => this.apiController.syncCurrentMonthTickets())
        .get('/mongodb/tickets/:type', ({ params, query }) => this.apiController.getTicketsFromMongoDB(params.type, query))
        .get('/mongodb/stats', () => this.apiController.getMongoDBStats())
        .get('/mongodb/groups', () => this.apiController.getTargetGroups())
      );

    console.log('🔗 Routes configured with modular controllers');
  }

  public async start(): Promise<void> {
    await this.webServerController.start();
  }

  public async stop(): Promise<void> {
    await this.webServerController.stop();
  }

  // Expose controllers for external access if needed
  public getWebServerController(): WebServerController {
    return this.webServerController;
  }

  public getAPIController(): APIController {
    return this.apiController;
  }

  public getDashboardController(): DashboardController {
    return this.dashboardController;
  }

  public getStreamingController(): StreamingController {
    return this.streamingController;
  }
}

export default ServiceNowWebServer;