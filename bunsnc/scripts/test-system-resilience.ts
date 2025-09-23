/**
 * System Resilience Test - Testa circuit breaker e rate limiting
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from "../src/utils/Logger";
import { serviceNowRateLimiter } from "../src/services/ServiceNowRateLimit";
import { serviceNowCircuitBreaker } from "../src/services/CircuitBreaker";

export class SystemResilienceTest {
  async testRateLimiter(): Promise<void> {
    try {
      logger.info("🚦 Testing Rate Limiter functionality...");

      const testRequests = Array.from({ length: 20 }, (_, i) => async () => {
        logger.info(`Request ${i + 1}: Testing rate limiter`);
        await new Promise(resolve => setTimeout(resolve, 100));
        return `Response ${i + 1}`;
      });

      const results = await Promise.allSettled(
        testRequests.map(request =>
          serviceNowRateLimiter.executeRequest(request, "normal")
        )
      );

      const successful = results.filter(r => r.status === "fulfilled").length;
      const failed = results.filter(r => r.status === "rejected").length;

      logger.info(`✅ Rate Limiter Test Results:`);
      logger.info(`   Successful: ${successful}/${testRequests.length}`);
      logger.info(`   Failed: ${failed}/${testRequests.length}`);

      const metrics = serviceNowRateLimiter.getMetrics();
      logger.info(`📊 Rate Limiter Metrics:`);
      logger.info(`   Total Requests: ${metrics.totalRequests}`);
      logger.info(`   Successful: ${metrics.successfulRequests}`);
      logger.info(`   Failed: ${metrics.failedRequests}`);
      logger.info(`   Average Response Time: ${metrics.averageResponseTime}ms`);

    } catch (error: unknown) {
      logger.error("❌ Rate Limiter test failed:", error);
    }
  }

  async testCircuitBreaker(): Promise<void> {
    try {
      logger.info("🔌 Testing Circuit Breaker functionality...");

      // Test successful operations
      logger.info("Testing successful operations...");
      for (let i = 0; i < 5; i++) {
        await serviceNowCircuitBreaker.execute(async () => {
          logger.info(`Successful operation ${i + 1}`);
          return `Success ${i + 1}`;
        });
      }

      let metrics = serviceNowCircuitBreaker.getMetrics();
      logger.info(`✅ After successful operations: State=${metrics.state}, Success=${metrics.successCount}`);

      // Test failing operations to trigger circuit breaker
      logger.info("Testing failing operations to trigger circuit breaker...");
      for (let i = 0; i < 10; i++) {
        try {
          await serviceNowCircuitBreaker.execute(async () => {
            throw new Error(`Simulated failure ${i + 1}`);
          });
        } catch (error: unknown) {
          logger.debug(`Expected failure ${i + 1}`);
        }
      }

      metrics = serviceNowCircuitBreaker.getMetrics();
      logger.info(`🔴 After failing operations: State=${metrics.state}, Failures=${metrics.failureCount}`);

      // Test circuit breaker OPEN state
      try {
        await serviceNowCircuitBreaker.execute(async () => {
          return "This should be blocked";
        });
        logger.warn("⚠️ Operation executed when circuit should be OPEN");
      } catch (error: unknown) {
        logger.info("✅ Circuit breaker correctly blocked operation when OPEN");
      }

      // Reset circuit breaker
      serviceNowCircuitBreaker.reset();
      metrics = serviceNowCircuitBreaker.getMetrics();
      logger.info(`🔄 After reset: State=${metrics.state}`);

    } catch (error: unknown) {
      logger.error("❌ Circuit Breaker test failed:", error);
    }
  }

  async testSystemHealth(): Promise<void> {
    try {
      logger.info("🏥 Testing System Health endpoints...");

      const baseUrl = "http://localhost:3008";

      // Test health endpoint
      const healthResponse = await fetch(`${baseUrl}/api/system/health`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        logger.info("✅ System health endpoint working");
        logger.info(`   Overall Health: ${healthData.healthy ? "✅" : "❌"}`);
        logger.info(`   Components: ${Object.keys(healthData.components).length}`);
      } else {
        logger.warn("⚠️ System health endpoint unavailable");
      }

      // Test metrics endpoint
      const metricsResponse = await fetch(`${baseUrl}/api/system/metrics`);
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        logger.info("✅ System metrics endpoint working");
        logger.info(`   Uptime: ${Math.round(metricsData.metrics.system.uptime)}s`);
      } else {
        logger.warn("⚠️ System metrics endpoint unavailable");
      }

    } catch (error: unknown) {
      logger.warn("⚠️ System health endpoints not available (server may not be running)");
      logger.debug("Health test error:", error);
    }
  }

  async testResilienceUnderLoad(): Promise<void> {
    try {
      logger.info("⚡ Testing system resilience under load...");

      const startTime = Date.now();
      const concurrentRequests = 50;
      const requestPromises: Promise<any>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const requestPromise = serviceNowRateLimiter.executeRequest(async () => {
          // Simulate varying response times
          const delay = Math.random() * 500 + 100;
          await new Promise(resolve => setTimeout(resolve, delay));

          // Simulate some failures
          if (Math.random() < 0.1) {
            throw new Error(`Simulated error in request ${i}`);
          }

          return `Response ${i}`;
        }, "normal");

        requestPromises.push(requestPromise);
      }

      const results = await Promise.allSettled(requestPromises);
      const duration = Date.now() - startTime;

      const successful = results.filter(r => r.status === "fulfilled").length;
      const failed = results.filter(r => r.status === "rejected").length;

      logger.info(`⚡ Load Test Results (${duration}ms):`);
      logger.info(`   Concurrent Requests: ${concurrentRequests}`);
      logger.info(`   Successful: ${successful} (${Math.round(successful/concurrentRequests*100)}%)`);
      logger.info(`   Failed: ${failed} (${Math.round(failed/concurrentRequests*100)}%)`);
      logger.info(`   Throughput: ${Math.round(concurrentRequests*1000/duration)} req/s`);

      const rateLimiterHealth = serviceNowRateLimiter.getHealthStatus();
      const circuitBreakerHealth = serviceNowCircuitBreaker.getHealthStatus();

      logger.info(`📊 Post-Load System State:`);
      logger.info(`   Rate Limiter: ${rateLimiterHealth.status}`);
      logger.info(`   Circuit Breaker: ${circuitBreakerHealth.state}`);

    } catch (error: unknown) {
      logger.error("❌ Load test failed:", error);
    }
  }

  async runAllTests(): Promise<void> {
    try {
      logger.info("🚀 Starting System Resilience Testing...");
      logger.info("=" * 60);

      await this.testRateLimiter();
      logger.info("");

      await this.testCircuitBreaker();
      logger.info("");

      await this.testSystemHealth();
      logger.info("");

      await this.testResilienceUnderLoad();

      logger.info("\n" + "=" * 60);
      logger.info("🎉 System Resilience Testing completed!");

      logger.info("\n📋 Final System Status:");
      const rateLimiterMetrics = serviceNowRateLimiter.getMetrics();
      const circuitBreakerMetrics = serviceNowCircuitBreaker.getMetrics();

      logger.info(`   Rate Limiter - Success Rate: ${Math.round(rateLimiterMetrics.successfulRequests/rateLimiterMetrics.totalRequests*100)}%`);
      logger.info(`   Circuit Breaker - State: ${circuitBreakerMetrics.state}`);
      logger.info(`   Queue Size: ${serviceNowRateLimiter.getQueueSize()}`);

    } catch (error: unknown) {
      logger.error("❌ System resilience testing failed:", error);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const test = new SystemResilienceTest();
  test.runAllTests().catch((error) => {
    logger.error("Test runner failed:", error);
    process.exit(1);
  });
}