/**
 * ServiceNow Web Interface Server - Modular MVC Architecture with Plugin System
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Integrado com Elysia Plugin System:
 * - Core Plugin Composition para dependency injection
 * - Plugin lifecycle management
 * - Type safety com Eden Treaty
 */

import htmxDashboardClean from "./htmx-dashboard-clean";
import htmxDashboardEnhanced from "./htmx-dashboard-enhanced";
import waitingAnalysisHtmx from "./waiting-analysis-htmx";
import { createTicketDetailsRoutes } from "../routes/TicketDetailsRoutes";
import { createTicketActionsRoutes } from "../routes/TicketActionsRoutes";
import { createTicketListRoutes } from "../routes/TicketListRoutes";
import { createIncidentNotesRoutes } from "../routes/IncidentNotesRoutes";
import { authRoutes } from "../routes/auth";

import { WebServerController } from "../controllers/WebServerController";

// Plugin System Integration
import {
  createWebPluginComposition,
  type ConsolidatedPluginContext
} from "../plugins";

interface WebServerConfig {
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
import { APIController } from "../controllers/APIController";
import { DashboardController } from "../controllers/DashboardController";
import { StreamingController } from "../controllers/StreamingController";

export class ServiceNowWebServer {
  private webServerController: WebServerController;
  private apiController: APIController;
  private dashboardController: DashboardController;
  private streamingController: StreamingController;

  constructor(config: WebServerConfig) {
    console.log("🏗️ Initializing modular ServiceNow Web Server...");

    this.webServerController = new WebServerController(config);

    this.apiController = new APIController(
      this.webServerController.getServiceNowClient(),
      this.webServerController.getConfig(),
    );

    this.dashboardController = new DashboardController(config);

    this.streamingController = new StreamingController(this.apiController);

    this.setupRoutes();

    console.log(" Modular ServiceNow Web Server initialized");
  }

  private setupRoutes(): void {
    const app = this.webServerController.setupServer();

    app
      .use(createWebPluginComposition({
        enableHealthChecks: true,
        enableMetrics: true,
        pluginConfig: {
          serviceNow: this.webServerController.getConfig().serviceNow,
          redis: this.webServerController.getConfig().redis,
          mongodb: this.webServerController.getConfig().mongodb
        }
      }))
      .use(authRoutes)
      .use(htmxDashboardClean)
      .use(htmxDashboardEnhanced)
      .use(waitingAnalysisHtmx)
      .use(
        createTicketActionsRoutes(
          this.webServerController.getServiceNowAuthClient(),
        ),
      )
      .use(
        createTicketListRoutes(
          this.webServerController.getServiceNowAuthClient(),
        ),
      )
      .use(
        createTicketDetailsRoutes(
          this.webServerController.getServiceNowAuthClient(),
          this.webServerController.getConsolidatedDataService(),
          this.webServerController.getRedisStreams(),
        ),
      )
      .use(
        createIncidentNotesRoutes(
          this.webServerController.getServiceNowAuthClient(),
          this.webServerController.getSLATrackingService(),
        ),
      )

      .get("/", () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/htmx/",
          },
        });
      })
      .head("/", () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/htmx/",
          },
        });
      })

      .get("/dashboard", () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/clean/",
          },
        });
      })
      .head("/dashboard", () => {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/clean/",
          },
        });
      })

      .get("/dashboard/incidents", () => {
        const data = {
          message: "Incidents dashboard - modularized version",
          incidents: [],
        };
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      })
      .get("/dashboard/problems", () => {
        const data = {
          message: "Problems dashboard - modularized version",
          problems: [],
        };
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      })
      .get("/dashboard/changes", () => {
        const data = {
          message: "Changes dashboard - modularized version",
          changes: [],
        };
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      })

      .get("/events/stream", (context) =>
        this.streamingController.handleSSEStream(context),
      )

      .ws("/ws/control", {
        message: (ws, message) =>
          this.streamingController.handleWebSocketMessage(ws, message),
        open: (ws) => this.streamingController.handleWebSocketOpen(ws),
        close: (ws) => this.streamingController.handleWebSocketClose(ws),
      })

      .group("/api/v1", (app) =>
        app
          .get("/incidents", () => this.apiController.getIncidents())
          .get("/problems", () => this.apiController.getProblems())
          .get("/changes", () => this.apiController.getChanges())
          .post("/process/parquet/:table", ({ params }) =>
            this.apiController.processToParquet(params.table),
          )
          .post("/process/pipeline/:pipeline", ({ params }) =>
            this.apiController.executePipeline(params.pipeline),
          )
          .get("/analytics/dashboard", () =>
            this.apiController.getDashboardAnalytics(),
          )
          .post("/mongodb/sync", () =>
            this.apiController.syncCurrentMonthTickets(),
          )
          .get("/mongodb/tickets/:type", ({ params, query }) =>
            this.apiController.getTicketsFromMongoDB(params.type, query),
          )
          .get("/servicenow/tickets/:type", ({ params, query }) =>
            this.apiController.getTicketsFromServiceNow(params.type, query),
          )
          .get("/mongodb/stats", () => this.apiController.getMongoDBStats())
          .get("/mongodb/groups", () => this.apiController.getTargetGroups()),
      );

    console.log("🔗 Routes configured with modular controllers");
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
