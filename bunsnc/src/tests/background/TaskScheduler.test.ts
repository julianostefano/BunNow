/**
 * Task Scheduler Test Suite - Testing Cron-based Auto-Sync Scheduling
 * Validates the scheduling system for 5-minute auto-sync intervals
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  mock,
  spyOn,
} from "bun:test";
import {
  TaskScheduler,
  type ScheduledTask,
  type ScheduleOptions,
} from "../../background/TaskScheduler";
import { TaskQueue, TaskType, TaskPriority } from "../../background/TaskQueue";

// Mock Redis client for TaskScheduler
const mockRedisClient = {
  connect: mock(),
  disconnect: mock(),
  hSet: mock(),
  hGetAll: mock(),
  hDel: mock(),
  set: mock(),
  del: mock(),
  ping: mock(),
};

// Mock TaskQueue for scheduler integration
const mockTaskQueue = {
  addTask: mock(),
  getStats: mock(() => ({
    pending: 0,
    processing: 0,
    completed: 5,
    failed: 0,
  })),
  start: mock(),
  stop: mock(),
} as unknown as TaskQueue;

// Mock Redis configuration
const mockRedisConfig = {
  host: "localhost",
  port: 6379,
  password: "test",
  db: 1,
};

// Mock scheduled task data
const mockAutoSyncTask: ScheduleOptions = {
  name: "ServiceNow Auto-Sync",
  description: "Automatic synchronization of ServiceNow data every 5 minutes",
  cronExpression: "*/5 * * * *", // Every 5 minutes
  taskType: TaskType.SYNC,
  taskData: {
    tables: ["incident", "change_task", "sc_task"],
    batchSize: 50,
    enableDeltaSync: true,
    enableRealTimeUpdates: true,
  },
  priority: TaskPriority.HIGH,
  maxRetries: 3,
  timeout: 300000, // 5 minutes
  enabled: true,
  tags: ["auto-sync", "servicenow", "data-sync"],
  createdBy: "system",
};

describe("TaskScheduler - Auto-Sync Scheduling Tests", () => {
  let taskScheduler: TaskScheduler;
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;
  let mockIntervalId: number;
  let intervalCallbacks: Map<number, () => void> = new Map();

  beforeAll(() => {
    // Mock global timers for testing
    originalSetInterval = globalThis.setInterval;
    originalClearInterval = globalThis.clearInterval;

    globalThis.setInterval = mock((callback: () => void, interval: number) => {
      mockIntervalId = Math.floor(Math.random() * 1000);
      intervalCallbacks.set(mockIntervalId, callback);
      return mockIntervalId as any;
    });

    globalThis.clearInterval = mock((id: any) => {
      intervalCallbacks.delete(id);
    });
  });

  afterAll(() => {
    // Restore original timers
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });

  beforeEach(async () => {
    // Setup mock responses
    mockRedisClient.connect.mockResolvedValue(void 0);
    mockRedisClient.hSet.mockResolvedValue(1);
    mockRedisClient.hGetAll.mockResolvedValue({});
    mockRedisClient.set.mockResolvedValue("OK");
    mockRedisClient.ping.mockResolvedValue("PONG");

    mockTaskQueue.addTask.mockResolvedValue("task-123");

    // Mock the Redis connection creation
    const originalTaskScheduler = TaskScheduler;
    spyOn(
      originalTaskScheduler.prototype as any,
      "initializeRedis",
    ).mockResolvedValue(void 0);

    // Initialize TaskScheduler
    taskScheduler = new TaskScheduler(mockTaskQueue, mockRedisConfig);

    // Override redis property to use mock
    (taskScheduler as any).redis = mockRedisClient;
  });

  afterEach(async () => {
    // Cleanup after each test
    try {
      if (taskScheduler) {
        await taskScheduler.stop();
      }
    } catch (error) {
      // Ignore cleanup errors in tests
    }

    // Clear interval callbacks
    intervalCallbacks.clear();
  });

  describe("Auto-Sync Task Scheduling", () => {
    it("should schedule auto-sync task with 5-minute cron expression", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);

      expect(taskId).toBeDefined();
      expect(taskId).toMatch(/^scheduled_\d+_[a-z0-9]+$/);

      // Verify Redis storage
      expect(mockRedisClient.hSet).toHaveBeenCalledWith(
        "scheduler:tasks",
        taskId,
        expect.stringContaining("ServiceNow Auto-Sync"),
      );
    });

    it("should calculate correct next run time for 5-minute intervals", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);
      const scheduledTask = taskScheduler.getScheduledTask(taskId);

      expect(scheduledTask).toBeDefined();
      expect(scheduledTask!.nextRun).toBeDefined();
      expect(scheduledTask!.cronExpression).toBe("*/5 * * * *");

      // Next run should be within the next 5 minutes
      const now = new Date();
      const nextRun = scheduledTask!.nextRun!;
      const timeDiff = nextRun.getTime() - now.getTime();

      expect(timeDiff).toBeGreaterThan(0);
      expect(timeDiff).toBeLessThanOrEqual(300000); // 5 minutes
    });

    it("should support different auto-sync intervals", async () => {
      const customIntervals = [
        { cron: "*/1 * * * *", description: "Every minute" },
        { cron: "*/5 * * * *", description: "Every 5 minutes" },
        { cron: "*/15 * * * *", description: "Every 15 minutes" },
        { cron: "0 */1 * * *", description: "Every hour" },
      ];

      for (const interval of customIntervals) {
        const taskOptions = {
          ...mockAutoSyncTask,
          name: `Auto-Sync ${interval.description}`,
          cronExpression: interval.cron,
        };

        const taskId = await taskScheduler.schedule(taskOptions);
        const scheduledTask = taskScheduler.getScheduledTask(taskId);

        expect(scheduledTask).toBeDefined();
        expect(scheduledTask!.cronExpression).toBe(interval.cron);
        expect(scheduledTask!.nextRun).toBeDefined();
      }
    });

    it("should handle auto-sync task data correctly", async () => {
      const customAutoSyncData = {
        ...mockAutoSyncTask,
        taskData: {
          tables: ["incident"],
          batchSize: 25,
          enableDeltaSync: false,
          enableSLMCollection: true,
          enableNotesCollection: false,
          conflictResolutionStrategy: "servicenow_wins",
        },
      };

      const taskId = await taskScheduler.schedule(customAutoSyncData);
      const scheduledTask = taskScheduler.getScheduledTask(taskId);

      expect(scheduledTask!.taskData).toEqual(customAutoSyncData.taskData);
      expect(scheduledTask!.taskData.tables).toEqual(["incident"]);
      expect(scheduledTask!.taskData.batchSize).toBe(25);
      expect(scheduledTask!.taskData.enableDeltaSync).toBe(false);
    });
  });

  describe("Auto-Sync Task Execution", () => {
    it("should execute auto-sync task when scheduled time arrives", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);

      // Start the scheduler
      await taskScheduler.start();

      // Mock that the task should run now
      const scheduledTask = taskScheduler.getScheduledTask(taskId)!;
      scheduledTask.nextRun = new Date(Date.now() - 1000); // 1 second ago
      scheduledTask.enabled = true;

      // Mock Redis lock acquisition
      mockRedisClient.set.mockResolvedValueOnce("OK");
      mockRedisClient.del.mockResolvedValue(1);

      // Trigger scheduler check
      const checkCallback = intervalCallbacks.get(mockIntervalId);
      expect(checkCallback).toBeDefined();

      if (checkCallback) {
        await checkCallback();
      }

      // Verify task was added to queue
      expect(mockTaskQueue.addTask).toHaveBeenCalledWith({
        type: TaskType.SYNC,
        data: expect.objectContaining({
          tables: ["incident", "change_task", "sc_task"],
          scheduledTaskId: taskId,
          scheduledTaskName: "ServiceNow Auto-Sync",
        }),
        priority: TaskPriority.HIGH,
        maxRetries: 3,
        metadata: expect.objectContaining({
          createdBy: "scheduler",
          parentTaskId: taskId,
          tags: ["auto-sync", "servicenow", "data-sync"],
        }),
      });
    });

    it("should update task statistics after execution", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);
      const originalTask = taskScheduler.getScheduledTask(taskId)!;

      // Mock successful execution
      await taskScheduler.triggerTask(taskId);

      // Verify task statistics were updated
      expect(mockRedisClient.hSet).toHaveBeenCalledWith(
        "scheduler:tasks",
        taskId,
        expect.stringContaining('"runCount":1'),
      );
    });

    it("should handle auto-sync task execution failures", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);

      // Mock task queue failure
      mockTaskQueue.addTask.mockRejectedValueOnce(new Error("Queue full"));

      await expect(taskScheduler.triggerTask(taskId)).rejects.toThrow(
        "Queue full",
      );

      // Verify fail count was updated
      expect(mockRedisClient.hSet).toHaveBeenCalledWith(
        "scheduler:tasks",
        taskId,
        expect.stringContaining('"failCount":1'),
      );
    });

    it("should schedule next auto-sync run after execution", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);
      const originalNextRun = taskScheduler.getScheduledTask(taskId)!.nextRun;

      await taskScheduler.triggerTask(taskId);

      const updatedTask = taskScheduler.getScheduledTask(taskId)!;
      expect(updatedTask.nextRun).toBeDefined();
      expect(updatedTask.nextRun!.getTime()).toBeGreaterThan(
        originalNextRun!.getTime(),
      );
    });
  });

  describe("Auto-Sync Task Management", () => {
    it("should enable and disable auto-sync tasks", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);

      // Disable task
      await taskScheduler.setTaskEnabled(taskId, false);
      let task = taskScheduler.getScheduledTask(taskId)!;
      expect(task.enabled).toBe(false);

      // Enable task
      await taskScheduler.setTaskEnabled(taskId, true);
      task = taskScheduler.getScheduledTask(taskId)!;
      expect(task.enabled).toBe(true);
    });

    it("should update auto-sync task configuration", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);

      const updates = {
        cronExpression: "*/10 * * * *", // Change to 10 minutes
        taskData: {
          ...mockAutoSyncTask.taskData,
          batchSize: 100,
        },
      };

      await taskScheduler.updateScheduledTask(taskId, updates);

      const updatedTask = taskScheduler.getScheduledTask(taskId)!;
      expect(updatedTask.cronExpression).toBe("*/10 * * * *");
      expect(updatedTask.taskData.batchSize).toBe(100);
      expect(updatedTask.nextRun).toBeDefined(); // Should recalculate next run
    });

    it("should unschedule auto-sync tasks", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);
      expect(taskScheduler.getScheduledTask(taskId)).toBeDefined();

      await taskScheduler.unschedule(taskId);
      expect(taskScheduler.getScheduledTask(taskId)).toBeUndefined();

      // Verify Redis deletion
      expect(mockRedisClient.hDel).toHaveBeenCalledWith(
        "scheduler:tasks",
        taskId,
      );
    });

    it("should list all scheduled auto-sync tasks", async () => {
      const task1Id = await taskScheduler.schedule({
        ...mockAutoSyncTask,
        name: "Auto-Sync Incidents",
        taskData: { ...mockAutoSyncTask.taskData, tables: ["incident"] },
      });

      const task2Id = await taskScheduler.schedule({
        ...mockAutoSyncTask,
        name: "Auto-Sync Change Tasks",
        taskData: { ...mockAutoSyncTask.taskData, tables: ["change_task"] },
      });

      const allTasks = taskScheduler.getScheduledTasks();
      expect(allTasks).toHaveLength(2);
      expect(allTasks.map((t) => t.id)).toContain(task1Id);
      expect(allTasks.map((t) => t.id)).toContain(task2Id);
    });
  });

  describe("Cron Expression Validation", () => {
    it("should validate common auto-sync cron expressions", () => {
      const validExpressions = [
        "*/5 * * * *", // Every 5 minutes
        "*/15 * * * *", // Every 15 minutes
        "*/30 * * * *", // Every 30 minutes
        "0 * * * *", // Every hour
        "0 */6 * * *", // Every 6 hours
        "0 0 * * *", // Daily
      ];

      for (const expr of validExpressions) {
        expect(TaskScheduler.validateCronExpression(expr)).toBe(true);
      }
    });

    it("should reject invalid cron expressions", () => {
      const invalidExpressions = [
        "invalid",
        "* * * *", // Too few parts
        "* * * * * *", // Too many parts
        "", // Empty
      ];

      for (const expr of invalidExpressions) {
        expect(TaskScheduler.validateCronExpression(expr)).toBe(false);
      }
    });

    it("should provide common cron expression templates", () => {
      const expressions = TaskScheduler.getCommonExpressions();

      expect(expressions["Every 5 minutes"]).toBe("*/5 * * * *");
      expect(expressions["Every 15 minutes"]).toBe("*/15 * * * *");
      expect(expressions["Every hour"]).toBe("0 * * * *");
      expect(expressions["Daily at midnight"]).toBe("0 0 * * *");
    });
  });

  describe("Scheduler Statistics", () => {
    it("should provide accurate scheduler statistics", async () => {
      // Schedule multiple auto-sync tasks
      await taskScheduler.schedule({
        ...mockAutoSyncTask,
        name: "Auto-Sync 1",
        enabled: true,
      });

      await taskScheduler.schedule({
        ...mockAutoSyncTask,
        name: "Auto-Sync 2",
        enabled: false,
      });

      const stats = taskScheduler.getStats();

      expect(stats.totalTasks).toBe(2);
      expect(stats.enabledTasks).toBe(1);
      expect(stats.disabledTasks).toBe(1);
      expect(stats.nextRun).toBeDefined();
    });

    it("should track task execution statistics", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);

      // Simulate successful execution
      await taskScheduler.triggerTask(taskId);

      const stats = taskScheduler.getStats();
      expect(stats.totalRuns).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Redis Persistence", () => {
    it("should persist scheduled tasks to Redis", async () => {
      const taskId = await taskScheduler.schedule(mockAutoSyncTask);

      expect(mockRedisClient.hSet).toHaveBeenCalledWith(
        "scheduler:tasks",
        taskId,
        expect.any(String),
      );

      // Verify the stored data includes all task properties
      const storedData = mockRedisClient.hSet.mock.calls.find(
        (call) => call[1] === taskId,
      )?.[2];

      expect(storedData).toBeDefined();
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        expect(parsedData.name).toBe("ServiceNow Auto-Sync");
        expect(parsedData.cronExpression).toBe("*/5 * * * *");
        expect(parsedData.taskType).toBe(TaskType.SYNC);
      }
    });

    it("should load scheduled tasks from Redis on initialization", async () => {
      const existingTasks = {
        "task-1": JSON.stringify({
          id: "task-1",
          name: "Existing Auto-Sync",
          cronExpression: "*/5 * * * *",
          taskType: TaskType.SYNC,
          taskData: { tables: ["incident"] },
          priority: TaskPriority.HIGH,
          enabled: true,
          runCount: 0,
          failCount: 0,
          maxRetries: 3,
          timeout: 300000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      };

      mockRedisClient.hGetAll.mockResolvedValueOnce(existingTasks);

      // Create new scheduler instance to test loading
      const newScheduler = new TaskScheduler(mockTaskQueue, mockRedisConfig);
      (newScheduler as any).redis = mockRedisClient;

      // Simulate loading existing tasks
      await (newScheduler as any).loadScheduledTasks();

      const loadedTask = newScheduler.getScheduledTask("task-1");
      expect(loadedTask).toBeDefined();
      expect(loadedTask!.name).toBe("Existing Auto-Sync");
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should handle Redis connection failures gracefully", async () => {
      mockRedisClient.hSet.mockRejectedValueOnce(
        new Error("Redis connection failed"),
      );

      await expect(taskScheduler.schedule(mockAutoSyncTask)).rejects.toThrow(
        "Redis connection failed",
      );
    });

    it("should handle scheduler lock contention", async () => {
      await taskScheduler.start();

      // Mock lock already acquired by another scheduler
      mockRedisClient.set.mockResolvedValueOnce(null);

      const checkCallback = intervalCallbacks.get(mockIntervalId);
      if (checkCallback) {
        await checkCallback();
      }

      // Should not execute tasks when lock is not acquired
      expect(mockTaskQueue.addTask).not.toHaveBeenCalled();
    });

    it("should release scheduler lock on errors", async () => {
      await taskScheduler.start();

      // Mock Redis error during task execution
      mockRedisClient.set.mockResolvedValueOnce("OK");
      mockTaskQueue.addTask.mockRejectedValueOnce(
        new Error("Task queue error"),
      );

      const checkCallback = intervalCallbacks.get(mockIntervalId);
      if (checkCallback) {
        await checkCallback();
      }

      // Should release lock even on error
      expect(mockRedisClient.del).toHaveBeenCalledWith("scheduler:lock");
    });
  });
});

// Bun test compatibility helpers
if (typeof mock === "undefined") {
  (globalThis as any).mock = (implementation?: Function) => {
    const mockFn = implementation || (() => {});
    (mockFn as any).mock = { calls: [], results: [] };
    (mockFn as any).mockResolvedValue = (value: any) => {
      (mockFn as any).mockImplementation = () => Promise.resolve(value);
      return mockFn;
    };
    (mockFn as any).mockResolvedValueOnce = (value: any) => {
      (mockFn as any).mockImplementationOnce = () => Promise.resolve(value);
      return mockFn;
    };
    (mockFn as any).mockRejectedValue = (error: any) => {
      (mockFn as any).mockImplementation = () => Promise.reject(error);
      return mockFn;
    };
    (mockFn as any).mockRejectedValueOnce = (error: any) => {
      (mockFn as any).mockImplementationOnce = () => Promise.reject(error);
      return mockFn;
    };
    return mockFn;
  };
}

if (typeof spyOn === "undefined") {
  (globalThis as any).spyOn = (object: any, method: string) => {
    const original = object[method];
    const mockFn = mock(original);
    object[method] = mockFn;
    return mockFn;
  };
}
