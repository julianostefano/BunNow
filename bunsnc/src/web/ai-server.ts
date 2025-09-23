/**
 * AI Services Server - Dedicated AI endpoints
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { logger } from "../utils/Logger";
import { aiRoutes } from "./routes/api/ai";
import { searchRoutes } from "./routes/api/search";

const AI_SERVER_PORT = 3001;

export class AIServer {
  private app: Elysia;
  private port: number;

  constructor(port: number = AI_SERVER_PORT) {
    this.port = port;
    this.app = this.createApp();
  }

  private createApp(): Elysia {
    return (
      new Elysia()
        .use(
          cors({
            origin: true,
            credentials: true,
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowedHeaders: [
              "Content-Type",
              "Authorization",
              "X-Requested-With",
            ],
          }),
        )

        .use(
          swagger({
            documentation: {
              info: {
                title: "BunSNC AI Services API",
                version: "1.0.0",
                description:
                  "AI-powered ServiceNow integration with neural search, document intelligence, and ticket analysis capabilities",
              },
              tags: [
                { name: "AI", description: "AI service endpoints" },
                { name: "Search", description: "Intelligent search endpoints" },
                {
                  name: "Health",
                  description: "Service health and monitoring",
                },
              ],
              servers: [
                {
                  url: `http://localhost:${this.port}`,
                  description: "AI Services Server",
                },
              ],
            },
            path: "/docs",
          }),
        )

        // Security headers
        .onBeforeHandle(({ set }) => {
          set.headers = {
            ...set.headers,
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          };
        })

        // Error handling
        .onError(({ code, error, set }) => {
          logger.error(`[AI-Server] ${code} Error:`, error);

          switch (code) {
            case "VALIDATION":
              set.status = 400;
              return {
                success: false,
                error: "Validation failed",
                details: error.message,
                timestamp: new Date().toISOString(),
              };

            case "NOT_FOUND":
              set.status = 404;
              return {
                success: false,
                error: "Endpoint not found",
                timestamp: new Date().toISOString(),
              };

            default:
              set.status = 500;
              return {
                success: false,
                error: "Internal server error",
                timestamp: new Date().toISOString(),
              };
          }
        })

        // Health check endpoint
        .get(
          "/health",
          () => ({
            success: true,
            status: "healthy",
            service: "bunsnc-ai-services",
            version: "1.0.0",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
          }),
          {
            detail: {
              summary: "Health check",
              description: "Returns the health status of AI services server",
              tags: ["Health"],
            },
          },
        )

        // Root endpoint
        .get(
          "/",
          () => ({
            success: true,
            message: "BunSNC AI Services Server",
            version: "1.0.0",
            endpoints: {
              docs: "/docs",
              health: "/health",
              ai_services: "/api/ai",
              search: "/api/search",
            },
            timestamp: new Date().toISOString(),
          }),
          {
            detail: {
              summary: "Server information",
              description: "Returns information about the AI services server",
              tags: ["Health"],
            },
          },
        )

        // Add AI routes
        .use(aiRoutes)

        // Add search routes
        .use(searchRoutes)

        // Request logging
        .onRequest(({ request, path }) => {
          const method = request.method;
          logger.info(`🤖 [AI-Server] ${method} ${path}`);
        })

        // Response logging
        .onAfterHandle(({ response, path, request }) => {
          const method = request.method;
          const status = response instanceof Response ? response.status : 200;
          logger.info(` [AI-Server] ${method} ${path} - ${status}`);
        })
    );
  }

  async start(): Promise<void> {
    try {
      logger.info(
        ` [AI-Server] Starting AI Services Server on port ${this.port}...`,
      );

      // Initialize AI services
      await this.initializeServices();

      await this.app.listen(this.port);
      logger.info(
        ` [AI-Server] AI Services Server running on http://localhost:${this.port}`,
      );
      logger.info(
        `📚 [AI-Server] API Documentation: http://localhost:${this.port}/docs`,
      );
    } catch (error: unknown) {
      logger.error(" [AI-Server] Failed to start server:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info(" [AI-Server] Stopping AI Services Server...");
      await this.app.stop();
      logger.info(" [AI-Server] Server stopped successfully");
    } catch (error: unknown) {
      logger.error(" [AI-Server] Error stopping server:", error);
      throw error;
    }
  }

  private async initializeServices(): Promise<void> {
    try {
      logger.info(" [AI-Server] Initializing AI services...");

      // Import and test all AI clients
      const { TikaClient } = await import("../clients/TikaClient");
      const { EmbeddingClient } = await import("../clients/EmbeddingClient");
      const { RerankClient } = await import("../clients/RerankClient");
      const { LLMClient } = await import("../clients/LLMClient");
      const { OpenSearchClient } = await import("../clients/OpenSearchClient");

      const services = [
        { name: "Tika Server", client: new TikaClient() },
        { name: "Embedding Service", client: new EmbeddingClient() },
        { name: "Rerank Service", client: new RerankClient() },
        { name: "LLM Service", client: new LLMClient() },
        {
          name: "OpenSearch",
          client: new OpenSearchClient({
            host: process.env.OPENSEARCH_HOST || "10.219.8.210",
            port: parseInt(process.env.OPENSEARCH_PORT || "9200"),
            ssl: false,
            timeout: 30000,
          }),
        },
      ];

      // Health check all services
      const healthChecks = await Promise.allSettled(
        services.map(async ({ name, client }) => {
          try {
            const isHealthy = await client.healthCheck();
            if (isHealthy) {
              logger.info(` [AI-Server] ${name}: Connected`);
              return { name, status: "connected" };
            } else {
              logger.warn(` [AI-Server] ${name}: Health check failed`);
              return { name, status: "unhealthy" };
            }
          } catch (error: unknown) {
            logger.error(` [AI-Server] ${name}: Connection failed -`, error);
            return { name, status: "failed" };
          }
        }),
      );

      const results = healthChecks.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : { name: "Unknown", status: "error" },
      );

      const connected = results.filter((r) => r.status === "connected").length;
      const total = results.length;

      logger.info(
        `🎯 [AI-Server] Service initialization complete: ${connected}/${total} services connected`,
      );

      if (connected === 0) {
        logger.warn(
          " [AI-Server] No AI services are connected - some functionality may be limited",
        );
      }
    } catch (error: unknown) {
      logger.error(" [AI-Server] Service initialization failed:", error);
      // Don't throw - allow server to start even if some services are unavailable
    }
  }

  getApp(): Elysia {
    return this.app;
  }

  getPort(): number {
    return this.port;
  }
}

// Create and export server instance
export const aiServer = new AIServer();

// Auto-start if this file is run directly
if (import.meta.main) {
  const server = new AIServer();

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`[AI-Server] Received ${signal}, shutting down gracefully...`);
    try {
      await server.stop();
      process.exit(0);
    } catch (error: unknown) {
      logger.error("[AI-Server] Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("[AI-Server] Uncaught exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error(
      "[AI-Server] Unhandled promise rejection at:",
      promise,
      "reason:",
      reason,
    );
    process.exit(1);
  });

  // Start the server
  server.start().catch((error) => {
    logger.error("[AI-Server] Failed to start:", error);
    process.exit(1);
  });
}
