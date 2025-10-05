/**
 * System Plugin - SystemService dependency injection with lazy initialization
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.5.21: SystemService Plugin Pattern (ElysiaJS Best Practice)
 * Root cause: streaming-metrics.routes.ts calling getInstance() without config
 * Solution: Plugin with .derive() for lazy initialization and proper DI
 * Reference: docs/ELYSIA_BEST_PRACTICES.md - "Plugin Dependency Injection"
 */

import { Elysia } from "elysia";
import { MongoClient } from "mongodb";
import { SystemService, type SystemConfig } from "../services/SystemService";
import { logger } from "../utils/Logger";

/**
 * System Plugin - Provides SystemService via dependency injection
 *
 * Usage:
 * ```typescript
 * new Elysia()
 *   .use(systemPlugin)
 *   .get('/metrics', ({ systemService }) => systemService.getPerformanceStats())
 * ```
 */
export const systemPlugin = new Elysia({ name: "system" }).derive(async () => {
  try {
    // Get existing singleton OR create with config
    let systemService = SystemService.getInstance();

    if (!systemService) {
      // Initialize with config if not exists
      const mongoClient = new MongoClient(
        process.env.MONGODB_URL ||
          "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin",
      );

      const systemConfig: SystemConfig = {
        mongodb: {
          client: mongoClient,
          database: process.env.MONGODB_DATABASE || "bunsnc",
        },
        redis: {
          host: process.env.REDIS_HOST || "localhost",
          port: parseInt(process.env.REDIS_PORT || "6379"),
          password: process.env.REDIS_PASSWORD,
        },
        performance: {
          monitoring: true,
          thresholds: {
            response_time_warning: 1000,
            response_time_critical: 5000,
            memory_warning: 500,
            memory_critical: 1000,
          },
        },
        tasks: {
          concurrency: 3,
          retryDelay: 5000,
          maxRetries: 3,
          cleanupInterval: 300000,
        },
      };

      systemService = SystemService.getInstance(systemConfig);

      // Initialize async (non-blocking)
      systemService
        .initialize()
        .then(() => logger.info("✅ SystemService initialized via plugin"))
        .catch((error) => logger.warn("⚠️ SystemService init warning:", error));
    }

    return { systemService };
  } catch (error: unknown) {
    logger.error("❌ Failed to create systemService in plugin:", error);
    throw error;
  }
});
