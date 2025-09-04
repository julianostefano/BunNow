# Ticket Data Mapping Strategy for BunSNC

**Author:** Juliano Stefano <jsdealencar@ayesa.com> [2025]  
**Version:** 1.0  
**Date:** 2025-09-04

## Overview

This document describes the comprehensive data mapping strategy for ServiceNow ticket integration in BunSNC, focusing on the systematic analysis and storage of incident, change task, and service catalog task data.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Mapping Methodology](#data-mapping-methodology)
3. [ServiceNow Tables Analysis](#servicenow-tables-analysis)
4. [Field Classification](#field-classification)
5. [Storage Strategy](#storage-strategy)
6. [Testing Framework](#testing-framework)
7. [Implementation Guidelines](#implementation-guidelines)
8. [Performance Considerations](#performance-considerations)
9. [Security and Compliance](#security-and-compliance)

## Architecture Overview

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ServiceNow    │    │     BunSNC      │    │    MongoDB      │
│     Tables      │────│   Integration   │────│   Collections   │
│                 │    │    Services     │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │               ┌──────────────┐               │
         └───────────────│ Data Mapping │───────────────┘
                         │   Framework  │
                         └──────────────┘
```

### Data Flow Architecture

1. **Extraction**: ServiceNow API endpoints (`/api/now/table/`)
2. **Analysis**: Field structure and type inference
3. **Mapping**: Normalization and schema generation  
4. **Storage**: MongoDB collection optimization
5. **Validation**: Real-time data integrity checks

## Data Mapping Methodology

### Phase 1: Discovery
- **Endpoint Testing**: Validate connectivity and permissions
- **Schema Extraction**: Map all available fields and types
- **Data Sampling**: Analyze representative data samples
- **Performance Profiling**: Measure response times and limits

### Phase 2: Classification
- **Common Fields**: Shared across all ticket types
- **Type-Specific Fields**: Unique to each ticket table
- **Business Logic Fields**: Critical for workflow operations
- **Reference Fields**: Foreign key relationships
- **Temporal Fields**: Date/time tracking

### Phase 3: Optimization
- **Index Strategy**: Query performance optimization
- **Storage Schema**: MongoDB collection design
- **Data Validation**: Field validation rules
- **ETL Pipeline**: Extract, Transform, Load processes

## ServiceNow Tables Analysis

### Primary Ticket Tables

#### 1. Incident (`incident`)
**Purpose**: IT service interruption tracking and resolution

**Key Characteristics**:
- **Volume**: High-frequency table (1000+ records/day typical)
- **States**: New, In Progress, On Hold, Resolved, Closed
- **Priority Matrix**: Urgency × Impact = Priority
- **SLA Critical**: Response and resolution time tracking

**Critical Fields**:
```typescript
interface IncidentRecord {
  sys_id: string;           // Primary key
  number: string;           // Business key (INC0000001)
  short_description: string; // Summary
  description?: string;     // Detailed description
  state: number;           // Workflow state
  priority: number;        // 1-5 (Critical to Planning)
  urgency: number;         // 1-3 (High to Low)
  impact: number;          // 1-3 (High to Low)
  assignment_group: string; // Team assignment
  assigned_to?: string;    // Individual assignee
  caller_id: string;       // Reporter/caller
  opened_at: Date;         // Creation timestamp
  resolved_at?: Date;      // Resolution timestamp
  closed_at?: Date;        // Closure timestamp
  // ... additional fields
}
```

#### 2. Change Task (`change_task`)
**Purpose**: Individual tasks within change requests

**Key Characteristics**:
- **Volume**: Medium frequency (100-500 records/day)
- **Dependency**: Child records of change_request
- **Approval Flow**: Complex approval workflows
- **Risk Assessment**: Change impact evaluation

**Critical Fields**:
```typescript
interface ChangeTaskRecord {
  sys_id: string;
  number: string;           // CTASK0000001
  change_request: string;   // Parent change request
  short_description: string;
  state: number;
  assignment_group: string;
  planned_start_date?: Date;
  planned_end_date?: Date;
  actual_start_date?: Date;
  actual_end_date?: Date;
  implementation_plan?: string;
  test_plan?: string;
  // ... additional fields
}
```

#### 3. Service Catalog Task (`sc_task`)
**Purpose**: Fulfillment tasks for service catalog requests

**Key Characteristics**:
- **Volume**: Medium-high frequency (500+ records/day)
- **Service Oriented**: Business service fulfillment
- **Cost Tracking**: Price and quantity fields
- **Request Lifecycle**: Tied to service catalog requests

**Critical Fields**:
```typescript
interface SCTaskRecord {
  sys_id: string;
  number: string;           // SCTASK0000001
  request: string;          // Parent service request
  request_item: string;     // Specific catalog item
  short_description: string;
  state: number;
  assignment_group: string;
  requested_for: string;    // End user
  price?: number;           // Cost information
  quantity?: number;        // Item quantity
  // ... additional fields
}
```

### Secondary Tables

#### 4. User Groups (`sys_user_group`)
**Purpose**: Team and assignment group definitions

#### 5. Task SLA (`task_sla`)
**Purpose**: Service Level Agreement tracking

#### 6. Users (`sys_user`)
**Purpose**: User account information

## Field Classification

### 1. Universal Fields (100% frequency)
Present in all ticket types:
- `sys_id` - Primary identifier
- `number` - Business identifier  
- `short_description` - Title/summary
- `state` - Workflow state
- `assignment_group` - Team assignment
- `sys_created_on` - Creation timestamp
- `sys_updated_on` - Last modified timestamp

### 2. Common Fields (80%+ frequency)
Present in most ticket types:
- `description` - Detailed description
- `priority` - Business priority
- `assigned_to` - Individual assignee
- `caller_id` - Reporter/requester
- `opened_at` - Opening timestamp
- `category` - Categorization
- `subcategory` - Sub-categorization

### 3. Type-Specific Fields
Unique to specific ticket types:

**Incident Only**:
- `incident_state` - Incident-specific states
- `severity` - Service impact severity
- `problem_id` - Related problem record

**Change Task Only**:
- `change_request` - Parent change
- `planned_start_date` - Scheduled start
- `implementation_plan` - Implementation details

**SC Task Only**:
- `request_item` - Catalog item reference
- `price` - Cost information
- `requested_for` - End user

### 4. Reference Fields
Foreign key relationships:
- `assignment_group` → `sys_user_group.sys_id`
- `assigned_to` → `sys_user.sys_id`  
- `caller_id` → `sys_user.sys_id`
- `cmdb_ci` → `cmdb_ci.sys_id`
- `business_service` → `cmdb_ci_service.sys_id`

### 5. Business Logic Fields
Critical for workflow operations:
- `state` - Workflow state machine
- `approval_history` - Approval tracking
- `sla_due` - SLA deadline
- `work_notes` - Internal communications
- `comments` - Public communications

## Storage Strategy

### MongoDB Collection Design

#### 1. Base Ticket Schema
Shared fields across all ticket types:

```javascript
const BaseTicketSchema = {
  bsonType: "object",
  required: [
    "sys_id", "number", "short_description", "state", 
    "assignment_group", "sys_created_on", "ticketType"
  ],
  properties: {
    sys_id: { bsonType: "string", pattern: "^[a-f0-9]{32}$" },
    number: { bsonType: "string" },
    ticketType: { bsonType: "string", enum: ["incident", "change_task", "sc_task"] },
    short_description: { bsonType: "string", maxLength: 160 },
    description: { bsonType: "string" },
    state: { bsonType: "int", minimum: 1, maximum: 10 },
    priority: { bsonType: "int", minimum: 1, maximum: 5 },
    assignment_group: { bsonType: "string" },
    assigned_to: { bsonType: "string" },
    caller_id: { bsonType: "string" },
    opened_at: { bsonType: "date" },
    sys_created_on: { bsonType: "date" },
    sys_updated_on: { bsonType: "date" }
  }
}
```

#### 2. Collection Strategy Options

**Option A: Single Collection (Recommended)**
- **Collection**: `tickets`
- **Discriminator**: `ticketType` field
- **Benefits**: Unified queries, single index management
- **Schema**: Base schema + type-specific fields

**Option B: Separate Collections**
- **Collections**: `incidents`, `change_tasks`, `sc_tasks`
- **Benefits**: Type isolation, specific optimizations
- **Drawbacks**: Complex cross-type queries

#### 3. Index Strategy

**Primary Indexes**:
```javascript
// Unique identifier
db.tickets.createIndex({ "sys_id": 1 }, { unique: true })

// Business identifier  
db.tickets.createIndex({ "number": 1 }, { unique: true })

// Query performance indexes
db.tickets.createIndex({ "ticketType": 1, "state": 1 })
db.tickets.createIndex({ "assignment_group": 1, "state": 1 })
db.tickets.createIndex({ "sys_created_on": -1 })
db.tickets.createIndex({ "opened_at": -1 })

// Text search
db.tickets.createIndex({ 
  "short_description": "text", 
  "description": "text" 
})
```

**Compound Indexes for Dashboard Queries**:
```javascript
// Active tickets by group
db.tickets.createIndex({ 
  "assignment_group": 1, 
  "state": 1, 
  "priority": -1 
})

// Recent tickets by type
db.tickets.createIndex({ 
  "ticketType": 1, 
  "sys_created_on": -1 
})
```

## Testing Framework

### Test Suite Components

#### 1. ServiceNowEndpointMapper
**Purpose**: Comprehensive endpoint testing and analysis
**Location**: `src/tests/ServiceNowEndpointMapper.ts`

**Key Features**:
- Endpoint connectivity validation
- Data structure analysis
- Performance limit testing
- TypeScript interface generation

**Usage**:
```bash
bun src/tests/cli-endpoint-tests.ts test-table -t incident -l 100
bun src/tests/cli-endpoint-tests.ts map-structure -t incident --export
bun src/tests/cli-endpoint-tests.ts analyze-all --generate-interfaces
```

#### 2. CLI Endpoint Tests
**Purpose**: Command-line testing interface
**Location**: `src/tests/cli-endpoint-tests.ts`

**Available Commands**:
- `test-table` - Single table testing
- `map-structure` - Complete field analysis
- `performance-test` - Performance profiling
- `analyze-all` - Comprehensive analysis
- `compare-tables` - Cross-table comparison
- `field-analysis` - Deep field analysis
- `quick-test` - Connectivity validation

#### 3. Ticket Data Analyzer
**Purpose**: Specialized ticket table analysis
**Location**: `src/tests/ticket-data-analysis.ts`

**Features**:
- Ticket-specific field classification
- Business logic identification
- Storage recommendations
- MongoDB schema generation

### Test Data Generation

#### Sample Test Commands
```bash
# Quick connectivity test
bun src/tests/cli-endpoint-tests.ts quick-test

# Test specific table
bun src/tests/cli-endpoint-tests.ts test-table -t incident -l 50

# Map complete structure
bun src/tests/cli-endpoint-tests.ts map-structure -t incident -s 200 --export

# Performance analysis
bun src/tests/cli-endpoint-tests.ts performance-test -t incident

# Complete analysis
bun src/tests/cli-endpoint-tests.ts analyze-all --generate-interfaces

# Compare ticket tables
bun src/tests/cli-endpoint-tests.ts compare-tables -t "incident,change_task,sc_task"

# Analyze specific field
bun src/tests/cli-endpoint-tests.ts field-analysis -f assignment_group

# Run specialized ticket analysis
bun src/tests/ticket-data-analysis.ts
```

## Implementation Guidelines

### 1. Development Workflow

1. **Environment Setup**:
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Configure ServiceNow credentials
   # Edit .env with your instance details
   ```

2. **Initial Testing**:
   ```bash
   # Validate connectivity
   bun src/tests/cli-endpoint-tests.ts quick-test
   
   # Run comprehensive analysis
   bun src/tests/cli-endpoint-tests.ts analyze-all --generate-interfaces
   ```

3. **Review Results**:
   - Check `src/tests/data-schemas/` for generated schemas
   - Review `mapping-summary.json` for analysis overview
   - Examine individual table schemas

4. **Implement Storage**:
   - Use generated TypeScript interfaces
   - Apply recommended MongoDB indexes
   - Implement validation rules

### 2. Data Synchronization Pipeline

```typescript
// Example sync implementation
class TicketSyncPipeline {
  async syncCurrentMonth() {
    const tables = ['incident', 'change_task', 'sc_task'];
    
    for (const table of tables) {
      const tickets = await serviceNowService.query({
        table,
        filter: 'sys_created_onBETWEEN2025-09-01@00:00:00@2025-09-30@23:59:59',
        limit: 1000
      });
      
      for (const ticket of tickets) {
        await this.upsertTicket(ticket, table);
      }
    }
  }
  
  private async upsertTicket(ticket: any, ticketType: string) {
    const normalizedTicket = {
      ...ticket,
      ticketType,
      _syncedAt: new Date()
    };
    
    await ticketsCollection.replaceOne(
      { sys_id: ticket.sys_id },
      normalizedTicket,
      { upsert: true }
    );
  }
}
```

### 3. Validation Implementation

```typescript
// MongoDB schema validation
const ticketValidation = {
  $jsonSchema: {
    bsonType: "object",
    required: ["sys_id", "ticketType", "number"],
    properties: {
      sys_id: { bsonType: "string", pattern: "^[a-f0-9]{32}$" },
      ticketType: { enum: ["incident", "change_task", "sc_task"] },
      number: { bsonType: "string" },
      state: { bsonType: "int", minimum: 1 },
      priority: { bsonType: "int", minimum: 1, maximum: 5 }
    }
  }
};

await db.createCollection("tickets", { validator: ticketValidation });
```

## Performance Considerations

### 1. Query Optimization

**Dashboard Queries** (Most Frequent):
- Active tickets by assignment group
- Recent tickets by creation date
- High priority tickets
- Overdue tickets (SLA violations)

**Recommended Indexes**:
```javascript
// Dashboard performance
db.tickets.createIndex({ 
  "assignment_group": 1, 
  "state": 1, 
  "priority": -1,
  "sys_created_on": -1 
})

// SLA monitoring
db.tickets.createIndex({ 
  "sla_due": 1, 
  "state": 1 
})
```

### 2. Data Volume Management

**Retention Strategy**:
- **Active Tickets**: Keep indefinitely
- **Closed Tickets**: 2 years retention
- **Archived Tickets**: Move to cold storage after 2 years

**Sharding Strategy** (Large Deployments):
```javascript
// Shard by assignment group for balanced distribution
sh.shardCollection("bunsnc.tickets", { "assignment_group": 1 })
```

### 3. Sync Performance

**Batch Processing**:
- Process records in batches of 100-500
- Use MongoDB bulk operations
- Implement retry logic for failures
- Monitor sync performance metrics

## Security and Compliance

### 1. Data Classification

**Sensitive Data Fields**:
- `caller_id` - PII (Personal Identifiable Information)
- `description` - May contain sensitive information
- `work_notes` - Internal communications
- `comments` - Public communications

**Security Measures**:
```typescript
// Field-level encryption for sensitive data
const encryptedSchema = {
  encryptedFields: {
    "caller_id": {
      keyId: "customer-pii-key",
      bsonType: "string"
    },
    "description": {
      keyId: "content-encryption-key", 
      bsonType: "string"
    }
  }
};
```

### 2. Access Control

**Role-Based Access**:
- **Admin**: Full access to all tickets
- **Manager**: Access to team tickets
- **Agent**: Access to assigned tickets
- **User**: Access to own submitted tickets

**Implementation**:
```typescript
// Query filtering by user role
const getTicketsForUser = async (userId: string, role: string) => {
  let filter = {};
  
  switch (role) {
    case 'admin':
      filter = {}; // No restrictions
      break;
    case 'manager':
      filter = { assignment_group: { $in: userGroups } };
      break;
    case 'agent':
      filter = { $or: [
        { assigned_to: userId },
        { assignment_group: { $in: userGroups } }
      ]};
      break;
    case 'user':
      filter = { caller_id: userId };
      break;
  }
  
  return await ticketsCollection.find(filter);
};
```

### 3. Audit Trail

**Change Tracking**:
- Track all field modifications
- Store modification timestamp and user
- Maintain change history for compliance

**Implementation**:
```typescript
interface TicketAudit {
  ticketId: string;
  fieldName: string;
  oldValue: any;
  newValue: any;
  changedBy: string;
  changedAt: Date;
  syncSource: 'servicenow' | 'bunsnc';
}
```

## Conclusion

This mapping strategy provides a comprehensive foundation for ServiceNow ticket integration in BunSNC. The testing framework ensures data quality and the storage strategy optimizes for performance while maintaining data integrity.

**Key Success Factors**:
1. **Comprehensive Testing**: Use the provided testing framework extensively
2. **Iterative Refinement**: Continuously improve based on real-world usage
3. **Performance Monitoring**: Monitor query performance and optimize indexes
4. **Security First**: Implement proper access controls and data protection
5. **Documentation**: Keep mapping documentation updated as schemas evolve

**Next Steps**:
1. Run complete endpoint analysis using the testing framework
2. Review generated schemas and interfaces
3. Implement storage layer based on recommendations
4. Deploy sync pipeline with monitoring
5. Iterate and optimize based on production metrics

---

*For questions or clarifications, contact: Juliano Stefano <jsdealencar@ayesa.com>*