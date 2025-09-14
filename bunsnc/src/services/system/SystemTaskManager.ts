/**
 * System Task Manager - Simplified task management
 * Consolidates functionality from TaskManager with simpler interface
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/Logger';

export interface Task {
  id: string;
  type: string;
  data: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
  retries: number;
  maxRetries: number;
}

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  taskType: string;
  taskData: Record<string, any>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
}

export class SystemTaskManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private isRunning = false;
  private processingInterval?: Timer;
  private scheduleInterval?: Timer;
  private config: any;
  private taskCounter = 0;

  constructor(config: any) {
    super();
    this.config = config;
  }

  /**
   * Initialize task manager
   */
  async initialize(): Promise<void> {
    try {
      logger.info('📋 [SystemTasks] Initializing task manager...');
      // Initialize any required resources
      logger.info('✅ [SystemTasks] Task manager initialized');
    } catch (error) {
      logger.error('❌ [SystemTasks] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Start task processing
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('🚀 [SystemTasks] Starting task processing...');

    // Process pending tasks every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processPendingTasks();
    }, 5000);

    // Check scheduled tasks every minute
    this.scheduleInterval = setInterval(() => {
      this.processScheduledTasks();
    }, 60000);

    logger.info('✅ [SystemTasks] Task processing started');
  }

  /**
   * Stop task processing
   */
  async stop(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
      this.scheduleInterval = undefined;
    }

    this.isRunning = false;
    logger.info('🛑 [SystemTasks] Task processing stopped');
  }

  /**
   * Add a task to the queue
   */
  async addTask(type: string, data: Record<string, any>, options?: {
    priority?: 'low' | 'normal' | 'high' | 'critical';
    maxRetries?: number;
    tags?: string[];
  }): Promise<string> {
    const taskId = `task_${++this.taskCounter}_${Date.now()}`;

    const task: Task = {
      id: taskId,
      type,
      data,
      status: 'pending',
      priority: options?.priority || 'normal',
      createdAt: new Date(),
      retries: 0,
      maxRetries: options?.maxRetries || 3
    };

    this.tasks.set(taskId, task);
    this.emit('taskAdded', { taskId, task });

    logger.debug(`📝 [SystemTasks] Task added: ${taskId} (${type})`);
    return taskId;
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status === 'running') {
      logger.warn(`⚠️ [SystemTasks] Cannot cancel running task: ${taskId}`);
      return;
    }

    task.status = 'cancelled';
    task.error = reason || 'Cancelled by user';
    task.completedAt = new Date();

    this.emit('taskCancelled', { taskId, task, reason });
    logger.info(`🚫 [SystemTasks] Task cancelled: ${taskId}`);
  }

  /**
   * Process pending tasks
   */
  private async processPendingTasks(): Promise<void> {
    if (!this.isRunning) return;

    const pendingTasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'pending')
      .sort((a, b) => {
        // Sort by priority first, then by creation time
        const priorityOrder = { 'critical': 4, 'high': 3, 'normal': 2, 'low': 1 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];

        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }

        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    // Process tasks based on concurrency limit
    const concurrency = this.config.tasks?.concurrency || 3;
    const runningTasks = Array.from(this.tasks.values()).filter(task => task.status === 'running');
    const availableSlots = Math.max(0, concurrency - runningTasks.length);

    for (let i = 0; i < Math.min(availableSlots, pendingTasks.length); i++) {
      const task = pendingTasks[i];
      await this.executeTask(task);
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: Task): Promise<void> {
    try {
      task.status = 'running';
      task.startedAt = new Date();

      logger.debug(`🔄 [SystemTasks] Executing task: ${task.id} (${task.type})`);
      this.emit('taskStarted', { taskId: task.id, task });

      // Execute the task based on type
      const result = await this.performTaskOperation(task);

      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;

      const duration = task.completedAt.getTime() - task.startedAt!.getTime();

      this.emit('taskCompleted', {
        taskId: task.id,
        task,
        result,
        duration,
        taskType: task.type
      });

      logger.info(`✅ [SystemTasks] Task completed: ${task.id} in ${duration}ms`);

    } catch (error) {
      await this.handleTaskError(task, error);
    }
  }

  /**
   * Perform the actual task operation
   */
  private async performTaskOperation(task: Task): Promise<any> {
    // Simulate different task types
    switch (task.type) {
      case 'data_sync':
        return this.performDataSync(task.data);
      case 'cache_refresh':
        return this.performCacheRefresh(task.data);
      case 'report_generation':
        return this.performReportGeneration(task.data);
      case 'cleanup':
        return this.performCleanup(task.data);
      case 'backup':
        return this.performBackup(task.data);
      default:
        // Generic task processing
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
        return { success: true, processed: true };
    }
  }

  /**
   * Handle task execution errors
   */
  private async handleTaskError(task: Task, error: any): Promise<void> {
    task.retries++;
    task.error = error instanceof Error ? error.message : String(error);

    if (task.retries < task.maxRetries) {
      task.status = 'pending';
      logger.warn(`⚠️ [SystemTasks] Task failed, retrying (${task.retries}/${task.maxRetries}): ${task.id}`);

      // Add delay before retry
      setTimeout(() => {
        // Task will be picked up in next processing cycle
      }, this.config.tasks?.retryDelay || 5000);

    } else {
      task.status = 'failed';
      task.completedAt = new Date();

      logger.error(`❌ [SystemTasks] Task failed permanently: ${task.id} - ${task.error}`);
      this.emit('taskFailed', { taskId: task.id, task, error });
    }
  }

  /**
   * Schedule a recurring task
   */
  async scheduleTask(options: {
    name: string;
    cronExpression: string;
    taskType: string;
    taskData: Record<string, any>;
    enabled?: boolean;
  }): Promise<string> {
    const scheduleId = `schedule_${++this.taskCounter}_${Date.now()}`;

    const scheduledTask: ScheduledTask = {
      id: scheduleId,
      name: options.name,
      cronExpression: options.cronExpression,
      taskType: options.taskType,
      taskData: options.taskData,
      enabled: options.enabled !== false,
      runCount: 0
    };

    this.scheduledTasks.set(scheduleId, scheduledTask);
    logger.info(`📅 [SystemTasks] Task scheduled: ${options.name} (${options.cronExpression})`);

    return scheduleId;
  }

  /**
   * Process scheduled tasks
   */
  private processScheduledTasks(): void {
    const now = new Date();

    for (const [scheduleId, scheduledTask] of this.scheduledTasks) {
      if (!scheduledTask.enabled) continue;

      // Simple cron parsing - for production, use a proper cron library
      if (this.shouldRunScheduledTask(scheduledTask, now)) {
        this.executeScheduledTask(scheduledTask);
      }
    }
  }

  /**
   * Simple cron evaluation (basic implementation)
   */
  private shouldRunScheduledTask(scheduledTask: ScheduledTask, now: Date): boolean {
    if (!scheduledTask.lastRun) return true;

    // Simple interval-based scheduling
    const timeSinceLastRun = now.getTime() - scheduledTask.lastRun.getTime();

    // Parse basic cron expressions (simplified)
    if (scheduledTask.cronExpression.includes('* * * * *')) {
      return timeSinceLastRun >= 60000; // Every minute
    }

    if (scheduledTask.cronExpression.includes('0 * * * *')) {
      return timeSinceLastRun >= 3600000; // Every hour
    }

    if (scheduledTask.cronExpression.includes('0 0 * * *')) {
      return timeSinceLastRun >= 86400000; // Daily
    }

    return false;
  }

  /**
   * Execute a scheduled task
   */
  private async executeScheduledTask(scheduledTask: ScheduledTask): Promise<void> {
    try {
      scheduledTask.lastRun = new Date();
      scheduledTask.runCount++;

      const taskId = await this.addTask(scheduledTask.taskType, scheduledTask.taskData, {
        priority: 'normal'
      });

      logger.info(`🔄 [SystemTasks] Scheduled task executed: ${scheduledTask.name} -> ${taskId}`);

    } catch (error) {
      logger.error(`❌ [SystemTasks] Failed to execute scheduled task: ${scheduledTask.name}`, error);
    }
  }

  /**
   * Task operation implementations
   */
  private async performDataSync(data: any): Promise<any> {
    logger.debug(`🔄 [SystemTasks] Performing data sync with data:`, data);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { synced: true, recordsProcessed: Math.floor(Math.random() * 100) + 10 };
  }

  private async performCacheRefresh(data: any): Promise<any> {
    logger.debug(`🔄 [SystemTasks] Performing cache refresh`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { refreshed: true, cacheKeys: data.keys || ['default'] };
  }

  private async performReportGeneration(data: any): Promise<any> {
    logger.debug(`🔄 [SystemTasks] Generating report:`, data.reportType);
    await new Promise(resolve => setTimeout(resolve, 3000));
    return { reportGenerated: true, reportPath: `/tmp/reports/${data.reportType}_${Date.now()}.pdf` };
  }

  private async performCleanup(data: any): Promise<any> {
    logger.debug(`🔄 [SystemTasks] Performing cleanup`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return { cleaned: true, itemsRemoved: Math.floor(Math.random() * 50) };
  }

  private async performBackup(data: any): Promise<any> {
    logger.debug(`🔄 [SystemTasks] Performing backup`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    return { backedUp: true, backupSize: Math.floor(Math.random() * 1000) + 100 };
  }

  /**
   * Get task statistics
   */
  async getStats(): Promise<any> {
    const allTasks = Array.from(this.tasks.values());
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;
    const failedTasks = allTasks.filter(t => t.status === 'failed').length;
    const runningTasks = allTasks.filter(t => t.status === 'running').length;
    const pendingTasks = allTasks.filter(t => t.status === 'pending').length;

    const scheduledTaskCount = this.scheduledTasks.size;
    const enabledScheduledTasks = Array.from(this.scheduledTasks.values()).filter(t => t.enabled).length;

    return {
      total: totalTasks,
      completed: completedTasks,
      failed: failedTasks,
      running: runningTasks,
      pending: pendingTasks,
      active: runningTasks,
      success_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      scheduled_tasks: scheduledTaskCount,
      enabled_scheduled_tasks: enabledScheduledTasks,
      is_running: this.isRunning
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const stats = await this.getStats();
      return this.isRunning && stats.running < 100; // Prevent runaway tasks
    } catch (error) {
      logger.error('❌ [SystemTasks] Health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stop();

    // Cancel all running tasks
    for (const [taskId, task] of this.tasks) {
      if (task.status === 'running' || task.status === 'pending') {
        await this.cancelTask(taskId, 'System shutdown');
      }
    }

    this.tasks.clear();
    this.scheduledTasks.clear();
    logger.info('🧹 [SystemTasks] Cleanup completed');
  }
}