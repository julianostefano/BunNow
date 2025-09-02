# Getting Started Guide

**Author**: Juliano Stefano <jsdealencar@ayesa.com> [2025]

## Prerequisites

Before using BunSNC, ensure you have the following:

### Runtime Requirements
- **Bun 1.2+** (recommended) or **Node.js 18+**
- **TypeScript 5.3+** (for TypeScript projects)
- **ServiceNow instance** (any version with REST API support)

### ServiceNow Requirements
- Active ServiceNow instance with REST API enabled
- Valid ServiceNow user account with appropriate permissions
- One of the following authentication methods:
  - API Token (recommended)
  - Basic Authentication (username/password)
  - OAuth 2.0 token

## Installation

### Using Bun (Recommended)
```bash
bun add bunsnc
```

### Using npm
```bash
npm install bunsnc
```

### Using yarn
```bash
yarn add bunsnc
```

## Quick Setup

### 1. Environment Configuration

Create a `.env` file in your project root:

```bash
# Required
SNC_INSTANCE_URL=https://your-instance.service-now.com
SNC_AUTH_TOKEN=your-api-token

# Optional - Basic Auth (alternative to token)
SNC_USERNAME=your-username
SNC_PASSWORD=your-password

# Optional - OAuth (alternative authentication)
SNC_CLIENT_ID=your-oauth-client-id
SNC_CLIENT_SECRET=your-oauth-secret

# Optional - Proxy Configuration
SNC_PROXY_URL=http://your-proxy:8080

# Optional - Performance Tuning
SNC_CACHE_ENABLED=true
SNC_CACHE_SIZE=1000
SNC_CONCURRENT_LIMIT=5
```

### 2. Basic Client Setup

```typescript
import { ServiceNowClient } from 'bunsnc';

// Method 1: From environment variables (recommended)
const client = ServiceNowClient.fromEnv();

// Method 2: Direct token authentication
const client = ServiceNowClient.create(
  'https://your-instance.service-now.com',
  'your-api-token'
);

// Method 3: Basic authentication
const client = ServiceNowClient.createWithBasicAuth(
  'https://your-instance.service-now.com',
  'username',
  'password'
);
```

## Your First Query

### Simple Record Query

```typescript
import { ServiceNowClient } from 'bunsnc';

async function queryIncidents() {
  const client = ServiceNowClient.fromEnv();
  
  // Query active P1 incidents
  const incidents = await client.table('incident')
    .query({
      query: 'state=1^priority=1',
      fields: ['number', 'short_description', 'assigned_to', 'state'],
      limit: 10
    });
  
  console.log(`Found ${incidents.length} P1 incidents:`);
  incidents.forEach(incident => {
    console.log(`${incident.number}: ${incident.short_description}`);
  });
}

queryIncidents().catch(console.error);
```

### Using GlideRecord Pattern

```typescript
import { ServiceNowClient } from 'bunsnc';

async function queryWithGlideRecord() {
  const client = ServiceNowClient.fromEnv();
  
  // Create GlideRecord for incident table
  const gr = client.GlideRecord('incident');
  
  // Build query conditions
  gr.addQuery('state', '1');           // Active
  gr.addQuery('priority', '<=', '2');   // High priority
  gr.addQuery('assigned_to', 'IS NOT EMPTY');
  
  // Set ordering and limits
  gr.orderBy('priority');
  gr.orderByDesc('sys_created_on');
  gr.setLimit(5);
  
  // Execute query
  await gr.query();
  
  // Process results
  console.log(`Found ${gr.getRowCount()} incidents:`);
  while (gr.next()) {
    console.log({
      number: gr.getValue('number'),
      description: gr.getValue('short_description'),
      assignee: gr.getDisplayValue('assigned_to'),
      priority: gr.getDisplayValue('priority')
    });
  }
}

queryWithGlideRecord().catch(console.error);
```

## Creating Records

### Simple Record Creation

```typescript
async function createIncident() {
  const client = ServiceNowClient.fromEnv();
  
  const newIncident = await client.table('incident').create({
    short_description: 'Server outage in data center',
    category: 'hardware',
    subcategory: 'server',
    priority: '1',
    urgency: '1',
    impact: '1',
    caller_id: '5137153cc611227c000bbd1bd8cd2007', // System Administrator
    assignment_group: 'network'
  });
  
  console.log('Created incident:', newIncident.number);
  return newIncident.sys_id;
}
```

### Using GlideRecord for Creation

```typescript
async function createIncidentWithGR() {
  const client = ServiceNowClient.fromEnv();
  
  const gr = client.GlideRecord('incident');
  
  // Set field values
  gr.setValue('short_description', 'Database connection timeout');
  gr.setValue('category', 'software');
  gr.setValue('subcategory', 'database');
  gr.setValue('priority', '2');
  gr.setValue('caller_id', '5137153cc611227c000bbd1bd8cd2007');
  
  // Use display values for reference fields
  gr.setDisplayValue('assignment_group', 'Database Team');
  gr.setDisplayValue('assigned_to', 'John Doe');
  
  // Insert the record
  const sysId = await gr.insert();
  
  console.log('Created incident with sys_id:', sysId);
  console.log('Incident number:', gr.getValue('number'));
}
```

## Updating Records

### Direct Table Update

```typescript
async function updateIncident(sysId: string) {
  const client = ServiceNowClient.fromEnv();
  
  const updated = await client.table('incident').update(sysId, {
    state: '2', // In Progress
    work_notes: 'Investigation started',
    assigned_to: '5137153cc611227c000bbd1bd8cd2005'
  });
  
  console.log('Updated incident:', updated.number);
}
```

### Using GlideRecord for Updates

```typescript
async function updateIncidentWithGR(incidentNumber: string) {
  const client = ServiceNowClient.fromEnv();
  
  const gr = client.GlideRecord('incident');
  gr.addQuery('number', incidentNumber);
  await gr.query();
  
  if (gr.next()) {
    gr.setValue('state', '3'); // Work in Progress
    gr.setValue('work_notes', 'Root cause identified, implementing fix');
    gr.setDisplayValue('assigned_to', 'Jane Smith');
    
    await gr.update();
    console.log('Updated incident:', gr.getValue('number'));
  } else {
    console.log('Incident not found:', incidentNumber);
  }
}
```

## Error Handling Best Practices

### Basic Error Handling

```typescript
import { ServiceNowError, AuthenticationError, ValidationError } from 'bunsnc';

async function robustQuery() {
  const client = ServiceNowClient.fromEnv();
  
  try {
    const incidents = await client.table('incident').query({
      query: 'state=1',
      limit: 100
    });
    
    return incidents;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error('Authentication failed. Check your credentials.');
      // Implement credential refresh logic
    } else if (error instanceof ValidationError) {
      console.error('Validation error:', error.validationErrors);
      // Handle field validation issues
    } else if (error instanceof ServiceNowError) {
      console.error('ServiceNow API error:', error.message);
      console.error('Status:', error.statusCode);
    } else {
      console.error('Unexpected error:', error);
    }
    
    throw error; // Re-throw for upstream handling
  }
}
```

### Retry Logic for Transient Errors

```typescript
async function queryWithRetry(maxAttempts = 3) {
  const client = ServiceNowClient.fromEnv();
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const incidents = await client.table('incident').query();
      return incidents;
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxAttempts) {
        throw error; // Final attempt failed
      }
      
      // Wait before retry (exponential backoff)
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
```

## Performance Optimization

### Enable Caching

```typescript
const client = ServiceNowClient.create(url, token, {
  enableCaching: true,
  cacheTimeout: 300000, // 5 minutes
  cacheMaxSize: 1000
});

// First query - hits the API
const incidents1 = await client.table('incident').query({ query: 'state=1' });

// Second identical query - served from cache
const incidents2 = await client.table('incident').query({ query: 'state=1' });
```

### Batch Operations for Efficiency

```typescript
async function efficientBatchCreation() {
  const client = ServiceNowClient.fromEnv();
  
  // Create multiple incidents efficiently
  const incidentData = [
    { short_description: 'Server A down', category: 'hardware' },
    { short_description: 'Server B slow', category: 'hardware' },
    { short_description: 'App crash', category: 'software' }
  ];
  
  const results = await client.table('incident').createMultiple(incidentData);
  
  console.log(`Created ${results.length} incidents`);
  results.forEach(result => {
    console.log('Created:', result.number);
  });
}
```

### Optimize Field Selection

```typescript
async function optimizedQuery() {
  const client = ServiceNowClient.fromEnv();
  
  // Only fetch needed fields to reduce payload size
  const incidents = await client.table('incident').query({
    query: 'state=1',
    fields: ['number', 'short_description', 'priority'], // Only essential fields
    limit: 100
  });
  
  return incidents;
}
```

## Working with Attachments

### Upload File Attachment

```typescript
import { promises as fs } from 'fs';

async function uploadDocument(incidentSysId: string) {
  const client = ServiceNowClient.fromEnv();
  
  // Read file from disk
  const fileBuffer = await fs.readFile('/path/to/document.pdf');
  
  // Upload attachment
  const attachmentId = await client.uploadAttachment(
    'incident-documentation.pdf',
    'incident',
    incidentSysId,
    fileBuffer,
    'application/pdf'
  );
  
  console.log('Uploaded attachment with ID:', attachmentId);
}
```

### Download Attachment

```typescript
async function downloadAttachment(attachmentSysId: string) {
  const client = ServiceNowClient.fromEnv();
  
  // Download as buffer
  const buffer = await client.downloadAttachment(attachmentSysId);
  
  // Save to disk
  await fs.writeFile('/local/downloads/downloaded-file.pdf', buffer);
  
  console.log('Downloaded attachment successfully');
}
```

## Advanced Query Patterns

### Complex Queries with Multiple Conditions

```typescript
async function complexIncidentQuery() {
  const client = ServiceNowClient.fromEnv();
  
  const gr = client.GlideRecord('incident');
  
  // Multiple AND conditions
  gr.addQuery('state', '1'); // Active
  gr.addQuery('priority', '<=', '2'); // High priority
  gr.addQuery('category', 'hardware');
  
  // OR condition
  gr.addOrQuery('assignment_group', 'network');
  gr.addOrQuery('assignment_group', 'server');
  
  // Date range query
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  gr.addQuery('sys_created_on', '>=', sevenDaysAgo.toISOString());
  
  // Null checks
  gr.addNotNullQuery('assigned_to'); // Must be assigned
  
  // Execute query
  await gr.query();
  
  const results = [];
  while (gr.next()) {
    results.push({
      number: gr.getValue('number'),
      description: gr.getValue('short_description'),
      assignee: gr.getDisplayValue('assigned_to'),
      group: gr.getDisplayValue('assignment_group'),
      created: gr.getValue('sys_created_on')
    });
  }
  
  return results;
}
```

### Pagination for Large Result Sets

```typescript
async function processAllIncidents() {
  const client = ServiceNowClient.fromEnv();
  const pageSize = 100;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const incidents = await client.table('incident').query({
      query: 'state=1',
      limit: pageSize,
      offset: offset,
      fields: ['number', 'short_description', 'priority']
    });
    
    if (incidents.length === 0) {
      hasMore = false;
      break;
    }
    
    // Process current page
    console.log(`Processing ${incidents.length} incidents (offset: ${offset})`);
    incidents.forEach(incident => {
      console.log(`Processing: ${incident.number}`);
    });
    
    offset += pageSize;
    hasMore = incidents.length === pageSize; // If less than page size, we're done
  }
  
  console.log('Finished processing all incidents');
}
```

## Configuration and Customization

### Custom Client Configuration

```typescript
const client = ServiceNowClient.create(url, token, {
  // Performance settings
  enableCaching: true,
  cacheTimeout: 600000, // 10 minutes
  enablePerformanceMonitoring: true,
  
  // Retry settings
  maxRetries: 5,
  retryDelay: 2000, // 2 seconds
  
  // Connection settings
  timeout: 60000, // 60 seconds
  proxy: 'http://corporate-proxy:8080',
  
  // Logging
  logLevel: 'info',
  enableStructuredLogging: true,
  
  // Custom headers
  headers: {
    'X-Custom-Header': 'BunSNC-Client',
    'User-Agent': 'MyApp/1.0'
  }
});
```

### Environment-Specific Configurations

```typescript
// development.ts
export const devConfig = {
  enableCaching: false, // Always fresh data in development
  enablePerformanceMonitoring: true,
  logLevel: 'debug' as const,
  maxRetries: 1
};

// production.ts
export const prodConfig = {
  enableCaching: true,
  cacheTimeout: 300000,
  enablePerformanceMonitoring: true,
  logLevel: 'warn' as const,
  maxRetries: 3
};

// main.ts
import { devConfig, prodConfig } from './config';

const config = process.env.NODE_ENV === 'production' ? prodConfig : devConfig;
const client = ServiceNowClient.create(url, token, config);
```

## Next Steps

Now that you've completed the getting started guide, explore these advanced topics:

1. **[Advanced Usage Guide](./ADVANCED.md)** - Learn about batch operations, transactions, and advanced patterns
2. **[Performance Guide](./PERFORMANCE.md)** - Optimize your ServiceNow integrations for high performance
3. **[Testing Guide](./TESTING.md)** - Test your ServiceNow integrations effectively
4. **[API Documentation](./API.md)** - Complete API reference for all features
5. **[Migration Guide](./MIGRATION.md)** - Migrate from PySNC to BunSNC

## Common Issues and Solutions

### Authentication Problems

**Issue**: `AuthenticationError: Invalid credentials`
**Solution**: 
- Verify your ServiceNow instance URL is correct
- Check that your API token is valid and not expired
- Ensure your user has sufficient permissions for the operations you're attempting

### Connection Timeouts

**Issue**: `NetworkError: Request timeout`
**Solution**:
- Increase the timeout setting in client configuration
- Check your network connection to the ServiceNow instance
- Consider using a proxy if required by your network setup

### Rate Limiting

**Issue**: `RateLimitError: API rate limit exceeded`
**Solution**:
- Implement exponential backoff retry logic
- Reduce the number of concurrent requests
- Use batch operations where possible to reduce API calls

### Large Result Sets

**Issue**: Memory issues with large queries
**Solution**:
- Use pagination to process results in smaller chunks
- Specify only required fields to reduce payload size
- Consider using streaming for very large operations

## Support

If you encounter issues not covered in this guide:

1. Check the [API Documentation](./API.md) for detailed method information
2. Review the [GitHub Issues](https://github.com/julianostefano/BunNow/issues) for known problems
3. Join the [GitHub Discussions](https://github.com/julianostefano/BunNow/discussions) for community support