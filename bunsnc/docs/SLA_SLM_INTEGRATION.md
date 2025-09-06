# SLA/SLM Integration Documentation
**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

## Overview

This document provides comprehensive information about the SLA (Service Level Agreement) and SLM (Service Level Management) integration implemented in the BunSNC framework. The integration follows the patterns established in the existing Python ServiceNow collectors, ensuring consistency and compatibility with established workflows.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [TypeScript Types and Interfaces](#typescript-types-and-interfaces)
3. [ServiceNow Service Layer](#servicenow-service-layer)
4. [Data Storage Strategy](#data-storage-strategy)
5. [Web Dashboard Integration](#web-dashboard-integration)
6. [Real-time Streaming](#real-time-streaming)
7. [CLI Tools and Testing](#cli-tools-and-testing)
8. [API Endpoints](#api-endpoints)
9. [Python Integration Patterns](#python-integration-patterns)
10. [Usage Examples](#usage-examples)
11. [Performance Considerations](#performance-considerations)
12. [Troubleshooting](#troubleshooting)

## Architecture Overview

The SLA/SLM integration is built around the core principle: **"tickets must be stored together with SLM table data"** (Portuguese: "os tickets devem ser armazenados juntos com os dados da tabela de slms"). This approach ensures data consistency and enables efficient querying of combined ticket+SLA information.

### Core Components

```
BunSNC SLA/SLM Integration
├── TypeScript Types (servicenow.ts)
├── ServiceNow Service Layer (servicenow.service.ts)
├── Enhanced Storage Service (EnhancedTicketStorageService.ts)
├── Web Dashboard (htmx-dashboard-clean.ts)
├── Streaming Service (StreamingService.ts)
├── CLI Testing Tools (cli-endpoint-tests.ts)
└── Endpoint Mapper (ServiceNowEndpointMapper.ts)
```

### Data Flow Architecture

```
ServiceNow API (task_sla) → ServiceNowService → Combined Document Structure → MongoDB Storage
                              ↓
Web Dashboard ← SLA Tab Display ← HTMX Endpoints ← Real-time Updates ← Streaming Service
```

## TypeScript Types and Interfaces

### Core SLM Types

```typescript
// Basic SLM record structure matching ServiceNow task_sla table
export interface SLMRecord {
  sys_id: string;
  task_number: string;
  taskslatable_business_percentage: string | null;
  taskslatable_start_time: string | null;
  taskslatable_end_time: string | null;
  taskslatable_sla: string | null;
  taskslatable_stage: string | null;
  taskslatable_has_breached: string | boolean;
  task_assignment_group: string | null;
  raw_data: ServiceNowRecord;
}

// Combined ticket + SLM storage document
export interface TicketWithSLMs<T = BaseTicketRecord> {
  ticket: T;
  slms: SLMRecord[];
  sync_timestamp: string;
  collection_version: string;
}

// SLA analysis and summary types
export interface SLABreachInfo {
  sla_name: string;
  has_breached: boolean;
  business_percentage: number;
  start_time: string | null;
  end_time: string | null;
  stage: string;
  breach_time?: string;
}

export interface TicketSLASummary {
  ticket_number: string;
  total_slas: number;
  active_slas: number;
  breached_slas: number;
  breach_percentage: number;
  worst_sla: SLABreachInfo | null;
  all_slas: SLABreachInfo[];
}
```

### Specialized Ticket Types

```typescript
export interface IncidentWithSLMs extends TicketWithSLMs<IncidentRecord> {}
export interface ChangeTaskWithSLMs extends TicketWithSLMs<ChangeTaskRecord> {}
export interface ServiceCatalogTaskWithSLMs extends TicketWithSLMs<ServiceCatalogTaskRecord> {}
```

## ServiceNow Service Layer

### Enhanced ServiceNowService Methods

The `ServiceNowService` class has been enhanced with SLA-specific methods:

#### `getTaskSLAs(options: TaskSLAQueryOptions): Promise<TaskSLAResponse>`
Retrieves SLA records for a specific task number.

```typescript
const slaResponse = await sncService.getTaskSLAs({ 
  taskNumber: 'INC0012345', 
  includeDisplayValues: true 
});
```

#### `getTaskSLASummary(taskNumber: string): Promise<TicketSLASummary>`
Provides a comprehensive SLA summary including breach analysis.

```typescript
const summary = await sncService.getTaskSLASummary('INC0012345');
console.log(`Breach rate: ${summary.breach_percentage}%`);
```

#### `getMultipleTaskSLAs(taskNumbers: string[]): Promise<Record<string, SLMRecord[]>>`
Efficiently retrieves SLAs for multiple tickets in batches.

```typescript
const slas = await sncService.getMultipleTaskSLAs(['INC0012345', 'CHG0034567']);
```

### Data Processing Helpers

```typescript
// Helper methods for data extraction and parsing
private extractValue(field: any): string
private parseBoolean(value: string | boolean): boolean
private parsePercentage(value: string | null): number
```

## Data Storage Strategy

### Combined Document Structure

Following the Python reference patterns, tickets are stored together with their SLM data:

```javascript
// MongoDB Document Structure
{
  "_id": "incident_sys_id_here",
  "ticket": {
    "sys_id": "...",
    "number": "INC0012345",
    "state": "2",
    "priority": "2",
    // ... all incident fields
  },
  "slms": [
    {
      "sys_id": "sla_sys_id_1",
      "task_number": "INC0012345",
      "taskslatable_business_percentage": "85.5",
      "taskslatable_has_breached": false,
      "taskslatable_sla": "Resolution Time",
      // ... SLA fields
    }
  ],
  "sync_timestamp": "2025-01-20T10:30:00.000Z",
  "collection_version": "1.0.0"
}
```

### MongoDB Collections

```typescript
// Collection naming pattern
ticket_${type}_with_slms
// Examples:
// - ticket_incident_with_slms
// - ticket_change_task_with_slms  
// - ticket_sc_task_with_slms
```

### Indexing Strategy

```javascript
// Required indexes for optimal performance
{
  "ticket.sys_id": 1,        // Unique index
  "ticket.number": 1,        // Unique index  
  "slms.taskslatable_has_breached": 1,  // Breach queries
  "sync_timestamp": -1,      // Temporal queries
  "ticket.sys_id": "text"    // Text search
}
```

## Web Dashboard Integration

### SLA Tab in Ticket Details Modal

The web dashboard includes a dedicated SLA tab in the ticket details modal:

#### Features:
- **SLA Summary Cards**: Total SLAs, Active SLAs, Breached SLAs, Breach Percentage
- **Individual SLA Details**: Progress bars, timelines, status indicators
- **Real-time Updates**: HTMX-powered refresh functionality
- **Visual Indicators**: Color-coded status (green/yellow/red)

#### HTMX Integration:
```html
<!-- SLA Tab with HTMX loading -->
<div id="sla-content-${sysId}" 
     hx-get="/htmx/ticket-sla/${number}" 
     hx-trigger="load" 
     hx-target="this">
  <!-- Loading state -->
</div>
```

### SLA Display Components

#### Status Badges:
- 🔴 **VIOLADO** (Breached)
- 🟡 **EM ANDAMENTO** (In Progress - Warning)  
- 🟢 **CUMPRIDO** (Completed)

#### Progress Bars:
```html
<div class="w-full bg-gray-700 rounded-full h-2">
  <div class="h-2 rounded-full bg-red-500" style="width: 110%"></div>
</div>
```

## Real-time Streaming

### SLA Event Types

The `StreamingService` supports several SLA-specific event types:

```typescript
export interface SLAEvent extends StreamEvent {
  event: 'sla-breach' | 'sla-warning' | 'sla-created' | 'sla-updated';
  data: {
    ticketNumber: string;
    slaName: string;
    businessPercentage: number;
    hasBreached: boolean;
    // ... additional SLA data
  };
}
```

### Streaming Methods

#### `createSLAMonitoringStream(clientId, filters)`
Real-time SLA breach alerts and warnings.

#### `createSLAProgressStream(clientId, operation)`
Bulk SLA processing progress monitoring.

#### `createSLADashboardStream(clientId, intervalSeconds)`
Real-time SLA dashboard statistics.

### Usage Example:
```typescript
// Create SLA monitoring stream
const stream = streamingService.createSLAMonitoringStream('client123', {
  breachesOnly: true
});

// Broadcast SLA breach
streamingService.broadcastSLABreach({
  event: 'sla-breach',
  data: { /* breach data */ }
});
```

## CLI Tools and Testing

### New SLA-Specific Commands

#### `bun src/tests/cli-endpoint-tests.ts test-slas -t INC0012345,CHG0034567`
Test SLA data collection for specific tickets.

#### `bun src/tests/cli-endpoint-tests.ts analyze-sla-tables`
Comprehensive analysis of SLA-related tables.

#### `bun src/tests/cli-endpoint-tests.ts test-ticket-sla-join -t INC0012345`
Test combined ticket + SLA data collection (matches Python patterns).

### ServiceNowEndpointMapper Enhancements

The endpoint mapper now includes SLA table analysis:

```typescript
const slaRelatedTables = [
  'task_sla',      // Primary SLA table
  'incident_sla',  // Legacy incident SLAs
  'contract_sla',  // Contract-based SLAs
  'sla_definition',// SLA definitions
  'sla'            // Base SLA table
];
```

## API Endpoints

### HTMX Endpoints

#### `GET /htmx/ticket-sla/:ticketNumber`
Returns formatted HTML for SLA information display.

**Response**: HTML with SLA summary cards and detailed SLA information.

### REST API Endpoints

#### `GET /api/ticket/:sysId/sla`
Returns JSON SLA data for programmatic access.

#### `POST /api/sla/bulk-sync`
Triggers bulk SLA synchronization process.

## Python Integration Patterns

### Reference Implementation Analysis

The TypeScript implementation follows patterns from the Python reference scripts:

#### Python Pattern:
```python
def get_incident_slms(self, incident_sys_id, incident_number):
    # Get SLMs from incident_sla table
    slms_data = self.get_table_data('incident_sla', 
                                  f'task={incident_sys_id}')
    return slms_data

# Combined storage in PostgreSQL JSONB
document = {
    "incident": incident_data,
    "slms": slms_data,
    "sync_timestamp": datetime.now().isoformat()
}
```

#### TypeScript Implementation:
```typescript
async getTaskSLAs(options: TaskSLAQueryOptions): Promise<TaskSLAResponse> {
  const params = new URLSearchParams();
  params.append('sysparm_query', `task.number=${options.taskNumber}`);
  
  const response = await fetch(`${this.baseUrl}/task_sla?${params.toString()}`);
  // Process and return SLA data
}

// Combined document structure matches Python pattern
const combinedDocument = {
  ticket: ticketData,
  slms: slaData,
  sync_timestamp: new Date().toISOString(),
  collection_version: "1.0.0"
};
```

### Key Compatibility Points

1. **Same Field Mappings**: TypeScript uses identical field names from Python
2. **Combined Storage**: Both store tickets+SLMs together
3. **Query Patterns**: Similar API query structures
4. **Data Processing**: Consistent data extraction and parsing logic

## Usage Examples

### Basic SLA Integration

```typescript
import { ServiceNowService } from './services/servicenow.service';

const sncService = new ServiceNowService(instanceUrl, authToken);

// Get SLA summary for a ticket
const summary = await sncService.getTaskSLASummary('INC0012345');

console.log(`Ticket ${summary.ticket_number}:`);
console.log(`- Total SLAs: ${summary.total_slas}`);
console.log(`- Breached SLAs: ${summary.breached_slas}`);
console.log(`- Breach Rate: ${summary.breach_percentage}%`);

if (summary.worst_sla) {
  console.log(`- Worst SLA: ${summary.worst_sla.sla_name} (${summary.worst_sla.business_percentage}%)`);
}
```

### Web Dashboard Usage

```html
<!-- Ticket modal with SLA tab -->
<div class="modal-tabs">
  <button onclick="activeTab = 'sla'">SLA</button>
</div>

<div x-show="activeTab === 'sla'">
  <div id="sla-content" 
       hx-get="/htmx/ticket-sla/INC0012345" 
       hx-trigger="load">
    Loading SLA information...
  </div>
</div>
```

### Streaming Integration

```typescript
// Create SLA monitoring stream
const slaStream = streamingService.createSLAMonitoringStream('dashboard-client', {
  breachesOnly: true,
  ticketTypes: ['incident', 'change_task']
});

// Handle SLA events
for await (const event of slaStream) {
  if (event.event === 'sla-breach') {
    console.log(`🚨 SLA BREACH: ${event.data.ticketNumber} - ${event.data.slaName}`);
  }
}
```

### CLI Testing

```bash
# Test SLA data collection for specific tickets
bun src/tests/cli-endpoint-tests.ts test-slas -t "INC0012345,CHG0034567"

# Comprehensive SLA table analysis
bun src/tests/cli-endpoint-tests.ts analyze-sla-tables

# Test combined ticket+SLA collection (Python pattern)
bun src/tests/cli-endpoint-tests.ts test-ticket-sla-join -t INC0012345 --table-type incident
```

## Performance Considerations

### Batch Processing

- **SLA Queries**: Process multiple tickets in batches of 10 to avoid URL length limits
- **API Rate Limits**: Respect ServiceNow rate limits with built-in retry logic
- **Memory Usage**: Stream large datasets instead of loading everything into memory

### Caching Strategy

```typescript
// SLA data caching (recommended TTL: 5-10 minutes)
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Use Redis or in-memory cache for frequently accessed SLA summaries
const cacheKey = `sla:${ticketNumber}:${Date.now() - Date.now() % CACHE_TTL}`;
```

### Database Optimization

```javascript
// Compound indexes for efficient queries
db.ticket_incident_with_slms.createIndex({
  "slms.taskslatable_has_breached": 1,
  "ticket.priority": 1,
  "sync_timestamp": -1
});

// Partial index for breached SLAs only
db.ticket_incident_with_slms.createIndex(
  { "slms.taskslatable_has_breached": 1 },
  { partialFilterExpression: { "slms.taskslatable_has_breached": true } }
);
```

### Query Optimization

- **Projection**: Only request needed fields from ServiceNow
- **Filtering**: Apply filters at the API level, not in application code
- **Pagination**: Use ServiceNow's pagination for large result sets

## Troubleshooting

### Common Issues

#### 1. **SLA Data Not Loading**

**Symptoms**: SLA tab shows "No SLA configured" despite SLAs existing.

**Causes**: 
- Incorrect ticket number format
- ServiceNow authentication issues
- task_sla table permissions

**Solutions**:
```bash
# Test SLA endpoint directly
bun src/tests/cli-endpoint-tests.ts test-table -t task_sla -f "task.number=INC0012345"

# Verify authentication
bun src/tests/cli-endpoint-tests.ts quick-test
```

#### 2. **SLA Percentage Calculation Errors**

**Symptoms**: Business percentage shows as NaN or unexpected values.

**Causes**: 
- ServiceNow returns percentage as string with '%' symbol
- Null/undefined values in business_percentage field

**Solutions**:
```typescript
// Ensure proper percentage parsing
private parsePercentage(value: string | null): number {
  if (!value) return 0;
  const cleaned = value.replace('%', '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}
```

#### 3. **Combined Document Storage Issues**

**Symptoms**: Tickets saved without SLA data or vice versa.

**Causes**: 
- Transaction failures during combined save
- SLA query timeout

**Solutions**:
```typescript
// Implement proper error handling
try {
  const ticketData = await getTicketData(ticketNumber);
  const slaData = await getSLAData(ticketNumber);
  
  // Save combined document atomically
  await saveTicketWithSLAs({ ticket: ticketData, slms: slaData });
} catch (error) {
  console.error('Combined save failed:', error);
  // Implement retry logic or save ticket without SLAs
}
```

### Debug Commands

```bash
# Enable verbose logging
DEBUG=bunsnc:sla bun src/web/app.ts

# Test specific SLA functionality
bun src/tests/cli-endpoint-tests.ts test-ticket-sla-join -t INC0012345

# Monitor SLA streaming
curl -N "http://localhost:3008/sse/sla-monitoring"
```

### Monitoring and Alerts

```typescript
// Set up SLA monitoring alerts
streamingService.createSLAMonitoringStream('monitor', { breachesOnly: true })
  .on('sla-breach', (event) => {
    // Send alert to monitoring system
    console.log(`🚨 SLA BREACH: ${event.data.ticketNumber}`);
  });
```

## Conclusion

The SLA/SLM integration in BunSNC provides a comprehensive solution for managing and monitoring Service Level Agreements within ServiceNow environments. By following the established Python patterns and implementing modern TypeScript/HTMX technologies, it offers both compatibility and enhanced functionality.

Key benefits:
- ✅ **Python Pattern Compatibility**: Matches existing workflow patterns
- ✅ **Real-time Monitoring**: Live SLA breach alerts and progress tracking
- ✅ **Modern UI**: HTMX-powered responsive dashboard
- ✅ **Comprehensive API**: Full REST and streaming API support
- ✅ **CLI Testing Tools**: Extensive testing and validation capabilities
- ✅ **Performance Optimized**: Efficient batch processing and caching strategies

For additional support or questions, refer to the CLI help system:
```bash
bun src/tests/cli-endpoint-tests.ts --help
```

---
*This documentation is maintained as part of the BunSNC project. Last updated: January 2025*