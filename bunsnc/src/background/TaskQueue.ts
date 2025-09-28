/**
 * Background Task Queue System
 * Redis-based task queue with priority support and retry logic
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { Redis as RedisClient, Cluster as RedisCluster } from "ioredis";
import { redisConnectionManager } from "../utils/RedisConnection";
import { logger } from "../utils/Logger";

export interface Task {
  id: string;
  type: TaskType;
  data: Record<string, any>;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: TaskError;
  result?: any;
  metadata: {
    createdBy?: string;
    parentTaskId?: string;
    tags?: string[];
    estimatedDuration?: number;
  };
}

export enum TaskType {
  PARQUET_EXPORT = "parquet_export",
  PIPELINE_EXECUTION = "pipeline_execution",
  DATA_SYNC = "data_sync",
  REPORT_GENERATION = "report_generation",
  CACHE_REFRESH = "cache_refresh",
  ELASTICSEARCH_INDEX = "elasticsearch_index",
  HADOOP_UPLOAD = "hadoop_upload",
  REDIS_CLEANUP = "redis_cleanup",
  SCHEDULED_BACKUP = "scheduled_backup",
  NOTIFICATION_SEND = "notification_send",
}

export enum TaskPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
  URGENT = 5,
}

export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  RETRYING = "retrying",
  PAUSED = "paused",
}

export interface TaskError {
  message: string;
  stack?: string;
  code?: string;
  timestamp: Date;
  retryable: boolean;
}

export interface TaskQueueOptions {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  concurrency: number;
  retryDelay: number;
  maxRetries: number;
  cleanupInterval: number;
  deadLetterQueue: boolean;
}

export class TaskQueue extends EventEmitter {
  private redis: RedisClient | RedisCluster | null = null;
  private subscriber: RedisClient | RedisCluster | null = null;
  private options: TaskQueueOptions;
  private workers: Map<string, TaskWorker> = new Map();
  private isRunning: boolean = false;
  private cleanupTimer?: Timer;

  // Queue names
  private readonly PENDING_QUEUE = "tasks:pending";
  private readonly RUNNING_QUEUE = "tasks:running";
  private readonly COMPLETED_QUEUE = "tasks:completed";
  private readonly FAILED_QUEUE = "tasks:failed";
  private readonly DEAD_LETTER_QUEUE = "tasks:dead_letter";
  private readonly TASK_DATA_PREFIX = "task:";

  constructor(options: TaskQueueOptions) {
    super();
    this.options = options;
    this.initializeSharedConnections();
  }

  private async initializeSharedConnections(): Promise<void> {
    try {
      logger.info("Initializing shared Redis connections", "TaskQueue");

      // Get shared Redis connections
      this.redis = await redisConnectionManager.connect({
        host: this.options.redis.host,
        port: this.options.redis.port,
        password: this.options.redis.password,
        db: this.options.redis.db || 0,
      });

      // Get separate connection for subscriber
      this.subscriber = await redisConnectionManager.connect({
        host: this.options.redis.host,
        port: this.options.redis.port,
        password: this.options.redis.password,
        db: this.options.redis.db || 0,
      });

      // Validate connections
      if (this.redis) {
        await this.redis.ping();
      }
      if (this.subscriber) {
        await this.subscriber.ping();
      }

      // Subscribe to task events
      if (this.subscriber) {
        this.subscriber.subscribe("task:events", (message) => {
          try {
            const event = JSON.parse(message);
            this.emit("taskEvent", event);
          } catch (error: unknown) {
            logger.error("Error parsing task event", "TaskQueue", { error });
          }
        });
      }

      logger.info("TaskQueue Redis connections established", "TaskQueue");
    } catch (error: unknown) {
      logger.error(
        "Redis initialization failed - continuing without Redis",
        "TaskQueue",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      this.redis = null;
      this.subscriber = null;
    }
  }

  /**
   * Add a new task to the queue
   */
  async addTask(
    task: Omit<Task, "id" | "status" | "progress" | "retryCount" | "createdAt">,
  ): Promise<string> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const fullTask: Task = {
      id: taskId,
      status: TaskStatus.PENDING,
      progress: 0,
      retryCount: 0,
      createdAt: new Date(),
      ...task,
    };

    if (!this.redis) {
      logger.warn("Redis unavailable - task not added", "TaskQueue", {
        taskId,
      });
      return taskId; // degradação graciosa
    }

    try {
      // Store task data
      await this.redis.hset(
        `${this.TASK_DATA_PREFIX}${taskId}`,
        "data",
        JSON.stringify(fullTask),
      );

      // Add to pending queue with priority
      const priority = task.priority || TaskPriority.NORMAL;
      await this.redis.zadd(
        this.PENDING_QUEUE,
        priority * 1000 + Date.now(),
        taskId,
      );

      // Emit event
      await this.publishTaskEvent("task.added", { taskId, task: fullTask });

      logger.info(`Task added to queue: ${taskId} (${task.type})`, "TaskQueue");
      return taskId;
    } catch (error: unknown) {
      logger.error(`Failed to add task ${taskId}`, "TaskQueue", { error });
      return taskId; // degradação graciosa em vez de throw
    }
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    if (!this.redis) {
      logger.warn("Redis unavailable - task not retrieved", "TaskQueue", {
        taskId,
      });
      return null;
    }

    try {
      const taskData = await this.redis.hget(
        `${this.TASK_DATA_PREFIX}${taskId}`,
        "data",
      );
      if (!taskData) return null;

      return JSON.parse(taskData);
    } catch (error: unknown) {
      logger.error(`Failed to get task ${taskId}`, "TaskQueue", { error });
      return null;
    }
  }

  /**
   * Update task status and progress
   */
  async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
    if (!this.redis) {
      logger.warn("Redis unavailable - task not updated", "TaskQueue", {
        taskId,
      });
      return;
    }

    try {
      const currentTask = await this.getTask(taskId);
      if (!currentTask) {
        logger.warn(`Task ${taskId} not found`, "TaskQueue");
        return;
      }

      const updatedTask: Task = {
        ...currentTask,
        ...updates,
      };

      // Update task data
      await this.redis.hset(
        `${this.TASK_DATA_PREFIX}${taskId}`,
        "data",
        JSON.stringify(updatedTask),
      );

      // Move between queues based on status
      await this.moveTaskBetweenQueues(
        taskId,
        currentTask.status,
        updatedTask.status,
      );

      // Emit event
      await this.publishTaskEvent("task.updated", {
        taskId,
        task: updatedTask,
        changes: updates,
      });
    } catch (error: unknown) {
      logger.error(`Failed to update task ${taskId}`, "TaskQueue", { error });
      // Não fazer throw - permite aplicação continuar
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (task.status === TaskStatus.RUNNING) {
        // Send cancellation signal to worker
        const worker = this.workers.get(taskId);
        if (worker) {
          await worker.cancel();
        }
      }

      await this.updateTask(taskId, {
        status: TaskStatus.CANCELLED,
        completedAt: new Date(),
        error: reason
          ? {
              message: reason,
              timestamp: new Date(),
              retryable: false,
            }
          : undefined,
      });
    } catch (error: unknown) {
      console.error(` Failed to cancel task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Get tasks by status with pagination
   */
  async getTasks(
    status?: TaskStatus,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ tasks: Task[]; total: number }> {
    if (!this.redis) {
      logger.warn("Redis unavailable - no tasks retrieved", "TaskQueue");
      return { tasks: [], total: 0 };
    }

    try {
      let queueName: string;

      switch (status) {
        case TaskStatus.PENDING:
          queueName = this.PENDING_QUEUE;
          break;
        case TaskStatus.RUNNING:
          queueName = this.RUNNING_QUEUE;
          break;
        case TaskStatus.COMPLETED:
          queueName = this.COMPLETED_QUEUE;
          break;
        case TaskStatus.FAILED:
          queueName = this.FAILED_QUEUE;
          break;
        default:
          // Get all tasks
          const allTasks: Task[] = [];
          const allQueues = [
            this.PENDING_QUEUE,
            this.RUNNING_QUEUE,
            this.COMPLETED_QUEUE,
            this.FAILED_QUEUE,
          ];

          for (const queue of allQueues) {
            const taskIds = await this.redis.zrange(queue, 0, -1);
            for (const taskId of taskIds) {
              const task = await this.getTask(taskId);
              if (task) allTasks.push(task);
            }
          }

          // Sort by created date
          allTasks.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );

          return {
            tasks: allTasks.slice(offset, offset + limit),
            total: allTasks.length,
          };
      }

      // Get tasks from specific queue
      const total = await this.redis.zcard(queueName);
      const taskIds = await this.redis.zrange(
        queueName,
        offset,
        offset + limit - 1,
      );

      const tasks: Task[] = [];
      for (const taskId of taskIds) {
        const task = await this.getTask(taskId);
        if (task) tasks.push(task);
      }

      return { tasks, total };
    } catch (error: unknown) {
      console.error(" Failed to get tasks:", error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    running: number;
    completed: number;
    failed: number;
    deadLetter: number;
    totalProcessed: number;
    avgProcessingTime: number;
  }> {
    if (!this.redis) {
      return {
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        deadLetter: 0,
        totalProcessed: 0,
        avgProcessingTime: 0,
      };
    }

    try {
      const [pending, running, completed, failed, deadLetter] =
        await Promise.all([
          this.redis.zcard(this.PENDING_QUEUE),
          this.redis.zcard(this.RUNNING_QUEUE),
          this.redis.zcard(this.COMPLETED_QUEUE),
          this.redis.zcard(this.FAILED_QUEUE),
          this.redis.zcard(this.DEAD_LETTER_QUEUE),
        ]);

      const totalProcessed = completed + failed;

      // Calculate average processing time from recent completed tasks
      const recentCompleted = await this.redis.zrange(
        this.COMPLETED_QUEUE,
        -100,
        -1,
      );
      let avgProcessingTime = 0;

      if (recentCompleted.length > 0) {
        let totalTime = 0;
        let count = 0;

        for (const taskId of recentCompleted) {
          const task = await this.getTask(taskId);
          if (task?.startedAt && task?.completedAt) {
            totalTime += task.completedAt.getTime() - task.startedAt.getTime();
            count++;
          }
        }

        avgProcessingTime = count > 0 ? totalTime / count : 0;
      }

      return {
        pending,
        running,
        completed,
        failed,
        deadLetter,
        totalProcessed,
        avgProcessingTime: Math.round(avgProcessingTime),
      };
    } catch (error: unknown) {
      console.error(" Failed to get queue stats:", error);
      throw error;
    }
  }

  /**
   * Start processing tasks
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(` Starting TaskQueue with ${this.options.concurrency} workers`);

    // Start workers
    for (let i = 0; i < this.options.concurrency; i++) {
      this.startWorker(`worker_${i}`);
    }

    // Start cleanup timer
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.options.cleanupInterval,
    );

    this.emit("started");
  }

  /**
   * Stop processing tasks
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log(" Stopping TaskQueue...");
    this.isRunning = false;

    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Stop all workers
    const stopPromises = Array.from(this.workers.values()).map((worker) =>
      worker.stop(),
    );
    await Promise.all(stopPromises);

    this.workers.clear();

    // Disconnect from shared Redis connections
    await redisConnectionManager.disconnect();
    this.redis = null;
    this.subscriber = null;

    this.emit("stopped");
    logger.info("TaskQueue stopped (shared connections)", "TaskQueue");
  }

  // Private Methods

  private async startWorker(workerId: string): Promise<void> {
    const worker = new TaskWorker(workerId, this);
    this.workers.set(workerId, worker);
    await worker.start();
  }

  private async moveTaskBetweenQueues(
    taskId: string,
    oldStatus: TaskStatus,
    newStatus: TaskStatus,
  ): Promise<void> {
    const getQueueName = (status: TaskStatus): string => {
      switch (status) {
        case TaskStatus.PENDING:
          return this.PENDING_QUEUE;
        case TaskStatus.RUNNING:
          return this.RUNNING_QUEUE;
        case TaskStatus.COMPLETED:
          return this.COMPLETED_QUEUE;
        case TaskStatus.FAILED:
          return this.FAILED_QUEUE;
        default:
          return this.PENDING_QUEUE;
      }
    };

    const oldQueue = getQueueName(oldStatus);
    const newQueue = getQueueName(newStatus);

    if (oldQueue !== newQueue && this.redis) {
      await Promise.all([
        this.redis.zrem(oldQueue, taskId),
        this.redis.zadd(newQueue, Date.now(), taskId),
      ]);
    }
  }

  private async publishTaskEvent(event: string, data: any): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.publish(
        "task:events",
        JSON.stringify({
          event,
          data,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error: unknown) {
      logger.error("Failed to publish task event", "TaskQueue", { error });
    }
  }

  private async cleanup(): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago

      // Remove old completed tasks
      await this.redis.zremrangebyscore(this.COMPLETED_QUEUE, 0, cutoffTime);

      // Remove old failed tasks
      await this.redis.zremrangebyscore(this.FAILED_QUEUE, 0, cutoffTime);

      logger.info("TaskQueue cleanup completed", "TaskQueue");
    } catch (error: unknown) {
      logger.error("TaskQueue cleanup failed", "TaskQueue", { error });
    }
  }

  async getNextTask(): Promise<Task | null> {
    if (!this.redis) {
      return null;
    }

    try {
      // Get highest priority pending task
      const taskData = await this.redis.zpopmax(this.PENDING_QUEUE);
      if (!taskData || taskData.length === 0) return null;

      const taskId = taskData[0];
      const task = await this.getTask(taskId);

      if (task) {
        // Move to running queue
        await this.redis.zadd(this.RUNNING_QUEUE, Date.now(), taskId);
      }

      return task;
    } catch (error: unknown) {
      logger.error("Failed to get next task", "TaskQueue", { error });
      return null;
    }
  }
}

/**
 * Task Worker - Processes individual tasks
 */
export class TaskWorker {
  private workerId: string;
  private queue: TaskQueue;
  private isRunning: boolean = false;
  private currentTask?: Task;
  private processingLoop?: Promise<void>;

  constructor(workerId: string, queue: TaskQueue) {
    this.workerId = workerId;
    this.queue = queue;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`👷 Worker ${this.workerId} started`);

    this.processingLoop = this.processLoop();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Wait for current task to finish or timeout
    if (this.processingLoop) {
      await Promise.race([
        this.processingLoop,
        new Promise((resolve) => setTimeout(resolve, 30000)), // 30s timeout
      ]);
    }

    console.log(`👷 Worker ${this.workerId} stopped`);
  }

  async cancel(): Promise<void> {
    if (this.currentTask) {
      console.log(
        `⏹️ Cancelling task ${this.currentTask.id} on worker ${this.workerId}`,
      );
      // Implementation depends on task type
      // For now, just mark as cancelled
      await this.queue.updateTask(this.currentTask.id, {
        status: TaskStatus.CANCELLED,
        completedAt: new Date(),
      });
    }
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const task = await this.queue.getNextTask();

        if (!task) {
          // No tasks available, wait a bit
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        this.currentTask = task;
        await this.processTask(task);
        this.currentTask = undefined;
      } catch (error: unknown) {
        console.error(` Worker ${this.workerId} error:`, error);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before retrying
      }
    }
  }

  private async processTask(task: Task): Promise<void> {
    console.log(
      ` Worker ${this.workerId} processing task ${task.id} (${task.type})`,
    );

    try {
      // Mark task as running
      await this.queue.updateTask(task.id, {
        status: TaskStatus.RUNNING,
        startedAt: new Date(),
      });

      // Process based on task type
      const result = await this.executeTask(task);

      // Mark as completed
      await this.queue.updateTask(task.id, {
        status: TaskStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
        result,
      });

      console.log(` Task ${task.id} completed by worker ${this.workerId}`);
    } catch (error: unknown) {
      console.error(
        ` Task ${task.id} failed on worker ${this.workerId}:`,
        error,
      );

      const taskError: TaskError = {
        message: (error as Error).message,
        stack: (error as Error).stack,
        timestamp: new Date(),
        retryable: this.isRetryableError(error as Error),
      };

      // Check if should retry
      if (task.retryCount < task.maxRetries && taskError.retryable) {
        // Schedule retry
        await this.queue.updateTask(task.id, {
          status: TaskStatus.RETRYING,
          retryCount: task.retryCount + 1,
          error: taskError,
        });

        // Re-add to pending queue with delay
        setTimeout(async () => {
          await this.queue.updateTask(task.id, { status: TaskStatus.PENDING });
        }, this.getRetryDelay(task.retryCount));
      } else {
        // Mark as failed
        await this.queue.updateTask(task.id, {
          status: TaskStatus.FAILED,
          completedAt: new Date(),
          error: taskError,
        });
      }
    }
  }

  private async executeTask(task: Task): Promise<any> {
    // Mock implementation - in real usage, this would call specific task handlers
    switch (task.type) {
      case TaskType.PARQUET_EXPORT:
        return this.executeParquetExport(task);
      case TaskType.PIPELINE_EXECUTION:
        return this.executePipeline(task);
      case TaskType.DATA_SYNC:
        return this.executeDataSync(task);
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async executeParquetExport(task: Task): Promise<any> {
    // Mock implementation
    for (let i = 0; i <= 100; i += 10) {
      await this.queue.updateTask(task.id, { progress: i });
      await new Promise((resolve) => setTimeout(resolve, 200)); // Simulate work
    }
    return { exported: 1000, fileSize: "2.5MB", format: "parquet" };
  }

  private async executePipeline(task: Task): Promise<any> {
    // Mock implementation
    for (let i = 0; i <= 100; i += 5) {
      await this.queue.updateTask(task.id, { progress: i });
      await new Promise((resolve) => setTimeout(resolve, 300)); // Simulate work
    }
    return { processed: 5000, pipeline: task.data.pipelineId };
  }

  private async executeDataSync(task: Task): Promise<any> {
    // Mock implementation
    for (let i = 0; i <= 100; i += 20) {
      await this.queue.updateTask(task.id, { progress: i });
      await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate work
    }
    return { synced: true, records: 2500 };
  }

  private isRetryableError(error: any): boolean {
    // Network errors, timeouts, etc. are retryable
    // Logic errors, validation errors are not
    return (
      !error.message.includes("validation") &&
      !error.message.includes("invalid") &&
      !error.message.includes("unauthorized")
    );
  }

  private getRetryDelay(retryCount: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    return Math.min(1000 * Math.pow(2, retryCount), 30000);
  }
}

export default TaskQueue;
