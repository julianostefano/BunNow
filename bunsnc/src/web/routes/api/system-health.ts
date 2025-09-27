/**
 * System Health API Routes - Monitoramento avançado
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { serviceNowRateLimiter } from "../../services/ServiceNowRateLimit";
import { serviceNowCircuitBreaker } from "../../services/CircuitBreaker";
import { streamHandler } from "../../services/streaming/StreamHandler";
import { neuralSearchService } from "../../services/NeuralSearchService";
import { logger } from "../../utils/Logger";

export const systemHealthApiRoutes = new Elysia({ prefix: "/api/system" })
  .get("/health", async () => {
    try {
      const [
        rateLimiterHealth,
        circuitBreakerHealth,
        streamingHealth,
        neuralSearchHealth,
      ] = await Promise.all([
        serviceNowRateLimiter.getHealthStatus(),
        serviceNowCircuitBreaker.getHealthStatus(),
        streamHandler.getHealthStatus(),
        neuralSearchService.getHealthStatus(),
      ]);

      const overallHealth =
        rateLimiterHealth.status === "healthy" &&
        circuitBreakerHealth.healthy &&
        streamingHealth.healthy &&
        neuralSearchHealth.healthy;

      return {
        success: true,
        healthy: overallHealth,
        timestamp: new Date().toISOString(),
        components: {
          rateLimiter: rateLimiterHealth,
          circuitBreaker: circuitBreakerHealth,
          streaming: streamingHealth,
          neuralSearch: neuralSearchHealth,
        },
      };
    } catch (error: unknown) {
      logger.error("[SystemHealthAPI] Health check failed:", error);
      return {
        success: false,
        healthy: false,
        error: "Health check failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .get("/metrics", async () => {
    try {
      const rateLimiterMetrics = serviceNowRateLimiter.getMetrics();
      const circuitBreakerMetrics = serviceNowCircuitBreaker.getMetrics();
      const streamingStats = streamHandler.getStats();

      return {
        success: true,
        timestamp: new Date().toISOString(),
        metrics: {
          rateLimiter: {
            ...rateLimiterMetrics,
            queueSize: serviceNowRateLimiter.getQueueSize(),
          },
          circuitBreaker: circuitBreakerMetrics,
          streaming: streamingStats,
          system: {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
          },
        },
      };
    } catch (error: unknown) {
      logger.error("[SystemHealthAPI] Metrics collection failed:", error);
      return {
        success: false,
        error: "Metrics collection failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .post("/circuit-breaker/reset", async () => {
    try {
      serviceNowCircuitBreaker.reset();

      return {
        success: true,
        message: "Circuit breaker reset successfully",
        state: serviceNowCircuitBreaker.getMetrics().state,
      };
    } catch (error: unknown) {
      logger.error("[SystemHealthAPI] Circuit breaker reset failed:", error);
      return {
        success: false,
        error: "Circuit breaker reset failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .post("/circuit-breaker/force-open", async () => {
    try {
      serviceNowCircuitBreaker.forceOpen();

      return {
        success: true,
        message: "Circuit breaker forced OPEN",
        state: serviceNowCircuitBreaker.getMetrics().state,
      };
    } catch (error: unknown) {
      logger.error(
        "[SystemHealthAPI] Circuit breaker force open failed:",
        error,
      );
      return {
        success: false,
        error: "Circuit breaker force open failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .post("/circuit-breaker/force-closed", async () => {
    try {
      serviceNowCircuitBreaker.forceClosed();

      return {
        success: true,
        message: "Circuit breaker forced CLOSED",
        state: serviceNowCircuitBreaker.getMetrics().state,
      };
    } catch (error: unknown) {
      logger.error(
        "[SystemHealthAPI] Circuit breaker force closed failed:",
        error,
      );
      return {
        success: false,
        error: "Circuit breaker force closed failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .post("/rate-limiter/reset", async () => {
    try {
      serviceNowRateLimiter.resetMetrics();

      return {
        success: true,
        message: "Rate limiter metrics reset successfully",
        metrics: serviceNowRateLimiter.getMetrics(),
      };
    } catch (error: unknown) {
      logger.error("[SystemHealthAPI] Rate limiter reset failed:", error);
      return {
        success: false,
        error: "Rate limiter reset failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .get("/circuit-breaker/status", async () => {
    try {
      const status = serviceNowCircuitBreaker.getHealthStatus();

      return {
        success: true,
        ...status,
      };
    } catch (error: unknown) {
      logger.error("[SystemHealthAPI] Circuit breaker status failed:", error);
      return {
        success: false,
        error: "Circuit breaker status failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  })

  .get("/rate-limiter/status", async () => {
    try {
      const status = serviceNowRateLimiter.getHealthStatus();

      return {
        success: true,
        ...status,
      };
    } catch (error: unknown) {
      logger.error("[SystemHealthAPI] Rate limiter status failed:", error);
      return {
        success: false,
        error: "Rate limiter status failed",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  });
