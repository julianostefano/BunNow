# Socket Connection Errors - Solution Implementation

**Author**: Juliano Stefano <jsdealencar@ayesa.com> [2025]

## Problem Description

The ServiceNow web interface was experiencing persistent socket connection errors during background operations, specifically during cache pre-warming and data synchronization processes. Users reported:

- Application not loading properly
- 500 Internal Server Error on `/favicon.ico` and `/dashboard`
- Console errors: "The socket connection was closed unexpectedly"

## Root Cause Analysis

### Primary Issues Identified:

1. **Concurrent Request Overload**: Multiple simultaneous ServiceNow API requests during cache pre-warming overwhelmed the connection pool
2. **Poor Connection Management**: Axios configuration lacked proper connection pooling and keep-alive settings
3. **Missing Error Handling**: No retry logic for transient network errors
4. **Multiple Cache Warming Instances**: Each ServiceNow client instance triggered its own cache warming process

### Error Pattern:
```bash
Error getting waiting incidents for IT Operations: The socket connection was closed unexpectedly
Error getting waiting change tasks for Database Administration: The socket connection was closed unexpectedly
Error getting waiting SC tasks for Network Support: The socket connection was closed unexpectedly
```

## Solution Implementation

### 1. Enhanced Axios Configuration (`ServiceNowAuthCore.ts`)

#### Before:
```typescript
this.axiosClient = axios.create({
  baseURL: this.SERVICENOW_BASE_URL,
  timeout: 240000, // 4 minutes - too long
  httpsAgent: new (require('https').Agent)({
    rejectUnauthorized: false
  })
});
```

#### After:
```typescript
this.axiosClient = axios.create({
  baseURL: this.SERVICENOW_BASE_URL,
  timeout: 60000, // Reduced to 60 seconds
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10, // Connection pool limit
    maxFreeSockets: 5,
    timeout: 60000,
    scheduling: 'fifo'
  }),
  headers: {
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=30, max=100'
  }
});
```

### 2. Retry Logic with Exponential Backoff (`ServiceNowQueryService.ts`)

```typescript
private async executeQuery<T>(
  table: string,
  query: string,
  fields?: string,
  retryAttempts: number = 3
): Promise<T> {
  return serviceNowRateLimiter.executeRequest(async () => {
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const response = await this.axiosClient.get(url, {
          params: queryParams,
          timeout: 30000, // 30 seconds per request
          headers: {
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=5, max=1000'
          }
        });
        return response.data;
      } catch (error: any) {
        const isRetryableError = error.code === 'ECONNRESET' ||
                               error.code === 'ETIMEDOUT' ||
                               error.message?.includes('socket connection was closed');

        if (isRetryableError && attempt < retryAttempts) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }
        throw error;
      }
    }
  });
}
```

### 3. Sequential Cache Warming with Singleton Pattern

#### Before (Concurrent):
```typescript
const warmupPromises = criticalGroups.map(async (group) => {
  await Promise.all([
    this.getWaitingIncidents(group),
    this.getWaitingChangeTasks(group),
    this.getWaitingServiceCatalogTasks(group)
  ]);
});
await Promise.all(warmupPromises); // Overwhelming ServiceNow
```

#### After (Sequential):
```typescript
async preWarmCache(): Promise<void> {
  // Singleton pattern to prevent multiple instances
  if (ServiceNowQueryService.cacheWarmingInProgress ||
      ServiceNowQueryService.cacheWarmingCompleted) {
    return;
  }

  ServiceNowQueryService.cacheWarmingInProgress = true;

  // Process groups sequentially
  for (const group of criticalGroups) {
    await this.getWaitingIncidents(group);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Delay between requests

    await this.getWaitingChangeTasks(group);
    await new Promise(resolve => setTimeout(resolve, 1500));

    await this.getWaitingServiceCatalogTasks(group);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Delay before next group
  }
}
```

### 4. Enhanced Error Logging and Monitoring

Added request/response interceptors for better visibility:

```typescript
// Request timing
this.axiosClient.interceptors.request.use((config) => {
  config.metadata = { startTime: Date.now() };
  return config;
});

// Response monitoring
this.axiosClient.interceptors.response.use(
  (response) => {
    const duration = Date.now() - response.config.metadata?.startTime;
    if (duration > 10000) {
      console.warn(`⚠️ Slow ServiceNow request: ${response.config.url} took ${duration}ms`);
    }
    return response;
  },
  (error) => {
    console.error(`❌ ServiceNow request failed:`, {
      url: error.config?.url,
      status: error.response?.status,
      code: error.code,
      message: error.message?.substring(0, 200)
    });
    return Promise.reject(error);
  }
);
```

## Results and Performance Impact

### Before Fix:
- ❌ Frequent socket connection errors
- ❌ Application endpoints returning 500 errors
- ❌ Cache warming failing due to connection overload
- ❌ Poor user experience with application not loading

### After Fix:
- ✅ **Application Stability**: All endpoints working properly
  - `/health` → 200 OK
  - `/dashboard` → 302 Redirect (proper)
  - `/favicon.ico` → 204 No Content (proper)
- ✅ **Background Operations**: Cache warming completed successfully for all groups
- ✅ **Connection Management**: Proper connection pooling and keep-alive
- ✅ **Error Handling**: Graceful retry logic for transient errors
- ✅ **Performance**: Regular auto-sync cycles completing every 5 minutes

### Metrics:
```bash
✅ Cache warmed successfully for: IT Operations
✅ Cache warmed successfully for: Database Administration
✅ Cache warmed successfully for: Network Support
✅ Cache warmed successfully for: Application Support
🔥 Cache pre-warming completed successfully

✅ [DataService] Auto-sync completed for table: incident
✅ [DataService] Auto-sync completed for table: change_task
✅ [DataService] Auto-sync completed for table: sc_task
🎉 [DataService] Auto-sync cycle completed
```

## Configuration Parameters

### Connection Pool Settings:
- `maxSockets`: 10 (concurrent connections per host)
- `maxFreeSockets`: 5 (keep-alive connections)
- `keepAliveMsecs`: 30000 (30 seconds)
- `timeout`: 60000 (60 seconds)

### Retry Logic:
- `maxRetries`: 3 attempts
- `backoffDelay`: Exponential (1s, 2s, 4s)
- `retryableErrors`: ECONNRESET, ETIMEDOUT, socket closed

### Cache Warming Delays:
- Between queries: 1.5 seconds
- Between groups: 3 seconds
- After errors: 5 seconds

## Monitoring and Maintenance

### Key Metrics to Monitor:
1. **Request Duration**: Warn if >10 seconds
2. **Error Rates**: Track retryable vs non-retryable errors
3. **Cache Hit Rates**: Monitor Redis cache effectiveness
4. **Auto-sync Cycles**: Ensure 5-minute intervals complete successfully

### Log Patterns to Watch:
- `⚠️ Slow ServiceNow request` - Indicates performance issues
- `⚠️ Retryable error on attempt` - Network instability
- `✅ Cache warmed successfully` - Successful cache warming
- `🎉 Auto-sync cycle completed` - Healthy background operations

## Future Improvements

1. **Circuit Breaker Pattern**: Implement circuit breaker for ServiceNow API
2. **Request Queuing**: Add intelligent request queuing for peak loads
3. **Health Checks**: Regular connection health monitoring
4. **Adaptive Timeouts**: Dynamic timeout adjustment based on response times

## Files Modified

- `src/services/auth/ServiceNowAuthCore.ts` - Enhanced axios configuration
- `src/services/auth/ServiceNowQueryService.ts` - Retry logic and sequential cache warming
- `src/web/server.ts` - Fixed route response objects
- `src/controllers/WebServerController.ts` - Fixed favicon and health routes

## Testing

The solution has been tested with:
- ✅ Core endpoint functionality
- ✅ Cache warming process completion
- ✅ Background auto-sync operations
- ✅ Error handling and retry mechanisms
- ✅ Connection pool utilization

The application is now stable and ready for production use.