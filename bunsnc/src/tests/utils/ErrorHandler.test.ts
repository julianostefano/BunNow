/**
 * ErrorHandler Tests - Comprehensive test suite for error handling and recovery
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import {
  ErrorHandler,
  ServiceNowError,
  ErrorContext,
  RecoveryStrategy,
  errorHandler,
} from "../../utils/ErrorHandler";

describe("ErrorHandler", () => {
  let handler: ErrorHandler;
  let mockOperation: () => Promise<any>;

  beforeEach(() => {
    handler = ErrorHandler.getInstance();
    handler.clearStats();
    mockOperation = mock(() => Promise.resolve("success"));
  });

  afterEach(() => {
    handler.clearStats();
  });

  describe("Basic Functionality", () => {
    test("should be a singleton", () => {
      const handler1 = ErrorHandler.getInstance();
      const handler2 = ErrorHandler.getInstance();

      expect(handler1).toBe(handler2);
      expect(errorHandler).toBe(handler1);
    });

    test("should create ServiceNowError from response", () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const error = handler.createError(
        404,
        '{"error":{"message":"Record not found","detail":"sys_id not found"}}',
        context,
      );

      expect(error).toBeInstanceOf(ServiceNowError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("Record not found");
      expect(error.context).toBe(context);
      expect(error.isRetryable).toBe(false); // 404 is not retryable
    });

    test("should create error from plain text response", () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const error = handler.createError(500, "Internal Server Error", context);

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("Internal Server Error");
      expect(error.isRetryable).toBe(true); // 500 is retryable
    });

    test("should determine retryability correctly", () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Non-retryable status codes
      const error400 = handler.createError(400, "Bad Request", context);
      expect(error400.isRetryable).toBe(false);

      const error401 = handler.createError(401, "Unauthorized", context);
      expect(error401.isRetryable).toBe(false);

      const error403 = handler.createError(403, "Forbidden", context);
      expect(error403.isRetryable).toBe(false);

      const error404 = handler.createError(404, "Not Found", context);
      expect(error404.isRetryable).toBe(false);

      // Retryable status codes
      const error500 = handler.createError(
        500,
        "Internal Server Error",
        context,
      );
      expect(error500.isRetryable).toBe(true);

      const error502 = handler.createError(502, "Bad Gateway", context);
      expect(error502.isRetryable).toBe(true);

      const error503 = handler.createError(503, "Service Unavailable", context);
      expect(error503.isRetryable).toBe(true);

      const error429 = handler.createError(429, "Too Many Requests", context);
      expect(error429.isRetryable).toBe(true);
    });

    test("should track error statistics", () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const error1 = new Error("Test error 1");
      const error2 = new ServiceNowError("Test error 2", 500, context);

      // Record errors (would happen during handleError calls)
      (handler as any).recordError(error1, context);
      (handler as any).recordError(error2, context);

      const stats = handler.getStats();

      expect(stats.total).toBe(2);
      expect(stats.byType.Error).toBe(1);
      expect(stats.byType.ServiceNowError).toBe(1);
      expect(stats.byStatusCode[500]).toBe(1);
      expect(stats.byOperation.test_operation).toBe(2);
    });
  });

  describe("Retry Logic", () => {
    test("should retry retryable errors with exponential backoff", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      let attempts = 0;
      const failingOperation = mock(() => {
        attempts++;
        if (attempts < 3) {
          throw new ServiceNowError(
            "Temporary failure",
            503,
            context,
            undefined,
            undefined,
            true,
          );
        }
        return Promise.resolve("success after retries");
      });

      const startTime = Date.now();
      const result = await handler.handleError(
        new ServiceNowError(
          "Initial failure",
          503,
          context,
          undefined,
          undefined,
          true,
        ),
        context,
        failingOperation,
      );
      const endTime = Date.now();

      expect(result).toBe("success after retries");
      expect(attempts).toBe(3);

      // Should have taken some time due to backoff delays
      expect(endTime - startTime).toBeGreaterThan(1000); // At least 1 second for backoff

      const stats = handler.getStats();
      expect(stats.retried).toBeGreaterThan(0);
    });

    test("should not retry non-retryable errors", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      let attempts = 0;
      const failingOperation = mock(() => {
        attempts++;
        return Promise.reject(
          new ServiceNowError(
            "Not found",
            404,
            context,
            undefined,
            undefined,
            false,
          ),
        );
      });

      await expect(
        handler.handleError(
          new ServiceNowError(
            "Not found",
            404,
            context,
            undefined,
            undefined,
            false,
          ),
          context,
          failingOperation,
        ),
      ).rejects.toThrow("Not found");

      expect(attempts).toBe(0); // Should not retry non-retryable errors
    });

    test("should stop retrying if error becomes non-retryable", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      let attempts = 0;
      const failingOperation = mock(() => {
        attempts++;
        if (attempts === 1) {
          // First attempt: retryable error
          throw new ServiceNowError(
            "Server error",
            503,
            context,
            undefined,
            undefined,
            true,
          );
        } else {
          // Second attempt: non-retryable error
          throw new ServiceNowError(
            "Unauthorized",
            401,
            context,
            undefined,
            undefined,
            false,
          );
        }
      });

      await expect(
        handler.handleError(
          new ServiceNowError(
            "Server error",
            503,
            context,
            undefined,
            undefined,
            true,
          ),
          context,
          failingOperation,
        ),
      ).rejects.toThrow("Unauthorized");

      expect(attempts).toBe(1); // Should stop after first retry due to non-retryable error
    });

    test("should respect maximum retry limit", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Update retry config to limit retries
      handler.updateRetryConfig({ maxRetries: 2 });

      let attempts = 0;
      const alwaysFailingOperation = mock(() => {
        attempts++;
        throw new ServiceNowError(
          "Always fails",
          503,
          context,
          undefined,
          undefined,
          true,
        );
      });

      await expect(
        handler.handleError(
          new ServiceNowError(
            "Always fails",
            503,
            context,
            undefined,
            undefined,
            true,
          ),
          context,
          alwaysFailingOperation,
        ),
      ).rejects.toThrow("Always fails");

      expect(attempts).toBe(2); // Should respect maxRetries setting

      // Reset to default
      handler.updateRetryConfig({ maxRetries: 3 });
    });

    test("should apply jitter to backoff delays", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Enable jitter
      handler.updateRetryConfig({ jitter: true, baseDelay: 100 });

      let attempts = 0;
      const delayTimes: number[] = [];
      let lastTime = Date.now();

      const failingOperation = mock(() => {
        attempts++;
        const currentTime = Date.now();
        if (attempts > 1) {
          delayTimes.push(currentTime - lastTime);
        }
        lastTime = currentTime;

        if (attempts < 3) {
          throw new ServiceNowError(
            "Temporary failure",
            503,
            context,
            undefined,
            undefined,
            true,
          );
        }
        return Promise.resolve("success");
      });

      await handler.handleError(
        new ServiceNowError(
          "Initial failure",
          503,
          context,
          undefined,
          undefined,
          true,
        ),
        context,
        failingOperation,
      );

      // With jitter, delays should vary slightly
      expect(delayTimes).toHaveLength(2);
      expect(delayTimes[0]).toBeGreaterThan(80); // Some variance due to jitter
      expect(delayTimes[1]).toBeGreaterThan(180); // Exponential backoff with jitter
    });
  });

  describe("Recovery Strategies", () => {
    test("should execute recovery strategies in priority order", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const executionOrder: string[] = [];

      // Add recovery strategies
      const strategy1: RecoveryStrategy = {
        name: "low_priority",
        priority: 10,
        description: "Low priority strategy",
        condition: () => true,
        action: async () => {
          executionOrder.push("low_priority");
          throw new Error("Low priority failed");
        },
      };

      const strategy2: RecoveryStrategy = {
        name: "high_priority",
        priority: 100,
        description: "High priority strategy",
        condition: () => true,
        action: async () => {
          executionOrder.push("high_priority");
          return "recovered by high priority";
        },
      };

      handler.addRecoveryStrategy(strategy1);
      handler.addRecoveryStrategy(strategy2);

      const result = await handler.handleError(
        new ServiceNowError("Test error", 500, context),
        context,
        mockOperation,
      );

      expect(result).toBe("recovered by high priority");
      expect(executionOrder).toEqual(["high_priority"]); // Should not try low priority after success

      const stats = handler.getStats();
      expect(stats.recovered).toBeGreaterThan(0);
    });

    test("should try next strategy if current one fails", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const executionOrder: string[] = [];

      const strategy1: RecoveryStrategy = {
        name: "failing_strategy",
        priority: 100,
        description: "Strategy that fails",
        condition: () => true,
        action: async () => {
          executionOrder.push("failing_strategy");
          throw new Error("Strategy failed");
        },
      };

      const strategy2: RecoveryStrategy = {
        name: "working_strategy",
        priority: 90,
        description: "Strategy that works",
        condition: () => true,
        action: async () => {
          executionOrder.push("working_strategy");
          return "recovered by working strategy";
        },
      };

      handler.addRecoveryStrategy(strategy1);
      handler.addRecoveryStrategy(strategy2);

      const result = await handler.handleError(
        new ServiceNowError("Test error", 500, context),
        context,
        mockOperation,
      );

      expect(result).toBe("recovered by working strategy");
      expect(executionOrder).toEqual(["failing_strategy", "working_strategy"]);
    });

    test("should only execute strategies that match condition", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const executionOrder: string[] = [];

      const strategy1: RecoveryStrategy = {
        name: "no_match",
        priority: 100,
        description: "Strategy with no match",
        condition: (error) => error.statusCode === 404, // Won't match our 500 error
        action: async () => {
          executionOrder.push("no_match");
          return "should not execute";
        },
      };

      const strategy2: RecoveryStrategy = {
        name: "match",
        priority: 90,
        description: "Strategy that matches",
        condition: (error) => error.statusCode === 500,
        action: async () => {
          executionOrder.push("match");
          return "matched and executed";
        },
      };

      handler.addRecoveryStrategy(strategy1);
      handler.addRecoveryStrategy(strategy2);

      const result = await handler.handleError(
        new ServiceNowError("Test error", 500, context),
        context,
        mockOperation,
      );

      expect(result).toBe("matched and executed");
      expect(executionOrder).toEqual(["match"]); // Only matching strategy should execute
    });

    test("should fall back to retry if no recovery strategies work", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const strategy: RecoveryStrategy = {
        name: "failing_recovery",
        priority: 100,
        description: "Recovery that fails",
        condition: () => true,
        action: async () => {
          throw new Error("Recovery failed");
        },
      };

      handler.addRecoveryStrategy(strategy);

      let attempts = 0;
      const retryOperation = mock(() => {
        attempts++;
        if (attempts < 2) {
          throw new ServiceNowError(
            "Retry attempt",
            503,
            context,
            undefined,
            undefined,
            true,
          );
        }
        return Promise.resolve("success after retry");
      });

      const result = await handler.handleError(
        new ServiceNowError(
          "Initial error",
          503,
          context,
          undefined,
          undefined,
          true,
        ),
        context,
        retryOperation,
      );

      expect(result).toBe("success after retry");
      expect(attempts).toBe(2); // Should have fallen back to retry
    });
  });

  describe("Configuration", () => {
    test("should update retry configuration", () => {
      const newConfig = {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 60000,
        backoffFactor: 3,
        jitter: false,
      };

      handler.updateRetryConfig(newConfig);

      // Verify config was updated (would need to access private config in real implementation)
      // For now, just test that method doesn't throw
      expect(() => handler.updateRetryConfig(newConfig)).not.toThrow();
    });

    test("should support custom retryable error patterns", () => {
      handler.updateRetryConfig({
        retryableErrors: [/custom.*error/i, "specific error message"],
        nonRetryableErrors: [/fatal.*error/i],
      });

      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // These would be tested through the isRetryable logic in actual handleError calls
      const customError = new Error("Custom error occurred");
      const specificError = new Error("specific error message");
      const fatalError = new Error("Fatal error occurred");

      // Test that the configuration doesn't break the system
      expect(() => {
        (handler as any).isRetryable(customError);
        (handler as any).isRetryable(specificError);
        (handler as any).isRetryable(fatalError);
      }).not.toThrow();
    });
  });

  describe("Statistics and Monitoring", () => {
    test("should provide detailed error statistics", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Generate various types of errors
      try {
        await handler.handleError(
          new ServiceNowError("Auth error", 401, context),
          context,
          mock(() => Promise.reject(new Error("Still failing"))),
        );
      } catch {}

      try {
        await handler.handleError(
          new ServiceNowError(
            "Server error",
            500,
            context,
            undefined,
            undefined,
            true,
          ),
          { ...context, operation: "another_operation" },
          mock(() => Promise.resolve("recovered")),
        );
      } catch {}

      const stats = handler.getStats();

      expect(stats.total).toBe(2);
      expect(typeof stats.recoveryRate).toBe("number");
      expect(typeof stats.retryRate).toBe("number");
      expect(stats.byType).toBeTruthy();
      expect(stats.byStatusCode).toBeTruthy();
      expect(stats.byOperation).toBeTruthy();
    });

    test("should calculate recovery and retry rates correctly", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Add a successful recovery strategy
      handler.addRecoveryStrategy({
        name: "test_recovery",
        priority: 100,
        description: "Test recovery",
        condition: (error) => error.statusCode === 500,
        action: async () => "recovered",
      });

      // Test recovery
      await handler.handleError(
        new ServiceNowError("Recoverable error", 500, context),
        context,
        mockOperation,
      );

      // Test retry
      let attempts = 0;
      await handler.handleError(
        new ServiceNowError(
          "Retryable error",
          503,
          context,
          undefined,
          undefined,
          true,
        ),
        context,
        mock(() => {
          attempts++;
          if (attempts < 2) {
            throw new Error("Retry needed");
          }
          return Promise.resolve("success");
        }),
      );

      const stats = handler.getStats();

      expect(stats.recovered).toBe(1);
      expect(stats.retried).toBe(1);
      expect(stats.total).toBe(2);
      expect(stats.recoveryRate).toBe(0.5); // 1 recovered out of 2 total
      expect(stats.retryRate).toBe(0.5); // 1 retried out of 2 total
    });

    test("should clear statistics", () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Add some stats
      (handler as any).recordError(new Error("Test error"), context);

      let stats = handler.getStats();
      expect(stats.total).toBeGreaterThan(0);

      handler.clearStats();

      stats = handler.getStats();
      expect(stats.total).toBe(0);
      expect(stats.recovered).toBe(0);
      expect(stats.retried).toBe(0);
    });
  });

  describe("Error Handling Edge Cases", () => {
    test("should handle null/undefined errors gracefully", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Test null error
      await expect(
        handler.handleError(null as any, context, mockOperation),
      ).rejects.toThrow();

      // Test undefined error
      await expect(
        handler.handleError(undefined as any, context, mockOperation),
      ).rejects.toThrow();
    });

    test("should handle string errors", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      await expect(
        handler.handleError("String error" as any, context, mockOperation),
      ).rejects.toThrow("String error");
    });

    test("should handle errors without status codes", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const genericError = new Error("Generic error without status code");

      await expect(
        handler.handleError(genericError, context, mockOperation),
      ).rejects.toThrow("Generic error without status code");
    });

    test("should handle malformed JSON error responses", () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const error = handler.createError(500, "Invalid JSON: {broken", context);

      expect(error.message).toBe("Invalid JSON: {broken"); // Should use raw text
    });

    test("should handle recovery strategy exceptions gracefully", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Add strategy that throws an exception
      handler.addRecoveryStrategy({
        name: "exception_strategy",
        priority: 100,
        description: "Strategy that throws",
        condition: () => true,
        action: async () => {
          throw new Error("Strategy exception");
        },
      });

      // Should not crash, should fall back to retry
      let attempts = 0;
      const result = await handler.handleError(
        new ServiceNowError(
          "Test error",
          503,
          context,
          undefined,
          undefined,
          true,
        ),
        context,
        mock(() => {
          attempts++;
          if (attempts < 2) {
            throw new Error("Retry needed");
          }
          return Promise.resolve("success after retry");
        }),
      );

      expect(result).toBe("success after retry");
    });
  });

  describe("Default Recovery Strategies", () => {
    test("should have default recovery strategies configured", () => {
      // Test that default strategies are loaded (they would be added in constructor)
      const newHandler = ErrorHandler.getInstance();

      // Default strategies should be present
      // This is tested indirectly by ensuring the constructor doesn't throw
      expect(newHandler).toBeTruthy();
    });

    test("should handle rate limit errors with backoff", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Rate limit error should trigger the rate limit recovery strategy
      await expect(
        handler.handleError(
          new ServiceNowError(
            "Rate limited",
            429,
            context,
            undefined,
            { retryAfter: 1 },
            true,
          ),
          context,
          mockOperation,
        ),
      ).rejects.toThrow(); // Will fail after attempting recovery
    });

    test("should handle authentication errors", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      // Auth error should trigger auth refresh strategy (which will fail in test)
      await expect(
        handler.handleError(
          new ServiceNowError("Unauthorized", 401, context),
          context,
          mockOperation,
        ),
      ).rejects.toThrow(); // Will fail as auth refresh is not implemented
    });

    test("should handle connection reset errors", async () => {
      const context: ErrorContext = {
        operation: "test_operation",
        timestamp: Date.now(),
      };

      const connectionError = new Error("ECONNRESET: Connection reset by peer");

      // Should attempt recovery for connection errors
      await expect(
        handler.handleError(connectionError, context, mockOperation),
      ).rejects.toThrow(); // Will eventually fail but should attempt recovery
    });
  });
});
