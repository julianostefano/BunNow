/**
 * Circuit Breaker Pattern para ServiceNow
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from "../utils/Logger";
import { ErrorHandler } from "../utils/ErrorHandler";

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
  minimumCalls: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  stateChangedAt: number;
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalCalls = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private stateChangedAt = Date.now();
  private halfOpenCalls = 0;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 60000, // 1 minute
      halfOpenMaxCalls: 3,
      minimumCalls: 5,
      ...config,
    };

    logger.info("🔌 Circuit Breaker initialized:");
    logger.info(`   - Failure threshold: ${this.config.failureThreshold}`);
    logger.info(`   - Reset timeout: ${this.config.resetTimeout}ms`);
    logger.info(`   - Half-open max calls: ${this.config.halfOpenMaxCalls}`);
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.moveToHalfOpen();
      } else {
        throw new Error(
          `Circuit breaker is OPEN. Next attempt in ${this.timeUntilReset()}ms`,
        );
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new Error("Circuit breaker is HALF_OPEN and max calls exceeded");
      }
      this.halfOpenCalls++;
    }

    this.totalCalls++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error: unknown) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.moveToClosed();
        logger.info("🟢 Circuit breaker moved to CLOSED (recovery successful)");
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.resetFailureCount();
    }
  }

  private onFailure(error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    ErrorHandler.logUnknownError("CircuitBreaker.onFailure", error);

    if (this.state === CircuitState.HALF_OPEN) {
      this.moveToOpen();
      logger.warn("🔴 Circuit breaker moved to OPEN (half-open failure)");
    } else if (this.state === CircuitState.CLOSED && this.shouldOpenCircuit()) {
      this.moveToOpen();
      logger.warn(
        `🔴 Circuit breaker OPENED (${this.failureCount} failures in monitoring period)`,
      );
    }
  }

  private shouldOpenCircuit(): boolean {
    if (this.totalCalls < this.config.minimumCalls) {
      return false;
    }

    const recentFailures = this.getRecentFailures();
    return recentFailures >= this.config.failureThreshold;
  }

  private shouldAttemptReset(): boolean {
    const timeSinceLastFailure = this.lastFailureTime
      ? Date.now() - this.lastFailureTime
      : 0;

    return timeSinceLastFailure >= this.config.resetTimeout;
  }

  private timeUntilReset(): number {
    if (!this.lastFailureTime) return 0;

    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.resetTimeout - elapsed);
  }

  private getRecentFailures(): number {
    const monitoringWindowStart = Date.now() - this.config.monitoringPeriod;

    if (this.lastFailureTime && this.lastFailureTime > monitoringWindowStart) {
      return this.failureCount;
    }

    return 0;
  }

  private moveToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.stateChangedAt = Date.now();
    this.halfOpenCalls = 0;
    this.resetFailureCount();
  }

  private moveToOpen(): void {
    this.state = CircuitState.OPEN;
    this.stateChangedAt = Date.now();
    this.halfOpenCalls = 0;
  }

  private moveToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.stateChangedAt = Date.now();
    this.halfOpenCalls = 0;
    logger.info("🟡 Circuit breaker moved to HALF_OPEN (attempting recovery)");
  }

  private resetFailureCount(): void {
    this.failureCount = 0;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
    };
  }

  getHealthStatus(): {
    healthy: boolean;
    state: CircuitState;
    details: any;
  } {
    const metrics = this.getMetrics();
    const recentFailures = this.getRecentFailures();
    const failureRate =
      this.totalCalls > 0 ? this.failureCount / this.totalCalls : 0;

    return {
      healthy: this.state === CircuitState.CLOSED && failureRate < 0.5,
      state: this.state,
      details: {
        ...metrics,
        recentFailures,
        failureRate: Math.round(failureRate * 100) / 100,
        timeUntilReset:
          this.state === CircuitState.OPEN ? this.timeUntilReset() : 0,
        config: this.config,
      },
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.stateChangedAt = Date.now();
    this.halfOpenCalls = 0;

    logger.info("🔄 Circuit breaker manually reset");
  }

  forceOpen(): void {
    this.moveToOpen();
    logger.warn("🔴 Circuit breaker manually forced OPEN");
  }

  forceClosed(): void {
    this.moveToClosed();
    logger.info("🟢 Circuit breaker manually forced CLOSED");
  }
}

// Export singleton instance for ServiceNow API calls
export const serviceNowCircuitBreaker = new CircuitBreaker({
  failureThreshold: 8,
  resetTimeout: 120000, // 2 minutes
  monitoringPeriod: 300000, // 5 minutes
  halfOpenMaxCalls: 5,
  minimumCalls: 10,
});
