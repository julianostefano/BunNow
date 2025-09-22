/**
 * Task Scheduler System
 * Cron-based task scheduling with Redis persistence
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { createClient, RedisClientType } from "redis";
import { TaskQueue, Task, TaskType, TaskPriority } from "./TaskQueue";

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  taskType: TaskType;
  taskData: Record<string, any>;
  priority: TaskPriority;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  failCount: number;
  maxRetries: number;
  timeout: number; // milliseconds
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  tags?: string[];
}

export interface ScheduleOptions {
  name: string;
  description: string;
  cronExpression: string;
  taskType: TaskType;
  taskData: Record<string, any>;
  priority?: TaskPriority;
  maxRetries?: number;
  timeout?: number;
  enabled?: boolean;
  tags?: string[];
  createdBy?: string;
}

export class TaskScheduler extends EventEmitter {
  private redis: RedisClientType;
  private taskQueue: TaskQueue;
  private isRunning: boolean = false;
  private schedulerInterval?: Timer;
  private scheduledTasks: Map<string, ScheduledTask> = new Map();

  private readonly SCHEDULED_TASKS_KEY = "scheduler:tasks";
  private readonly SCHEDULE_LOCK_KEY = "scheduler:lock";
  private readonly SCHEDULER_INTERVAL = 60000; // Check every minute

  constructor(
    taskQueue: TaskQueue,
    redisOptions: {
      host: string;
      port: number;
      password?: string;
      db?: number;
    },
  ) {
    super();
    this.taskQueue = taskQueue;
    this.initializeRedis(redisOptions);
  }

  private async initializeRedis(options: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  }): Promise<void> {
    try {
      this.redis = createClient({
        socket: {
          host: options.host,
          port: options.port,
        },
        password: options.password,
        database: options.db || 1, // Use different DB for scheduler
      });

      await this.redis.connect();

      console.log(" Task Scheduler Redis connection established");

      // Load existing scheduled tasks
      await this.loadScheduledTasks();
    } catch (error) {
      console.error(" Failed to initialize Redis for TaskScheduler:", error);
      throw error;
    }
  }

  /**
   * Schedule a new recurring task
   */
  async schedule(options: ScheduleOptions): Promise<string> {
    const taskId = `scheduled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const scheduledTask: ScheduledTask = {
      id: taskId,
      name: options.name,
      description: options.description,
      cronExpression: options.cronExpression,
      taskType: options.taskType,
      taskData: options.taskData,
      priority: options.priority || TaskPriority.NORMAL,
      enabled: options.enabled !== false,
      runCount: 0,
      failCount: 0,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 300000, // 5 minutes default
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: options.createdBy,
      tags: options.tags,
    };

    // Calculate next run
    scheduledTask.nextRun = this.calculateNextRun(scheduledTask.cronExpression);

    try {
      // Save to Redis
      await this.redis.hSet(
        this.SCHEDULED_TASKS_KEY,
        taskId,
        JSON.stringify(scheduledTask),
      );

      // Update local cache
      this.scheduledTasks.set(taskId, scheduledTask);

      this.emit("taskScheduled", { taskId, task: scheduledTask });

      console.log(
        `📅 Task scheduled: ${options.name} (${taskId}) - Next run: ${scheduledTask.nextRun}`,
      );
      return taskId;
    } catch (error) {
      console.error(` Failed to schedule task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Unschedule a task
   */
  async unschedule(taskId: string): Promise<void> {
    try {
      const task = this.scheduledTasks.get(taskId);
      if (!task) {
        throw new Error(`Scheduled task ${taskId} not found`);
      }

      // Remove from Redis
      await this.redis.hDel(this.SCHEDULED_TASKS_KEY, taskId);

      // Remove from local cache
      this.scheduledTasks.delete(taskId);

      this.emit("taskUnscheduled", { taskId, task });

      console.log(`📅 Task unscheduled: ${task.name} (${taskId})`);
    } catch (error) {
      console.error(` Failed to unschedule task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Update a scheduled task
   */
  async updateScheduledTask(
    taskId: string,
    updates: Partial<ScheduledTask>,
  ): Promise<void> {
    try {
      const currentTask = this.scheduledTasks.get(taskId);
      if (!currentTask) {
        throw new Error(`Scheduled task ${taskId} not found`);
      }

      const updatedTask: ScheduledTask = {
        ...currentTask,
        ...updates,
        updatedAt: new Date(),
      };

      // Recalculate next run if cron expression changed
      if (updates.cronExpression) {
        updatedTask.nextRun = this.calculateNextRun(updates.cronExpression);
      }

      // Save to Redis
      await this.redis.hSet(
        this.SCHEDULED_TASKS_KEY,
        taskId,
        JSON.stringify(updatedTask),
      );

      // Update local cache
      this.scheduledTasks.set(taskId, updatedTask);

      this.emit("taskUpdated", { taskId, task: updatedTask });
    } catch (error) {
      console.error(` Failed to update scheduled task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Enable/disable a scheduled task
   */
  async setTaskEnabled(taskId: string, enabled: boolean): Promise<void> {
    await this.updateScheduledTask(taskId, { enabled });
    console.log(`📅 Task ${taskId} ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks(): ScheduledTask[] {
    return Array.from(this.scheduledTasks.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  /**
   * Get scheduled task by ID
   */
  getScheduledTask(taskId: string): ScheduledTask | undefined {
    return this.scheduledTasks.get(taskId);
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    totalTasks: number;
    enabledTasks: number;
    disabledTasks: number;
    totalRuns: number;
    totalFails: number;
    nextRun?: Date;
    runningTasks: number;
  } {
    const tasks = Array.from(this.scheduledTasks.values());

    const totalRuns = tasks.reduce((sum, task) => sum + task.runCount, 0);
    const totalFails = tasks.reduce((sum, task) => sum + task.failCount, 0);
    const enabledTasks = tasks.filter((task) => task.enabled);
    const nextRuns = enabledTasks
      .map((task) => task.nextRun)
      .filter(Boolean)
      .sort((a, b) => a!.getTime() - b!.getTime());

    return {
      totalTasks: tasks.length,
      enabledTasks: enabledTasks.length,
      disabledTasks: tasks.length - enabledTasks.length,
      totalRuns,
      totalFails,
      nextRun: nextRuns[0],
      runningTasks: 0, // TODO: Track running scheduled tasks
    };
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log("🕒 Starting Task Scheduler...");

    // Start scheduler loop
    this.schedulerInterval = setInterval(
      () => this.checkAndRunTasks(),
      this.SCHEDULER_INTERVAL,
    );

    // Run initial check
    await this.checkAndRunTasks();

    this.emit("started");
    console.log(" Task Scheduler started");
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log(" Stopping Task Scheduler...");
    this.isRunning = false;

    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }

    await this.redis.disconnect();

    this.emit("stopped");
    console.log(" Task Scheduler stopped");
  }

  /**
   * Manually trigger a scheduled task
   */
  async triggerTask(taskId: string): Promise<string> {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (!scheduledTask) {
      throw new Error(`Scheduled task ${taskId} not found`);
    }

    console.log(` Manually triggering task: ${scheduledTask.name} (${taskId})`);

    return await this.executeScheduledTask(scheduledTask);
  }

  // Private Methods

  private async loadScheduledTasks(): Promise<void> {
    try {
      const tasksData = await this.redis.hGetAll(this.SCHEDULED_TASKS_KEY);

      for (const [taskId, taskDataStr] of Object.entries(tasksData)) {
        try {
          const task: ScheduledTask = JSON.parse(taskDataStr as string);
          // Convert date strings back to Date objects
          task.createdAt = new Date(task.createdAt);
          task.updatedAt = new Date(task.updatedAt);
          if (task.lastRun) task.lastRun = new Date(task.lastRun);
          if (task.nextRun) task.nextRun = new Date(task.nextRun);

          this.scheduledTasks.set(taskId, task);
        } catch (parseError) {
          console.error(
            ` Failed to parse scheduled task ${taskId}:`,
            parseError,
          );
        }
      }

      console.log(`📅 Loaded ${this.scheduledTasks.size} scheduled tasks`);
    } catch (error) {
      console.error(" Failed to load scheduled tasks:", error);
    }
  }

  private async checkAndRunTasks(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Use Redis lock to prevent multiple scheduler instances
      const lockAcquired = await this.redis.set(
        this.SCHEDULE_LOCK_KEY,
        "locked",
        { EX: 30, NX: true }, // 30 second expiration, only if not exists
      );

      if (!lockAcquired) {
        // Another scheduler instance is running
        return;
      }

      const now = new Date();
      const tasksToRun: ScheduledTask[] = [];

      // Find tasks that need to run
      for (const task of this.scheduledTasks.values()) {
        if (task.enabled && task.nextRun && task.nextRun <= now) {
          tasksToRun.push(task);
        }
      }

      if (tasksToRun.length > 0) {
        console.log(`🕒 Found ${tasksToRun.length} tasks to run`);

        // Execute tasks
        for (const task of tasksToRun) {
          try {
            await this.executeScheduledTask(task);
          } catch (error) {
            console.error(
              ` Failed to execute scheduled task ${task.id}:`,
              error,
            );
          }
        }
      }

      // Release lock
      await this.redis.del(this.SCHEDULE_LOCK_KEY);
    } catch (error) {
      console.error(" Scheduler check failed:", error);
      // Make sure to release lock on error
      try {
        await this.redis.del(this.SCHEDULE_LOCK_KEY);
      } catch (unlockError) {
        console.error(" Failed to release scheduler lock:", unlockError);
      }
    }
  }

  private async executeScheduledTask(
    scheduledTask: ScheduledTask,
  ): Promise<string> {
    try {
      // Create task for queue
      const queueTaskId = await this.taskQueue.addTask({
        type: scheduledTask.taskType,
        data: {
          ...scheduledTask.taskData,
          scheduledTaskId: scheduledTask.id,
          scheduledTaskName: scheduledTask.name,
        },
        priority: scheduledTask.priority,
        maxRetries: scheduledTask.maxRetries,
        metadata: {
          createdBy: "scheduler",
          parentTaskId: scheduledTask.id,
          tags: scheduledTask.tags,
          estimatedDuration: scheduledTask.timeout,
        },
      });

      // Update scheduled task statistics
      const now = new Date();
      const updatedTask: ScheduledTask = {
        ...scheduledTask,
        lastRun: now,
        nextRun: this.calculateNextRun(scheduledTask.cronExpression, now),
        runCount: scheduledTask.runCount + 1,
        updatedAt: now,
      };

      // Save updated task
      await this.redis.hSet(
        this.SCHEDULED_TASKS_KEY,
        scheduledTask.id,
        JSON.stringify(updatedTask),
      );

      // Update local cache
      this.scheduledTasks.set(scheduledTask.id, updatedTask);

      this.emit("taskExecuted", {
        scheduledTaskId: scheduledTask.id,
        queueTaskId,
        task: updatedTask,
      });

      console.log(
        `🕒 Scheduled task executed: ${scheduledTask.name} -> Queue Task: ${queueTaskId}`,
      );

      return queueTaskId;
    } catch (error) {
      // Update fail count
      const updatedTask: ScheduledTask = {
        ...scheduledTask,
        failCount: scheduledTask.failCount + 1,
        nextRun: this.calculateNextRun(scheduledTask.cronExpression),
        updatedAt: new Date(),
      };

      await this.redis.hSet(
        this.SCHEDULED_TASKS_KEY,
        scheduledTask.id,
        JSON.stringify(updatedTask),
      );

      this.scheduledTasks.set(scheduledTask.id, updatedTask);

      this.emit("taskFailed", {
        scheduledTaskId: scheduledTask.id,
        error: (error as Error).message,
        task: updatedTask,
      });

      throw error;
    }
  }

  private calculateNextRun(cronExpression: string, fromDate?: Date): Date {
    // Simple cron parser implementation
    // In production, use a proper cron library like 'node-cron'
    const now = fromDate || new Date();

    try {
      // Parse cron expression: minute hour day month dayOfWeek
      const parts = cronExpression.trim().split(/\s+/);
      if (parts.length !== 5) {
        throw new Error("Invalid cron expression format");
      }

      const [minute, hour, day, month, dayOfWeek] = parts;

      // Simple implementation for common patterns
      const nextRun = new Date(now);

      // Handle some common patterns
      if (cronExpression === "0 0 * * *") {
        // Daily at midnight
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(0, 0, 0, 0);
      } else if (cronExpression === "0 */1 * * *") {
        // Every hour
        nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
      } else if (cronExpression === "*/15 * * * *") {
        // Every 15 minutes
        const minutes = Math.ceil(nextRun.getMinutes() / 15) * 15;
        if (minutes >= 60) {
          nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
        } else {
          nextRun.setMinutes(minutes, 0, 0);
        }
      } else if (cronExpression === "*/5 * * * *") {
        // Every 5 minutes
        const minutes = Math.ceil(nextRun.getMinutes() / 5) * 5;
        if (minutes >= 60) {
          nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
        } else {
          nextRun.setMinutes(minutes, 0, 0);
        }
      } else {
        // Default: add 1 hour
        nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
      }

      return nextRun;
    } catch (error) {
      console.error(
        ` Failed to parse cron expression "${cronExpression}":`,
        error,
      );
      // Fallback: run in 1 hour
      const fallback = new Date(now);
      fallback.setHours(fallback.getHours() + 1);
      return fallback;
    }
  }

  /**
   * Validate cron expression
   */
  static validateCronExpression(cronExpression: string): boolean {
    try {
      const parts = cronExpression.trim().split(/\s+/);
      return parts.length === 5;
    } catch {
      return false;
    }
  }

  /**
   * Get common cron expressions
   */
  static getCommonExpressions(): Record<string, string> {
    return {
      "Every minute": "* * * * *",
      "Every 5 minutes": "*/5 * * * *",
      "Every 15 minutes": "*/15 * * * *",
      "Every 30 minutes": "*/30 * * * *",
      "Every hour": "0 * * * *",
      "Every 2 hours": "0 */2 * * *",
      "Every 6 hours": "0 */6 * * *",
      "Every 12 hours": "0 */12 * * *",
      "Daily at midnight": "0 0 * * *",
      "Daily at 6 AM": "0 6 * * *",
      "Daily at 6 PM": "0 18 * * *",
      "Weekly (Sunday)": "0 0 * * 0",
      "Monthly (1st)": "0 0 1 * *",
    };
  }
}

export default TaskScheduler;
