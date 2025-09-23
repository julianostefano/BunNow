/**
 * Utility functions for BunSNC Client SDK
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  BunSNCClient,
  TaskType,
  TaskStatus,
  TaskPriority,
  ClientConfig,
  Task,
} from "./types";

/**
 * Create a mock client for testing
 */
export function createMockClient(): BunSNCClient {
  const mockConfig: ClientConfig = {
    baseUrl: "http://mock.localhost:3008",
    timeout: 5000,
    headers: {
      "X-Mock-Client": "true",
    },
  };

  return new BunSNCClient(mockConfig);
}

/**
 * Create a test client with predefined configuration
 */
export function createTestClient(
  overrides?: Partial<ClientConfig>,
): BunSNCClient {
  const testConfig: ClientConfig = {
    baseUrl: "http://localhost:3008",
    timeout: 10000,
    auth: {
      username: "test",
      password: "test",
    },
    headers: {
      "X-Test-Client": "true",
    },
    ...overrides,
  };

  return new BunSNCClient(testConfig);
}

/**
 * Validate task type
 */
export function isValidTaskType(type: string): type is TaskType {
  return Object.values(TaskType).includes(type as TaskType);
}

/**
 * Validate task status
 */
export function isValidTaskStatus(status: string): status is TaskStatus {
  return Object.values(TaskStatus).includes(status as TaskStatus);
}

/**
 * Validate task priority
 */
export function isValidTaskPriority(
  priority: string,
): priority is TaskPriority {
  return Object.values(TaskPriority).includes(priority as TaskPriority);
}

/**
 * Format task duration in human-readable format
 */
export function formatTaskDuration(startTime: Date, endTime?: Date): string {
  const end = endTime || new Date();
  const duration = end.getTime() - startTime.getTime();

  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Parse and validate task filters
 */
export function parseTaskFilters(filters: Record<string, any>): {
  valid: Record<string, any>;
  invalid: string[];
} {
  const valid: Record<string, any> = {};
  const invalid: string[] = [];

  for (const [key, value] of Object.entries(filters)) {
    switch (key) {
      case "status":
        if (isValidTaskStatus(value)) {
          valid[key] = value;
        } else {
          invalid.push(`Invalid status: ${value}`);
        }
        break;
      case "type":
        if (isValidTaskType(value)) {
          valid[key] = value;
        } else {
          invalid.push(`Invalid type: ${value}`);
        }
        break;
      case "priority":
        if (isValidTaskPriority(value)) {
          valid[key] = value;
        } else {
          invalid.push(`Invalid priority: ${value}`);
        }
        break;
      case "limit":
      case "offset":
        const numValue = parseInt(value, 10);
        if (isNaN(numValue) || numValue < 0) {
          invalid.push(`Invalid ${key}: must be a non-negative integer`);
        } else {
          valid[key] = numValue.toString();
        }
        break;
      case "tags":
        if (
          Array.isArray(value) &&
          value.every((tag) => typeof tag === "string")
        ) {
          valid[key] = value;
        } else {
          invalid.push("Invalid tags: must be an array of strings");
        }
        break;
      case "createdBy":
      case "createdAfter":
      case "createdBefore":
        if (typeof value === "string" && value.length > 0) {
          valid[key] = value;
        } else {
          invalid.push(`Invalid ${key}: must be a non-empty string`);
        }
        break;
      default:
        valid[key] = value;
    }
  }

  return { valid, invalid };
}

/**
 * Generate unique task ID
 */
export function generateTaskId(prefix = "task"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Create retry configuration
 */
export function createRetryConfig(maxRetries = 3, baseDelay = 1000) {
  return {
    maxRetries,
    delay: (attempt: number) =>
      Math.min(baseDelay * Math.pow(2, attempt), 10000),
  };
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse connection string for various formats
 */
export function parseConnectionString(connectionString: string): ClientConfig {
  // Support formats like:
  // http://username:password@localhost:3008
  // https://token@server.com:443
  // http://localhost:3008

  try {
    const url = new URL(connectionString);
    const config: ClientConfig = {
      baseUrl: `${url.protocol}//${url.host}`,
    };

    if (url.username && url.password) {
      config.auth = {
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      };
    } else if (url.username) {
      config.auth = {
        token: decodeURIComponent(url.username),
      };
    }

    return config;
  } catch (error: unknown) {
    throw new Error(`Invalid connection string: ${connectionString}`);
  }
}

/**
 * Debounce function for API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: NodeJS.Timeout;
  let resolvePromise: (value: ReturnType<T>) => void;
  let rejectPromise: (reason: any) => void;

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise<ReturnType<T>>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        try {
          const result = await func(...args);
          resolvePromise(result);
        } catch (error: unknown) {
          rejectPromise(error);
        }
      }, delay);
    });
  };
}

/**
 * Create rate limiter
 */
export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests: number[] = [];

  return {
    canMakeRequest(): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old requests
      while (requests.length > 0 && requests[0] < windowStart) {
        requests.shift();
      }

      return requests.length < maxRequests;
    },

    recordRequest(): void {
      requests.push(Date.now());
    },

    getWaitTime(): number {
      if (this.canMakeRequest()) return 0;

      const oldestRequest = requests[0];
      const windowStart = Date.now() - windowMs;
      return oldestRequest - windowStart + 1;
    },
  };
}

/**
 * Task progress calculator
 */
export function calculateTaskProgress(task: Task): {
  percentage: number;
  estimatedTimeRemaining?: number;
  status: string;
} {
  const percentage = task.progress || 0;
  let estimatedTimeRemaining: number | undefined;

  if (task.startedAt && percentage > 0 && percentage < 100) {
    const elapsedTime = Date.now() - task.startedAt.getTime();
    const totalEstimatedTime = (elapsedTime / percentage) * 100;
    estimatedTimeRemaining = totalEstimatedTime - elapsedTime;
  }

  let status = task.status;
  if (task.status === TaskStatus.RUNNING && percentage > 0) {
    status = `${task.status} (${percentage.toFixed(1)}%)`;
  }

  return {
    percentage,
    estimatedTimeRemaining,
    status,
  };
}

/**
 * Batch processor for multiple operations
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    batchSize?: number;
    concurrency?: number;
    delayBetweenBatches?: number;
    onBatchComplete?: (results: R[], batchIndex: number) => void;
  } = {},
): Promise<R[]> {
  const {
    batchSize = 10,
    concurrency = 3,
    delayBetweenBatches = 100,
    onBatchComplete,
  } = options;

  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);

    // Process batch with limited concurrency
    const batchPromises = batch.map(async (item, index) => {
      // Add delay to prevent overwhelming the server
      if (index > 0 && index % concurrency === 0) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return processor(item);
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (onBatchComplete) {
      onBatchComplete(batchResults, batchIndex);
    }

    // Delay between batches
    if (i + batchSize < items.length && delayBetweenBatches > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}

/**
 * Environment detection
 */
export function getEnvironmentInfo(): {
  isNode: boolean;
  isBrowser: boolean;
  isBun: boolean;
  version?: string;
} {
  const isNode =
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.node != null;

  const isBrowser =
    typeof window !== "undefined" && typeof window.document !== "undefined";

  const isBun =
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.bun != null;

  let version: string | undefined;

  if (isBun && process.versions?.bun) {
    version = process.versions.bun;
  } else if (isNode && process.versions?.node) {
    version = process.versions.node;
  }

  return {
    isNode,
    isBrowser,
    isBun,
    version,
  };
}
