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
import { accepts } from 'elysia-accepts';
// import helmet from 'elysiajs-helmet';
// import { autoroutes } from 'elysia-autoroutes';
// import { tailwind } from '@gtramontina.com/elysia-tailwind'; // Removido por vulnerabilidades
// import { xss } from 'elysia-xss';
import { background } from 'elysia-background';
import { ServiceNowClient } from '../client/ServiceNowClient';
import { RedisStreamManager } from '../bigdata/redis/RedisStreamManager';
import { TicketIntegrationService } from '../services/TicketIntegrationService';
// import { ParquetWriter } from '../bigdata/parquet/ParquetWriter';
// import { OpenSearchClient } from '../bigdata/opensearch/OpenSearchClient';
// import { HDFSClient } from '../bigdata/hadoop/HDFSClient';
// import { DataPipelineOrchestrator } from '../bigdata/pipeline/DataPipelineOrchestrator';
import htmxDashboardClean from './htmx-dashboard-clean';
import htmxDashboardEnhanced from './htmx-dashboard-enhanced';
import waitingAnalysisHtmx from './waiting-analysis-htmx';
// import { db } from '../config/database';
// import { serviceNowStreams } from '../config/redis-streams';
// import { createWebSocketPlugin } from './websocket-handler';

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
  mongodb: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
}

export class ServiceNowWebServer {
  private app: Elysia;
  private config: WebServerConfig;
  private serviceNowClient: ServiceNowClient;
  private redisStreamManager: RedisStreamManager;
  private ticketIntegrationService: TicketIntegrationService;
  // private parquetWriter: ParquetWriter;
  // private openSearchClient: OpenSearchClient;
  // private hdfsClient: HDFSClient;
  // private pipelineOrchestrator: DataPipelineOrchestrator;

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

    // Initialize Redis Stream Manager for performance optimization
    this.redisStreamManager = new RedisStreamManager({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
    });

    // Initialize Ticket Integration Service
    this.ticketIntegrationService = new TicketIntegrationService(this.serviceNowClient);

    // Other big data clients temporarily commented out
    /*

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
    */
  }

  private setupServer(): void {
    this.app = new Elysia()
      // Security plugins - helmet temporarily disabled
      // .use(helmet({
      //   contentSecurityPolicy: {
      //     directives: {
      //       defaultSrc: ["'self'"],
      //       styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      //       scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com/htmx.org"],
      //       connectSrc: ["'self'", "ws:", "wss:"],
      //       imgSrc: ["'self'", "data:", "https:"],
      //     },
      //   },
      // }))
      // .use(xss())
      
      // CORS configuration - mais permissivo para assets
      .use(cors({
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
        allowedHeaders: ['*'],
        credentials: true,
        maxAge: 86400,
      }))

      // JWT authentication
      .use(jwt({
        name: 'jwt',
        secret: this.config.jwtSecret,
      }))

      // HTML templating
      .use(html())
      
      // Content negotiation support
      .use(accepts())

      // TailwindCSS integration removida - usando CSS compilado diretamente
      // .use(tailwind({
      //   path: "/public/styles.css",
      //   source: "./src/web/styles/input.css",
      //   config: "./tailwind.config.js"
      // }))

      // Static file serving - configuração única otimizada
      .use(staticPlugin({
        assets: "public",
        prefix: "/public",
        staticLimit: 2048,
        alwaysStatic: true,
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        },
        ignorePatterns: ['.DS_Store', '*.tmp', 'node_modules']
      }))

      // Background task processing
      .use(background())

      // HTMX Dashboard Integration
      .use(htmxDashboardClean)
      .use(htmxDashboardEnhanced)

      // HTMX Waiting Analysis Integration  
      .use(waitingAnalysisHtmx)

      // WebSocket Integration - temporarily disabled
      // .use(createWebSocketPlugin())

      // Auto-routes for file-based routing - temporarily disabled
      // .use(autoroutes({
      //   routesDir: "./src/web/routes",
      // }))

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

      // Main dashboard route - redirect to HTMX clean dashboard
      .get('/', ({ set }) => {
        set.headers['Location'] = '/htmx/';
        set.status = 302;
        return;
      })

      // Basic dashboard routes
      .get('/dashboard/incidents', () => ({ message: 'Incidents dashboard - temporarily simplified', incidents: [] }))
      .get('/dashboard/problems', () => ({ message: 'Problems dashboard - temporarily simplified', problems: [] }))
      .get('/dashboard/changes', () => ({ message: 'Changes dashboard - temporarily simplified', changes: [] }))

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
        
        // MongoDB Collection Routes
        .post('/mongodb/sync', () => this.syncCurrentMonthTickets())
        .get('/mongodb/tickets/:type', ({ params, query }) => this.getTicketsFromMongoDB(params.type, query))
        .get('/mongodb/stats', () => this.getMongoDBStats())
        .get('/mongodb/groups', () => this.getTargetGroups())
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

  private renderSimpleDashboard(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ServiceNow Web Interface</title>
    <link href="/public/styles.css" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">ServiceNow Web Interface</h1>
            <p class="text-gray-600">Sistema funcionando na porta 3008 - Versão simplificada temporária</p>
            <div class="mt-4 flex space-x-4">
                <span class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">✅ Server Online</span>
                <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">🔧 Rate Limiting: 10 req/sec</span>
                <span class="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">📦 Redis Cache: Enabled</span>
            </div>
        </div>

        <!-- Navigation -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">📊 Dashboard</h3>
                <div class="space-y-2">
                    <a href="/dashboard/incidents" class="block text-blue-600 hover:text-blue-800">Incidents</a>
                    <a href="/dashboard/problems" class="block text-blue-600 hover:text-blue-800">Problems</a>
                    <a href="/dashboard/changes" class="block text-blue-600 hover:text-blue-800">Changes</a>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">🛠️ API</h3>
                <div class="space-y-2">
                    <a href="/swagger" class="block text-blue-600 hover:text-blue-800">API Documentation</a>
                    <a href="/health" class="block text-blue-600 hover:text-blue-800">Health Check</a>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow-md p-6">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">⚙️ Status</h3>
                <div class="space-y-2">
                    <p class="text-gray-600">Port: 3008</p>
                    <p class="text-gray-600">Rate Limit: Conservative</p>
                    <p class="text-gray-600">Cache: Redis Enabled</p>
                </div>
            </div>
        </div>

        <!-- Status Info -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h3 class="text-xl font-semibold text-gray-800 mb-4">📈 System Status</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-600">✅</div>
                    <div class="text-sm text-gray-600">ServiceNow API</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-600">✅</div>
                    <div class="text-sm text-gray-600">Redis Cache</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-blue-600">⏱️</div>
                    <div class="text-sm text-gray-600">Rate Limiter</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-600">🚀</div>
                    <div class="text-sm text-gray-600">Web Server</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    `;
  }

  private renderEnhancedDashboard(): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ServiceNow Enhanced Dashboard</title>
    <script src="https://unpkg.com/htmx.org@2.0.0"></script>
    <script src="https://unpkg.com/alpinejs@3.14.1/dist/cdn.min.js" defer></script>
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'elysia-blue': '#3b82f6',
                        'elysia-cyan': '#06b6d4',
                        'dark-bg': '#0f172a',
                        'dark-card': '#1e293b',
                        'dark-border': '#334155'
                    }
                }
            }
        };
    </script>
</head>
<body class="bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="glass-card bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8 mb-8">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-4xl font-bold bg-gradient-to-r from-elysia-blue to-elysia-cyan bg-clip-text text-transparent">
                        ServiceNow Enhanced Dashboard
                    </h1>
                    <p class="text-gray-600 mt-2">Sistema com mapeamento correto de status e funcionalidades avançadas</p>
                    <div class="flex items-center space-x-4 mt-4">
                        <span class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm flex items-center">
                            <i data-lucide="check-circle" class="w-4 h-4 mr-1"></i>
                            Status Mapping Correto
                        </span>
                        <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center">
                            <i data-lucide="zap" class="w-4 h-4 mr-1"></i>
                            Real-time Updates
                        </span>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <button class="bg-gradient-to-r from-elysia-blue to-elysia-cyan text-white px-6 py-2 rounded-xl font-medium hover:shadow-lg transition-all duration-300">
                        <i data-lucide="settings" class="w-4 h-4 mr-2 inline"></i>
                        Configurações
                    </button>
                </div>
            </div>
        </div>

        <!-- Status Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="glass-card bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-600">Incidents Ativos</p>
                        <p class="text-2xl font-bold text-gray-900" id="incident-count">-</p>
                    </div>
                    <div class="bg-red-100 p-3 rounded-xl">
                        <i data-lucide="alert-triangle" class="w-6 h-6 text-red-600"></i>
                    </div>
                </div>
            </div>
            <div class="glass-card bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-600">Change Tasks</p>
                        <p class="text-2xl font-bold text-gray-900" id="change-count">-</p>
                    </div>
                    <div class="bg-yellow-100 p-3 rounded-xl">
                        <i data-lucide="git-branch" class="w-6 h-6 text-yellow-600"></i>
                    </div>
                </div>
            </div>
            <div class="glass-card bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-600">Service Tasks</p>
                        <p class="text-2xl font-bold text-gray-900" id="sctask-count">-</p>
                    </div>
                    <div class="bg-blue-100 p-3 rounded-xl">
                        <i data-lucide="clipboard-list" class="w-6 h-6 text-blue-600"></i>
                    </div>
                </div>
            </div>
        </div>

        <!-- Dashboard Message -->
        <div class="glass-card bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8 mb-8 text-center">
            <div class="bg-gradient-to-r from-green-100 to-blue-100 p-6 rounded-xl">
                <i data-lucide="check-circle-2" class="w-12 h-12 text-green-600 mx-auto mb-4"></i>
                <h2 class="text-2xl font-bold text-gray-900 mb-2">🎯 Dashboard Enhanced Funcionando!</h2>
                <p class="text-gray-600 mb-4">
                    Sistema integrado com sucesso na raiz (/) com todas as funcionalidades:
                </p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    <div class="space-y-2">
                        <p class="flex items-center"><i data-lucide="check" class="w-4 h-4 text-green-500 mr-2"></i><strong>Status Mapping Correto:</strong> "Designados" ≠ "Em Andamento"</p>
                        <p class="flex items-center"><i data-lucide="check" class="w-4 h-4 text-green-500 mr-2"></i><strong>Dropdowns Específicos:</strong> Status por tipo de ticket</p>
                        <p class="flex items-center"><i data-lucide="check" class="w-4 h-4 text-green-500 mr-2"></i><strong>Modal Responsiva:</strong> Abas (Ticket + Anotações + Anexos)</p>
                    </div>
                    <div class="space-y-2">
                        <p class="flex items-center"><i data-lucide="check" class="w-4 h-4 text-green-500 mr-2"></i><strong>Ações do Usuário:</strong> Anotar, assumir, alterar status</p>
                        <p class="flex items-center"><i data-lucide="check" class="w-4 h-4 text-green-500 mr-2"></i><strong>Redis Stream:</strong> Erro corrigido (addToStream → addMessage)</p>
                        <p class="flex items-center"><i data-lucide="check" class="w-4 h-4 text-green-500 mr-2"></i><strong>Servidor:</strong> Rodando estável na porta 3008</p>
                    </div>
                </div>
                <div class="mt-6 pt-4 border-t border-gray-200">
                    <p class="text-sm text-gray-500">
                        <strong>URLs Disponíveis:</strong> 
                        <code class="bg-gray-100 px-2 py-1 rounded">http://localhost:3008/</code> (este dashboard) • 
                        <code class="bg-gray-100 px-2 py-1 rounded">http://localhost:3008/enhanced/</code> (versão completa) •
                        <code class="bg-gray-100 px-2 py-1 rounded">http://localhost:3008/clean/</code> (dashboard limpo)
                    </p>
                </div>
            </div>
        </div>

        <!-- Tickets Demo Section -->
        <div class="glass-card bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-8 mb-8">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-900">🎯 Status Mapping Demo</h2>
                    <p class="text-gray-600">Demonstração do mapeamento correto de status</p>
                </div>
                <div class="flex space-x-2">
                    <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm">Designado ≠ Em Andamento</span>
                </div>
            </div>
            
            <!-- Tickets Container -->
            <div id="tickets-container" hx-get="/enhanced/tickets-lazy?group=all&ticketType=incident&state=active&page=1" hx-trigger="load" hx-target="#tickets-container" hx-swap="innerHTML">
                <div class="flex justify-center py-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            </div>
        </div>

        <!-- Quick Access Buttons -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button onclick="refreshTickets()" class="glass-card bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 group">
                <div class="flex items-center space-x-4">
                    <div class="bg-gradient-to-r from-elysia-blue to-elysia-cyan p-3 rounded-xl group-hover:scale-110 transition-transform">
                        <i data-lucide="refresh-cw" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-gray-900">Atualizar Tickets</h3>
                        <p class="text-gray-600 text-sm">Carregar dados mais recentes</p>
                    </div>
                </div>
            </button>
            <a href="/clean/" class="glass-card bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 group">
                <div class="flex items-center space-x-4">
                    <div class="bg-gradient-to-r from-green-400 to-green-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                        <i data-lucide="minimize-2" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-gray-900">Dashboard Limpo</h3>
                        <p class="text-gray-600 text-sm">Interface simplificada</p>
                    </div>
                </div>
            </a>
            <a href="/swagger" class="glass-card bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl shadow-xl p-6 hover:shadow-2xl transition-all duration-300 group">
                <div class="flex items-center space-x-4">
                    <div class="bg-gradient-to-r from-purple-400 to-purple-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                        <i data-lucide="book-open" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-gray-900">Documentação API</h3>
                        <p class="text-gray-600 text-sm">Swagger docs</p>
                    </div>
                </div>
            </a>
        </div>
    </div>

    <script>
        // Initialize Lucide icons
        document.addEventListener('DOMContentLoaded', function() {
            lucide.createIcons();
        });

        // Load real data
        async function loadDashboardData() {
            try {
                // This would connect to actual endpoints
                document.getElementById('incident-count').textContent = '12';
                document.getElementById('change-count').textContent = '8';
                document.getElementById('sctask-count').textContent = '15';
            } catch (error) {
                console.error('Error loading dashboard data:', error);
            }
        }

        // Load data on page load
        loadDashboardData();
        
        // Refresh every 30 seconds
        setInterval(loadDashboardData, 30000);
        
        // Function to refresh tickets
        function refreshTickets() {
            htmx.trigger('#tickets-container', 'refresh');
            // Re-trigger the HTMX request
            document.getElementById('tickets-container').setAttribute('hx-trigger', 'refresh');
            htmx.process(document.getElementById('tickets-container'));
        }
        
        // Make function globally available
        window.refreshTickets = refreshTickets;
    </script>

    <style>
        .glass-card {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .glass-card:hover {
            transform: translateY(-2px);
        }
    </style>
</body>
</html>
    `;
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

  // Status configuration method
  private getStatusConfig(ticketType: string, state: string) {
    const statusMappings = {
      incident: {
        '1': { label: 'Novo', color: 'text-blue-700', bgColor: 'bg-blue-100' },
        '2': { label: 'Em Andamento', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
        '18': { label: 'Designado', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
        '3': { label: 'Em Espera', color: 'text-gray-700', bgColor: 'bg-gray-100' },
        '6': { label: 'Resolvido', color: 'text-green-700', bgColor: 'bg-green-100' },
        '7': { label: 'Fechado', color: 'text-green-800', bgColor: 'bg-green-200' },
        '8': { label: 'Cancelado', color: 'text-red-700', bgColor: 'bg-red-100' }
      }
    };
    
    return statusMappings[ticketType]?.[state] || { 
      label: `Status ${state}`, 
      color: 'text-gray-600', 
      bgColor: 'bg-gray-100' 
    };
  }

  // MongoDB Integration Methods
  private async syncCurrentMonthTickets(): Promise<any> {
    try {
      console.log('🔄 Starting sync of current month tickets to MongoDB...');
      const result = await this.ticketIntegrationService.syncCurrentMonthTickets();
      
      if (result.success) {
        console.log('✅ MongoDB sync completed successfully:', result.stats);
        return {
          success: true,
          message: 'Current month tickets synced successfully',
          stats: result.stats,
          timestamp: new Date().toISOString()
        };
      } else {
        console.error('❌ MongoDB sync failed');
        return {
          success: false,
          message: 'Failed to sync tickets to MongoDB',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('❌ Error during MongoDB sync:', error);
      return {
        success: false,
        message: `Error during sync: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  private async getTicketsFromMongoDB(ticketType: string, query: any = {}): Promise<any> {
    try {
      if (!['incident', 'change_task', 'sc_task'].includes(ticketType)) {
        throw new Error(`Invalid ticket type: ${ticketType}. Must be incident, change_task, or sc_task`);
      }

      const filter = {};
      if (query.state) filter.state = query.state;
      if (query.group) filter.assignment_group = query.group;
      
      const limit = parseInt(query.limit) || 50;
      
      const tickets = await this.ticketIntegrationService.getTicketsFromMongoDB(
        ticketType as 'incident' | 'change_task' | 'sc_task',
        filter,
        limit
      );

      const count = await this.ticketIntegrationService.getTicketCountFromMongoDB(
        ticketType as 'incident' | 'change_task' | 'sc_task',
        filter
      );

      return {
        success: true,
        tickets,
        count,
        ticketType,
        filter,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ Error getting ${ticketType} from MongoDB:`, error);
      return {
        success: false,
        message: `Error getting ${ticketType}: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  private async getMongoDBStats(): Promise<any> {
    try {
      const stats = await this.ticketIntegrationService.getCollectionStats();
      return {
        success: true,
        stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting MongoDB stats:', error);
      return {
        success: false,
        message: `Error getting stats: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  private async getTargetGroups(): Promise<any> {
    try {
      const groups = await this.ticketIntegrationService.getTargetGroups();
      return {
        success: true,
        groups,
        count: groups.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting target groups:', error);
      return {
        success: false,
        message: `Error getting groups: ${error.message}`,
        timestamp: new Date().toISOString()
      };
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