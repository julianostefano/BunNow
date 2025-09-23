/**
 * ServiceNow Rate Limiting Service - 25 req/sec max (realistic limits)
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface RateLimitConfig {
  maxRequestsPerSecond: number;
  maxConcurrentRequests: number;
  exponentialBackoffBase: number;
  maxRetries: number;
  jitterEnabled: boolean;
}

export interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  averageResponseTime: number;
  currentConcurrentRequests: number;
}

export class ServiceNowRateLimiter {
  private config: RateLimitConfig;
  private requestQueue: Array<() => Promise<void>> = [];
  private requestTimes: number[] = [];
  private concurrentRequests = 0;
  private metrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    averageResponseTime: 0,
    currentConcurrentRequests: 0,
  };
  private isProcessingQueue = false;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRequestsPerSecond: parseInt(process.env.SERVICENOW_RATE_LIMIT || "15"),
      maxConcurrentRequests: parseInt(
        process.env.SERVICENOW_MAX_CONCURRENT || "10",
      ),
      exponentialBackoffBase: 2,
      maxRetries: 5,
      jitterEnabled: true,
      ...config,
    };

    console.log("🚦 ServiceNow Rate Limiter initialized:");
    console.log(
      `   - Max requests/second: ${this.config.maxRequestsPerSecond}`,
    );
    console.log(`   - Max concurrent: ${this.config.maxConcurrentRequests}`);
    console.log(`   - Max retries: ${this.config.maxRetries}`);

    // Clean old request times every 5 seconds
    setInterval(() => this.cleanOldRequestTimes(), 5000);
  }

  /**
   * Execute a request with rate limiting
   */
  async executeRequest<T>(
    requestFn: () => Promise<T>,
    priority: "high" | "normal" | "low" = "normal",
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestWrapper = async () => {
        try {
          const result = await this.processRequest(requestFn);
          resolve(result);
        } catch (error: unknown) {
          reject(error);
        }
      };

      // Add to queue based on priority
      if (priority === "high") {
        this.requestQueue.unshift(requestWrapper);
      } else {
        this.requestQueue.push(requestWrapper);
      }

      this.processQueue();
    });
  }

  /**
   * Process individual request with rate limiting logic
   */
  private async processRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    let retryCount = 0;
    let lastError: Error;

    while (retryCount <= this.config.maxRetries) {
      try {
        // Wait for rate limit availability
        await this.waitForRateLimit();

        // Wait for concurrent request slot
        await this.waitForConcurrentSlot();

        this.concurrentRequests++;
        this.metrics.currentConcurrentRequests = this.concurrentRequests;
        this.metrics.totalRequests++;

        const startTime = Date.now();
        this.requestTimes.push(startTime);

        try {
          const result = await requestFn();

          const duration = Date.now() - startTime;
          this.updateAverageResponseTime(duration);
          this.metrics.successfulRequests++;

          console.log(` ServiceNow request completed in ${duration}ms`);
          return result;
        } catch (error: any) {
          const duration = Date.now() - startTime;
          this.updateAverageResponseTime(duration);

          // Check if it's a rate limit error
          if (this.isRateLimitError(error)) {
            this.metrics.rateLimitedRequests++;
            console.log(
              `🚦 Rate limit hit, retry ${retryCount + 1}/${this.config.maxRetries}`,
            );

            if (retryCount < this.config.maxRetries) {
              const backoffDelay = this.calculateBackoffDelay(retryCount);
              console.log(`⏳ Backing off for ${backoffDelay}ms`);
              await this.sleep(backoffDelay);
              retryCount++;
              lastError = error;
              continue;
            }
          }

          this.metrics.failedRequests++;
          throw error;
        } finally {
          this.concurrentRequests--;
          this.metrics.currentConcurrentRequests = this.concurrentRequests;
        }
      } catch (error: any) {
        lastError = error;

        if (
          retryCount < this.config.maxRetries &&
          this.isRetryableError(error)
        ) {
          const backoffDelay = this.calculateBackoffDelay(retryCount);
          console.log(
            ` Retrying request in ${backoffDelay}ms (${retryCount + 1}/${this.config.maxRetries})`,
          );
          await this.sleep(backoffDelay);
          retryCount++;
          continue;
        }

        this.metrics.failedRequests++;
        throw error;
      }
    }

    throw lastError!;
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        // Process request without waiting - the request itself handles rate limiting
        request().catch((error) => {
          console.error(" Request from queue failed:", error);
        });
      }

      // Small delay to prevent tight loop
      await this.sleep(10);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Wait for rate limit availability
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // Count requests in the last second
    const recentRequests = this.requestTimes.filter(
      (time) => time > oneSecondAgo,
    );

    if (recentRequests.length >= this.config.maxRequestsPerSecond) {
      const oldestRecentRequest = Math.min(...recentRequests);
      const waitTime = 1000 - (now - oldestRecentRequest) + 50; // Add 50ms buffer

      if (waitTime > 0) {
        console.log(
          `🚦 Rate limit: waiting ${waitTime}ms (${recentRequests.length}/${this.config.maxRequestsPerSecond} requests)`,
        );
        await this.sleep(waitTime);
      }
    }
  }

  /**
   * Wait for concurrent request slot
   */
  private async waitForConcurrentSlot(): Promise<void> {
    let waitTime = 0;
    const maxWaitTime = 30000; // 30 seconds max wait

    while (this.concurrentRequests >= this.config.maxConcurrentRequests) {
      if (waitTime >= maxWaitTime) {
        throw new Error(
          "ServiceNow concurrent request timeout - max wait time exceeded",
        );
      }

      console.log(
        `⏳ Max concurrent requests reached (${this.concurrentRequests}/${this.config.maxConcurrentRequests}), waiting...`,
      );
      await this.sleep(500); // Increased sleep time
      waitTime += 500;
    }
  }

  /**
   * Clean old request times from tracking array
   */
  private cleanOldRequestTimes(): void {
    const fiveSecondsAgo = Date.now() - 5000;
    this.requestTimes = this.requestTimes.filter(
      (time) => time > fiveSecondsAgo,
    );
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(retryCount: number): number {
    // More aggressive backoff for 502 errors
    const baseDelay = Math.min(
      Math.pow(this.config.exponentialBackoffBase, retryCount) * 2000,
      30000 // Cap at 30 seconds
    );

    if (this.config.jitterEnabled) {
      // Add jitter: ±50% of base delay for better distribution
      const jitter = (Math.random() - 0.5) * baseDelay;
      return Math.max(2000, baseDelay + jitter);
    }

    return Math.max(2000, baseDelay);
  }

  /**
   * Check if error is rate limit related
   */
  private isRateLimitError(error: any): boolean {
    if (!error) return false;

    const statusCode = error.response?.status || error.status;
    const message = error.message?.toLowerCase() || "";

    return (
      statusCode === 429 || // Too Many Requests
      statusCode === 503 || // Service Unavailable
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("quota exceeded")
    );
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    const statusCode = error.response?.status || error.status;
    const message = error.message?.toLowerCase() || "";
    const code = error.code?.toLowerCase() || "";

    // Retryable HTTP status codes
    const retryableStatuses = [408, 429, 500, 502, 503, 504];

    // Additional retryable conditions
    const retryableMessages = [
      "timeout",
      "connection reset",
      "network error",
      "bad gateway",
      "service unavailable",
      "gateway timeout",
      "err_bad_response",
      "econnreset",
      "econnrefused",
      "etimedout"
    ];

    return (
      retryableStatuses.includes(statusCode) ||
      this.isRateLimitError(error) ||
      retryableMessages.some(msg => message.includes(msg)) ||
      retryableMessages.some(msg => code.includes(msg))
    );
  }

  /**
   * Update average response time metric
   */
  private updateAverageResponseTime(duration: number): void {
    const currentAvg = this.metrics.averageResponseTime;
    const totalRequests =
      this.metrics.successfulRequests + this.metrics.failedRequests;

    if (totalRequests === 1) {
      this.metrics.averageResponseTime = duration;
    } else {
      // Exponential moving average
      this.metrics.averageResponseTime = Math.round(
        currentAvg * 0.9 + duration * 0.1,
      );
    }
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current metrics
   */
  getMetrics(): RequestMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.requestQueue.length;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      averageResponseTime: 0,
      currentConcurrentRequests: this.concurrentRequests,
    };
    console.log(" ServiceNow rate limiter metrics reset");
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    status: "healthy" | "degraded" | "unhealthy";
    details: any;
  } {
    const metrics = this.getMetrics();
    const queueSize = this.getQueueSize();

    const successRate =
      metrics.totalRequests > 0
        ? metrics.successfulRequests / metrics.totalRequests
        : 1;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (successRate < 0.5 || queueSize > 100) {
      status = "unhealthy";
    } else if (
      successRate < 0.8 ||
      queueSize > 20 ||
      metrics.averageResponseTime > 5000
    ) {
      status = "degraded";
    }

    return {
      status,
      details: {
        metrics,
        queueSize,
        successRate: Math.round(successRate * 100) / 100,
        config: this.config,
        recentRequestsCount: this.requestTimes.filter(
          (time) => time > Date.now() - 1000,
        ).length,
      },
    };
  }
}

// Export singleton instance
export const serviceNowRateLimiter = new ServiceNowRateLimiter({
  maxRequestsPerSecond: 15,
  maxConcurrentRequests: 10,
  maxRetries: 5,
});

// Export convenience function
export const executeWithRateLimit = <T>(
  requestFn: () => Promise<T>,
  priority: "high" | "normal" | "low" = "normal",
): Promise<T> => serviceNowRateLimiter.executeRequest(requestFn, priority);
