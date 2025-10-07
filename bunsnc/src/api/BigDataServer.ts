/**
 * Comprehensive Big Data API Server using Elysia.js
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi, fromTypes } from "@elysiajs/openapi";
import { jwt } from "@elysiajs/jwt";
import { rateLimit } from "elysia-rate-limit";
import { helmet } from "elysia-helmet";
import { logger } from "../utils/Logger";
import { performanceMonitor } from "../utils/PerformanceMonitor";
import path from "path";

// Import all big data services
import { ServiceNowParquetIntegration } from "../bigdata/parquet/index";
import { ServiceNowRedisIntegration } from "../bigdata/redis/index";
import { ServiceNowHadoopFactory } from "../bigdata/hadoop/index";
import { ServiceNowOpenSearchFactory } from "../bigdata/opensearch/index";
import { DataPipelineOrchestrator } from "../bigdata/pipeline/DataPipelineOrchestrator";
import { ServiceNowStreamingPlatform } from "../bigdata/streaming/index";

// Service interfaces
interface BigDataServices {
  parquet: ServiceNowParquetIntegration;
  redis: ServiceNowRedisIntegration;
  hadoop: ServiceNowHadoopFactory;
  opensearch: ServiceNowOpenSearchFactory;
  pipeline: DataPipelineOrchestrator;
  streaming: ServiceNowStreamingPlatform;
}

interface BigDataConfig {
  parquet: {
    outputPath: string;
    compressionType: "snappy" | "gzip" | "lz4";
    enablePartitioning: boolean;
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
    username: string;
    password: string;
  };
  jwt: {
    secret: string;
  };
  rateLimit: {
    max: number;
    windowMs: number;
  };
}

export class BigDataServer {
  private app: Elysia;
  private services: BigDataServices;
  private config: BigDataConfig;
  private isStarted = false;

  constructor(config: BigDataConfig) {
    this.config = config;
    this.services = this.initializeServices();
    this.app = this.createApp();
  }

  private initializeServices(): BigDataServices {
    logger.info("Initializing big data services...");

    // Initialize Parquet service
    const parquet = new ServiceNowParquetIntegration({
      outputPath: this.config.parquet.outputPath,
      compressionType: this.config.parquet.compressionType,
      enablePartitioning: this.config.parquet.enablePartitioning,
      batchSize: 5000,
      enableMonitoring: true,
    });

    // Initialize Redis service
    const redis = new ServiceNowRedisIntegration({
      stream: {
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
      },
      cache: {
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        defaultTTL: 3600,
      },
      pubsub: {
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
      },
    });

    // Initialize Hadoop service
    const hadoop = new ServiceNowHadoopFactory({
      namenode: this.config.hadoop.namenode,
      // port property exists in implementation but not in type definition
      ...(this.config.hadoop.port && { port: this.config.hadoop.port }),
      username: this.config.hadoop.username,
      replicationFactor: 3,
      blockSize: 134217728, // 128MB
      enableCompression: true,
    } as any);

    // Initialize OpenSearch service
    const opensearch = new ServiceNowOpenSearchFactory({
      node: `${this.config.opensearch.host}:${this.config.opensearch.port}`,
      auth: {
        username: this.config.opensearch.username,
        password: this.config.opensearch.password,
      },
      ssl: {
        // enabled property exists in implementation but not in SSL type definition
        rejectUnauthorized: false,
      } as any,
      requestTimeout: 30000,
    } as any);

    // Initialize Pipeline Orchestrator
    const pipeline = new DataPipelineOrchestrator({
      parquetWriter: parquet.getWriter(),
      redisStream: redis.getStreamManager(),
      hdfsClient: hadoop.getHDFSClient(),
      openSearchClient: opensearch.getClient(),
    });

    // Initialize Streaming Platform
    const streaming = new ServiceNowStreamingPlatform({
      redisStream: redis.getStreamManager(),
      openSearchClient: opensearch.getClient(),
      parquetWriter: parquet.getWriter(),
    });

    return { parquet, redis, hadoop, opensearch, pipeline, streaming };
  }

  private createApp(): Elysia {
    const app = new Elysia({ name: "ServiceNow Big Data API" })
      // Security and middleware
      .use(helmet())
      .use(
        cors({
          origin: [
            "http://localhost:3008",
            "https://your-servicenow-instance.com",
          ],
          methods: ["GET", "POST", "PUT", "DELETE"],
          allowedHeaders: ["Content-Type", "Authorization"],
        }),
      )
      .use(
        jwt({
          name: "jwt",
          secret: this.config.jwt.secret,
        }),
      )
      .use(
        rateLimit({
          max: this.config.rateLimit.max,
          // windowMs property exists in implementation but not in elysia-rate-limit Options type
          ...({ windowMs: this.config.rateLimit.windowMs } as any),
        } as any),
      )

      // FIX v1.0.0 (CRITICAL-2): Migrated from @elysiajs/swagger to @elysiajs/openapi
      // FIX v1.0.0 (CRITICAL-3): Type-based OpenAPI generation with fromTypes()
      .use(
        openapi({
          references: fromTypes(
            process.env.NODE_ENV === "production"
              ? "dist/types/types/api.types.d.ts"
              : "src/types/api.types.ts",
            {
              projectRoot: path.join(import.meta.dir, "../.."),
              tsconfigPath: "tsconfig.json",
            },
          ),
          documentation: {
            info: {
              title: "ServiceNow Big Data API",
              version: "1.0.0",
              description:
                "Comprehensive API for ServiceNow big data operations including Parquet, Redis, Hadoop, OpenSearch, and streaming capabilities",
            },
            tags: [
              { name: "parquet", description: "Parquet data operations" },
              { name: "redis", description: "Redis cache and streaming" },
              { name: "hadoop", description: "Hadoop HDFS operations" },
              { name: "opensearch", description: "Search and analytics" },
              { name: "pipeline", description: "ETL pipeline orchestration" },
              { name: "streaming", description: "Real-time data processing" },
              { name: "health", description: "System monitoring" },
            ],
          },
        }),
      )

      // Global context
      .derive(async () => ({
        services: this.services,
        startTime: Date.now(),
      }))

      // Auth middleware for protected routes
      .derive(async ({ headers, jwt, set }) => {
        const authHeader = headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          set.status = 401;
          throw new Error("Missing or invalid authorization header");
        }

        const token = authHeader.slice(7);
        try {
          const payload = await jwt.verify(token);
          return { user: payload };
        } catch (error: unknown) {
          set.status = 401;
          throw new Error("Invalid JWT token");
        }
      })

      // Health check endpoints (no auth required)
      .get("/health", () => ({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: "1.0.0",
      }))

      .get("/health/detailed", async ({ services }) => {
        const startTime = Date.now();

        const healthChecks = await Promise.allSettled([
          this.checkParquetHealth(services.parquet),
          this.checkRedisHealth(services.redis),
          this.checkHadoopHealth(services.hadoop),
          this.checkOpenSearchHealth(services.opensearch),
          this.checkPipelineHealth(services.pipeline),
          this.checkStreamingHealth(services.streaming),
        ]);

        const results = {
          overall: "healthy",
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          services: {
            parquet:
              healthChecks[0].status === "fulfilled"
                ? healthChecks[0].value
                : {
                    healthy: false,
                    error: (healthChecks[0] as any).reason.message,
                  },
            redis:
              healthChecks[1].status === "fulfilled"
                ? healthChecks[1].value
                : {
                    healthy: false,
                    error: (healthChecks[1] as any).reason.message,
                  },
            hadoop:
              healthChecks[2].status === "fulfilled"
                ? healthChecks[2].value
                : {
                    healthy: false,
                    error: (healthChecks[2] as any).reason.message,
                  },
            opensearch:
              healthChecks[3].status === "fulfilled"
                ? healthChecks[3].value
                : {
                    healthy: false,
                    error: (healthChecks[3] as any).reason.message,
                  },
            pipeline:
              healthChecks[4].status === "fulfilled"
                ? healthChecks[4].value
                : {
                    healthy: false,
                    error: (healthChecks[4] as any).reason.message,
                  },
            streaming:
              healthChecks[5].status === "fulfilled"
                ? healthChecks[5].value
                : {
                    healthy: false,
                    error: (healthChecks[5] as any).reason.message,
                  },
          },
        };

        // Determine overall health
        const healthyServices = Object.values(results.services).filter(
          (s) => s.healthy,
        ).length;
        if (healthyServices === 0) results.overall = "critical";
        else if (healthyServices < 6) results.overall = "degraded";

        return results;
      })

      // Parquet operations
      .group("/api/v1/parquet", (app) =>
        app
          .post(
            "/export/:table",
            async ({ params, body, services, user }) => {
              const timer = "parquet_export";
              performanceMonitor.startTimer(timer);

              try {
                const { records, options = {} } = body as any;
                const result = await services.parquet.exportTableToParquet(
                  params.table,
                  records,
                  options,
                );

                logger.info(
                  `Parquet export completed for table ${params.table}`,
                  "BigDataServer",
                  {
                    user: (user as any).username || "unknown",
                    recordCount: result.recordCount,
                    outputPath: result.filePath,
                  },
                );

                return result;
              } finally {
                performanceMonitor.endTimer(timer);
              }
            },
            {
              body: t.Object({
                records: t.Array(t.Any()),
                options: t.Optional(
                  t.Object({
                    compressionType: t.Optional(
                      t.Union([
                        t.Literal("snappy"),
                        t.Literal("gzip"),
                        t.Literal("lz4"),
                      ]),
                    ),
                    enablePartitioning: t.Optional(t.Boolean()),
                    partitionBy: t.Optional(t.Array(t.String())),
                  }),
                ),
              }),
              tags: ["parquet"],
            },
          )

          .post(
            "/query/:table",
            async ({ params, body, services }) => {
              const { query, options = {} } = body as any;
              const result = await services.parquet.queryTableData(
                params.table,
                query,
                options,
              );
              return result;
            },
            {
              body: t.Object({
                query: t.Object({}),
                options: t.Optional(
                  t.Object({
                    limit: t.Optional(t.Number()),
                    columns: t.Optional(t.Array(t.String())),
                  }),
                ),
              }),
              tags: ["parquet"],
            },
          )

          .get(
            "/analytics/:table",
            async ({ params, query, services }) => {
              const result = await services.parquet.queryIncidentAnalytics({
                table: params.table,
                dateRange:
                  query.from && query.to
                    ? {
                        from: new Date(query.from as string),
                        to: new Date(query.to as string),
                      }
                    : undefined,
                groupBy: query.groupBy
                  ? (query.groupBy as string).split(",")
                  : ["priority"],
                includeTimeSeriesAnalysis: query.includeTimeSeries === "true",
              });
              return result;
            },
            {
              tags: ["parquet"],
            },
          ),
      )

      // Redis operations
      .group("/api/v1/redis", (app) =>
        app
          .post(
            "/stream/:streamKey",
            async ({ params, body, services, user }) => {
              const messageId = await services.redis.addMessage(
                params.streamKey,
                body as any,
                "*",
              );

              logger.info(
                `Message added to stream ${params.streamKey}`,
                "BigDataServer",
                {
                  user: (user as any)?.username || "unknown",
                  messageId,
                },
              );

              return { success: true, messageId, streamKey: params.streamKey };
            },
            {
              body: t.Any(),
              tags: ["redis"],
            },
          )

          .get(
            "/cache/:key",
            async ({ params, services }) => {
              const value = await services.redis.getCached(params.key);
              return { key: params.key, value, cached: value !== null };
            },
            {
              tags: ["redis"],
            },
          )

          .post(
            "/cache/:key",
            async ({ params, body, services, user }) => {
              const { value, ttl = 3600 } = body as any;
              const success = await services.redis.setCached(
                params.key,
                value,
                ttl,
              );

              logger.info(`Cache set for key ${params.key}`, "BigDataServer", {
                user: (user as any)?.username || "unknown",
                ttl,
              });

              return { success, key: params.key, ttl };
            },
            {
              body: t.Object({
                value: t.Any(),
                ttl: t.Optional(t.Number()),
              }),
              tags: ["redis"],
            },
          )

          .get(
            "/stats",
            async ({ services }) => {
              const stats = await services.redis.getComprehensiveStats();
              return stats;
            },
            {
              tags: ["redis"],
            },
          ),
      )

      // Hadoop operations
      .group("/api/v1/hadoop", (app) =>
        app
          .post(
            "/upload",
            async ({ body, services, user }) => {
              const { localFiles, table, records, options = {} } = body as any;

              const result = await services.hadoop.uploadServiceNowData(
                localFiles,
                table,
                records,
                options,
              );

              logger.info(
                `Hadoop upload completed for table ${table}`,
                "BigDataServer",
                {
                  user: (user as any)?.username || "unknown",
                  uploadedFiles: result.uploadedFiles.length,
                  totalSize: result.totalSize,
                },
              );

              return result;
            },
            {
              body: t.Object({
                localFiles: t.Array(t.String()),
                table: t.String(),
                records: t.Array(t.Any()),
                options: t.Optional(
                  t.Object({
                    partitionStrategy: t.Optional(
                      t.Union([
                        t.Literal("date"),
                        t.Literal("size"),
                        t.Literal("record_count"),
                        t.Literal("hybrid"),
                      ]),
                    ),
                    compressionEnabled: t.Optional(t.Boolean()),
                    replicationFactor: t.Optional(t.Number()),
                  }),
                ),
              }),
              tags: ["hadoop"],
            },
          )

          .post(
            "/maintenance/:table",
            async ({ params, services, user }) => {
              const result = await services.hadoop.performDataMaintenance(
                params.table,
              );

              logger.info(
                `Hadoop maintenance completed for table ${params.table}`,
                "BigDataServer",
                {
                  user: (user as any)?.username || "unknown",
                  compactedPartitions: result.compactedPartitions,
                  deletedPartitions: result.deletedPartitions,
                },
              );

              return result;
            },
            {
              tags: ["hadoop"],
            },
          )

          .get(
            "/analytics",
            async ({ services }) => {
              const analytics = await services.hadoop.getStorageAnalytics();
              return analytics;
            },
            {
              tags: ["hadoop"],
            },
          )

          .get(
            "/health",
            async ({ services }) => {
              const health = await services.hadoop.healthCheck();
              return health;
            },
            {
              tags: ["hadoop"],
            },
          ),
      )

      // OpenSearch operations
      .group("/api/v1/search", (app) =>
        app
          .post(
            "/index/:table",
            async ({ params, body, services, user }) => {
              const { records, options = {} } = body as any;

              const result = await services.opensearch.indexServiceNowData(
                params.table,
                records,
                options,
              );

              logger.info(
                `OpenSearch indexing completed for table ${params.table}`,
                "BigDataServer",
                {
                  user: (user as any)?.username || "unknown",
                  indexed: result.indexed,
                  failed: result.failed,
                },
              );

              return result;
            },
            {
              body: t.Object({
                records: t.Array(t.Any()),
                options: t.Optional(
                  t.Object({
                    batchSize: t.Optional(t.Number()),
                    refreshIndex: t.Optional(t.Boolean()),
                    updateMappings: t.Optional(t.Boolean()),
                  }),
                ),
              }),
              tags: ["opensearch"],
            },
          )

          .post(
            "/query",
            async ({ body, services }) => {
              const { query, options = {} } = body as any;
              const result = await services.opensearch.intelligentSearch(
                query,
                options,
              );
              return result;
            },
            {
              body: t.Object({
                query: t.String(),
                options: t.Optional(
                  t.Object({
                    tables: t.Optional(t.Array(t.String())),
                    maxResults: t.Optional(t.Number()),
                    includeAggregations: t.Optional(t.Boolean()),
                    autoSuggest: t.Optional(t.Boolean()),
                  }),
                ),
              }),
              tags: ["opensearch"],
            },
          )

          .get(
            "/analytics",
            async ({ query, services }) => {
              const timeRange = {
                from: new Date(
                  (query.from as string) ||
                    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                ),
                to: new Date((query.to as string) || new Date()),
              };

              const analytics =
                await services.opensearch.generateAnalyticsDashboard(timeRange);
              return analytics;
            },
            {
              tags: ["opensearch"],
            },
          )

          .get(
            "/health",
            async ({ services }) => {
              const health = await services.opensearch.getHealthStatus();
              return health;
            },
            {
              tags: ["opensearch"],
            },
          ),
      )

      // Pipeline operations
      .group("/api/v1/pipeline", (app) =>
        app
          .post(
            "/register",
            async ({ body, services, user }) => {
              const pipelineConfig = body as any;
              services.pipeline.registerPipeline(pipelineConfig);

              logger.info(
                `Pipeline registered: ${pipelineConfig.name}`,
                "BigDataServer",
                {
                  user: (user as any)?.username || "unknown",
                  pipelineId: pipelineConfig.id,
                },
              );

              return { success: true, pipelineId: pipelineConfig.id };
            },
            {
              body: t.Any(),
              tags: ["pipeline"],
            },
          )

          .post(
            "/execute/:pipelineId",
            async ({ params, body, services, user }) => {
              const options = (body as any) || {};
              const execution = await services.pipeline.executePipeline(
                params.pipelineId,
                options,
              );

              logger.info(
                `Pipeline executed: ${params.pipelineId}`,
                "BigDataServer",
                {
                  user: (user as any)?.username || "unknown",
                  executionId: execution.id,
                  status: execution.status,
                },
              );

              return execution;
            },
            {
              body: t.Optional(t.Any()),
              tags: ["pipeline"],
            },
          )

          .get(
            "/execution/:executionId",
            async ({ params, services }) => {
              const execution = services.pipeline.getExecution(
                params.executionId,
              );
              return execution;
            },
            {
              tags: ["pipeline"],
            },
          )

          .get(
            "/templates/servicenow-parquet",
            async ({ query }) => {
              const tables = query.tables
                ? (query.tables as string).split(",")
                : ["incident"];
              const outputPath =
                (query.outputPath as string) || "/data/parquet";
              const compressionType =
                (query.compression as "snappy" | "gzip" | "lz4") || "snappy";

              const template =
                this.services.pipeline.createServiceNowToParquetPipeline({
                  tables,
                  outputPath,
                  compressionType,
                  schedule: query.schedule as string,
                });

              return template;
            },
            {
              tags: ["pipeline"],
            },
          )

          .get(
            "/templates/realtime-search",
            async ({ query }) => {
              const tables = query.tables
                ? (query.tables as string).split(",")
                : ["incident"];
              const indexPrefix = (query.indexPrefix as string) || "servicenow";
              const redisStreamPrefix =
                (query.streamPrefix as string) || "servicenow";

              const template =
                this.services.pipeline.createRealTimeSearchPipeline({
                  tables,
                  indexPrefix,
                  redisStreamPrefix,
                });

              return template;
            },
            {
              tags: ["pipeline"],
            },
          )

          .get(
            "/",
            async ({ services }) => {
              const pipelines = services.pipeline.getPipelines();
              return { pipelines };
            },
            {
              tags: ["pipeline"],
            },
          ),
      )

      // Streaming operations
      .group("/api/v1/streaming", (app) =>
        app
          .post(
            "/processor",
            async ({ body, services, user }) => {
              const { name, config, type = "custom" } = body as any;
              const processor = services.streaming.createProcessor(
                name,
                config,
                type,
              );

              logger.info(
                `Stream processor created: ${name}`,
                "BigDataServer",
                {
                  user: (user as any)?.username || "unknown",
                  type,
                  batchSize: config.batchSize,
                },
              );

              return { success: true, processorName: name, type };
            },
            {
              body: t.Object({
                name: t.String(),
                config: t.Any(),
                type: t.Optional(
                  t.Union([
                    t.Literal("incident"),
                    t.Literal("export"),
                    t.Literal("notification"),
                    t.Literal("custom"),
                  ]),
                ),
              }),
              tags: ["streaming"],
            },
          )

          .post(
            "/pipeline/incident",
            async ({ body, services, user }) => {
              const config = body as any;
              const pipeline =
                await services.streaming.createIncidentProcessingPipeline(
                  config,
                );

              logger.info(
                `Incident processing pipeline created`,
                "BigDataServer",
                {
                  user: (user as any)?.username || "unknown",
                  streamKey: pipeline.streamKey,
                },
              );

              return { success: true, streamKey: pipeline.streamKey };
            },
            {
              body: t.Any(),
              tags: ["streaming"],
            },
          )

          .post(
            "/pipeline/export",
            async ({ body, services, user }) => {
              const config = body as any;
              await services.streaming.createDataExportPipeline(config);

              logger.info(`Data export pipeline created`, "BigDataServer", {
                user: (user as any)?.username || "unknown",
                tables: config.tables,
              });

              return { success: true };
            },
            {
              body: t.Any(),
              tags: ["streaming"],
            },
          )

          .get(
            "/processors",
            async ({ services }) => {
              const processors = services.streaming.getProcessors();
              return {
                processors: processors.map((p) => ({
                  name: p.name,
                  healthy: p.processor.isHealthy(),
                  metrics: p.processor.getCurrentMetrics(),
                  backpressureState: p.processor.getBackpressureState(),
                })),
              };
            },
            {
              tags: ["streaming"],
            },
          )

          .get(
            "/metrics",
            async ({ services }) => {
              const platformMetrics = services.streaming.getPlatformMetrics();
              return platformMetrics;
            },
            {
              tags: ["streaming"],
            },
          )

          .post(
            "/start",
            async ({ services, user }) => {
              await services.streaming.startAll();

              logger.info("Streaming platform started", "BigDataServer", {
                user: (user as any)?.username || "unknown",
              });

              return { success: true, status: "started" };
            },
            {
              tags: ["streaming"],
            },
          )

          .post(
            "/stop",
            async ({ services, user }) => {
              await services.streaming.stopAll();

              logger.info("Streaming platform stopped", "BigDataServer", {
                user: (user as any)?.username || "unknown",
              });

              return { success: true, status: "stopped" };
            },
            {
              tags: ["streaming"],
            },
          ),
      )

      // Global error handling
      .onError(({ error, code, set }) => {
        logger.error("API Error:", error as Error);

        if (code === "VALIDATION") {
          set.status = 400;
          return {
            error: "Validation Error",
            message: error.message,
            timestamp: new Date().toISOString(),
          };
        }

        if (code === "NOT_FOUND") {
          set.status = 404;
          return {
            error: "Not Found",
            message: "The requested resource was not found",
            timestamp: new Date().toISOString(),
          };
        }

        set.status = 500;
        return {
          error: "Internal Server Error",
          message: "An unexpected error occurred",
          timestamp: new Date().toISOString(),
        };
      })

      // Request logging
      .onBeforeHandle(({ request, set }) => {
        logger.info(`${request.method} ${request.url}`, "BigDataServer", {
          method: request.method,
          url: request.url,
          userAgent: request.headers.get("user-agent"),
          timestamp: new Date().toISOString(),
        });
      });

    return app as any;
  }

  async start(port: number = 3008): Promise<void> {
    if (this.isStarted) {
      throw new Error("Server is already started");
    }

    try {
      // Initialize all services
      await this.initializeAllServices();

      // Start the server
      this.app.listen(port);
      this.isStarted = true;

      logger.info(` ServiceNow Big Data API Server started on port ${port}`);
      logger.info(`📚 API Documentation: http://localhost:${port}/swagger`);
      logger.info(`❤️  Health Check: http://localhost:${port}/health`);
    } catch (error: unknown) {
      logger.error("Failed to start server:", error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      // Gracefully shutdown all services
      await Promise.all([
        this.services.redis.shutdown(),
        this.services.pipeline.stop(),
        this.services.streaming.stopAll(),
      ]);

      this.isStarted = false;
      logger.info("ServiceNow Big Data API Server stopped gracefully");
    } catch (error: unknown) {
      logger.error("Error during server shutdown:", error as Error);
      throw error;
    }
  }

  private async initializeAllServices(): Promise<void> {
    logger.info("Initializing all big data services...");

    const initPromises = [
      this.services.opensearch.initializeServiceNowSearch([
        "incident",
        "problem",
        "change_request",
      ]),
      this.services.streaming.startAll(),
      this.services.pipeline.start(),
    ];

    const results = await Promise.allSettled(initPromises);

    results.forEach((result, index) => {
      const serviceName = ["OpenSearch", "Streaming", "Pipeline"][index];
      if (result.status === "rejected") {
        logger.warn(`${serviceName} initialization failed:`, result.reason);
      } else {
        logger.info(`${serviceName} initialized successfully`);
      }
    });
  }

  // Health check implementations
  private async checkParquetHealth(
    service: ServiceNowParquetIntegration,
  ): Promise<{ healthy: boolean; latency: number; details?: any }> {
    const startTime = Date.now();
    try {
      // Test basic write/read functionality
      const testRecord = { sys_id: "health_check", test: true };
      const testPath = "/tmp/health_check.parquet";

      await service.getWriter().writeRecords([testRecord], testPath);
      const latency = Date.now() - startTime;

      return { healthy: true, latency };
    } catch (error: unknown) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        details: (error as Error).message,
      };
    }
  }

  private async checkRedisHealth(
    service: ServiceNowRedisIntegration,
  ): Promise<{ healthy: boolean; latency: number; details?: any }> {
    const startTime = Date.now();
    try {
      const stats = await service.getComprehensiveStats();
      const latency = Date.now() - startTime;

      return {
        healthy: stats.system.connectivity.redis,
        latency,
        details: {
          totalOperations: stats.cache.totalOperations,
          streamCount: stats.streams.totalStreams,
        },
      };
    } catch (error: unknown) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        details: (error as Error).message,
      };
    }
  }

  private async checkHadoopHealth(
    service: ServiceNowHadoopFactory,
  ): Promise<{ healthy: boolean; latency: number; details?: any }> {
    const startTime = Date.now();
    try {
      const health = await service.healthCheck();
      const latency = Date.now() - startTime;

      return {
        healthy: health.hdfs.connected && health.cluster.healthy,
        latency,
        details: {
          hdfsConnected: health.hdfs.connected,
          clusterHealthy: health.cluster.healthy,
          writeable: health.hdfs.writeable,
          readable: health.hdfs.readable,
        },
      };
    } catch (error: unknown) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        details: (error as Error).message,
      };
    }
  }

  private async checkOpenSearchHealth(
    service: ServiceNowOpenSearchFactory,
  ): Promise<{ healthy: boolean; latency: number; details?: any }> {
    const startTime = Date.now();
    try {
      const health = await service.getHealthStatus();
      const latency = Date.now() - startTime;

      return {
        healthy:
          health.cluster.status === "green" ||
          health.cluster.status === "yellow",
        latency,
        details: {
          clusterStatus: health.cluster.status,
          totalIndices: health.servicenow.totalIndices,
          totalDocuments: health.servicenow.totalDocuments,
        },
      };
    } catch (error: unknown) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        details: (error as Error).message,
      };
    }
  }

  private async checkPipelineHealth(
    service: DataPipelineOrchestrator,
  ): Promise<{ healthy: boolean; latency: number; details?: any }> {
    const startTime = Date.now();
    try {
      const pipelines = service.getPipelines();
      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
        details: {
          registeredPipelines: pipelines.length,
        },
      };
    } catch (error: unknown) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        details: (error as Error).message,
      };
    }
  }

  private async checkStreamingHealth(
    service: ServiceNowStreamingPlatform,
  ): Promise<{ healthy: boolean; latency: number; details?: any }> {
    const startTime = Date.now();
    try {
      const metrics = service.getPlatformMetrics();
      const latency = Date.now() - startTime;

      return {
        healthy: metrics.systemHealth.overallHealth !== "critical",
        latency,
        details: {
          overallHealth: metrics.systemHealth.overallHealth,
          totalProcessors: metrics.global.totalProcessors,
          activeProcessors: metrics.global.activeProcessors,
        },
      };
    } catch (error: unknown) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        details: (error as Error).message,
      };
    }
  }

  // Utility methods
  getApp(): Elysia {
    return this.app;
  }

  isRunning(): boolean {
    return this.isStarted;
  }

  getServices(): BigDataServices {
    return this.services;
  }
}

// Factory function for easy server creation
export function createBigDataServer(config: BigDataConfig): BigDataServer {
  return new BigDataServer(config);
}

// Example configuration
export const defaultConfig: BigDataConfig = {
  parquet: {
    outputPath: "/data/parquet",
    compressionType: "snappy",
    enablePartitioning: true,
  },
  redis: {
    host: "localhost",
    port: 6379,
  },
  hadoop: {
    namenode: "localhost",
    port: 8020,
    username: "hadoop",
  },
  opensearch: {
    host: "localhost",
    port: 9200,
    username: "admin",
    password: "admin",
  },
  jwt: {
    secret: process.env.JWT_SECRET || "your-super-secret-jwt-key",
  },
  rateLimit: {
    max: 100,
    windowMs: 60000,
  },
};

// Main entry point
if (import.meta.main) {
  const server = createBigDataServer(defaultConfig);

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully...");
    await server.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT received, shutting down gracefully...");
    await server.stop();
    process.exit(0);
  });

  server.start(3000).catch((error) => {
    logger.error("Failed to start server:", error);
    process.exit(1);
  });
}
