/**
 * Usage examples for BunSNC Client SDK
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  BunSNCClient,
  createBunSNCClient,
  TaskType,
  TaskPriority,
} from "./index";

/**
 * Basic usage example - Connect and fetch data
 */
export async function basicUsageExample() {
  // Create client instance
  const client = createBunSNCClient({
    baseUrl: "http://localhost:3008",
    auth: {
      username: "admin",
      password: "admin",
    },
  });

  try {
    // Test connection
    const isConnected = await client.testConnection();
    console.log("Connection status:", isConnected);

    // Get incidents
    const incidents = await client.getIncidents({
      state: "active",
      priority: "high",
      limit: "10",
    });
    console.log("Active incidents:", incidents.data?.data);

    // Get system health
    const health = await client.getHealth();
    console.log("System health:", health.data);

    // Get task statistics
    const taskStats = await client.getTaskQueueStats();
    console.log("Task queue stats:", taskStats.data?.data);
  } catch (error: unknown) {
    console.error("Error in basic usage:", error);
  }
}

/**
 * Advanced usage example - Task management and monitoring
 */
export async function advancedUsageExample() {
  const client = new BunSNCClient({
    baseUrl: "https://your-server.com:3008",
    timeout: 60000,
    auth: {
      token: "your-jwt-token-here",
    },
  });

  try {
    // Create a data export task
    const exportTask = await client.createTask({
      type: TaskType.PARQUET_EXPORT,
      data: {
        table: "incident",
        filters: {
          priority: ["1", "2"], // High and Critical
          state: ["1", "2", "3"], // New, In Progress, On Hold
        },
        compression: "snappy",
      },
      priority: TaskPriority.HIGH,
      tags: ["export", "incident", "analytics"],
      createdBy: "data-analyst",
    });

    console.log("Export task created:", exportTask.data?.data.taskId);

    if (exportTask.data?.success && exportTask.data.data.taskId) {
      // Monitor task progress with callbacks
      const completedTask = await client.waitForTaskCompletion(
        exportTask.data.data.taskId,
        {
          timeout: 300000, // 5 minutes
          pollInterval: 2000, // Check every 2 seconds
          onProgress: (task) => {
            console.log(`Task progress: ${task.progress}% - ${task.status}`);
          },
        },
      );

      console.log("Export completed:", completedTask);

      // Schedule recurring data sync
      const scheduledSync = await client.createScheduledTask({
        name: "Daily Incident Sync",
        description: "Synchronize incident data every day at 2 AM",
        cronExpression: "0 2 * * *",
        taskType: TaskType.DATA_SYNC,
        taskData: {
          tables: ["incident", "problem", "change_request"],
          incremental: true,
        },
        priority: TaskPriority.NORMAL,
        tags: ["daily", "sync", "automated"],
      });

      console.log("Scheduled task created:", scheduledSync.data?.data.taskId);
    }
  } catch (error: unknown) {
    console.error("Error in advanced usage:", error);
  }
}

/**
 * Batch operations example - Processing multiple tasks
 */
export async function batchOperationsExample() {
  const client = createBunSNCClient({
    baseUrl: "http://localhost:3008",
  });

  try {
    // Define multiple export operations
    const exportOperations = [
      () =>
        client.exportToParquet({
          table: "incident",
          compression: "snappy",
          priority: TaskPriority.HIGH,
        }),
      () =>
        client.exportToParquet({
          table: "problem",
          compression: "snappy",
          priority: TaskPriority.NORMAL,
        }),
      () =>
        client.exportToParquet({
          table: "change_request",
          compression: "snappy",
          priority: TaskPriority.NORMAL,
        }),
    ];

    // Execute batch operations with controlled concurrency
    const results = await client.batchOperation(exportOperations, {
      concurrency: 2,
      failFast: false,
    });

    console.log(`Completed ${results.length} export operations`);

    // Extract task IDs for monitoring
    const taskIds = results
      .filter((result) => result.data?.success)
      .map((result) => result.data.data.taskId);

    // Monitor all tasks simultaneously
    const monitoringPromises = taskIds.map((taskId) =>
      client
        .waitForTaskCompletion(taskId, {
          timeout: 600000, // 10 minutes
          onProgress: (task) => {
            console.log(`Task ${taskId}: ${task.progress}%`);
          },
        })
        .catch((error) => {
          console.error(`Task ${taskId} failed:`, error.message);
          return null;
        }),
    );

    const completedTasks = await Promise.all(monitoringPromises);
    const successfulTasks = completedTasks.filter((task) => task !== null);

    console.log(
      `${successfulTasks.length}/${taskIds.length} tasks completed successfully`,
    );
  } catch (error: unknown) {
    console.error("Error in batch operations:", error);
  }
}

/**
 * Real-time monitoring example - WebSocket and SSE integration
 */
export async function realTimeMonitoringExample() {
  const client = createBunSNCClient({
    baseUrl: "ws://localhost:3008", // WebSocket URL
  });

  try {
    // Start a long-running pipeline
    const pipeline = await client.executePipeline({
      pipelineId: "full-analytics-pipeline",
      tables: ["incident", "problem", "change_request", "user"],
      priority: TaskPriority.HIGH,
    });

    if (!pipeline.data?.success || !pipeline.data.data.taskId) {
      throw new Error("Failed to start pipeline");
    }

    const taskId = pipeline.data.data.taskId;
    console.log(`Pipeline started: ${taskId}`);

    // Set up real-time monitoring
    const startTime = Date.now();
    let lastProgress = 0;

    const monitorTask = async () => {
      try {
        while (true) {
          const task = await client.getTask(taskId);

          if (!task.data?.success) {
            console.error("Failed to fetch task status");
            break;
          }

          const taskData = task.data.data.task;
          const currentProgress = taskData.progress || 0;

          if (currentProgress !== lastProgress) {
            const elapsed = Date.now() - startTime;
            const rate = currentProgress / (elapsed / 1000); // progress per second
            const estimatedTotal =
              currentProgress > 0 ? (elapsed / currentProgress) * 100 : 0;
            const remaining = estimatedTotal - elapsed;

            console.log(`Progress: ${currentProgress.toFixed(1)}%`);
            console.log(`Status: ${taskData.status}`);
            console.log(`Rate: ${rate.toFixed(2)}%/s`);

            if (remaining > 0) {
              console.log(
                `Estimated time remaining: ${Math.round(remaining / 1000)}s`,
              );
            }

            lastProgress = currentProgress;
          }

          if (["completed", "failed", "cancelled"].includes(taskData.status)) {
            console.log(`Task finished with status: ${taskData.status}`);

            if (taskData.status === "completed") {
              console.log("Result:", taskData.result);
            } else if (taskData.error) {
              console.error("Task error:", taskData.error);
            }

            break;
          }

          // Wait before next check
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error: unknown) {
        console.error("Monitoring error:", error);
      }
    };

    // Start monitoring
    await monitorTask();

    // Get final system stats
    const finalStats = await client.getSystemStats();
    console.log("Final system stats:", finalStats.data?.data.system);
  } catch (error: unknown) {
    console.error("Error in real-time monitoring:", error);
  }
}

/**
 * Error handling and retry example
 */
export async function errorHandlingExample() {
  const client = createBunSNCClient({
    baseUrl: "http://localhost:3008",
    timeout: 10000,
  });

  // Retry helper function
  async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          throw lastError;
        }

        console.warn(
          `Attempt ${attempt} failed, retrying in ${delay}ms:`,
          lastError.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }

    throw lastError!;
  }

  try {
    // Retry connection test
    const connected = await withRetry(() => client.testConnection(), 5, 1000);

    if (!connected) {
      throw new Error("Unable to connect to server after retries");
    }

    // Robust task creation with error handling
    let taskId: string;

    try {
      const task = await client.createTask({
        type: TaskType.DATA_SYNC,
        data: {
          tables: ["incident"],
          incremental: true,
        },
      });

      if (!task.data?.success) {
        throw new Error(task.data?.error || "Failed to create task");
      }

      taskId = task.data.data.taskId;
      console.log("Task created successfully:", taskId);
    } catch (error: unknown) {
      console.error("Task creation failed:", error);
      return;
    }

    // Monitor with timeout and error recovery
    try {
      await client.waitForTaskCompletion(taskId, {
        timeout: 120000, // 2 minutes
        onProgress: (task) => {
          if (task.error) {
            console.warn("Task error detected:", task.error);
          }
        },
      });

      console.log("Task completed successfully");
    } catch (error: unknown) {
      console.error("Task monitoring failed:", error);

      // Try to get final task state
      try {
        const finalState = await client.getTask(taskId);
        console.log("Final task state:", finalState.data?.data.task);
      } catch (stateError) {
        console.error("Could not retrieve final task state:", stateError);
      }
    }
  } catch (error: unknown) {
    console.error("Critical error in error handling example:", error);
  }
}

/**
 * Configuration and authentication example
 */
export async function authenticationExample() {
  // Example 1: Basic authentication
  const basicAuthClient = createBunSNCClient({
    baseUrl: "https://your-servicenow-integration.com",
    auth: {
      username: "integration_user",
      password: "secure_password_123",
    },
  });

  // Example 2: Token-based authentication
  const tokenClient = createBunSNCClient({
    baseUrl: "https://api.company.com",
    auth: {
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    },
  });

  // Example 3: Dynamic token refresh
  class AuthenticatedClient extends BunSNCClient {
    private refreshToken: string;

    constructor(config: any) {
      super(config);
      this.refreshToken = config.refreshToken;
    }

    async refreshAuthToken(): Promise<void> {
      try {
        // Simulate token refresh API call
        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });

        const data = await response.json();

        if (data.accessToken) {
          this.setAuthToken(data.accessToken);
          console.log("Auth token refreshed successfully");
        }
      } catch (error: unknown) {
        console.error("Token refresh failed:", error);
        throw error;
      }
    }

    // Override to handle 401 errors with token refresh
    async makeAuthenticatedRequest<T>(operation: () => Promise<T>): Promise<T> {
      try {
        return await operation();
      } catch (error: any) {
        if (error.statusCode === 401) {
          console.log("Auth token expired, refreshing...");
          await this.refreshAuthToken();
          return await operation(); // Retry with new token
        }
        throw error;
      }
    }
  }

  // Usage of authenticated client
  const authClient = new AuthenticatedClient({
    baseUrl: "https://secure-api.company.com",
    auth: { token: "initial_token" },
    refreshToken: "refresh_token_here",
  });

  try {
    // This will automatically handle token refresh if needed
    const incidents = await authClient.makeAuthenticatedRequest(() =>
      authClient.getIncidents(),
    );

    console.log("Incidents retrieved:", incidents.data?.count);
  } catch (error: unknown) {
    console.error("Authentication example failed:", error);
  }
}
