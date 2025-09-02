# API Documentation

**Author**: Juliano Stefano <jsdealencar@ayesa.com> [2025]

## ServiceNowClient

The main entry point for interacting with ServiceNow APIs.

### Constructor Methods

#### `ServiceNowClient.create(url, token, options?)`
Creates a new ServiceNow client with API token authentication.

```typescript
const client = ServiceNowClient.create(
  'https://instance.service-now.com',
  'your-api-token',
  {
    enableCaching: true,
    maxRetries: 3,
    timeout: 30000
  }
);
```

**Parameters:**
- `url`: string - ServiceNow instance URL
- `token`: string - API authentication token
- `options?`: ServiceNowClientOptions - Optional configuration

#### `ServiceNowClient.fromEnv()`
Creates client from environment variables.

```typescript
const client = ServiceNowClient.fromEnv();
```

**Required Environment Variables:**
- `SNC_INSTANCE_URL`: ServiceNow instance URL
- `SNC_AUTH_TOKEN`: API authentication token

#### `ServiceNowClient.createWithBasicAuth(url, username, password, options?)`
Creates client with basic authentication.

```typescript
const client = ServiceNowClient.createWithBasicAuth(
  'https://instance.service-now.com',
  'admin',
  'password'
);
```

#### `ServiceNowClient.createWithOAuth(url, token, options?)`
Creates client with OAuth token authentication.

```typescript
const client = ServiceNowClient.createWithOAuth(
  'https://instance.service-now.com',
  'oauth-token'
);
```

### Core Methods

#### `client.table(tableName)`
Returns a TableAPI instance for the specified table.

```typescript
const tableApi = client.table('incident');
```

#### `client.GlideRecord(tableName)`
Returns a GlideRecord instance for PySNC compatibility.

```typescript
const gr = client.GlideRecord('incident');
gr.addQuery('state', '1');
await gr.query();
```

#### `client.query(params)`
Executes a direct query with parameters.

```typescript
const results = await client.query({
  table: 'incident',
  query: 'state=1^priority=1',
  limit: 100,
  fields: ['number', 'short_description', 'state']
});
```

#### `client.create(table, data)`
Creates a new record in the specified table.

```typescript
const record = await client.create('incident', {
  short_description: 'Network outage',
  category: 'network',
  priority: '1'
});
```

#### `client.update(table, sysId, data)`
Updates an existing record.

```typescript
const updated = await client.update('incident', 'sys_id_here', {
  state: '6',
  close_notes: 'Issue resolved'
});
```

#### `client.delete(table, sysId)`
Deletes a record by system ID.

```typescript
await client.delete('incident', 'sys_id_here');
```

### Configuration Options

```typescript
interface ServiceNowClientOptions {
  // Performance settings
  enableCaching?: boolean;
  cacheTimeout?: number;
  enablePerformanceMonitoring?: boolean;
  
  // Retry settings
  maxRetries?: number;
  retryDelay?: number;
  
  // Connection settings
  timeout?: number;
  proxy?: string;
  
  // Logging
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enableStructuredLogging?: boolean;
  
  // Custom headers
  headers?: Record<string, string>;
}
```

## GlideRecord

PySNC-compatible ORM-style interface for ServiceNow records.

### Core Methods

#### `addQuery(field, operator?, value?)`
Adds a query condition.

```typescript
const gr = client.GlideRecord('incident');
gr.addQuery('state', '1');
gr.addQuery('priority', '<=', '2');
gr.addQuery('active', true);
```

**Supported Operators:**
- `=` (default), `!=`, `>`, `>=`, `<`, `<=`
- `IN`, `NOT IN`, `CONTAINS`, `DOES NOT CONTAIN`
- `STARTS WITH`, `ENDS WITH`
- `IS EMPTY`, `IS NOT EMPTY`

#### `addOrQuery(field, operator?, value?)`
Adds an OR condition to the query.

```typescript
gr.addQuery('priority', '1');
gr.addOrQuery('category', 'security');
```

#### `addNullQuery(field)` / `addNotNullQuery(field)`
Adds null/not null conditions.

```typescript
gr.addNullQuery('resolved_at');
gr.addNotNullQuery('assigned_to');
```

#### `orderBy(field)` / `orderByDesc(field)`
Sets ordering for results.

```typescript
gr.orderBy('number');
gr.orderByDesc('sys_created_on');
```

#### `setLimit(limit)`
Limits the number of results returned.

```typescript
gr.setLimit(100);
```

#### `query()`
Executes the query and loads results.

```typescript
await gr.query();
```

#### `next()`
Iterates to the next record in the result set.

```typescript
await gr.query();
while (gr.next()) {
  console.log(gr.getValue('number'));
}
```

#### `get(sysId)`
Loads a specific record by system ID.

```typescript
if (await gr.get('sys_id_here')) {
  console.log('Record found:', gr.getValue('number'));
}
```

### Data Access Methods

#### `getValue(field)`
Gets the value of a field.

```typescript
const number = gr.getValue('number');
const priority = gr.getValue('priority');
```

#### `getDisplayValue(field)`
Gets the display value of a field.

```typescript
const priorityLabel = gr.getDisplayValue('priority');
const assigneeDisplay = gr.getDisplayValue('assigned_to');
```

#### `setValue(field, value)`
Sets the value of a field.

```typescript
gr.setValue('short_description', 'Updated description');
gr.setValue('priority', '2');
```

#### `setDisplayValue(field, displayValue)`
Sets a field using its display value.

```typescript
gr.setDisplayValue('assigned_to', 'John Doe');
gr.setDisplayValue('category', 'Hardware');
```

### Record Operations

#### `insert()`
Inserts a new record.

```typescript
const gr = client.GlideRecord('incident');
gr.setValue('short_description', 'New incident');
gr.setValue('category', 'software');
const sysId = await gr.insert();
```

#### `update()`
Updates the current record.

```typescript
if (await gr.get('sys_id_here')) {
  gr.setValue('state', '2');
  await gr.update();
}
```

#### `deleteRecord()`
Deletes the current record.

```typescript
if (await gr.get('sys_id_here')) {
  await gr.deleteRecord();
}
```

#### `deleteMultiple()`
Deletes all records matching the query.

```typescript
const gr = client.GlideRecord('incident');
gr.addQuery('state', '7');
const deletedCount = await gr.deleteMultiple();
```

#### `updateMultiple(data)`
Updates all records matching the query.

```typescript
const gr = client.GlideRecord('incident');
gr.addQuery('assignment_group', 'old_group_id');
const updatedCount = await gr.updateMultiple({
  assignment_group: 'new_group_id'
});
```

### Utility Methods

#### `getRowCount()`
Gets the total number of records returned by the query.

```typescript
await gr.query();
const totalRecords = gr.getRowCount();
```

#### `hasNext()`
Checks if there are more records to iterate.

```typescript
await gr.query();
while (gr.hasNext()) {
  gr.next();
  console.log(gr.getValue('number'));
}
```

#### `isValidField(field)`
Validates if a field exists in the table.

```typescript
if (gr.isValidField('custom_field')) {
  const value = gr.getValue('custom_field');
}
```

## TableAPI

Direct table operations without ORM overhead.

### Query Operations

#### `query(options?)`
Executes a query with optional parameters.

```typescript
const records = await client.table('incident').query({
  query: 'state=1',
  fields: ['number', 'short_description'],
  limit: 50,
  offset: 0
});
```

#### `get(sysId, fields?)`
Gets a specific record by system ID.

```typescript
const record = await client.table('incident').get(
  'sys_id_here',
  ['number', 'state', 'priority']
);
```

#### `getBy(field, value, fields?)`
Gets records by a specific field value.

```typescript
const records = await client.table('incident').getBy(
  'number',
  'INC0000123',
  ['sys_id', 'state']
);
```

### CRUD Operations

#### `create(data)`
Creates a new record.

```typescript
const record = await client.table('incident').create({
  short_description: 'Database connection issue',
  category: 'software',
  urgency: '2',
  impact: '2'
});
```

#### `update(sysId, data)`
Updates an existing record.

```typescript
const updated = await client.table('incident').update('sys_id_here', {
  state: '2',
  assigned_to: 'user_sys_id'
});
```

#### `patch(sysId, data)`
Partially updates a record (PATCH operation).

```typescript
const patched = await client.table('incident').patch('sys_id_here', {
  work_notes: 'Investigation completed'
});
```

#### `delete(sysId)`
Deletes a record.

```typescript
const success = await client.table('incident').delete('sys_id_here');
```

### Batch Operations

#### `createMultiple(records)`
Creates multiple records in batch.

```typescript
const results = await client.table('incident').createMultiple([
  { short_description: 'Issue 1', category: 'hardware' },
  { short_description: 'Issue 2', category: 'software' },
  { short_description: 'Issue 3', category: 'network' }
]);
```

#### `updateMultiple(updates)`
Updates multiple records in batch.

```typescript
const results = await client.table('incident').updateMultiple([
  { sys_id: 'id1', data: { state: '2' } },
  { sys_id: 'id2', data: { state: '3' } },
  { sys_id: 'id3', data: { state: '6' } }
]);
```

## BatchAPI

Efficient batch processing for multiple operations.

### Basic Usage

```typescript
const batch = client.createBatch({
  concurrencyLimit: 5,
  retryFailedRequests: true,
  progressCallback: (progress) => {
    console.log(`Progress: ${progress.completed}/${progress.total}`);
  }
});
```

### Adding Requests

#### `addRequest(request)`
Adds a single request to the batch.

```typescript
batch.addRequest({
  method: 'POST',
  table: 'incident',
  data: { short_description: 'Batch created incident' },
  callback: (result, error) => {
    if (error) {
      console.error('Request failed:', error);
    } else {
      console.log('Created:', result.sys_id);
    }
  }
});
```

#### `addRequests(requests)`
Adds multiple requests to the batch.

```typescript
const requests = [
  {
    method: 'GET',
    table: 'incident',
    sysId: 'id1',
    callback: (result) => console.log('Fetched:', result.number)
  },
  {
    method: 'PUT',
    table: 'incident',
    sysId: 'id2',
    data: { state: '2' },
    callback: (result) => console.log('Updated:', result.sys_id)
  }
];

batch.addRequests(requests);
```

### Execution

#### `execute()`
Executes all requests in the batch.

```typescript
const results = await batch.execute();
console.log(`Processed ${results.successful} successful, ${results.failed} failed`);
```

#### `executeWithProgress()`
Executes with detailed progress tracking.

```typescript
const results = await batch.executeWithProgress((progress) => {
  const percentage = (progress.completed / progress.total) * 100;
  console.log(`Progress: ${percentage.toFixed(1)}%`);
});
```

### Configuration Options

```typescript
interface BatchOptions {
  concurrencyLimit?: number;        // Max concurrent requests (default: 5)
  retryFailedRequests?: boolean;    // Retry failed requests (default: true)
  maxRetries?: number;              // Max retry attempts (default: 3)
  retryDelay?: number;              // Delay between retries in ms (default: 1000)
  progressCallback?: (progress: BatchProgress) => void;
  enablePerformanceMonitoring?: boolean;
}
```

## AttachmentAPI

File attachment operations with streaming support.

### Upload Operations

#### `uploadAttachment(fileName, tableName, recordSysId, fileBuffer, contentType?)`
Uploads a file attachment.

```typescript
const fileBuffer = await fs.readFile('/path/to/document.pdf');
const attachmentId = await client.uploadAttachment(
  'document.pdf',
  'incident',
  incidentSysId,
  fileBuffer,
  'application/pdf'
);
```

#### `uploadAttachmentStream(fileName, tableName, recordSysId, stream, contentType?)`
Uploads a file using a stream for large files.

```typescript
const stream = fs.createReadStream('/path/to/large-file.zip');
const attachmentId = await client.uploadAttachmentStream(
  'backup.zip',
  'incident',
  incidentSysId,
  stream,
  'application/zip'
);
```

#### `uploadMultipleAttachments(attachments)`
Uploads multiple attachments in batch.

```typescript
const attachments = [
  {
    fileName: 'screenshot.png',
    tableName: 'incident',
    recordSysId: incidentSysId,
    fileBuffer: pngBuffer,
    contentType: 'image/png'
  },
  {
    fileName: 'logs.txt',
    tableName: 'incident',
    recordSysId: incidentSysId,
    fileBuffer: logsBuffer,
    contentType: 'text/plain'
  }
];

const results = await client.uploadMultipleAttachments(attachments);
```

### Download Operations

#### `downloadAttachment(attachmentSysId)`
Downloads an attachment as a buffer.

```typescript
const buffer = await client.downloadAttachment('attachment_sys_id');
await fs.writeFile('/local/path/downloaded-file.pdf', buffer);
```

#### `downloadAttachmentStream(attachmentSysId)`
Downloads an attachment as a stream.

```typescript
const stream = await client.downloadAttachmentStream('attachment_sys_id');
const writeStream = fs.createWriteStream('/local/path/large-download.zip');
stream.pipe(writeStream);
```

#### `downloadAttachmentInfo(attachmentSysId)`
Gets attachment metadata without downloading content.

```typescript
const info = await client.downloadAttachmentInfo('attachment_sys_id');
console.log({
  fileName: info.file_name,
  size: info.size_bytes,
  contentType: info.content_type,
  created: info.sys_created_on
});
```

### Management Operations

#### `listAttachments(tableName, recordSysId)`
Lists all attachments for a record.

```typescript
const attachments = await client.listAttachments('incident', incidentSysId);
attachments.forEach(att => {
  console.log(`${att.file_name} (${att.size_bytes} bytes)`);
});
```

#### `deleteAttachment(attachmentSysId)`
Deletes an attachment.

```typescript
await client.deleteAttachment('attachment_sys_id');
```

#### `copyAttachment(attachmentSysId, targetTable, targetRecordSysId)`
Copies an attachment to another record.

```typescript
const copiedAttachmentId = await client.copyAttachment(
  'source_attachment_id',
  'change_request',
  changeRequestSysId
);
```

## Error Handling

### Error Types

#### `ServiceNowError`
Base error class for ServiceNow-related errors.

```typescript
try {
  await client.table('incident').get('invalid_sys_id');
} catch (error) {
  if (error instanceof ServiceNowError) {
    console.log('ServiceNow Error:', error.message);
    console.log('Status Code:', error.statusCode);
    console.log('Details:', error.details);
  }
}
```

#### `AuthenticationError`
Authentication and authorization errors.

```typescript
try {
  const client = ServiceNowClient.create(url, 'invalid_token');
  await client.table('incident').query();
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.log('Authentication failed:', error.message);
  }
}
```

#### `ValidationError`
Data validation errors.

```typescript
try {
  await client.table('incident').create({
    invalid_field: 'value'
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.validationErrors);
  }
}
```

#### `NetworkError`
Network connectivity and timeout errors.

```typescript
try {
  await client.table('incident').query();
} catch (error) {
  if (error instanceof NetworkError) {
    console.log('Network error:', error.message);
    console.log('Retry attempted:', error.retryCount);
  }
}
```

#### `RateLimitError`
API rate limit exceeded errors.

```typescript
try {
  await Promise.all([
    client.table('incident').query(),
    client.table('incident').query(),
    // ... many concurrent requests
  ]);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log('Rate limit exceeded, retry after:', error.retryAfter);
  }
}
```

### Error Recovery

The client automatically handles transient errors with exponential backoff retry logic:

```typescript
const client = ServiceNowClient.create(url, token, {
  maxRetries: 3,
  retryDelay: 1000,
  enablePerformanceMonitoring: true
});

// Automatic retry for network timeouts, rate limits, and server errors
const records = await client.table('incident').query();
```

## Performance Monitoring

### Metrics Collection

```typescript
import { performanceMonitor } from 'bunsnc';

// Automatic monitoring is enabled by default
const client = ServiceNowClient.create(url, token, {
  enablePerformanceMonitoring: true
});

// Manual metric recording
performanceMonitor.recordMetric({
  name: 'custom_operation_time',
  value: 150,
  unit: 'ms',
  timestamp: Date.now(),
  metadata: { operation: 'complex_query' }
});
```

### Performance Reports

```typescript
// Get performance report for the last hour
const report = performanceMonitor.getReport(60);

console.log('Performance Summary:', {
  totalOperations: report.metrics.summary?.totalOperations,
  averageResponseTime: report.metrics.summary?.averageResponseTime,
  slowestOperation: report.metrics.summary?.slowestOperation,
  errorRate: report.metrics.summary?.errorRate
});

// Get detailed metrics
report.metrics.detailed.forEach(metric => {
  console.log(`${metric.name}: ${metric.value}${metric.unit}`);
});
```

### Custom Timers

```typescript
// Start a custom timer
const timerName = 'complex_business_logic';
performanceMonitor.startTimer(timerName, 'CustomOperations');

// ... perform operations ...

// End timer and get duration
const duration = performanceMonitor.endTimer(timerName);
console.log(`Operation completed in ${duration}ms`);
```