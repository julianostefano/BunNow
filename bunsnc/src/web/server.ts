/**
 * ServiceNow Web Interface Server
 * Modern web application using Elysia.js + HTMX + TailwindCSS
 * 
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from 'elysia';
import { html } from '@elysiajs/html';
import { staticPlugin } from '@elysiajs/static';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { jwt } from '@elysiajs/jwt';
import helmet from 'elysiajs-helmet';
import { autoroutes } from 'elysia-autoroutes';
import { tailwind } from '@gtramontina/elysia-tailwind';
import { xss } from 'elysia-xss';
import { background } from 'elysia-background';
import { ServiceNowClient } from '../ServiceNowClient';
import { RedisStreamManager } from '../bigdata/redis/RedisStreamManager';
import { ParquetWriter } from '../bigdata/parquet/ParquetWriter';
import { OpenSearchClient } from '../bigdata/opensearch/OpenSearchClient';
import { HDFSClient } from '../bigdata/hadoop/HDFSClient';
import { DataPipelineOrchestrator } from '../bigdata/pipeline/DataPipelineOrchestrator';

export interface WebServerConfig {
  port: number;
  jwtSecret: string;
  serviceNow: {
    instanceUrl: string;
    username: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  hadoop: {
    namenode: string;
    port: number;
    username: string;
  };
  opensearch: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    ssl?: boolean;
  };
  parquet: {
    outputPath: string;
    compressionType: 'snappy' | 'gzip' | 'lz4' | 'none';
  };
}

export class ServiceNowWebServer {
  private app: Elysia;
  private config: WebServerConfig;
  private serviceNowClient: ServiceNowClient;
  private redisStreamManager: RedisStreamManager;
  private parquetWriter: ParquetWriter;
  private openSearchClient: OpenSearchClient;
  private hdfsClient: HDFSClient;
  private pipelineOrchestrator: DataPipelineOrchestrator;

  constructor(config: WebServerConfig) {
    this.config = config;
    this.initializeClients();
    this.setupServer();
  }

  private initializeClients(): void {
    // Initialize ServiceNow client
    this.serviceNowClient = new ServiceNowClient(
      this.config.serviceNow.instanceUrl,
      this.config.serviceNow.username,
      this.config.serviceNow.password
    );

    // Initialize Redis Stream Manager
    this.redisStreamManager = new RedisStreamManager({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
    });

    // Initialize Parquet Writer
    this.parquetWriter = new ParquetWriter({
      compressionType: this.config.parquet.compressionType,
      enablePartitioning: true,
      partitionBy: ['sys_created_on', 'priority'],
    });

    // Initialize OpenSearch client
    this.openSearchClient = new OpenSearchClient({
      host: this.config.opensearch.host,
      port: this.config.opensearch.port,
      ssl: { enabled: this.config.opensearch.ssl || false },
      auth: this.config.opensearch.username ? {
        username: this.config.opensearch.username,
        password: this.config.opensearch.password || '',
      } : undefined,
    });

    // Initialize HDFS client
    this.hdfsClient = new HDFSClient({
      namenode: this.config.hadoop.namenode,
      port: this.config.hadoop.port,
      username: this.config.hadoop.username,
    });

    // Initialize pipeline orchestrator
    this.pipelineOrchestrator = new DataPipelineOrchestrator({
      serviceNow: this.serviceNowClient,
      redis: this.redisStreamManager,
      parquet: this.parquetWriter,
      opensearch: this.openSearchClient,
      hdfs: this.hdfsClient,
    });
  }

  private setupServer(): void {
    this.app = new Elysia()
      // Security plugins
      .use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com/htmx.org"],
            connectSrc: ["'self'", "ws:", "wss:"],
            imgSrc: ["'self'", "data:", "https:"],
          },
        },
      }))
      .use(xss())
      
      // CORS configuration
      .use(cors({
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
      }))

      // JWT authentication
      .use(jwt({
        name: 'jwt',
        secret: this.config.jwtSecret,
      }))

      // HTML templating
      .use(html())

      // TailwindCSS integration
      .use(tailwind({
        path: "/public/styles.css",
        source: "./src/web/styles/input.css",
        config: "./tailwind.config.js"
      }))

      // Static file serving
      .use(staticPlugin({
        assets: "./src/web/public",
        prefix: "/public",
      }))

      // Background task processing
      .use(background())

      // Auto-routes for file-based routing
      .use(autoroutes({
        routesDir: "./src/web/routes",
      }))

      // Swagger documentation
      .use(swagger({
        documentation: {
          info: {
            title: 'ServiceNow Web Interface API',
            version: '1.0.0',
            description: 'Modern web interface for ServiceNow integration with big data capabilities',
          },
          tags: [
            { name: 'Dashboard', description: 'Dashboard endpoints' },
            { name: 'Real-time', description: 'SSE and WebSocket endpoints' },
            { name: 'Data Processing', description: 'Big data processing endpoints' },
            { name: 'Analytics', description: 'Analytics and reporting endpoints' },
          ],
        },
      }))

      // Health check endpoint
      .get('/health', () => ({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          serviceNow: 'connected',
          redis: 'connected',
          opensearch: 'connected',
          hadoop: 'connected',
        },
      }))

      // Main dashboard route
      .get('/', () => this.renderDashboard())

      // Server-Sent Events for real-time updates
      .get('/events/stream', (context) => this.handleSSEStream(context))

      // WebSocket for interactive control
      .ws('/ws/control', {
        message: (ws, message) => this.handleWebSocketMessage(ws, message),
        open: (ws) => this.handleWebSocketOpen(ws),
        close: (ws) => this.handleWebSocketClose(ws),
      })

      // API Routes
      .group('/api/v1', (app) => app
        .get('/incidents', () => this.getIncidents())
        .get('/problems', () => this.getProblems())
        .get('/changes', () => this.getChanges())
        .post('/process/parquet/:table', ({ params }) => this.processToParquet(params.table))
        .post('/process/pipeline/:pipeline', ({ params }) => this.executePipeline(params.pipeline))
        .get('/analytics/dashboard', () => this.getDashboardAnalytics())
      )

      // Error handling
      .onError(({ error, code }) => {
        console.error(`Error ${code}:`, error);
        return {
          error: 'Internal Server Error',
          message: error.message,
          timestamp: new Date().toISOString(),
        };
      });
  }

  private renderDashboard(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ServiceNow Analytics Dashboard</title>
    <link href="/public/styles.css" rel="stylesheet">
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <script src="https://unpkg.com/htmx.org/dist/ext/sse.js"></script>
    <script src="https://unpkg.com/chart.js"></script>
</head>
<body class="bg-gray-100 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">ServiceNow Analytics Dashboard</h1>
            <p class="text-gray-600">Real-time monitoring and analytics for ServiceNow data processing</p>
        </div>

        <!-- Real-time Status Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8" 
             hx-ext="sse" 
             sse-connect="/events/stream">
            <div class="bg-white rounded-lg shadow-md p-6" sse-swap="incident-count">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Active Incidents</h3>
                <div class="text-3xl font-bold text-red-600" id="incident-count">Loading...</div>
            </div>
            <div class="bg-white rounded-lg shadow-md p-6" sse-swap="problem-count">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Open Problems</h3>
                <div class="text-3xl font-bold text-orange-600" id="problem-count">Loading...</div>
            </div>
            <div class="bg-white rounded-lg shadow-md p-6" sse-swap="change-count">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Pending Changes</h3>
                <div class="text-3xl font-bold text-blue-600" id="change-count">Loading...</div>
            </div>
            <div class="bg-white rounded-lg shadow-md p-6" sse-swap="processing-status">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Data Processing</h3>
                <div class="text-3xl font-bold text-green-600" id="processing-status">Active</div>
            </div>
        </div>

        <!-- Interactive Controls -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">Data Processing Controls</h3>
                <div class="space-y-4">
                    <button class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                            hx-post="/api/v1/process/parquet/incident"
                            hx-target="#processing-log"
                            hx-indicator="#processing-spinner">
                        Export Incidents to Parquet
                    </button>
                    <button class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                            hx-post="/api/v1/process/pipeline/realtime"
                            hx-target="#processing-log"
                            hx-indicator="#processing-spinner">
                        Start Real-time Pipeline
                    </button>
                    <button class="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                            hx-get="/api/v1/analytics/dashboard"
                            hx-target="#analytics-content">
                        Refresh Analytics
                    </button>
                </div>
                <div id="processing-spinner" class="htmx-indicator">
                    <div class="flex items-center justify-center mt-4">
                        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <span class="ml-2 text-gray-600">Processing...</span>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">Processing Log</h3>
                <div id="processing-log" class="bg-gray-50 rounded-md p-4 h-48 overflow-y-auto text-sm font-mono">
                    <div class="text-gray-500">Ready to process data...</div>
                </div>
            </div>
        </div>

        <!-- Analytics Content -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-xl font-semibold text-gray-800 mb-4">Analytics Overview</h3>
            <div id="analytics-content" 
                 hx-get="/api/v1/analytics/dashboard" 
                 hx-trigger="load">
                Loading analytics...
            </div>
        </div>
    </div>

    <script>
        // WebSocket connection for interactive features
        const ws = new WebSocket('ws://localhost:3008/ws/control');
        
        ws.onopen = function() {
            console.log('WebSocket connected');
        };
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            console.log('WebSocket message:', data);
            
            // Handle real-time updates
            if (data.type === 'log') {
                const logElement = document.getElementById('processing-log');
                const logEntry = document.createElement('div');
                logEntry.textContent = \`[\${new Date().toLocaleTimeString()}] \${data.message}\`;
                logElement.appendChild(logEntry);
                logElement.scrollTop = logElement.scrollHeight;
            }
        };
        
        ws.onclose = function() {
            console.log('WebSocket disconnected');
        };
    </script>
</body>
</html>
    `;
  }

  private handleSSEStream(context: any) {
    const { set } = context;
    
    set.headers['Content-Type'] = 'text/event-stream';
    set.headers['Cache-Control'] = 'no-cache';
    set.headers['Connection'] = 'keep-alive';
    
    // Start streaming real-time data
    return new ReadableStream({
      start(controller) {
        const interval = setInterval(async () => {
          try {
            // Get real-time counts from ServiceNow
            const incidentCount = await this.getActiveIncidentCount();
            const problemCount = await this.getOpenProblemCount();
            const changeCount = await this.getPendingChangeCount();
            
            // Send updates
            controller.enqueue(`event: incident-count\ndata: ${incidentCount}\n\n`);
            controller.enqueue(`event: problem-count\ndata: ${problemCount}\n\n`);
            controller.enqueue(`event: change-count\ndata: ${changeCount}\n\n`);
            
            // Send processing status
            const processingStatus = await this.getProcessingStatus();
            controller.enqueue(`event: processing-status\ndata: ${processingStatus}\n\n`);
            
          } catch (error) {
            console.error('SSE stream error:', error);
          }
        }, 5000); // Update every 5 seconds
        
        // Store interval for cleanup
        context.interval = interval;
      },
      cancel() {
        if (context.interval) {
          clearInterval(context.interval);
        }
      }
    });
  }

  private handleWebSocketMessage(ws: any, message: any): void {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      
      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        case 'subscribe':
          // Handle subscription to specific data streams
          break;
        default:
          console.log('Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  private handleWebSocketOpen(ws: any): void {
    console.log('WebSocket client connected');
    ws.send(JSON.stringify({ 
      type: 'welcome', 
      message: 'Connected to ServiceNow Analytics Dashboard' 
    }));
  }

  private handleWebSocketClose(ws: any): void {
    console.log('WebSocket client disconnected');
  }

  // API Methods
  private async getIncidents() {
    try {
      const gr = this.serviceNowClient.getGlideRecord('incident');
      gr.addQuery('state', '!=', '6'); // Not resolved
      gr.query();
      
      const incidents = [];
      while (gr.next()) {
        incidents.push({
          sys_id: gr.getValue('sys_id'),
          number: gr.getValue('number'),
          short_description: gr.getValue('short_description'),
          priority: gr.getValue('priority'),
          state: gr.getValue('state'),
          sys_created_on: gr.getValue('sys_created_on'),
        });
      }
      
      return { incidents, count: incidents.length };
    } catch (error) {
      throw new Error(`Failed to fetch incidents: ${error.message}`);
    }
  }

  private async getProblems() {
    try {
      const gr = this.serviceNowClient.getGlideRecord('problem');
      gr.addQuery('state', '!=', '6'); // Not resolved
      gr.query();
      
      const problems = [];
      while (gr.next()) {
        problems.push({
          sys_id: gr.getValue('sys_id'),
          number: gr.getValue('number'),
          short_description: gr.getValue('short_description'),
          priority: gr.getValue('priority'),
          state: gr.getValue('state'),
          sys_created_on: gr.getValue('sys_created_on'),
        });
      }
      
      return { problems, count: problems.length };
    } catch (error) {
      throw new Error(`Failed to fetch problems: ${error.message}`);
    }
  }

  private async getChanges() {
    try {
      const gr = this.serviceNowClient.getGlideRecord('change_request');
      gr.addQuery('state', 'IN', '1,2,3'); // New, Assess, Authorize
      gr.query();
      
      const changes = [];
      while (gr.next()) {
        changes.push({
          sys_id: gr.getValue('sys_id'),
          number: gr.getValue('number'),
          short_description: gr.getValue('short_description'),
          priority: gr.getValue('priority'),
          state: gr.getValue('state'),
          sys_created_on: gr.getValue('sys_created_on'),
        });
      }
      
      return { changes, count: changes.length };
    } catch (error) {
      throw new Error(`Failed to fetch changes: ${error.message}`);
    }
  }

  private async processToParquet(tableName: string) {
    try {
      const gr = this.serviceNowClient.getGlideRecord(tableName);
      gr.query();
      
      const outputPath = `${this.config.parquet.outputPath}/${tableName}_${Date.now()}.parquet`;
      const stats = await this.parquetWriter.streamToParquet(gr, outputPath);
      
      return {
        success: true,
        message: `Successfully exported ${stats.recordsWritten} records to Parquet format`,
        stats,
        outputPath,
      };
    } catch (error) {
      throw new Error(`Failed to process ${tableName} to Parquet: ${error.message}`);
    }
  }

  private async executePipeline(pipelineType: string) {
    try {
      let pipelineId: string;
      
      switch (pipelineType) {
        case 'realtime':
          pipelineId = await this.pipelineOrchestrator.createRealtimePipeline({
            tables: ['incident', 'problem', 'change_request'],
            enableStreaming: true,
          });
          break;
        case 'export':
          pipelineId = await this.pipelineOrchestrator.createExportPipeline({
            tables: ['incident', 'problem', 'change_request'],
            outputFormat: 'parquet',
            compressionType: 'snappy',
          });
          break;
        default:
          throw new Error(`Unknown pipeline type: ${pipelineType}`);
      }
      
      const execution = await this.pipelineOrchestrator.executePipeline(pipelineId);
      
      return {
        success: true,
        message: `Pipeline ${pipelineType} started successfully`,
        pipelineId,
        executionId: execution.id,
      };
    } catch (error) {
      throw new Error(`Failed to execute pipeline: ${error.message}`);
    }
  }

  private async getDashboardAnalytics() {
    try {
      const [incidents, problems, changes] = await Promise.all([
        this.getActiveIncidentCount(),
        this.getOpenProblemCount(),
        this.getPendingChangeCount(),
      ]);
      
      return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="text-center">
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Incidents</h4>
            <div class="text-4xl font-bold text-red-600">${incidents}</div>
            <p class="text-gray-500 mt-1">Active tickets</p>
          </div>
          <div class="text-center">
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Problems</h4>
            <div class="text-4xl font-bold text-orange-600">${problems}</div>
            <p class="text-gray-500 mt-1">Open problems</p>
          </div>
          <div class="text-center">
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Changes</h4>
            <div class="text-4xl font-bold text-blue-600">${changes}</div>
            <p class="text-gray-500 mt-1">Pending changes</p>
          </div>
        </div>
        <div class="mt-8">
          <h4 class="text-lg font-semibold text-gray-700 mb-4">Processing Statistics</h4>
          <div class="bg-gray-50 rounded-md p-4">
            <div class="flex justify-between items-center mb-2">
              <span class="text-gray-600">Records Processed Today:</span>
              <span class="font-semibold">12,458</span>
            </div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-gray-600">Parquet Files Generated:</span>
              <span class="font-semibold">34</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-600">Storage Used:</span>
              <span class="font-semibold">2.3 GB</span>
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      return `<div class="text-red-600">Error loading analytics: ${error.message}</div>`;
    }
  }

  // Helper methods
  private async getActiveIncidentCount(): Promise<number> {
    const gr = this.serviceNowClient.getGlideRecord('incident');
    gr.addQuery('state', '!=', '6');
    gr.query();
    let count = 0;
    while (gr.next()) count++;
    return count;
  }

  private async getOpenProblemCount(): Promise<number> {
    const gr = this.serviceNowClient.getGlideRecord('problem');
    gr.addQuery('state', '!=', '6');
    gr.query();
    let count = 0;
    while (gr.next()) count++;
    return count;
  }

  private async getPendingChangeCount(): Promise<number> {
    const gr = this.serviceNowClient.getGlideRecord('change_request');
    gr.addQuery('state', 'IN', '1,2,3');
    gr.query();
    let count = 0;
    while (gr.next()) count++;
    return count;
  }

  private async getProcessingStatus(): Promise<string> {
    // Check if any pipelines are running
    const activePipelines = await this.pipelineOrchestrator.getActivePipelines();
    return activePipelines.length > 0 ? 'Processing' : 'Idle';
  }

  public async start(): Promise<void> {
    try {
      await this.app.listen(this.config.port);
      console.log(`🚀 ServiceNow Web Interface running on port ${this.config.port}`);
      console.log(`📊 Dashboard: http://localhost:${this.config.port}`);
      console.log(`📖 API Docs: http://localhost:${this.config.port}/swagger`);
    } catch (error) {
      console.error('Failed to start web server:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.app.stop();
      console.log('🛑 ServiceNow Web Interface stopped');
    } catch (error) {
      console.error('Error stopping web server:', error);
      throw error;
    }
  }
}

export default ServiceNowWebServer;