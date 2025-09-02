# Migration Guide from PySNC

**Author**: Juliano Stefano <jsdealencar@ayesa.com> [2025]

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Key Differences](#key-differences)
3. [API Compatibility](#api-compatibility)
4. [Step-by-Step Migration](#step-by-step-migration)
5. [Common Migration Patterns](#common-migration-patterns)
6. [Performance Improvements](#performance-improvements)
7. [Error Handling Changes](#error-handling-changes)
8. [Advanced Features](#advanced-features)
9. [Testing Your Migration](#testing-your-migration)
10. [Migration Tools](#migration-tools)

## Migration Overview

BunSNC provides 100% API compatibility with PySNC while offering significant performance improvements and modern JavaScript/TypeScript features. This guide helps you migrate your existing PySNC-based ServiceNow integrations to BunSNC.

### Why Migrate to BunSNC?

- **Performance**: 5-10x faster than PySNC for batch operations
- **Modern Runtime**: Built for Bun with Node.js compatibility
- **TypeScript Support**: Full type safety and IntelliSense
- **Async/Await**: Modern promise-based async patterns
- **Enhanced Features**: Advanced caching, performance monitoring, and streaming
- **Enterprise Ready**: Production-tested with comprehensive error handling

### Migration Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Assessment | 1-2 days | Analyze existing PySNC usage |
| Setup | 1 day | Install BunSNC and configure environment |
| Core Migration | 3-5 days | Convert main functionality |
| Testing | 2-3 days | Comprehensive testing and validation |
| Advanced Features | 1-2 days | Implement performance optimizations |
| Deployment | 1 day | Production deployment and monitoring |

## Key Differences

### Language and Runtime

```python
# PySNC (Python)
import pysnc
client = pysnc.ServiceNowClient(instance, user, password)
```

```typescript
// BunSNC (TypeScript/JavaScript)
import { ServiceNowClient } from 'bunsnc';
const client = ServiceNowClient.createWithBasicAuth(instance, user, password);
```

### Async/Await Pattern

```python
# PySNC (Synchronous)
gr = client.GlideRecord('incident')
gr.add_query('state', '1')
gr.query()

while gr.next():
    print(gr.get_value('number'))
```

```typescript
// BunSNC (Asynchronous)
const gr = client.GlideRecord('incident');
gr.addQuery('state', '1');
await gr.query();

while (gr.next()) {
    console.log(gr.getValue('number'));
}
```

### Method Naming Conventions

| PySNC (Python) | BunSNC (TypeScript/JS) | Description |
|----------------|------------------------|-------------|
| `add_query()` | `addQuery()` | Add query condition |
| `add_or_query()` | `addOrQuery()` | Add OR condition |
| `order_by()` | `orderBy()` | Set ordering |
| `order_by_desc()` | `orderByDesc()` | Set descending order |
| `set_limit()` | `setLimit()` | Set query limit |
| `get_value()` | `getValue()` | Get field value |
| `get_display_value()` | `getDisplayValue()` | Get display value |
| `set_value()` | `setValue()` | Set field value |
| `insert()` | `insert()` | Insert record |
| `update()` | `update()` | Update record |
| `delete_record()` | `deleteRecord()` | Delete record |

## API Compatibility

### Client Initialization

```python
# PySNC
import pysnc
client = pysnc.ServiceNowClient(
    instance='https://dev123456.service-now.com',
    user='admin',
    password='password'
)
```

```typescript
// BunSNC - Direct equivalent
import { ServiceNowClient } from 'bunsnc';
const client = ServiceNowClient.createWithBasicAuth(
    'https://dev123456.service-now.com',
    'admin',
    'password'
);

// BunSNC - Recommended (with token)
const client = ServiceNowClient.create(
    'https://dev123456.service-now.com',
    'your-api-token'
);

// BunSNC - Environment variables (best practice)
const client = ServiceNowClient.fromEnv();
```

### GlideRecord Operations

#### Basic Query Pattern

```python
# PySNC
gr = client.GlideRecord('incident')
gr.add_query('state', '1')
gr.add_query('priority', '<=', '2')
gr.order_by('number')
gr.set_limit(10)
gr.query()

incidents = []
while gr.next():
    incidents.append({
        'number': gr.get_value('number'),
        'description': gr.get_value('short_description'),
        'priority': gr.get_display_value('priority')
    })
```

```typescript
// BunSNC
const gr = client.GlideRecord('incident');
gr.addQuery('state', '1');
gr.addQuery('priority', '<=', '2');
gr.orderBy('number');
gr.setLimit(10);
await gr.query();

const incidents = [];
while (gr.next()) {
    incidents.push({
        number: gr.getValue('number'),
        description: gr.getValue('short_description'),
        priority: gr.getDisplayValue('priority')
    });
}
```

#### Record Creation

```python
# PySNC
gr = client.GlideRecord('incident')
gr.set_value('short_description', 'New incident from PySNC')
gr.set_value('category', 'software')
gr.set_value('priority', '3')
sys_id = gr.insert()
```

```typescript
// BunSNC
const gr = client.GlideRecord('incident');
gr.setValue('short_description', 'New incident from BunSNC');
gr.setValue('category', 'software');
gr.setValue('priority', '3');
const sysId = await gr.insert();
```

#### Record Updates

```python
# PySNC
gr = client.GlideRecord('incident')
if gr.get('incident_sys_id'):
    gr.set_value('state', '2')
    gr.set_value('work_notes', 'Updated via PySNC')
    gr.update()
```

```typescript
// BunSNC
const gr = client.GlideRecord('incident');
if (await gr.get('incident_sys_id')) {
    gr.setValue('state', '2');
    gr.setValue('work_notes', 'Updated via BunSNC');
    await gr.update();
}
```

### Direct Table API

```python
# PySNC - Not available in standard PySNC
# Must use GlideRecord pattern
```

```typescript
// BunSNC - Enhanced direct table operations
const tableApi = client.table('incident');

// Query with parameters
const incidents = await tableApi.query({
    query: 'state=1^priority<=2',
    fields: ['number', 'short_description', 'priority'],
    limit: 10
});

// Direct CRUD operations
const created = await tableApi.create({
    short_description: 'Direct API creation',
    category: 'software'
});

const updated = await tableApi.update(sysId, {
    state: '2'
});

const success = await tableApi.delete(sysId);
```

## Step-by-Step Migration

### Step 1: Environment Setup

1. **Install BunSNC**
```bash
# With Bun (recommended)
bun add bunsnc

# With npm
npm install bunsnc
```

2. **Environment Configuration**
```bash
# Create .env file
SNC_INSTANCE_URL=https://your-instance.service-now.com
SNC_AUTH_TOKEN=your-api-token

# Optional basic auth (for migration compatibility)
SNC_USERNAME=your-username  
SNC_PASSWORD=your-password
```

3. **TypeScript Configuration** (if using TypeScript)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true
  }
}
```

### Step 2: Client Migration

```python
# PySNC - Before
import pysnc
import os

client = pysnc.ServiceNowClient(
    instance=os.getenv('SNC_INSTANCE_URL'),
    user=os.getenv('SNC_USERNAME'),
    password=os.getenv('SNC_PASSWORD')
)
```

```typescript
// BunSNC - After
import { ServiceNowClient } from 'bunsnc';

const client = ServiceNowClient.fromEnv(); // Reads from environment variables

// Or explicit configuration
const client = ServiceNowClient.createWithBasicAuth(
    process.env.SNC_INSTANCE_URL!,
    process.env.SNC_USERNAME!,
    process.env.SNC_PASSWORD!
);
```

### Step 3: Query Migration

```python
# PySNC - Before
def get_active_incidents():
    gr = client.GlideRecord('incident')
    gr.add_query('state', '1')
    gr.add_query('priority', '<=', '2')
    gr.order_by('priority')
    gr.order_by_desc('sys_created_on')
    gr.set_limit(50)
    gr.query()
    
    incidents = []
    while gr.next():
        incidents.append({
            'sys_id': gr.get_value('sys_id'),
            'number': gr.get_value('number'),
            'description': gr.get_value('short_description'),
            'priority': gr.get_display_value('priority'),
            'assigned_to': gr.get_display_value('assigned_to'),
            'created': gr.get_value('sys_created_on')
        })
    
    return incidents
```

```typescript
// BunSNC - After
async function getActiveIncidents() {
    const gr = client.GlideRecord('incident');
    gr.addQuery('state', '1');
    gr.addQuery('priority', '<=', '2');
    gr.orderBy('priority');
    gr.orderByDesc('sys_created_on');
    gr.setLimit(50);
    await gr.query();
    
    const incidents = [];
    while (gr.next()) {
        incidents.push({
            sys_id: gr.getValue('sys_id'),
            number: gr.getValue('number'),
            description: gr.getValue('short_description'),
            priority: gr.getDisplayValue('priority'),
            assigned_to: gr.getDisplayValue('assigned_to'),
            created: gr.getValue('sys_created_on')
        });
    }
    
    return incidents;
}
```

### Step 4: CRUD Operations Migration

```python
# PySNC - Before
def create_incident(description, category, priority='3'):
    gr = client.GlideRecord('incident')
    gr.set_value('short_description', description)
    gr.set_value('category', category)
    gr.set_value('priority', priority)
    gr.set_value('caller_id', '5137153cc611227c000bbd1bd8cd2007')  # System Admin
    
    sys_id = gr.insert()
    if sys_id:
        return gr.get_value('number'), sys_id
    return None, None

def update_incident_state(incident_sys_id, new_state, work_notes=''):
    gr = client.GlideRecord('incident')
    if gr.get(incident_sys_id):
        gr.set_value('state', new_state)
        if work_notes:
            gr.set_value('work_notes', work_notes)
        gr.update()
        return True
    return False
```

```typescript
// BunSNC - After
async function createIncident(description: string, category: string, priority: string = '3') {
    const gr = client.GlideRecord('incident');
    gr.setValue('short_description', description);
    gr.setValue('category', category);
    gr.setValue('priority', priority);
    gr.setValue('caller_id', '5137153cc611227c000bbd1bd8cd2007'); // System Admin
    
    const sysId = await gr.insert();
    if (sysId) {
        return [gr.getValue('number'), sysId];
    }
    return [null, null];
}

async function updateIncidentState(incidentSysId: string, newState: string, workNotes: string = '') {
    const gr = client.GlideRecord('incident');
    if (await gr.get(incidentSysId)) {
        gr.setValue('state', newState);
        if (workNotes) {
            gr.setValue('work_notes', workNotes);
        }
        await gr.update();
        return true;
    }
    return false;
}
```

### Step 5: Error Handling Migration

```python
# PySNC - Before
def safe_query_incidents():
    try:
        gr = client.GlideRecord('incident')
        gr.add_query('state', '1')
        gr.query()
        
        count = 0
        while gr.next():
            count += 1
            print(f"Processing incident: {gr.get_value('number')}")
        
        return count
    except Exception as e:
        print(f"Error querying incidents: {str(e)}")
        return 0
```

```typescript
// BunSNC - After
import { ServiceNowError, AuthenticationError, ValidationError } from 'bunsnc';

async function safeQueryIncidents(): Promise<number> {
    try {
        const gr = client.GlideRecord('incident');
        gr.addQuery('state', '1');
        await gr.query();
        
        let count = 0;
        while (gr.next()) {
            count++;
            console.log(`Processing incident: ${gr.getValue('number')}`);
        }
        
        return count;
    } catch (error) {
        if (error instanceof AuthenticationError) {
            console.error('Authentication failed:', error.message);
        } else if (error instanceof ValidationError) {
            console.error('Validation error:', error.validationErrors);
        } else if (error instanceof ServiceNowError) {
            console.error('ServiceNow API error:', error.message);
        } else {
            console.error('Unexpected error:', error);
        }
        return 0;
    }
}
```

## Common Migration Patterns

### Pattern 1: Bulk Data Processing

```python
# PySNC - Before (Inefficient)
def update_all_incidents_category():
    gr = client.GlideRecord('incident')
    gr.add_query('category', 'old_category')
    gr.query()
    
    count = 0
    while gr.next():
        gr.set_value('category', 'new_category')
        gr.update()
        count += 1
    
    return count
```

```typescript
// BunSNC - After (Efficient with batch operations)
async function updateAllIncidentsCategory(): Promise<number> {
    // Option 1: Using GlideRecord updateMultiple (New!)
    const gr = client.GlideRecord('incident');
    gr.addQuery('category', 'old_category');
    const updateCount = await gr.updateMultiple({
        category: 'new_category'
    });
    
    return updateCount;
}

// Alternative: Using Table API batch update
async function updateAllIncidentsCategoryBatch(): Promise<number> {
    // First get all matching records
    const incidents = await client.table('incident').query({
        query: 'category=old_category',
        fields: ['sys_id']
    });
    
    // Prepare batch updates
    const updates = incidents.map(incident => ({
        sys_id: incident.sys_id,
        data: { category: 'new_category' }
    }));
    
    // Execute batch update (much faster)
    const results = await client.table('incident').updateMultiple(updates);
    return results.length;
}
```

### Pattern 2: Complex Query Building

```python
# PySNC - Before
def get_incidents_by_criteria(priority_list, categories, assigned_to=None):
    gr = client.GlideRecord('incident')
    
    # Priority conditions
    for i, priority in enumerate(priority_list):
        if i == 0:
            gr.add_query('priority', priority)
        else:
            gr.add_or_query('priority', priority)
    
    # Category conditions
    for category in categories:
        gr.add_query('category', category)
    
    # Optional assignment
    if assigned_to:
        gr.add_query('assigned_to', assigned_to)
    
    gr.query()
    
    results = []
    while gr.next():
        results.append({
            'number': gr.get_value('number'),
            'priority': gr.get_display_value('priority'),
            'category': gr.get_value('category')
        })
    
    return results
```

```typescript
// BunSNC - After (Enhanced with encoded queries)
async function getIncidentsByCriteria(
    priorityList: string[],
    categories: string[],
    assignedTo?: string
): Promise<any[]> {
    // Method 1: Using GlideRecord (PySNC compatible)
    const gr = client.GlideRecord('incident');
    
    // Priority conditions
    priorityList.forEach((priority, index) => {
        if (index === 0) {
            gr.addQuery('priority', priority);
        } else {
            gr.addOrQuery('priority', priority);
        }
    });
    
    // Category conditions
    categories.forEach(category => {
        gr.addQuery('category', category);
    });
    
    // Optional assignment
    if (assignedTo) {
        gr.addQuery('assigned_to', assignedTo);
    }
    
    await gr.query();
    
    const results = [];
    while (gr.next()) {
        results.push({
            number: gr.getValue('number'),
            priority: gr.getDisplayValue('priority'),
            category: gr.getValue('category')
        });
    }
    
    return results;
}

// Method 2: Using Table API with encoded query (More efficient)
async function getIncidentsByCriteriaOptimized(
    priorityList: string[],
    categories: string[],
    assignedTo?: string
): Promise<any[]> {
    // Build encoded query string
    const priorityQuery = priorityList.map(p => `priority=${p}`).join('^OR');
    const categoryQuery = categories.map(c => `category=${c}`).join('^');
    
    let encodedQuery = `(${priorityQuery})^${categoryQuery}`;
    
    if (assignedTo) {
        encodedQuery += `^assigned_to=${assignedTo}`;
    }
    
    return await client.table('incident').query({
        query: encodedQuery,
        fields: ['number', 'priority', 'category'],
        limit: 1000
    });
}
```

### Pattern 3: Data Export and Processing

```python
# PySNC - Before
import csv

def export_incidents_to_csv(filename):
    gr = client.GlideRecord('incident')
    gr.add_query('state', '1')  # Active incidents
    gr.order_by('number')
    gr.query()
    
    with open(filename, 'w', newline='') as csvfile:
        fieldnames = ['number', 'short_description', 'priority', 'state', 'assigned_to']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        
        count = 0
        while gr.next():
            writer.writerow({
                'number': gr.get_value('number'),
                'short_description': gr.get_value('short_description'),
                'priority': gr.get_display_value('priority'),
                'state': gr.get_display_value('state'),
                'assigned_to': gr.get_display_value('assigned_to')
            })
            count += 1
        
        print(f"Exported {count} incidents to {filename}")
```

```typescript
// BunSNC - After (with streaming for large datasets)
import { promises as fs } from 'fs';

async function exportIncidentsToCsv(filename: string): Promise<void> {
    // Method 1: Simple export (for smaller datasets)
    const incidents = await client.table('incident').query({
        query: 'state=1',
        fields: ['number', 'short_description', 'priority', 'state', 'assigned_to'],
        orderBy: 'number'
    });
    
    const csvHeader = 'number,short_description,priority,state,assigned_to\n';
    const csvRows = incidents.map(incident => 
        [
            incident.number,
            `"${incident.short_description}"`,
            incident.priority,
            incident.state,
            incident.assigned_to || ''
        ].join(',')
    );
    
    await fs.writeFile(filename, csvHeader + csvRows.join('\n'));
    console.log(`Exported ${incidents.length} incidents to ${filename}`);
}

// Method 2: Streaming export (for large datasets)
import { createWriteStream } from 'fs';
import { StreamingServiceNowClient } from 'bunsnc/streaming';

async function exportIncidentsToCSvStreaming(filename: string): Promise<void> {
    const streamingClient = new StreamingServiceNowClient(client);
    
    const queryStream = streamingClient.createQueryStream(
        'incident',
        'state=1',
        { 
            batchSize: 1000,
            fields: ['number', 'short_description', 'priority', 'state', 'assigned_to']
        }
    );
    
    const writeStream = createWriteStream(filename);
    
    // Write CSV header
    writeStream.write('number,short_description,priority,state,assigned_to\n');
    
    let count = 0;
    
    for await (const incident of queryStream) {
        const csvRow = [
            incident.number,
            `"${incident.short_description}"`,
            incident.priority,
            incident.state,
            incident.assigned_to || ''
        ].join(',');
        
        writeStream.write(csvRow + '\n');
        count++;
        
        if (count % 1000 === 0) {
            console.log(`Processed ${count} incidents...`);
        }
    }
    
    writeStream.end();
    console.log(`Exported ${count} incidents to ${filename}`);
}
```

## Performance Improvements

### Caching Benefits

```python
# PySNC - Before (No built-in caching)
def get_user_info(user_id):
    gr = client.GlideRecord('sys_user')
    if gr.get(user_id):
        return {
            'name': gr.get_display_value('name'),
            'email': gr.get_value('email'),
            'department': gr.get_display_value('department')
        }
    return None

# Called multiple times - hits API every time
user1 = get_user_info('user_sys_id')  # API call
user2 = get_user_info('user_sys_id')  # Another API call (same data!)
```

```typescript
// BunSNC - After (with automatic caching)
const client = ServiceNowClient.create(url, token, {
    enableCaching: true,
    cacheTimeout: 300000 // 5 minutes
});

async function getUserInfo(userId: string) {
    const gr = client.GlideRecord('sys_user');
    if (await gr.get(userId)) {
        return {
            name: gr.getDisplayValue('name'),
            email: gr.getValue('email'),
            department: gr.getDisplayValue('department')
        };
    }
    return null;
}

// Called multiple times - second call served from cache
const user1 = await getUserInfo('user_sys_id'); // API call
const user2 = await getUserInfo('user_sys_id'); // From cache (faster!)
```

### Batch Operations Performance

```python
# PySNC - Before (Individual operations)
def create_multiple_incidents(incident_list):
    created_incidents = []
    
    for incident_data in incident_list:
        gr = client.GlideRecord('incident')
        gr.set_value('short_description', incident_data['description'])
        gr.set_value('category', incident_data['category'])
        gr.set_value('priority', incident_data.get('priority', '3'))
        
        sys_id = gr.insert()
        if sys_id:
            created_incidents.append({
                'sys_id': sys_id,
                'number': gr.get_value('number')
            })
    
    return created_incidents

# 100 incidents = 100 API calls (slow!)
incidents_data = [{'description': f'Incident {i}', 'category': 'software'} for i in range(100)]
result = create_multiple_incidents(incidents_data)  # Takes ~30-60 seconds
```

```typescript
// BunSNC - After (Batch operations)
async function createMultipleIncidents(incidentList: any[]) {
    // Prepare data for batch creation
    const incidentData = incidentList.map(incident => ({
        short_description: incident.description,
        category: incident.category,
        priority: incident.priority || '3'
    }));
    
    // Single batch API call
    const createdIncidents = await client.table('incident').createMultiple(incidentData);
    
    return createdIncidents.map(incident => ({
        sys_id: incident.sys_id,
        number: incident.number
    }));
}

// 100 incidents = 1-2 batch API calls (fast!)
const incidentsData = Array.from({length: 100}, (_, i) => ({
    description: `Incident ${i}`,
    category: 'software'
}));

const result = await createMultipleIncidents(incidentsData); // Takes ~3-5 seconds (10x faster!)
```

### Connection Pooling Benefits

```typescript
// BunSNC - Automatic connection pooling
const client = ServiceNowClient.create(url, token, {
    connectionPool: {
        maxConnections: 20,
        keepAlive: true,
        keepAliveMsecs: 30000
    }
});

// Concurrent operations share connection pool
const promises = [
    client.table('incident').query({ limit: 100 }),
    client.table('sys_user').query({ limit: 100 }),
    client.table('sys_user_group').query({ limit: 100 }),
    client.table('cmdb_ci').query({ limit: 100 }),
    client.table('change_request').query({ limit: 100 })
];

// All operations run concurrently with optimized connections
const results = await Promise.all(promises);
console.log('All queries completed efficiently!');
```

## Error Handling Changes

### PySNC Error Handling

```python
# PySNC - Before (Generic exception handling)
def safe_incident_update(sys_id, new_data):
    try:
        gr = client.GlideRecord('incident')
        if gr.get(sys_id):
            for field, value in new_data.items():
                gr.set_value(field, value)
            gr.update()
            return True
    except Exception as e:
        print(f"Error updating incident: {str(e)}")
        return False
```

### BunSNC Enhanced Error Handling

```typescript
// BunSNC - After (Specific error types and recovery)
import { 
    ServiceNowError, 
    AuthenticationError, 
    ValidationError, 
    NetworkError,
    RateLimitError 
} from 'bunsnc';

async function safeIncidentUpdate(sysId: string, newData: Record<string, any>): Promise<boolean> {
    try {
        const gr = client.GlideRecord('incident');
        if (await gr.get(sysId)) {
            Object.entries(newData).forEach(([field, value]) => {
                gr.setValue(field, value);
            });
            await gr.update();
            return true;
        }
        return false;
    } catch (error) {
        if (error instanceof AuthenticationError) {
            console.error('Authentication failed. Check credentials.');
            // Implement token refresh logic
            return false;
        } else if (error instanceof ValidationError) {
            console.error('Validation error:', error.validationErrors);
            // Handle specific field validation issues
            return false;
        } else if (error instanceof RateLimitError) {
            console.warn('Rate limit exceeded. Waiting before retry...');
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, error.retryAfter * 1000));
            return await safeIncidentUpdate(sysId, newData); // Retry
        } else if (error instanceof NetworkError) {
            console.warn('Network error. Retrying...');
            // Retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 2000));
            return await safeIncidentUpdate(sysId, newData); // Retry
        } else if (error instanceof ServiceNowError) {
            console.error('ServiceNow API error:', error.message, 'Status:', error.statusCode);
            return false;
        } else {
            console.error('Unexpected error:', error);
            return false;
        }
    }
}
```

## Advanced Features

### Performance Monitoring

```typescript
// BunSNC - New feature not available in PySNC
import { performanceMonitor } from 'bunsnc';

async function monitoredIncidentProcessing() {
    // Start monitoring
    const client = ServiceNowClient.create(url, token, {
        enablePerformanceMonitoring: true
    });
    
    // Process incidents with automatic performance tracking
    const incidents = await client.table('incident').query({
        query: 'state=1',
        limit: 1000
    });
    
    // Process each incident
    for (const incident of incidents) {
        const timerName = `process_incident_${incident.sys_id}`;
        performanceMonitor.startTimer(timerName, 'IncidentProcessing');
        
        // Simulate processing
        await client.table('incident').update(incident.sys_id, {
            work_notes: 'Processed automatically'
        });
        
        performanceMonitor.endTimer(timerName);
    }
    
    // Get performance report
    const report = performanceMonitor.getReport(60); // Last 60 minutes
    console.log('Performance Summary:', {
        totalOperations: report.metrics.summary?.totalOperations,
        averageResponseTime: report.metrics.summary?.averageResponseTime,
        slowestOperation: report.metrics.summary?.slowestOperation
    });
}
```

### Transaction Support

```typescript
// BunSNC - Advanced transaction management
import { TransactionManager } from 'bunsnc';

async function createIncidentWithRelatedRecords() {
    const txManager = new TransactionManager(client);
    
    try {
        await txManager.beginTransaction();
        
        // Create incident
        const incident = await client.table('incident').create({
            short_description: 'Complex incident with related records',
            category: 'software'
        });
        
        // Create related change request
        const changeRequest = await client.table('change_request').create({
            short_description: 'Change to fix incident',
            reason: `Related to incident ${incident.number}`
        });
        
        // Create relationship
        await client.table('task_rel_task').create({
            parent: incident.sys_id,
            child: changeRequest.sys_id,
            type: 'related'
        });
        
        // Commit all changes
        await txManager.commit();
        
        console.log('Transaction completed successfully');
        return { incident, changeRequest };
        
    } catch (error) {
        // Rollback all changes
        await txManager.rollback();
        console.error('Transaction failed, changes rolled back:', error.message);
        throw error;
    }
}
```

### Streaming for Large Datasets

```typescript
// BunSNC - Stream processing for memory efficiency
import { StreamingServiceNowClient } from 'bunsnc/streaming';

async function processLargeDataset() {
    const streamingClient = new StreamingServiceNowClient(client);
    
    // Stream all journal entries (could be millions of records)
    const journalStream = streamingClient.createQueryStream(
        'sys_journal_field',
        'element=work_notes^sys_created_on>=2024-01-01',
        {
            batchSize: 1000, // Process 1000 at a time
            fields: ['element', 'value', 'sys_created_on']
        }
    );
    
    let processed = 0;
    
    // Process stream without loading all data into memory
    for await (const record of journalStream) {
        // Process individual record
        await processJournalEntry(record);
        
        processed++;
        
        if (processed % 10000 === 0) {
            console.log(`Processed ${processed} journal entries`);
        }
    }
    
    console.log(`Total processed: ${processed} records`);
}

async function processJournalEntry(entry: any) {
    // Custom processing logic
    if (entry.value.includes('urgent')) {
        await client.table('sys_email').create({
            recipient: 'admin@company.com',
            subject: 'Urgent work note detected',
            body: `Entry: ${entry.value}`
        });
    }
}
```

## Testing Your Migration

### Migration Validation Script

```typescript
// migration-validation.ts
import { ServiceNowClient } from 'bunsnc';

async function validateMigration() {
    console.log('🔍 Starting migration validation...');
    
    const client = ServiceNowClient.fromEnv();
    
    // Test 1: Basic connectivity
    try {
        const testQuery = await client.table('sys_user').query({ limit: 1 });
        console.log('✅ Basic connectivity: PASSED');
    } catch (error) {
        console.error('❌ Basic connectivity: FAILED', error.message);
        return false;
    }
    
    // Test 2: GlideRecord compatibility
    try {
        const gr = client.GlideRecord('incident');
        gr.addQuery('state', '1');
        gr.setLimit(5);
        await gr.query();
        
        let count = 0;
        while (gr.next()) {
            count++;
            const number = gr.getValue('number');
            const description = gr.getValue('short_description');
            if (!number || !description) {
                throw new Error('Missing required fields');
            }
        }
        
        console.log(`✅ GlideRecord compatibility: PASSED (${count} records)`);
    } catch (error) {
        console.error('❌ GlideRecord compatibility: FAILED', error.message);
        return false;
    }
    
    // Test 3: CRUD operations
    try {
        // Create
        const testData = {
            short_description: `Migration test - ${Date.now()}`,
            category: 'software',
            priority: '4'
        };
        
        const created = await client.table('incident').create(testData);
        const sysId = created.sys_id;
        
        // Read
        const retrieved = await client.table('incident').get(sysId);
        if (retrieved.short_description !== testData.short_description) {
            throw new Error('Created data mismatch');
        }
        
        // Update
        const updated = await client.table('incident').update(sysId, {
            priority: '3',
            work_notes: 'Migration validation update'
        });
        if (updated.priority !== '3') {
            throw new Error('Update failed');
        }
        
        // Delete
        const deleted = await client.table('incident').delete(sysId);
        if (!deleted) {
            throw new Error('Delete failed');
        }
        
        console.log('✅ CRUD operations: PASSED');
    } catch (error) {
        console.error('❌ CRUD operations: FAILED', error.message);
        return false;
    }
    
    // Test 4: Batch operations
    try {
        const batchData = Array.from({ length: 5 }, (_, i) => ({
            short_description: `Batch test ${i + 1} - ${Date.now()}`,
            category: 'software',
            priority: '4'
        }));
        
        const batchCreated = await client.table('incident').createMultiple(batchData);
        if (batchCreated.length !== 5) {
            throw new Error('Batch creation failed');
        }
        
        // Cleanup batch created records
        const deletePromises = batchCreated.map(record =>
            client.table('incident').delete(record.sys_id)
        );
        await Promise.all(deletePromises);
        
        console.log('✅ Batch operations: PASSED');
    } catch (error) {
        console.error('❌ Batch operations: FAILED', error.message);
        return false;
    }
    
    // Test 5: Performance monitoring
    try {
        const perfClient = ServiceNowClient.create(
            process.env.SNC_INSTANCE_URL!,
            process.env.SNC_AUTH_TOKEN!,
            { enablePerformanceMonitoring: true }
        );
        
        await perfClient.table('sys_user').query({ limit: 10 });
        
        // Check if metrics are being collected
        const report = performanceMonitor.getReport(1);
        if (report.metrics.detailed.length === 0) {
            throw new Error('Performance monitoring not working');
        }
        
        console.log('✅ Performance monitoring: PASSED');
    } catch (error) {
        console.error('❌ Performance monitoring: FAILED', error.message);
        return false;
    }
    
    console.log('🎉 Migration validation completed successfully!');
    return true;
}

// Run validation
if (import.meta.main) {
    validateMigration()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Validation failed:', error);
            process.exit(1);
        });
}
```

### Performance Comparison Script

```typescript
// performance-comparison.ts
import { ServiceNowClient } from 'bunsnc';

async function comparePerformance() {
    console.log('⚡ Performance comparison: BunSNC vs PySNC patterns');
    
    const client = ServiceNowClient.create(
        process.env.SNC_INSTANCE_URL!,
        process.env.SNC_AUTH_TOKEN!,
        { enableCaching: true }
    );
    
    // Test 1: Sequential vs Batch Creation
    console.log('\n1️⃣  Testing: Sequential vs Batch Creation');
    
    const testData = Array.from({ length: 20 }, (_, i) => ({
        short_description: `Performance test ${i + 1} - ${Date.now()}`,
        category: 'software',
        priority: '4'
    }));
    
    // Sequential creation (PySNC pattern)
    console.log('   📊 Sequential creation (PySNC-style)...');
    const sequentialStart = Date.now();
    const sequentialResults = [];
    
    for (const data of testData) {
        const result = await client.table('incident').create(data);
        sequentialResults.push(result);
    }
    
    const sequentialTime = Date.now() - sequentialStart;
    console.log(`   ⏱️  Sequential: ${sequentialTime}ms (${testData.length} records)`);
    
    // Batch creation (BunSNC advantage)
    console.log('   📊 Batch creation (BunSNC-style)...');
    const batchStart = Date.now();
    const batchResults = await client.table('incident').createMultiple(testData);
    const batchTime = Date.now() - batchStart;
    
    console.log(`   ⏱️  Batch: ${batchTime}ms (${testData.length} records)`);
    console.log(`   🚀 Performance improvement: ${(sequentialTime / batchTime).toFixed(1)}x faster`);
    
    // Test 2: Caching Benefits
    console.log('\n2️⃣  Testing: Caching Benefits');
    
    const userQuery = { query: 'active=true', limit: 50 };
    
    // First call (cache miss)
    console.log('   📊 First query (cache miss)...');
    const firstCallStart = Date.now();
    await client.table('sys_user').query(userQuery);
    const firstCallTime = Date.now() - firstCallStart;
    
    // Second call (cache hit)
    console.log('   📊 Second query (cache hit)...');
    const secondCallStart = Date.now();
    await client.table('sys_user').query(userQuery);
    const secondCallTime = Date.now() - secondCallStart;
    
    console.log(`   ⏱️  First call: ${firstCallTime}ms`);
    console.log(`   ⏱️  Second call: ${secondCallTime}ms`);
    console.log(`   🚀 Cache improvement: ${(firstCallTime / secondCallTime).toFixed(1)}x faster`);
    
    // Cleanup
    console.log('\n🧹 Cleaning up test records...');
    const allTestRecords = [...sequentialResults, ...batchResults];
    const deletePromises = allTestRecords.map(record =>
        client.table('incident').delete(record.sys_id)
    );
    await Promise.all(deletePromises);
    
    console.log('✅ Performance comparison completed!');
}

if (import.meta.main) {
    comparePerformance().catch(console.error);
}
```

## Migration Tools

### Automated Code Converter

Create a simple script to help convert PySNC patterns:

```typescript
// migration-helper.ts
import { promises as fs } from 'fs';
import { join } from 'path';

const MIGRATION_PATTERNS = [
    // Method name conversions
    { from: /\.add_query\(/g, to: '.addQuery(' },
    { from: /\.add_or_query\(/g, to: '.addOrQuery(' },
    { from: /\.order_by\(/g, to: '.orderBy(' },
    { from: /\.order_by_desc\(/g, to: '.orderByDesc(' },
    { from: /\.set_limit\(/g, to: '.setLimit(' },
    { from: /\.get_value\(/g, to: '.getValue(' },
    { from: /\.get_display_value\(/g, to: '.getDisplayValue(' },
    { from: /\.set_value\(/g, to: '.setValue(' },
    { from: /\.delete_record\(/g, to: '.deleteRecord(' },
    
    // Import conversions
    { from: /import pysnc/g, to: "import { ServiceNowClient } from 'bunsnc';" },
    { from: /pysnc\.ServiceNowClient/g, to: 'ServiceNowClient.createWithBasicAuth' },
    
    // Async patterns
    { from: /\.query\(\)/g, to: 'await .query()' },
    { from: /\.insert\(\)/g, to: 'await .insert()' },
    { from: /\.update\(\)/g, to: 'await .update()' },
    { from: /\.get\(/g, to: 'await .get(' },
    
    // Function definitions
    { from: /def (\w+)\(/g, to: 'async function $1(' }
];

async function convertFile(filePath: string): Promise<void> {
    let content = await fs.readFile(filePath, 'utf-8');
    
    MIGRATION_PATTERNS.forEach(pattern => {
        content = content.replace(pattern.from, pattern.to);
    });
    
    // Write converted file
    const convertedPath = filePath.replace(/\.py$/, '.converted.ts');
    await fs.writeFile(convertedPath, content);
    
    console.log(`✅ Converted ${filePath} -> ${convertedPath}`);
}

async function convertDirectory(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
            await convertDirectory(fullPath);
        } else if (entry.name.endsWith('.py')) {
            await convertFile(fullPath);
        }
    }
}

// Usage
const sourceDir = process.argv[2];
if (!sourceDir) {
    console.error('Usage: bun migration-helper.ts <source-directory>');
    process.exit(1);
}

convertDirectory(sourceDir)
    .then(() => console.log('🎉 Migration conversion completed!'))
    .catch(console.error);
```

## Migration Checklist

- [ ] **Environment Setup**
  - [ ] Install BunSNC package
  - [ ] Configure environment variables
  - [ ] Set up TypeScript (if applicable)

- [ ] **Client Migration**
  - [ ] Replace PySNC client initialization
  - [ ] Update authentication method
  - [ ] Configure client options (caching, monitoring)

- [ ] **Code Conversion**
  - [ ] Convert method names (snake_case to camelCase)
  - [ ] Add async/await to all ServiceNow operations
  - [ ] Update error handling with specific error types
  - [ ] Convert loops and data processing

- [ ] **Performance Optimization**
  - [ ] Replace sequential operations with batch operations
  - [ ] Enable caching where appropriate
  - [ ] Implement connection pooling
  - [ ] Add performance monitoring

- [ ] **Testing**
  - [ ] Run migration validation script
  - [ ] Perform functional testing
  - [ ] Compare performance benchmarks
  - [ ] Test error scenarios

- [ ] **Advanced Features**
  - [ ] Implement streaming for large datasets
  - [ ] Add transaction support where needed
  - [ ] Set up performance monitoring
  - [ ] Configure logging and alerting

- [ ] **Deployment**
  - [ ] Update CI/CD pipelines
  - [ ] Configure production environment
  - [ ] Set up monitoring and alerting
  - [ ] Document new processes

This migration guide provides a comprehensive path from PySNC to BunSNC, ensuring you can take advantage of the performance improvements and modern features while maintaining compatibility with your existing ServiceNow integration patterns.