/**
 * Task Manager - Central Background Task Management System
 * Coordinates TaskQueue, TaskScheduler, and provides unified API
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import TaskQueue, {
  Task,
  TaskType,
  TaskPriority,
  TaskStatus,
  TaskQueueOptions,
} from "./TaskQueue";
import TaskScheduler, { ScheduledTask, ScheduleOptions } from "./TaskScheduler";

export interface TaskManagerConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    queueDb?: number;
    schedulerDb?: number;
  };
  queue: {
    concurrency: number;
    retryDelay: number;
    maxRetries: number;
    cleanupInterval: number;
    deadLetterQueue: boolean;
  };
  integrations: {
    serviceNow?: {
      instanceUrl: string;
      username: string;
      password: string;
    };
    parquet?: {
      outputPath: string;
      compressionType: string;
    };
    hadoop?: {
      namenode: string;
      port: number;
      username: string;
    };
    opensearch?: {
      host: string;
      port: number;
      username?: string;
      password?: string;
    };
  };
}

export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  timestamp: Date;
}

export class TaskManager extends EventEmitter {
  private config: TaskManagerConfig;
  private queue!: TaskQueue;
  private scheduler!: TaskScheduler;
  private isRunning: boolean = false;
  private metrics: {
    tasksCreated: number;
    tasksCompleted: number;
    tasksFailed: number;
    averageExecutionTime: number;
    totalExecutionTime: number;
  };

  constructor(config: TaskManagerConfig) {
    super();
    this.config = config;
    this.metrics = {
      tasksCreated: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0,
    };

    this.initializeComponents();
  }

  private initializeComponents(): void {
    // Initialize TaskQueue
    const queueOptions: TaskQueueOptions = {
      redis: {
        ...this.config.redis,
        db: this.config.redis.queueDb || 0,
      },
      ...this.config.queue,
    };

    this.queue = new TaskQueue(queueOptions);

    // Initialize TaskScheduler
    this.scheduler = new TaskScheduler(this.queue, {
      ...this.config.redis,
      db: this.config.redis.schedulerDb || 1,
    });

    // Set up event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Queue events
    this.queue.on("taskEvent", (event) => {
      this.emit("taskEvent", event);
      this.updateMetrics(event);
    });

    // Scheduler events
    this.scheduler.on("taskScheduled", (event) => {
      this.emit("taskScheduled", event);
    });

    this.scheduler.on("taskExecuted", (event) => {
      this.emit("scheduledTaskExecuted", event);
    });

    this.scheduler.on("taskFailed", (event) => {
      this.emit("scheduledTaskFailed", event);
    });
  }

  private updateMetrics(event: any): void {
    switch (event.event) {
      case "task.added":
        this.metrics.tasksCreated++;
        break;
      case "task.updated":
        if (event.data.task.status === TaskStatus.COMPLETED) {
          this.metrics.tasksCompleted++;
          if (event.data.task.startedAt && event.data.task.completedAt) {
            const duration =
              event.data.task.completedAt.getTime() -
              event.data.task.startedAt.getTime();
            this.metrics.totalExecutionTime += duration;
            this.metrics.averageExecutionTime =
              this.metrics.totalExecutionTime / this.metrics.tasksCompleted;
          }
        } else if (event.data.task.status === TaskStatus.FAILED) {
          this.metrics.tasksFailed++;
        }
        break;
    }
  }

  // Public API Methods

  /**
   * Start the Task Manager
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    console.log(" Starting Task Manager...");

    try {
      await Promise.all([this.queue.start(), this.scheduler.start()]);

      this.isRunning = true;
      this.emit("started");

      console.log(" Task Manager started successfully");

      // Schedule default tasks
      await this.scheduleDefaultTasks();
    } catch (error) {
      console.error(" Failed to start Task Manager:", error);
      throw error;
    }
  }

  /**
   * Stop the Task Manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log(" Stopping Task Manager...");

    try {
      await Promise.all([this.queue.stop(), this.scheduler.stop()]);

      this.isRunning = false;
      this.emit("stopped");

      console.log(" Task Manager stopped successfully");
    } catch (error) {
      console.error(" Failed to stop Task Manager:", error);
      throw error;
    }
  }

  // Task Queue Operations

  /**
   * Add a new task to the queue
   */
  async addTask(
    type: TaskType,
    data: Record<string, any>,
    options?: {
      priority?: TaskPriority;
      maxRetries?: number;
      tags?: string[];
      createdBy?: string;
    },
  ): Promise<string> {
    return await this.queue.addTask({
      type,
      data,
      priority: options?.priority || TaskPriority.NORMAL,
      maxRetries: options?.maxRetries || 3,
      metadata: {
        tags: options?.tags,
        createdBy: options?.createdBy,
      },
    });
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    return await this.queue.getTask(taskId);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    return await this.queue.cancelTask(taskId, reason);
  }

  /**
   * Get tasks with pagination
   */
  async getTasks(
    status?: TaskStatus,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ tasks: Task[]; total: number }> {
    return await this.queue.getTasks(status, limit, offset);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    return await this.queue.getStats();
  }

  // Task Scheduler Operations

  /**
   * Schedule a recurring task
   */
  async scheduleTask(options: ScheduleOptions): Promise<string> {
    return await this.scheduler.schedule(options);
  }

  /**
   * Unschedule a task
   */
  async unscheduleTask(taskId: string): Promise<void> {
    return await this.scheduler.unschedule(taskId);
  }

  /**
   * Update scheduled task
   */
  async updateScheduledTask(
    taskId: string,
    updates: Partial<ScheduledTask>,
  ): Promise<void> {
    return await this.scheduler.updateScheduledTask(taskId, updates);
  }

  /**
   * Enable/disable scheduled task
   */
  async setScheduledTaskEnabled(
    taskId: string,
    enabled: boolean,
  ): Promise<void> {
    return await this.scheduler.setTaskEnabled(taskId, enabled);
  }

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks(): ScheduledTask[] {
    return this.scheduler.getScheduledTasks();
  }

  /**
   * Get scheduled task by ID
   */
  getScheduledTask(taskId: string): ScheduledTask | undefined {
    return this.scheduler.getScheduledTask(taskId);
  }

  /**
   * Manually trigger a scheduled task
   */
  async triggerScheduledTask(taskId: string): Promise<string> {
    return await this.scheduler.triggerTask(taskId);
  }

  /**
   * Get scheduler statistics
   */
  getSchedulerStats() {
    return this.scheduler.getStats();
  }

  // High-level Operations

  /**
   * Export ServiceNow data to Parquet format
   */
  async exportToParquet(
    table: string,
    options?: {
      filters?: Record<string, any>;
      compression?: string;
      priority?: TaskPriority;
    },
  ): Promise<string> {
    return await this.addTask(
      TaskType.PARQUET_EXPORT,
      {
        table,
        filters: options?.filters || {},
        compression: options?.compression || "snappy",
        outputPath:
          this.config.integrations.parquet?.outputPath || "/tmp/parquet",
        serviceNow: this.config.integrations.serviceNow,
      },
      {
        priority: options?.priority || TaskPriority.HIGH,
        tags: ["export", "parquet", table],
      },
    );
  }

  /**
   * Execute a data pipeline
   */
  async executePipeline(
    pipelineId: string,
    options?: {
      tables?: string[];
      priority?: TaskPriority;
    },
  ): Promise<string> {
    return await this.addTask(
      TaskType.PIPELINE_EXECUTION,
      {
        pipelineId,
        tables: options?.tables || ["incident", "problem", "change_request"],
        serviceNow: this.config.integrations.serviceNow,
        parquet: this.config.integrations.parquet,
        hadoop: this.config.integrations.hadoop,
        opensearch: this.config.integrations.opensearch,
      },
      {
        priority: options?.priority || TaskPriority.HIGH,
        tags: ["pipeline", pipelineId],
      },
    );
  }

  /**
   * Sync data from ServiceNow
   */
  async syncData(
    tables: string[],
    options?: {
      incremental?: boolean;
      priority?: TaskPriority;
    },
  ): Promise<string> {
    return await this.addTask(
      TaskType.DATA_SYNC,
      {
        tables,
        incremental: options?.incremental || false,
        serviceNow: this.config.integrations.serviceNow,
        opensearch: this.config.integrations.opensearch,
      },
      {
        priority: options?.priority || TaskPriority.NORMAL,
        tags: ["sync", ...tables],
      },
    );
  }

  /**
   * Generate report
   */
  async generateReport(
    reportType: string,
    parameters: Record<string, any>,
    options?: {
      priority?: TaskPriority;
    },
  ): Promise<string> {
    return await this.addTask(
      TaskType.REPORT_GENERATION,
      {
        reportType,
        parameters,
        outputPath: "/tmp/reports",
        serviceNow: this.config.integrations.serviceNow,
      },
      {
        priority: options?.priority || TaskPriority.NORMAL,
        tags: ["report", reportType],
      },
    );
  }

  /**
   * Refresh cache
   */
  async refreshCache(
    cacheKeys?: string[],
    options?: {
      priority?: TaskPriority;
    },
  ): Promise<string> {
    return await this.addTask(
      TaskType.CACHE_REFRESH,
      {
        keys: cacheKeys,
        redis: this.config.redis,
      },
      {
        priority: options?.priority || TaskPriority.LOW,
        tags: ["cache", "refresh"],
      },
    );
  }

  // Metrics and Monitoring

  /**
   * Get comprehensive system statistics
   */
  async getSystemStats(): Promise<{
    queue: any;
    scheduler: any;
    metrics: any;
    system: {
      isRunning: boolean;
      uptime: number;
      tasksCreated: number;
      tasksCompleted: number;
      tasksFailed: number;
      successRate: number;
      averageExecutionTime: number;
    };
  }> {
    const queueStats = await this.getQueueStats();
    const schedulerStats = this.getSchedulerStats();

    const successRate =
      this.metrics.tasksCreated > 0
        ? (this.metrics.tasksCompleted / this.metrics.tasksCreated) * 100
        : 0;

    return {
      queue: queueStats,
      scheduler: schedulerStats,
      metrics: this.metrics,
      system: {
        isRunning: this.isRunning,
        uptime: process.uptime() * 1000,
        tasksCreated: this.metrics.tasksCreated,
        tasksCompleted: this.metrics.tasksCompleted,
        tasksFailed: this.metrics.tasksFailed,
        successRate: Math.round(successRate * 100) / 100,
        averageExecutionTime: Math.round(this.metrics.averageExecutionTime),
      },
    };
  }

  /**
   * Get task execution history
   */
  async getTaskHistory(limit: number = 100): Promise<Task[]> {
    const completed = await this.getTasks(
      TaskStatus.COMPLETED,
      Math.floor(limit / 2),
    );
    const failed = await this.getTasks(
      TaskStatus.FAILED,
      Math.floor(limit / 2),
    );

    const allTasks = [...completed.tasks, ...failed.tasks];

    // Sort by completion time
    allTasks.sort((a, b) => {
      const aTime = a.completedAt?.getTime() || 0;
      const bTime = b.completedAt?.getTime() || 0;
      return bTime - aTime;
    });

    return allTasks.slice(0, limit);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    services: {
      queue: boolean;
      scheduler: boolean;
      redis: boolean;
    };
    timestamp: Date;
  }> {
    let queueHealthy = false;
    let schedulerHealthy = false;
    let redisHealthy = false;

    try {
      // Check queue
      await this.getQueueStats();
      queueHealthy = true;
    } catch (error) {
      console.error("Queue health check failed:", error);
    }

    try {
      // Check scheduler
      this.getSchedulerStats();
      schedulerHealthy = true;
    } catch (error) {
      console.error("Scheduler health check failed:", error);
    }

    try {
      // Check Redis connectivity (via queue)
      await this.queue.getStats();
      redisHealthy = true;
    } catch (error) {
      console.error("Redis health check failed:", error);
    }

    const healthy = queueHealthy && schedulerHealthy && redisHealthy;

    return {
      healthy,
      services: {
        queue: queueHealthy,
        scheduler: schedulerHealthy,
        redis: redisHealthy,
      },
      timestamp: new Date(),
    };
  }

  // Private Methods

  private async scheduleDefaultTasks(): Promise<void> {
    try {
      // Schedule daily data sync
      await this.scheduleTask({
        name: "Daily Data Sync",
        description: "Synchronize ServiceNow data daily",
        cronExpression: "0 2 * * *", // 2 AM daily
        taskType: TaskType.DATA_SYNC,
        taskData: {
          tables: ["incident", "problem", "change_request"],
          incremental: true,
        },
        priority: TaskPriority.HIGH,
        tags: ["system", "daily", "sync"],
        createdBy: "system",
      });

      // Schedule weekly cache cleanup
      await this.scheduleTask({
        name: "Weekly Cache Cleanup",
        description: "Clean up old cache entries",
        cronExpression: "0 3 * * 0", // 3 AM on Sundays
        taskType: TaskType.CACHE_REFRESH,
        taskData: {
          cleanup: true,
        },
        priority: TaskPriority.LOW,
        tags: ["system", "weekly", "cleanup"],
        createdBy: "system",
      });

      // Schedule monthly report generation
      await this.scheduleTask({
        name: "Monthly Summary Report",
        description: "Generate monthly analytics summary",
        cronExpression: "0 4 1 * *", // 4 AM on 1st of month
        taskType: TaskType.REPORT_GENERATION,
        taskData: {
          reportType: "monthly_summary",
          parameters: {
            includeTrends: true,
            includeMetrics: true,
          },
        },
        priority: TaskPriority.NORMAL,
        tags: ["system", "monthly", "report"],
        createdBy: "system",
      });

      console.log(" Default scheduled tasks created");
    } catch (error) {
      console.error(" Failed to create default scheduled tasks:", error);
    }
  }
}

export default TaskManager;
