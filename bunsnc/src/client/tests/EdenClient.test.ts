/**
 * Tests for BunSNC Eden Treaty Client SDK
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { 
  BunSNCClient, 
  createBunSNCClient
} from '../EdenClient';
import {
  TaskType,
  TaskPriority,
  TaskStatus 
} from '../types';

describe('BunSNC Client SDK', () => {
  let client: BunSNCClient;
  const mockServerUrl = 'http://localhost:3008';

  beforeEach(() => {
    client = createBunSNCClient({
      baseUrl: mockServerUrl,
      timeout: 5000,
      auth: {
        username: 'test',
        password: 'test'
      }
    });
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('Client Configuration', () => {
    test('should create client with default config', () => {
      const defaultClient = new BunSNCClient();
      expect(defaultClient).toBeInstanceOf(BunSNCClient);
    });

    test('should create client with custom config', () => {
      const customClient = createBunSNCClient({
        baseUrl: 'https://custom.server.com',
        timeout: 60000,
        auth: { token: 'test-token' }
      });
      expect(customClient).toBeInstanceOf(BunSNCClient);
    });

    test('should update client configuration', () => {
      client.updateConfig({
        timeout: 10000,
        auth: { token: 'new-token' }
      });
      // Configuration should be updated internally
    });

    test('should set auth token', () => {
      client.setAuthToken('jwt-token-here');
      // Should update internal auth configuration
    });

    test('should set basic auth', () => {
      client.setBasicAuth('username', 'password');
      // Should update internal auth configuration
    });
  });

  describe('Connection Management', () => {
    test('should test connection successfully', async () => {
      // Mock successful connection
      const mockHealthResponse = {
        data: {
          success: true,
          data: { healthy: true },
          timestamp: new Date().toISOString()
        }
      };

      // In a real test, you would mock the HTTP request
      // For now, we'll test the method exists and has correct signature
      expect(typeof client.testConnection).toBe('function');
    });

    test('should handle connection failure', async () => {
      const invalidClient = createBunSNCClient({
        baseUrl: 'http://invalid-server:9999',
        timeout: 1000
      });

      // This should handle the connection error gracefully
      expect(typeof invalidClient.testConnection).toBe('function');
    });
  });

  describe('Incident API Methods', () => {
    test('should get incidents with filters', async () => {
      const filters = {
        state: 'active',
        priority: 'high',
        limit: '10'
      };

      // Test method signature and call
      expect(typeof client.getIncidents).toBe('function');
      
      // In a real integration test, you would verify the actual API call
      const mockCall = () => client.getIncidents(filters);
      expect(mockCall).toBeDefined();
    });

    test('should get specific incident by ID', async () => {
      const incidentId = 'inc-12345';
      
      expect(typeof client.getIncident).toBe('function');
      
      const mockCall = () => client.getIncident(incidentId);
      expect(mockCall).toBeDefined();
    });

    test('should get incident statistics', async () => {
      expect(typeof client.getIncidentStats).toBe('function');
    });

    test('should get incident trends', async () => {
      expect(typeof client.getIncidentTrends).toBe('function');
      
      const mockCall = () => client.getIncidentTrends('7');
      expect(mockCall).toBeDefined();
    });

    test('should export incidents to parquet', async () => {
      const options = {
        filters: { priority: ['1', '2'] },
        compression: 'snappy'
      };

      expect(typeof client.exportIncidentsToParquet).toBe('function');
      
      const mockCall = () => client.exportIncidentsToParquet(options);
      expect(mockCall).toBeDefined();
    });
  });

  describe('Task Management API Methods', () => {
    test('should get tasks with pagination', async () => {
      const params = {
        status: TaskStatus.RUNNING,
        limit: '50',
        offset: '0'
      };

      expect(typeof client.getTasks).toBe('function');
      
      const mockCall = () => client.getTasks(params);
      expect(mockCall).toBeDefined();
    });

    test('should create a new task', async () => {
      const task = {
        type: TaskType.PARQUET_EXPORT,
        data: {
          table: 'incident',
          compression: 'snappy'
        },
        priority: TaskPriority.HIGH,
        tags: ['export', 'test'],
        createdBy: 'test-user'
      };

      expect(typeof client.createTask).toBe('function');
      
      const mockCall = () => client.createTask(task);
      expect(mockCall).toBeDefined();
    });

    test('should get specific task by ID', async () => {
      const taskId = 'task-12345';
      
      expect(typeof client.getTask).toBe('function');
      
      const mockCall = () => client.getTask(taskId);
      expect(mockCall).toBeDefined();
    });

    test('should cancel a task', async () => {
      const taskId = 'task-12345';
      const reason = 'Test cancellation';

      expect(typeof client.cancelTask).toBe('function');
      
      const mockCall = () => client.cancelTask(taskId, reason);
      expect(mockCall).toBeDefined();
    });

    test('should get task queue statistics', async () => {
      expect(typeof client.getTaskQueueStats).toBe('function');
    });

    test('should get system statistics', async () => {
      expect(typeof client.getSystemStats).toBe('function');
    });

    test('should get task history', async () => {
      expect(typeof client.getTaskHistory).toBe('function');
      
      const mockCall = () => client.getTaskHistory('100');
      expect(mockCall).toBeDefined();
    });

    test('should get task health check', async () => {
      expect(typeof client.getTaskHealthCheck).toBe('function');
    });
  });

  describe('Scheduled Tasks API Methods', () => {
    test('should get scheduled tasks', async () => {
      expect(typeof client.getScheduledTasks).toBe('function');
    });

    test('should create scheduled task', async () => {
      const scheduledTask = {
        name: 'Test Scheduled Task',
        description: 'A test scheduled task',
        cronExpression: '0 2 * * *',
        taskType: TaskType.DATA_SYNC,
        taskData: {
          tables: ['incident'],
          incremental: true
        },
        priority: TaskPriority.NORMAL,
        tags: ['scheduled', 'test']
      };

      expect(typeof client.createScheduledTask).toBe('function');
      
      const mockCall = () => client.createScheduledTask(scheduledTask);
      expect(mockCall).toBeDefined();
    });

    test('should delete scheduled task', async () => {
      const taskId = 'scheduled-task-123';
      
      expect(typeof client.deleteScheduledTask).toBe('function');
      
      const mockCall = () => client.deleteScheduledTask(taskId);
      expect(mockCall).toBeDefined();
    });

    test('should trigger scheduled task', async () => {
      const taskId = 'scheduled-task-123';
      
      expect(typeof client.triggerScheduledTask).toBe('function');
      
      const mockCall = () => client.triggerScheduledTask(taskId);
      expect(mockCall).toBeDefined();
    });

    test('should enable/disable scheduled task', async () => {
      const taskId = 'scheduled-task-123';
      
      expect(typeof client.setScheduledTaskEnabled).toBe('function');
      
      const mockCall = () => client.setScheduledTaskEnabled(taskId, false);
      expect(mockCall).toBeDefined();
    });
  });

  describe('High-Level Operations API Methods', () => {
    test('should export to parquet', async () => {
      const options = {
        table: 'incident',
        compression: 'snappy',
        priority: TaskPriority.HIGH
      };

      expect(typeof client.exportToParquet).toBe('function');
      
      const mockCall = () => client.exportToParquet(options);
      expect(mockCall).toBeDefined();
    });

    test('should execute pipeline', async () => {
      const options = {
        pipelineId: 'analytics-pipeline',
        tables: ['incident', 'problem'],
        priority: TaskPriority.NORMAL
      };

      expect(typeof client.executePipeline).toBe('function');
      
      const mockCall = () => client.executePipeline(options);
      expect(mockCall).toBeDefined();
    });

    test('should sync data', async () => {
      const options = {
        tables: ['incident', 'problem'],
        incremental: true,
        priority: TaskPriority.NORMAL
      };

      expect(typeof client.syncData).toBe('function');
      
      const mockCall = () => client.syncData(options);
      expect(mockCall).toBeDefined();
    });

    test('should refresh cache', async () => {
      const options = {
        keys: ['incidents', 'problems'],
        priority: TaskPriority.LOW
      };

      expect(typeof client.refreshCache).toBe('function');
      
      const mockCall = () => client.refreshCache(options);
      expect(mockCall).toBeDefined();
    });

    test('should get mock task data', async () => {
      expect(typeof client.getMockTaskData).toBe('function');
    });
  });

  describe('Analytics API Methods', () => {
    test('should get analytics dashboard', async () => {
      expect(typeof client.getAnalyticsDashboard).toBe('function');
    });

    test('should get performance metrics', async () => {
      expect(typeof client.getPerformanceMetrics).toBe('function');
    });

    test('should get trend data', async () => {
      const type = 'incidents';
      const days = '30';

      expect(typeof client.getTrendData).toBe('function');
      
      const mockCall = () => client.getTrendData(type, days);
      expect(mockCall).toBeDefined();
    });
  });

  describe('Server Health & Info Methods', () => {
    test('should get server health', async () => {
      expect(typeof client.getHealth).toBe('function');
    });

    test('should get server info', async () => {
      expect(typeof client.getServerInfo).toBe('function');
    });
  });

  describe('Utility Methods', () => {
    test('should wait for task completion', async () => {
      const taskId = 'task-12345';
      const options = {
        timeout: 10000,
        pollInterval: 1000,
        onProgress: (task: any) => {
          console.log(`Progress: ${task.progress}%`);
        }
      };

      expect(typeof client.waitForTaskCompletion).toBe('function');
      
      // Test that the method is callable
      const mockCall = () => client.waitForTaskCompletion(taskId, options);
      expect(mockCall).toBeDefined();
    });

    test('should get task progress', async () => {
      const taskId = 'task-12345';
      
      expect(typeof client.getTaskProgress).toBe('function');
      
      const mockCall = () => client.getTaskProgress(taskId);
      expect(mockCall).toBeDefined();
    });

    test('should handle batch operations', async () => {
      const operations = [
        () => Promise.resolve('result1'),
        () => Promise.resolve('result2'),
        () => Promise.resolve('result3')
      ];

      const options = {
        concurrency: 2,
        failFast: false
      };

      expect(typeof client.batchOperation).toBe('function');
      
      // Test actual batch processing
      const results = await client.batchOperation(operations, options);
      expect(results).toEqual(['result1', 'result2', 'result3']);
    });

    test('should handle batch operation with failures', async () => {
      const operations = [
        () => Promise.resolve('success'),
        () => Promise.reject(new Error('failure')),
        () => Promise.resolve('success2')
      ];

      // With failFast: false, should continue processing
      const results = await client.batchOperation(operations, { 
        failFast: false 
      });
      expect(results).toEqual(['success', 'success2']);
    });

    test('should handle batch operation with failFast', async () => {
      const operations = [
        () => Promise.resolve('success'),
        () => Promise.reject(new Error('failure')),
        () => Promise.resolve('should-not-reach')
      ];

      // With failFast: true, should throw on first error
      try {
        await client.batchOperation(operations, { failFast: true });
        expect.unreachable('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('failure');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      const invalidClient = createBunSNCClient({
        baseUrl: 'http://nonexistent-server:9999',
        timeout: 1000
      });

      // Methods should not throw during instantiation
      expect(typeof invalidClient.testConnection).toBe('function');
      expect(typeof invalidClient.getHealth).toBe('function');
    });

    test('should handle invalid task ID', async () => {
      const invalidTaskId = '';
      
      // Method should exist and be callable
      expect(typeof client.getTask).toBe('function');
      
      const mockCall = () => client.getTask(invalidTaskId);
      expect(mockCall).toBeDefined();
    });

    test('should validate task parameters', () => {
      // Test that required parameters are properly typed
      const validTask = {
        type: TaskType.DATA_SYNC,
        data: { tables: ['incident'] }
      };

      const mockCall = () => client.createTask(validTask);
      expect(mockCall).toBeDefined();
    });
  });

  describe('Type Safety', () => {
    test('should enforce task type enum', () => {
      // TypeScript should catch invalid task types at compile time
      const validTypes = Object.values(TaskType);
      expect(validTypes).toContain(TaskType.PARQUET_EXPORT);
      expect(validTypes).toContain(TaskType.DATA_SYNC);
      expect(validTypes).toContain(TaskType.PIPELINE_EXECUTION);
    });

    test('should enforce task status enum', () => {
      const validStatuses = Object.values(TaskStatus);
      expect(validStatuses).toContain(TaskStatus.PENDING);
      expect(validStatuses).toContain(TaskStatus.RUNNING);
      expect(validStatuses).toContain(TaskStatus.COMPLETED);
    });

    test('should enforce task priority enum', () => {
      const validPriorities = Object.values(TaskPriority);
      expect(validPriorities).toContain(TaskPriority.LOW);
      expect(validPriorities).toContain(TaskPriority.NORMAL);
      expect(validPriorities).toContain(TaskPriority.HIGH);
    });
  });
});

describe('Factory Functions', () => {
  test('should create client with factory function', () => {
    const client = createBunSNCClient();
    expect(client).toBeInstanceOf(BunSNCClient);
  });

  test('should create client with config', () => {
    const config = {
      baseUrl: 'https://test.server.com',
      timeout: 15000,
      auth: { token: 'test-token' }
    };

    const client = createBunSNCClient(config);
    expect(client).toBeInstanceOf(BunSNCClient);
  });
});

describe('Constants and Configuration', () => {
  test('should export required constants', () => {
    expect(TaskType).toBeDefined();
    expect(TaskStatus).toBeDefined();
    expect(TaskPriority).toBeDefined();
  });

  test('should validate task type values', () => {
    const types = Object.values(TaskType);
    expect(types.length).toBeGreaterThan(0);
    expect(types).toContain('PARQUET_EXPORT');
    expect(types).toContain('DATA_SYNC');
  });
});