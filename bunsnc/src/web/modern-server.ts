/**
 * Modern Web Server with File-based Routing - Phase 5 Implementation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { jwt } from "@elysiajs/jwt";
import { autoroutes } from "elysia-autoroutes";

// Configuration interface
interface ModernServerConfig {
  port: number;
  host?: string;
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
  staticFiles?: {
    assets: string;
    prefix: string;
  };
  routes?: {
    directory: string;
    prefix?: string;
  };
}

export class ModernWebServer {
  private app: Elysia;
  private config: ModernServerConfig;

  constructor(config: ModernServerConfig) {
    this.config = {
      port: 3008,
      host: "localhost",
      cors: {
        origin: true,
        credentials: true,
      },
      staticFiles: {
        assets: "public",
        prefix: "/public",
      },
      routes: {
        directory: "./src/web/routes",
        prefix: "",
      },
      ...config,
    };

    this.initializeServer();
  }

  private initializeServer(): void {
    console.log(" Initializing modern web server with file-based routing...");

    this.app = new Elysia()
      // Core plugins
      .use(
        cors({
          origin: this.config.cors?.origin || true,
          credentials: this.config.cors?.credentials || true,
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
          allowedHeaders: ["*"],
          maxAge: 86400,
        }),
      )

      .use(html())

      .use(
        staticPlugin({
          assets: this.config.staticFiles?.assets || "public",
          prefix: this.config.staticFiles?.prefix || "/public",
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

      // JWT authentication
      .use(
        jwt({
          name: "jwt",
          secret: process.env.JWT_SECRET || "bunsnc-secret-key-2025",
          exp: "7d",
        }),
      )

      // Swagger documentation
      .use(
        swagger({
          documentation: {
            info: {
              title: "ServiceNow Analytics API",
              version: "2.0.0",
              description:
                "Modern ServiceNow interface with real-time analytics and file-based routing",
            },
            tags: [
              {
                name: "Dashboard",
                description: "Dashboard and analytics endpoints",
              },
              { name: "Incidents", description: "Incident management API" },
              { name: "Problems", description: "Problem management API" },
              { name: "Changes", description: "Change management API" },
              {
                name: "Real-time",
                description: "Real-time monitoring and SSE",
              },
              { name: "Auth", description: "Authentication and authorization" },
            ],
          },
        }),
      )

      // Health check endpoint
      .get("/health", () => ({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "2.0.0",
        server: "modern-web-server",
        features: [
          "file-based-routing",
          "jwt-auth",
          "real-time-sse",
          "htmx-components",
          "responsive-design",
        ],
      }))

      // Error handling
      .onError(({ error, code, set }) => {
        console.error(`Server Error [${code}]:`, error);

        set.status = code === "VALIDATION" ? 400 : 500;

        return {
          error:
            code === "VALIDATION"
              ? "Validation Error"
              : "Internal Server Error",
          message: error.message,
          timestamp: new Date().toISOString(),
          code,
        };
      })

      // Request logging
      .onRequest(({ request }) => {
        console.log(`${request.method} ${new URL(request.url).pathname}`);
      });

    // File-based routing with autoroutes
    try {
      console.log(
        "📁 Loading file-based routes from:",
        this.config.routes?.directory,
      );

      this.app.use(
        autoroutes({
          routesDir: `${process.cwd()}/src/web/routes`,
          prefix: this.config.routes?.prefix || "",
        }),
      );

      console.log(" File-based routing configured successfully");
    } catch (error: unknown) {
      console.warn(" File-based routing not available:", error.message);
      console.log(" Falling back to manual route definitions");
      this.setupFallbackRoutes();
    }

    console.log(" Modern web server initialized successfully");
  }

  private setupFallbackRoutes(): void {
    // Fallback routes if autoroutes fails
    this.app
      .get("/", () => {
        return `
          <html>
            <head>
              <title>ServiceNow Analytics</title>
              <script src="/ui/js/htmx.min.js"></script>
              <script src="/ui/styles/tailwind.css"></script>
            </head>
            <body class="bg-gray-50">
              <div class="container mx-auto px-4 py-8">
                <h1 class="text-3xl font-bold text-gray-900 mb-4">ServiceNow Analytics Dashboard</h1>
                <p class="text-gray-600">File-based routing is being initialized...</p>
                <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-semibold">Active Incidents</h3>
                    <p class="text-3xl font-bold text-red-600">--</p>
                  </div>
                  <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-semibold">Open Problems</h3>
                    <p class="text-3xl font-bold text-orange-600">--</p>
                  </div>
                  <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-semibold">Pending Changes</h3>
                    <p class="text-3xl font-bold text-blue-600">--</p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `;
      })

      .get("/api/health", () => ({
        status: "fallback",
        message: "Using fallback routes",
      }));
  }

  public async start(): Promise<void> {
    try {
      console.log(
        ` Starting modern web server on http://${this.config.host}:${this.config.port}`,
      );

      await this.app.listen({
        hostname: this.config.host,
        port: this.config.port,
      });

      console.log(` Modern web server running successfully!`);
      console.log(` Dashboard: http://${this.config.host}:${this.config.port}`);
      console.log(
        ` API Docs: http://${this.config.host}:${this.config.port}/swagger`,
      );
      console.log(
        ` Health Check: http://${this.config.host}:${this.config.port}/health`,
      );
    } catch (error: unknown) {
      console.error(" Failed to start modern web server:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.app.stop();
      console.log(" Modern web server stopped");
    } catch (error: unknown) {
      console.error("Error stopping web server:", error);
      throw error;
    }
  }

  public getApp(): Elysia {
    return this.app;
  }
}

// Factory function for easy instantiation
export function createModernWebServer(
  config: Partial<ModernServerConfig> = {},
): ModernWebServer {
  const defaultConfig: ModernServerConfig = {
    port: parseInt(process.env.PORT || "3008"),
    host: process.env.HOST || "localhost",
    cors: {
      origin: process.env.CORS_ORIGIN?.split(",") || true,
      credentials: true,
    },
    staticFiles: {
      assets: "public",
      prefix: "/public",
    },
    routes: {
      directory: "./src/web/routes",
    },
  };

  return new ModernWebServer({ ...defaultConfig, ...config });
}

// Development server launcher
if (import.meta.main) {
  console.log(" Starting development server...");

  const server = createModernWebServer({
    port: 3008,
    host: "0.0.0.0",
  });

  try {
    await server.start();
  } catch (error: unknown) {
    console.error(" Development server failed to start:", error);
    process.exit(1);
  }
}

export default createModernWebServer;
