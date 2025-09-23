/**
 * Tasks API Routes - Background Task Management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import {
  TaskType,
  TaskPriority,
  TaskStatus,
} from "../../../background/TaskQueue";
import TaskManager from "../../../background/TaskManager";

// Global task manager instance (will be injected)
let taskManager: TaskManager;

const app = new Elysia({ prefix: "/api/v1/tasks" })
  .get(
    "/",
    async ({ query }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        const status = query.status as TaskStatus | undefined;
        const limit = Math.min(parseInt(query.limit as string) || 50, 100);
        const offset = parseInt(query.offset as string) || 0;

        const result = await taskManager.getTasks(status, limit, offset);

        return {
          success: true,
          data: {
            tasks: result.tasks,
            pagination: {
              total: result.total,
              limit,
              offset,
              pages: Math.ceil(result.total / limit),
            },
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Error fetching tasks:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        status: t.Optional(t.Enum(TaskStatus)),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  .post(
    "/",
    async ({ body }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        const taskId = await taskManager.addTask(body.type, body.data, {
          priority: body.priority,
          maxRetries: body.maxRetries,
          tags: body.tags,
          createdBy: body.createdBy || "api",
        });

        return {
          success: true,
          data: { taskId },
          message: "Task created successfully",
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Error creating task:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        type: t.Enum(TaskType),
        data: t.Record(t.String(), t.Any()),
        priority: t.Optional(t.Enum(TaskPriority)),
        maxRetries: t.Optional(t.Number()),
        tags: t.Optional(t.Array(t.String())),
        createdBy: t.Optional(t.String()),
      }),
    },
  )

  .get("/:id", async ({ params }) => {
    try {
      if (!taskManager) {
        return {
          success: false,
          error: "Task Manager not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      const task = await taskManager.getTask(params.id);

      if (!task) {
        return {
          success: false,
          error: "Task not found",
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        data: { task },
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      console.error(`Error fetching task ${params.id}:`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  .post(
    "/:id/cancel",
    async ({ params, body }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        await taskManager.cancelTask(params.id, body.reason);

        return {
          success: true,
          message: "Task cancelled successfully",
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error(`Error cancelling task ${params.id}:`, error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        reason: t.Optional(t.String()),
      }),
    },
  )

  // Queue Statistics
  .get("/stats/queue", async () => {
    try {
      if (!taskManager) {
        return {
          success: false,
          error: "Task Manager not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      const stats = await taskManager.getQueueStats();

      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      console.error("Error fetching queue stats:", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  // System Statistics
  .get("/stats/system", async () => {
    try {
      if (!taskManager) {
        return {
          success: false,
          error: "Task Manager not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      const stats = await taskManager.getSystemStats();

      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      console.error("Error fetching system stats:", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  // Task History
  .get(
    "/history",
    async ({ query }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        const limit = Math.min(parseInt(query.limit as string) || 100, 500);
        const history = await taskManager.getTaskHistory(limit);

        return {
          success: true,
          data: { history, count: history.length },
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Error fetching task history:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
    },
  )

  // Health Check
  .get("/health", async () => {
    try {
      if (!taskManager) {
        return {
          success: false,
          error: "Task Manager not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      const health = await taskManager.healthCheck();

      return {
        success: true,
        data: health,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      console.error("Error checking task manager health:", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  // Scheduled Tasks Routes
  .get("/scheduled", async () => {
    try {
      if (!taskManager) {
        return {
          success: false,
          error: "Task Manager not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      const scheduledTasks = taskManager.getScheduledTasks();

      return {
        success: true,
        data: { scheduledTasks, count: scheduledTasks.length },
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      console.error("Error fetching scheduled tasks:", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  .post(
    "/scheduled",
    async ({ body }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        const taskId = await taskManager.scheduleTask(body);

        return {
          success: true,
          data: { taskId },
          message: "Task scheduled successfully",
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Error scheduling task:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        description: t.String(),
        cronExpression: t.String(),
        taskType: t.Enum(TaskType),
        taskData: t.Record(t.String(), t.Any()),
        priority: t.Optional(t.Enum(TaskPriority)),
        maxRetries: t.Optional(t.Number()),
        timeout: t.Optional(t.Number()),
        enabled: t.Optional(t.Boolean()),
        tags: t.Optional(t.Array(t.String())),
        createdBy: t.Optional(t.String()),
      }),
    },
  )

  .delete("/scheduled/:id", async ({ params }) => {
    try {
      if (!taskManager) {
        return {
          success: false,
          error: "Task Manager not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      await taskManager.unscheduleTask(params.id);

      return {
        success: true,
        message: "Scheduled task removed successfully",
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      console.error(`Error unscheduling task ${params.id}:`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  .post("/scheduled/:id/trigger", async ({ params }) => {
    try {
      if (!taskManager) {
        return {
          success: false,
          error: "Task Manager not initialized",
          timestamp: new Date().toISOString(),
        };
      }

      const queueTaskId = await taskManager.triggerScheduledTask(params.id);

      return {
        success: true,
        data: { queueTaskId },
        message: "Scheduled task triggered successfully",
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      console.error(`Error triggering scheduled task ${params.id}:`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  .post(
    "/scheduled/:id/enable",
    async ({ params, body }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        await taskManager.setScheduledTaskEnabled(params.id, body.enabled);

        return {
          success: true,
          message: `Scheduled task ${body.enabled ? "enabled" : "disabled"} successfully`,
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error(`Error updating scheduled task ${params.id}:`, error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        enabled: t.Boolean(),
      }),
    },
  )

  // High-level Operations
  .post(
    "/export/parquet",
    async ({ body }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        const taskId = await taskManager.exportToParquet(body.table, {
          filters: body.filters,
          compression: body.compression,
          priority: body.priority,
        });

        return {
          success: true,
          data: { taskId },
          message: `Parquet export started for table: ${body.table}`,
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Error starting parquet export:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        table: t.String(),
        filters: t.Optional(t.Record(t.String(), t.Any())),
        compression: t.Optional(t.String()),
        priority: t.Optional(t.Enum(TaskPriority)),
      }),
    },
  )

  .post(
    "/pipeline/execute",
    async ({ body }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        const taskId = await taskManager.executePipeline(body.pipelineId, {
          tables: body.tables,
          priority: body.priority,
        });

        return {
          success: true,
          data: { taskId },
          message: `Pipeline execution started: ${body.pipelineId}`,
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Error starting pipeline execution:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        pipelineId: t.String(),
        tables: t.Optional(t.Array(t.String())),
        priority: t.Optional(t.Enum(TaskPriority)),
      }),
    },
  )

  .post(
    "/sync/data",
    async ({ body }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        const taskId = await taskManager.syncData(body.tables, {
          incremental: body.incremental,
          priority: body.priority,
        });

        return {
          success: true,
          data: { taskId },
          message: `Data sync started for tables: ${body.tables.join(", ")}`,
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Error starting data sync:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        tables: t.Array(t.String()),
        incremental: t.Optional(t.Boolean()),
        priority: t.Optional(t.Enum(TaskPriority)),
      }),
    },
  )

  .post(
    "/cache/refresh",
    async ({ body }) => {
      try {
        if (!taskManager) {
          return {
            success: false,
            error: "Task Manager not initialized",
            timestamp: new Date().toISOString(),
          };
        }

        const taskId = await taskManager.refreshCache(body.keys, {
          priority: body.priority,
        });

        return {
          success: true,
          data: { taskId },
          message: "Cache refresh started",
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Error starting cache refresh:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        keys: t.Optional(t.Array(t.String())),
        priority: t.Optional(t.Enum(TaskPriority)),
      }),
    },
  )

  // Mock data endpoint for testing
  .get("/mock", () => {
    return {
      success: true,
      data: {
        taskTypes: Object.values(TaskType),
        priorities: Object.values(TaskPriority),
        statuses: Object.values(TaskStatus),
        exampleTasks: [
          {
            id: "task_demo_001",
            type: TaskType.PARQUET_EXPORT,
            status: TaskStatus.COMPLETED,
            progress: 100,
            createdAt: new Date(),
          },
          {
            id: "task_demo_002",
            type: TaskType.DATA_SYNC,
            status: TaskStatus.RUNNING,
            progress: 45,
            createdAt: new Date(),
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
  });

// Function to inject TaskManager instance
export function setTaskManager(manager: TaskManager): void {
  taskManager = manager;
}

export default app;
