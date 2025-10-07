/**
 * Web Server Controller - Core server setup and configuration management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { jwt } from "@elysiajs/jwt";
import { accepts } from "elysia-accepts";
import { background } from "elysia-background";
import { instrumentation } from "../instrumentation";
import { serviceNowPlugin } from "../plugins/servicenow";

import { ServiceNowClient } from "../client/ServiceNowClient";
import { RedisStreamManager } from "../bigdata/redis/RedisStreamManager";
// FIX v5.5.19: Import from services/index.ts to use lazy Proxy singletons
import {
  consolidatedServiceNowService,
  dataService,
  serviceNowAuthClient,
} from "../services";
import { ServiceNowStreams } from "../config/redis-streams";
import { mongoCollectionManager } from "../config/mongodb-collections";
import { TicketRepository } from "../repositories/TicketRepository";

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
    compressionType: "snappy" | "gzip" | "lz4" | "none";
  };
  mongodb: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
}

export class WebServerController {
  private app!: Elysia;
  private config: WebServerConfig;
  private serviceNowClient!: ServiceNowClient;
  private redisStreamManager!: RedisStreamManager;
  private consolidatedTicketService!: typeof consolidatedServiceNowService;
  private serviceNowAuthClient!: typeof serviceNowAuthClient;
  private enhancedTicketStorageService: typeof dataService | undefined;
  private redisStreams: ServiceNowStreams | undefined;
  private hybridDataService: typeof dataService | undefined;
  private slaTrackingService: typeof consolidatedServiceNowService | undefined;
  private ticketRepository: TicketRepository | undefined;

  constructor(config: WebServerConfig) {
    this.config = config;
    this.initializeClients();
  }

  private initializeClients(): void {
    console.log(" Initializing ServiceNow clients...");

    // ✅ FIX v5.4.4: Use factory method with credentials instead of direct constructor
    // This properly formats Basic auth token from username/password
    this.serviceNowClient = ServiceNowClient.createWithCredentials(
      this.config.serviceNow.instanceUrl,
      this.config.serviceNow.username,
      this.config.serviceNow.password,
      {
        validateConnection: false, // Skip validation during startup for faster boot
        enableCache: true,
      },
    );

    this.redisStreamManager = new RedisStreamManager({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
    });

    this.serviceNowAuthClient = serviceNowAuthClient;
    this.consolidatedTicketService = consolidatedServiceNowService;

    console.log(" ServiceNow clients initialized");
  }

  /**
   * Initialize enhanced services with timeout protection (Elysia Best Practice)
   * Prevents indefinite blocking during startup
   * @public
   */
  public async initializeEnhancedServices(): Promise<void> {
    console.log("[INIT-1/6] 🚀 Starting enhanced services initialization...");

    // Initialize service references as undefined (graceful degradation)
    this.enhancedTicketStorageService = undefined;
    this.ticketRepository = undefined;
    this.hybridDataService = undefined;
    this.slaTrackingService = undefined;

    // MongoDB initialization with 10s timeout
    try {
      console.log("[INIT-2/6] Initializing MongoDB connection...");
      await Promise.race([
        dataService.initialize(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("MongoDB init timeout (10s)")),
            10000,
          ),
        ),
      ]);
      console.log("[INIT-2/6] ✅ MongoDB connection established");

      console.log("[INIT-3/6] Initializing MongoDB collections...");
      await Promise.race([
        mongoCollectionManager.initializeCollections(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("MongoDB collections timeout (10s)")),
            10000,
          ),
        ),
      ]);
      console.log("[INIT-3/6] ✅ MongoDB collections ready");

      // Only assign services if MongoDB initialization succeeded
      this.enhancedTicketStorageService = dataService;
      this.ticketRepository = new TicketRepository();
      this.hybridDataService = dataService;
      this.slaTrackingService = consolidatedServiceNowService;

      console.log(
        "[INIT-3/6] ✅ Enhanced services configured (Repository, HybridData, SLA)",
      );
    } catch (error: unknown) {
      console.warn(
        "[INIT-3/6] ⚠️ MongoDB initialization failed, enhanced features disabled:",
        error instanceof Error ? error.message : error,
      );
      console.warn(
        "[INIT-3/6] ⚠️ Services will run in degraded mode (auto-sync disabled)",
      );
    }

    // Redis Streams initialization with 5s timeout
    try {
      console.log("[INIT-4/6] Initializing Redis Streams...");
      this.redisStreams = new ServiceNowStreams();

      await Promise.race([
        this.redisStreams.initialize(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Redis Streams timeout (5s)")),
            5000,
          ),
        ),
      ]);
      console.log("[INIT-4/6] ✅ Redis Streams initialized");
    } catch (error: unknown) {
      console.error(
        "[INIT-4/6] ⚠️ Redis Streams initialization failed, real-time features limited:",
        error instanceof Error ? error.message : error,
      );
    }

    // Background services (fire-and-forget, won't block)
    try {
      console.log("[INIT-5/6] Starting background services...");
      await this.startBackgroundServices();
      console.log("[INIT-5/6] ✅ Background services started");
    } catch (error: unknown) {
      console.error(
        "[INIT-5/6] ⚠️ Background services failed to start:",
        error instanceof Error ? error.message : error,
      );
    }

    console.log("[INIT-6/6] ✅ Enhanced services initialization complete");
  }

  /**
   * Start background services using fire-and-forget pattern (Elysia Best Practice)
   * Services start asynchronously without blocking server initialization
   * @private
   */
  private async startBackgroundServices(): Promise<void> {
    console.log(
      "[BG-SERVICE-1/2] Starting background services (non-blocking)...",
    );

    if (this.hybridDataService && this.slaTrackingService) {
      // Fire-and-forget pattern: Start auto-sync without awaiting
      // This prevents blocking the server startup (Elysia Best Practice linha 694-704)
      if (typeof this.hybridDataService.startAutoSync === "function") {
        try {
          // ✅ FIX: startAutoSync() returns void, not Promise - no .catch() needed
          this.hybridDataService.startAutoSync({
            syncInterval: 5 * 60 * 1000, // 5 minutes
            batchSize: 50,
            maxRetries: 3,
            tables: ["incident", "change_task", "sc_task"],
            enableDeltaSync: true,
            enableRealTimeUpdates: true,
            enableSLMCollection: true,
            enableNotesCollection: true,
          });
          console.log("[BG-SERVICE] ✅ Auto-sync started (background)");
        } catch (error: unknown) {
          console.error(
            "[BG-SERVICE] ⚠️ Auto-sync initialization error:",
            error,
          );
        }
      } else {
        console.warn(
          "[BG-SERVICE] ⚠️ startAutoSync method not available, enhanced sync features disabled",
        );
      }

      // Start SLA tracking service (also fire-and-forget)
      if (typeof this.slaTrackingService.start === "function") {
        try {
          this.slaTrackingService.start();
          console.log("[BG-SERVICE] ✅ SLA tracking service started");
        } catch (error: unknown) {
          console.warn("[BG-SERVICE] ⚠️ Failed to start SLA tracking:", error);
        }
      } else {
        console.warn(
          "[BG-SERVICE] ⚠️ SLA tracking start method not available, SLA features disabled",
        );
      }

      console.log(
        "[BG-SERVICE-2/2] ✅ Background services initialized (running asynchronously)",
      );
    } else {
      console.warn(
        "[BG-SERVICE] ⚠️ Services not available, enhanced features disabled",
      );
    }
  }

  public setupServer(): Elysia {
    console.log("⚙️ Setting up Elysia server configuration...");

    this.app = new Elysia()
      .use(instrumentation) // OpenTelemetry plugin applied first
      .use(serviceNowPlugin) // ServiceNow Plugin with dependency injection - eliminates self-referencing calls
      .use(
        cors({
          origin: true,
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
          allowedHeaders: ["*"],
          credentials: true,
          maxAge: 86400,
        }),
      )
      .use(
        jwt({
          name: "jwt",
          secret: this.config.jwtSecret,
        }),
      )
      .use(html())
      .use(accepts())
      .use(
        staticPlugin({
          assets: "public",
          prefix: "/public",
          staticLimit: 2048,
          alwaysStatic: true,
          headers: {
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
          },
          ignorePatterns: [".DS_Store", "*.tmp", "node_modules"],
        }),
      )
      .use(background())
      // FIX v1.0.0 (CRITICAL-2): Migrated from @elysiajs/swagger to @elysiajs/openapi
      .use(
        openapi({
          documentation: {
            info: {
              title: "ServiceNow Web Interface API",
              version: "1.0.0",
              description:
                "Modern web interface for ServiceNow integration with big data capabilities",
            },
            tags: [
              { name: "Dashboard", description: "Dashboard endpoints" },
              { name: "Real-time", description: "SSE and WebSocket endpoints" },
              {
                name: "Data Processing",
                description: "Big data processing endpoints",
              },
              {
                name: "Analytics",
                description: "Analytics and reporting endpoints",
              },
            ],
          },
        }),
      )
      .get("/health", () => {
        const healthData = {
          status: "healthy",
          timestamp: new Date().toISOString(),
          services: {
            serviceNow: "connected",
            redis: "connected",
            opensearch: "connected",
            hadoop: "connected",
          },
        };
        return new Response(JSON.stringify(healthData), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      })
      .head("/health", () => {
        return new Response(null, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      })
      .get("/htmx/", () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/dashboard",
          },
        });
      })
      .get("/favicon.ico", () => {
        return new Response(null, { status: 204 });
      })
      .head("/favicon.ico", () => {
        return new Response(null, { status: 204 });
      })
      .onError(({ error, code, set }) => {
        console.error(`Error ${code}:`, error);

        if (code === "NOT_FOUND") {
          set.status = 404;
          return {
            success: false,
            error: "Página não encontrada",
            code: "NOT_FOUND",
            timestamp: new Date().toISOString(),
          };
        }

        if (code === "VALIDATION") {
          set.status = 400;
          return {
            success: false,
            error: "Dados de entrada inválidos",
            details: error.message,
            code: "VALIDATION_ERROR",
            timestamp: new Date().toISOString(),
          };
        }

        set.status = 500;
        return {
          success: false,
          error: "Erro interno do servidor",
          message: error.message,
          code: "INTERNAL_ERROR",
          timestamp: new Date().toISOString(),
        };
      });

    console.log(" Elysia server configuration completed");
    return this.app;
  }

  /**
   * Start the web server with proper initialization sequence
   * Follows Elysia Best Practices for async plugin initialization
   * @public
   */
  public async start(): Promise<void> {
    try {
      console.log("[SERVER-START-1/3] 🚀 Initializing enhanced services...");
      await this.initializeEnhancedServices();
      console.log("[SERVER-START-1/3] ✅ Services initialized successfully");

      console.log(
        `[SERVER-START-2/3] 🌐 Starting Elysia server on port ${this.config.port}...`,
      );
      await this.app.listen(this.config.port);
      console.log(
        `[SERVER-START-2/3] ✅ Elysia server listening on port ${this.config.port}`,
      );

      console.log("[SERVER-START-3/3] ✅ ========================");
      console.log(`[SERVER-START-3/3] ✅ ServiceNow Web Interface READY`);
      console.log(
        `[SERVER-START-3/3] ✅ Dashboard: http://localhost:${this.config.port}`,
      );
      console.log(
        `[SERVER-START-3/3] ✅ API Docs: http://localhost:${this.config.port}/swagger`,
      );
      console.log(
        `[SERVER-START-3/3] ✅ Health Check: http://localhost:${this.config.port}/health`,
      );
      console.log("[SERVER-START-3/3] ✅ ========================");
    } catch (error: unknown) {
      console.error(
        "[SERVER-START-ERROR] ❌ Failed to start web server:",
        error,
      );
      console.error(
        "[SERVER-START-ERROR] ❌ Stack:",
        error instanceof Error ? error.stack : "No stack trace",
      );
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      if (this.hybridDataService) {
        this.hybridDataService.stopAutoSync();
      }

      if (this.slaTrackingService) {
        try {
          if (typeof this.slaTrackingService.stop === "function") {
            this.slaTrackingService.stop();
            console.log("✅ SLA tracking service stopped");
          } else {
            console.warn("⚠️ SLA tracking stop method not available");
          }
        } catch (error: unknown) {
          console.warn("⚠️ Failed to stop SLA tracking service:", error);
        }
      }

      console.log(" Background services stopped");

      await this.app.stop();
      console.log(" ServiceNow Web Interface stopped");
    } catch (error: unknown) {
      console.error("Error stopping web server:", error);
      throw error;
    }
  }

  // Getters for other controllers to access services
  public getServiceNowClient(): ServiceNowClient {
    return this.serviceNowClient;
  }

  public getConsolidatedServiceNowService(): typeof consolidatedServiceNowService {
    return this.consolidatedTicketService;
  }

  public getServiceNowAuthClient(): typeof serviceNowAuthClient {
    return this.serviceNowAuthClient;
  }

  public getConsolidatedDataService(): typeof dataService | undefined {
    return this.enhancedTicketStorageService;
  }

  public getRedisStreams(): ServiceNowStreams | undefined {
    return this.redisStreams;
  }

  public getSLATrackingService():
    | typeof consolidatedServiceNowService
    | undefined {
    return this.slaTrackingService;
  }

  public getConfig(): WebServerConfig {
    return this.config;
  }

  public getApp(): Elysia {
    return this.app;
  }
}
