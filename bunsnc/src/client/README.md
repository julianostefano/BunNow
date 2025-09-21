# BunSNC Client SDK

A comprehensive, type-safe client SDK for interacting with the BunSNC ServiceNow Integration Platform. Built with Eden Treaty for full type safety and excellent developer experience.

## Features

- **🔒 Fully Type-Safe**: Built with Eden Treaty for complete type safety from client to server
- **🚀 Modern API**: Promise-based with async/await support
- **🔄 Real-time Monitoring**: Built-in task progress tracking and monitoring
- **⚡ High Performance**: Optimized for batch operations and concurrent requests
- **🛡️ Error Handling**: Comprehensive error handling with retry mechanisms
- **📊 Analytics**: Built-in analytics and performance monitoring
- **🔐 Flexible Auth**: Support for JWT tokens, basic auth, and custom authentication
- **📦 Zero Dependencies**: Lightweight with minimal external dependencies

## Installation

```bash
# Using bun (recommended)
bun add @bunsnc/client-sdk

# Using npm
npm install @bunsnc/client-sdk

# Using yarn
yarn add @bunsnc/client-sdk
```

## Quick Start

```typescript
import { createBunSNCClient } from "@bunsnc/client-sdk";

// Create client instance
const client = createBunSNCClient({
  baseUrl: "http://localhost:3008",
  auth: {
    username: "your-username",
    password: "your-password",
  },
});

// Test connection
const isConnected = await client.testConnection();
console.log("Connected:", isConnected);

// Get incidents
const incidents = await client.getIncidents({
  state: "active",
  priority: "high",
  limit: "10",
});

console.log("Active incidents:", incidents.data?.data);
```

## Configuration

### Basic Configuration

```typescript
import { BunSNCClient } from "@bunsnc/client-sdk";

const client = new BunSNCClient({
  baseUrl: "https://your-bunsnc-server.com",
  timeout: 30000,
  auth: {
    token: "your-jwt-token",
  },
});
```

### Advanced Configuration

```typescript
const client = new BunSNCClient({
  baseUrl: "https://api.company.com:3008",
  timeout: 60000,
  headers: {
    "X-API-Version": "1.0",
    "X-Client-ID": "my-application",
  },
  auth: {
    username: "api-user",
    password: "secure-password",
  },
});
```

### Authentication Methods

#### JWT Token Authentication

```typescript
const client = createBunSNCClient({
  baseUrl: "https://api.server.com",
  auth: {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  },
});
```

#### Basic Authentication

```typescript
const client = createBunSNCClient({
  baseUrl: "https://api.server.com",
  auth: {
    username: "your-username",
    password: "your-password",
  },
});
```

#### Dynamic Token Updates

```typescript
// Update auth token during runtime
client.setAuthToken("new-jwt-token");

// Update basic auth
client.setBasicAuth("new-username", "new-password");
```

## Core API Methods

### Incident Management

```typescript
// Get incidents with filters
const incidents = await client.getIncidents({
  state: "active",
  priority: "high",
  assignment_group: "IT Support",
  search: "network issue",
  limit: "50",
});

// Get specific incident
const incident = await client.getIncident("incident-id-123");

// Get incident statistics
const stats = await client.getIncidentStats();

// Get incident trends
const trends = await client.getIncidentTrends("7"); // Last 7 days

// Export incidents to Parquet
const exportTask = await client.exportIncidentsToParquet({
  filters: { priority: ["1", "2"] },
  compression: "snappy",
});
```

### Task Management

```typescript
import { TaskType, TaskPriority } from "@bunsnc/client-sdk";

// Create a new task
const task = await client.createTask({
  type: TaskType.PARQUET_EXPORT,
  data: {
    table: "incident",
    filters: { priority: ["1", "2"] },
    compression: "snappy",
  },
  priority: TaskPriority.HIGH,
  tags: ["export", "analytics"],
  createdBy: "data-team",
});

// Get task details
const taskDetails = await client.getTask(task.data.data.taskId);

// Monitor task progress
const completedTask = await client.waitForTaskCompletion(
  task.data.data.taskId,
  {
    timeout: 300000, // 5 minutes
    pollInterval: 2000, // Check every 2 seconds
    onProgress: (task) => {
      console.log(`Progress: ${task.progress}%`);
    },
  },
);

// Cancel a task
await client.cancelTask("task-id", "User requested cancellation");

// Get task history
const history = await client.getTaskHistory("100");
```

### Scheduled Tasks

```typescript
// Create scheduled task
const scheduledTask = await client.createScheduledTask({
  name: "Daily Data Sync",
  description: "Sync incident data every day at 2 AM",
  cronExpression: "0 2 * * *",
  taskType: TaskType.DATA_SYNC,
  taskData: {
    tables: ["incident", "problem"],
    incremental: true,
  },
  priority: TaskPriority.NORMAL,
  tags: ["daily", "automated"],
});

// Get all scheduled tasks
const scheduled = await client.getScheduledTasks();

// Trigger scheduled task manually
await client.triggerScheduledTask("scheduled-task-id");

// Enable/disable scheduled task
await client.setScheduledTaskEnabled("scheduled-task-id", false);

// Delete scheduled task
await client.deleteScheduledTask("scheduled-task-id");
```

### High-Level Operations

```typescript
// Export data to Parquet
const parquetExport = await client.exportToParquet({
  table: "incident",
  filters: { state: ["1", "2", "3"] },
  compression: "snappy",
  priority: TaskPriority.HIGH,
});

// Execute data pipeline
const pipeline = await client.executePipeline({
  pipelineId: "analytics-pipeline-v2",
  tables: ["incident", "problem", "change_request"],
  priority: TaskPriority.NORMAL,
});

// Sync data from ServiceNow
const dataSync = await client.syncData({
  tables: ["incident", "user", "group"],
  incremental: true,
  priority: TaskPriority.HIGH,
});

// Refresh cache
const cacheRefresh = await client.refreshCache({
  keys: ["incidents", "problems"],
  priority: TaskPriority.LOW,
});
```

### Analytics and Monitoring

```typescript
// Get performance metrics
const metrics = await client.getPerformanceMetrics();
console.log("System metrics:", metrics.data?.data);

// Get trend data
const incidentTrends = await client.getTrendData("incidents", "30");

// Get system statistics
const systemStats = await client.getSystemStats();

// Health check
const health = await client.getHealth();
console.log("System healthy:", health.data?.healthy);
```

## Advanced Usage

### Batch Operations

```typescript
// Define multiple operations
const operations = [
  () => client.exportToParquet({ table: "incident", compression: "snappy" }),
  () => client.exportToParquet({ table: "problem", compression: "snappy" }),
  () =>
    client.exportToParquet({ table: "change_request", compression: "snappy" }),
];

// Execute with controlled concurrency
const results = await client.batchOperation(operations, {
  concurrency: 2,
  failFast: false,
});

console.log(`Completed ${results.length} operations`);
```

### Real-time Monitoring

```typescript
// Start a long-running task
const task = await client.executePipeline({
  pipelineId: "big-data-pipeline",
  tables: ["incident", "problem", "change_request", "user"],
  priority: TaskPriority.HIGH,
});

// Monitor with real-time progress updates
if (task.data?.success) {
  const taskId = task.data.data.taskId;

  try {
    const result = await client.waitForTaskCompletion(taskId, {
      timeout: 1800000, // 30 minutes
      pollInterval: 5000, // Check every 5 seconds
      onProgress: (task) => {
        const progress = client.calculateTaskProgress(task);
        console.log(`Task: ${progress.status}`);
        console.log(`Progress: ${progress.percentage.toFixed(1)}%`);

        if (progress.estimatedTimeRemaining) {
          const minutes = Math.round(progress.estimatedTimeRemaining / 60000);
          console.log(`ETA: ${minutes} minutes`);
        }
      },
    });

    console.log("Pipeline completed:", result);
  } catch (error) {
    console.error("Pipeline failed:", error);
  }
}
```

### Error Handling and Retries

```typescript
import {
  BunSNCError,
  TaskTimeoutError,
  ConnectionError,
} from "@bunsnc/client-sdk";

// Custom retry logic
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof ConnectionError && attempt < maxRetries) {
        console.warn(`Attempt ${attempt} failed, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      throw error;
    }
  }

  throw lastError!;
}

// Usage with retry
try {
  const result = await withRetry(() =>
    client.createTask({
      type: TaskType.DATA_SYNC,
      data: { tables: ["incident"] },
    }),
  );

  console.log("Task created:", result.data?.data.taskId);
} catch (error) {
  if (error instanceof TaskTimeoutError) {
    console.error("Task timed out:", error.message);
  } else if (error instanceof BunSNCError) {
    console.error("API error:", error.message, error.statusCode);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## TypeScript Support

The SDK provides full TypeScript support with comprehensive type definitions:

```typescript
import {
  Task,
  TaskType,
  TaskStatus,
  TaskPriority,
  Incident,
  ApiResponse,
  SystemStats,
} from "@bunsnc/client-sdk";

// All API responses are fully typed
const incidents: ApiResponse<{ tasks: Incident[]; count: number }> =
  await client.getIncidents();

// Enum values are type-safe
const task = await client.createTask({
  type: TaskType.PARQUET_EXPORT, // ✅ Type-safe
  // type: 'invalid-type',        // ❌ TypeScript error
  priority: TaskPriority.HIGH,
  data: { table: "incident" },
});

// Response data is typed
if (task.data?.success) {
  const taskId: string = task.data.data.taskId; // ✅ Fully typed
}
```

## Testing

The SDK includes comprehensive test utilities:

```typescript
import { createMockClient, createTestClient } from "@bunsnc/client-sdk";

// Create mock client for unit tests
const mockClient = createMockClient();

// Create test client with predefined config
const testClient = createTestClient({
  baseUrl: "http://localhost:3008",
  timeout: 5000,
});

// Run tests
describe("My Application", () => {
  test("should handle task creation", async () => {
    const task = await testClient.createTask({
      type: TaskType.DATA_SYNC,
      data: { tables: ["incident"] },
    });

    expect(task).toBeDefined();
  });
});
```

## Performance Optimization

### Connection Pooling

```typescript
// Reuse client instances
const client = createBunSNCClient(config);

// Use single client for multiple operations
const [incidents, problems, changes] = await Promise.all([
  client.getIncidents(),
  client.getTasks({ status: "running" }),
  client.getSystemStats(),
]);
```

### Caching

```typescript
// Implement client-side caching
class CachedBunSNCClient extends BunSNCClient {
  private cache = new Map<string, { data: any; expires: number }>();

  async getWithCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 60000,
  ): Promise<T> {
    const cached = this.cache.get(key);

    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    const data = await fetcher();
    this.cache.set(key, {
      data,
      expires: Date.now() + ttl,
    });

    return data;
  }
}

const cachedClient = new CachedBunSNCClient(config);

// Use cached version
const stats = await cachedClient.getWithCache(
  "system-stats",
  () => cachedClient.getSystemStats(),
  300000, // 5 minutes
);
```

## Migration Guide

### From v1.0 to v2.0

```typescript
// ❌ Old API (v1.0)
const client = new BunSNCClient("http://localhost:3008");
const incidents = await client.incidents.list();

// ✅ New API (v2.0)
const client = createBunSNCClient({
  baseUrl: "http://localhost:3008",
});
const incidents = await client.getIncidents();
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@bunsnc.com
- 💬 Discord: [BunSNC Community](https://discord.gg/bunsnc)
- 📖 Documentation: [docs.bunsnc.com](https://docs.bunsnc.com)
- 🐛 Issues: [GitHub Issues](https://github.com/bunsnc/client-sdk/issues)

## Changelog

### v2.0.0

- ✨ Complete rewrite with Eden Treaty for full type safety
- 🚀 Improved performance and error handling
- 📊 Enhanced analytics and monitoring capabilities
- 🔐 Flexible authentication methods
- 📦 Reduced bundle size by 40%

### v1.1.0

- 🔄 Added real-time monitoring support
- 📈 Performance improvements
- 🛡️ Enhanced error handling

### v1.0.0

- 🎉 Initial release
- ✅ Basic API coverage
- 📝 TypeScript support
