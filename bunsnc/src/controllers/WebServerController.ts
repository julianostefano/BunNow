/**
 * Web Server Controller - Core server setup and configuration management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { jwt } from "@elysiajs/jwt";
import { accepts } from "elysia-accepts";
import { background } from "elysia-background";
import { instrumentation } from "../instrumentation";

import { ServiceNowClient } from "../client/ServiceNowClient";
import { RedisStreamManager } from "../bigdata/redis/RedisStreamManager";
import { consolidatedServiceNowService } from "../services/ConsolidatedServiceNowService";
import { dataService } from "../services/ConsolidatedDataService";
import { serviceNowAuthClient } from "../services/ServiceNowAuthClient";
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

    this.serviceNowClient = new ServiceNowClient(
      this.config.serviceNow.instanceUrl,
      this.config.serviceNow.username,
      this.config.serviceNow.password,
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

  public async initializeEnhancedServices(): Promise<void> {
    console.log(" Initializing enhanced services...");

    try {
      await dataService.initialize();
      await mongoCollectionManager.initializeCollections();

      this.enhancedTicketStorageService = dataService;
      console.log(" MongoDB service initialized for enhanced features");

      this.ticketRepository = new TicketRepository();
      console.log(" Ticket Repository initialized");

      this.hybridDataService = dataService;
      console.log(" Hybrid Data Service with sync capabilities initialized");

      this.slaTrackingService = consolidatedServiceNowService;
      console.log(" SLA Tracking Service initialized");

      this.startBackgroundServices();
    } catch (error: unknown) {
      console.warn(
        " MongoDB service not available, enhanced features will be limited:",
        error,
      );
    }

    try {
      this.redisStreams = new ServiceNowStreams();
      await this.redisStreams.initialize();
      console.log(" Redis Streams initialized for real-time features");
    } catch (error: unknown) {
      console.warn(
        " Redis Streams not available, real-time features will be limited:",
        error,
      );
    }
  }

  private startBackgroundServices(): void {
    if (this.hybridDataService && this.slaTrackingService) {
      try {
        if (typeof this.hybridDataService.startAutoSync === "function") {
          this.hybridDataService.startAutoSync({
            syncInterval: 5 * 60 * 1000,
            batchSize: 50,
            maxRetries: 3,
            tables: ["incident", "change_task", "sc_task"],
            enableDeltaSync: true,
            enableRealTimeUpdates: true,
            enableSLMCollection: true,
            enableNotesCollection: true,
          });
          console.log("✅ Auto-sync enabled for enhanced features");
        } else {
          console.warn(
            "⚠️ startAutoSync method not available, enhanced sync features disabled",
          );
        }
      } catch (error: unknown) {
        console.warn("⚠️ Failed to start auto-sync:", error);
      }

      try {
        if (typeof this.slaTrackingService.start === "function") {
          this.slaTrackingService.start();
          console.log("✅ SLA tracking service started");
        } else {
          console.warn(
            "⚠️ SLA tracking start method not available, SLA features disabled",
          );
        }
      } catch (error: unknown) {
        console.warn("⚠️ Failed to start SLA tracking service:", error);
      }

      console.log(
        " Background services started (ConsolidatedDataService + SLA Tracking)",
      );
    }
  }

  public setupServer(): Elysia {
    console.log("⚙️ Setting up Elysia server configuration...");

    this.app = new Elysia()
      .use(instrumentation) // OpenTelemetry plugin applied first
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
      .use(
        swagger({
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

  public async start(): Promise<void> {
    try {
      await this.initializeEnhancedServices();

      await this.app.listen(this.config.port);
      console.log(
        ` ServiceNow Web Interface running on port ${this.config.port}`,
      );
      console.log(` Dashboard: http://localhost:${this.config.port}`);
      console.log(` API Docs: http://localhost:${this.config.port}/swagger`);
    } catch (error: unknown) {
      console.error("Failed to start web server:", error);
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
