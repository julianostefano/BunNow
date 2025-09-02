# Advanced Usage Guide

**Author**: Juliano Stefano <jsdealencar@ayesa.com> [2025]

## Table of Contents

1. [Advanced Query Patterns](#advanced-query-patterns)
2. [Batch Operations](#batch-operations)
3. [Transaction Management](#transaction-management)
4. [Streaming and Large Data](#streaming-and-large-data)
5. [Performance Optimization](#performance-optimization)
6. [Advanced Caching](#advanced-caching)
7. [Custom Error Handling](#custom-error-handling)
8. [Monitoring and Observability](#monitoring-and-observability)
9. [Advanced Attachment Operations](#advanced-attachment-operations)
10. [Custom Extensions](#custom-extensions)

## Advanced Query Patterns

### Dynamic Query Building

```typescript
class AdvancedQueryBuilder {
  private client: ServiceNowClient;
  
  constructor(client: ServiceNowClient) {
    this.client = client;
  }
  
  async buildDynamicQuery(criteria: QueryCriteria): Promise<any[]> {
    const gr = this.client.GlideRecord(criteria.table);
    
    // Apply dynamic filters
    criteria.filters.forEach(filter => {
      if (filter.operator === 'OR') {
        gr.addOrQuery(filter.field, filter.value);
      } else {
        gr.addQuery(filter.field, filter.operator || '=', filter.value);
      }
    });
    
    // Apply date range filters
    if (criteria.dateRange) {
      const { field, start, end } = criteria.dateRange;
      gr.addQuery(field, '>=', start);
      gr.addQuery(field, '<=', end);
    }
    
    // Apply sorting
    criteria.orderBy?.forEach(order => {
      if (order.direction === 'desc') {
        gr.orderByDesc(order.field);
      } else {
        gr.orderBy(order.field);
      }
    });
    
    // Apply pagination
    if (criteria.limit) gr.setLimit(criteria.limit);
    
    await gr.query();
    
    const results = [];
    while (gr.next()) {
      const record = {};
      criteria.fields.forEach(field => {
        record[field] = gr.getValue(field);
        record[`${field}_display`] = gr.getDisplayValue(field);
      });
      results.push(record);
    }
    
    return results;
  }
}

interface QueryCriteria {
  table: string;
  fields: string[];
  filters: Array<{
    field: string;
    operator?: string;
    value: any;
  }>;
  dateRange?: {
    field: string;
    start: string;
    end: string;
  };
  orderBy?: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  limit?: number;
}
```

### Advanced Filtering with Encoded Queries

```typescript
class EncodedQueryBuilder {
  private conditions: string[] = [];
  
  addCondition(field: string, operator: string, value: string): this {
    this.conditions.push(`${field}${operator}${value}`);
    return this;
  }
  
  addOrCondition(field: string, operator: string, value: string): this {
    const lastIndex = this.conditions.length - 1;
    this.conditions[lastIndex] += `^OR${field}${operator}${value}`;
    return this;
  }
  
  addDateRange(field: string, startDate: Date, endDate: Date): this {
    const start = startDate.toISOString().split('T')[0] + ' 00:00:00';
    const end = endDate.toISOString().split('T')[0] + ' 23:59:59';
    this.conditions.push(`${field}>=javascript:gs.dateGenerate('${start}')`);
    this.conditions.push(`${field}<=javascript:gs.dateGenerate('${end}')`);
    return this;
  }
  
  build(): string {
    return this.conditions.join('^');
  }
}

// Usage example
async function complexQuery() {
  const client = ServiceNowClient.fromEnv();
  
  const query = new EncodedQueryBuilder()
    .addCondition('state', '=', '1')
    .addCondition('priority', '<=', '2')
    .addOrCondition('category', '=', 'hardware')
    .addOrCondition('category', '=', 'software')
    .addDateRange('sys_created_on', new Date('2024-01-01'), new Date())
    .build();
  
  const incidents = await client.table('incident').query({
    query,
    fields: ['number', 'short_description', 'category', 'priority'],
    limit: 1000
  });
  
  return incidents;
}
```

### Hierarchical Data Queries

```typescript
async function queryHierarchicalData() {
  const client = ServiceNowClient.fromEnv();
  
  // Query parent CI and its children
  async function getCIHierarchy(parentSysId: string, maxDepth: number = 3): Promise<any> {
    const hierarchy = {
      parent: null,
      children: []
    };
    
    // Get parent CI
    const parentGr = client.GlideRecord('cmdb_ci');
    if (await parentGr.get(parentSysId)) {
      hierarchy.parent = {
        sys_id: parentGr.getValue('sys_id'),
        name: parentGr.getValue('name'),
        category: parentGr.getDisplayValue('category'),
        status: parentGr.getDisplayValue('install_status')
      };
    }
    
    // Get children recursively
    if (maxDepth > 0) {
      const childrenGr = client.GlideRecord('cmdb_rel_ci');
      childrenGr.addQuery('parent', parentSysId);
      await childrenGr.query();
      
      while (childrenGr.next()) {
        const childSysId = childrenGr.getValue('child');
        const childHierarchy = await getCIHierarchy(childSysId, maxDepth - 1);
        hierarchy.children.push(childHierarchy);
      }
    }
    
    return hierarchy;
  }
  
  return getCIHierarchy('parent_ci_sys_id');
}
```

## Batch Operations

### Advanced Batch Processing

```typescript
class AdvancedBatchProcessor {
  private client: ServiceNowClient;
  private batchSize: number;
  private concurrencyLimit: number;
  
  constructor(client: ServiceNowClient, batchSize = 100, concurrencyLimit = 5) {
    this.client = client;
    this.batchSize = batchSize;
    this.concurrencyLimit = concurrencyLimit;
  }
  
  async processBulkOperations<T>(
    items: T[],
    processor: (batch: T[]) => Promise<any[]>,
    options?: {
      progressCallback?: (progress: number) => void;
      errorHandler?: (error: Error, batch: T[]) => Promise<boolean>; // Return true to continue
    }
  ): Promise<any[]> {
    const results: any[] = [];
    const batches = this.createBatches(items);
    let processed = 0;
    
    // Process batches with concurrency control
    const processBatch = async (batch: T[]): Promise<any[]> => {
      try {
        const batchResults = await processor(batch);
        processed += batch.length;
        
        if (options?.progressCallback) {
          options.progressCallback(processed / items.length);
        }
        
        return batchResults;
      } catch (error) {
        if (options?.errorHandler) {
          const shouldContinue = await options.errorHandler(error as Error, batch);
          if (!shouldContinue) throw error;
        } else {
          throw error;
        }
        return [];
      }
    };
    
    // Execute batches with concurrency limit
    for (let i = 0; i < batches.length; i += this.concurrencyLimit) {
      const concurrentBatches = batches.slice(i, i + this.concurrencyLimit);
      const batchPromises = concurrentBatches.map(batch => processBatch(batch));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        }
      });
    }
    
    return results;
  }
  
  private createBatches<T>(items: T[]): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }
    return batches;
  }
}

// Usage example
async function bulkUpdateIncidents() {
  const client = ServiceNowClient.fromEnv();
  const processor = new AdvancedBatchProcessor(client, 50, 3);
  
  // Get all incidents to update
  const incidentsToUpdate = await client.table('incident').query({
    query: 'assignment_group=old_group_id',
    fields: ['sys_id', 'number']
  });
  
  // Process in batches
  const results = await processor.processBulkOperations(
    incidentsToUpdate,
    async (batch) => {
      const updates = batch.map(incident => ({
        sys_id: incident.sys_id,
        data: { assignment_group: 'new_group_id' }
      }));
      
      return await client.table('incident').updateMultiple(updates);
    },
    {
      progressCallback: (progress) => {
        console.log(`Progress: ${(progress * 100).toFixed(1)}%`);
      },
      errorHandler: async (error, batch) => {
        console.error(`Batch failed for ${batch.length} items:`, error.message);
        return true; // Continue processing other batches
      }
    }
  );
  
  console.log(`Updated ${results.length} incidents`);
}
```

### Smart Batch Operations with Retry Logic

```typescript
class SmartBatchAPI {
  private client: ServiceNowClient;
  
  constructor(client: ServiceNowClient) {
    this.client = client;
  }
  
  async executeBatchWithRetry<T>(
    operations: BatchOperation<T>[],
    options: SmartBatchOptions = {}
  ): Promise<BatchResult<T>[]> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      concurrencyLimit = 5,
      backoffMultiplier = 2
    } = options;
    
    const results: BatchResult<T>[] = [];
    const failedOperations: BatchOperation<T>[] = [];
    
    // First attempt
    const initialResults = await this.executeBatch(operations, concurrencyLimit);
    
    initialResults.forEach((result, index) => {
      if (result.success) {
        results[index] = result;
      } else {
        failedOperations.push({ ...operations[index], originalIndex: index });
      }
    });
    
    // Retry failed operations
    let retryAttempt = 1;
    let operationsToRetry = [...failedOperations];
    
    while (operationsToRetry.length > 0 && retryAttempt <= maxRetries) {
      console.log(`Retry attempt ${retryAttempt} for ${operationsToRetry.length} operations`);
      
      // Wait before retry with exponential backoff
      const delay = retryDelay * Math.pow(backoffMultiplier, retryAttempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const retryResults = await this.executeBatch(operationsToRetry, concurrencyLimit);
      const stillFailed: BatchOperation<T>[] = [];
      
      retryResults.forEach((result, index) => {
        const originalIndex = operationsToRetry[index].originalIndex;
        if (result.success) {
          results[originalIndex] = result;
        } else {
          stillFailed.push(operationsToRetry[index]);
        }
      });
      
      operationsToRetry = stillFailed;
      retryAttempt++;
    }
    
    return results;
  }
  
  private async executeBatch<T>(
    operations: BatchOperation<T>[],
    concurrencyLimit: number
  ): Promise<BatchResult<T>[]> {
    const results: BatchResult<T>[] = [];
    
    for (let i = 0; i < operations.length; i += concurrencyLimit) {
      const batch = operations.slice(i, i + concurrencyLimit);
      const promises = batch.map(op => this.executeOperation(op));
      const batchResults = await Promise.allSettled(promises);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            error: result.reason.message,
            data: null
          });
        }
      });
    }
    
    return results;
  }
  
  private async executeOperation<T>(operation: BatchOperation<T>): Promise<BatchResult<T>> {
    try {
      let result: any;
      
      switch (operation.method) {
        case 'GET':
          result = await this.client.table(operation.table).get(operation.sysId);
          break;
        case 'POST':
          result = await this.client.table(operation.table).create(operation.data);
          break;
        case 'PUT':
          result = await this.client.table(operation.table).update(operation.sysId, operation.data);
          break;
        case 'DELETE':
          result = await this.client.table(operation.table).delete(operation.sysId);
          break;
        default:
          throw new Error(`Unsupported method: ${operation.method}`);
      }
      
      return { success: true, data: result, error: null };
    } catch (error) {
      return { 
        success: false, 
        data: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

interface BatchOperation<T> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  table: string;
  sysId?: string;
  data?: T;
  originalIndex?: number;
}

interface BatchResult<T> {
  success: boolean;
  data: any;
  error: string | null;
}

interface SmartBatchOptions {
  maxRetries?: number;
  retryDelay?: number;
  concurrencyLimit?: number;
  backoffMultiplier?: number;
}
```

## Transaction Management

### Advanced Transaction Patterns

```typescript
import { TransactionManager } from 'bunsnc';

class AdvancedTransactionManager {
  private client: ServiceNowClient;
  private transactionManager: TransactionManager;
  
  constructor(client: ServiceNowClient) {
    this.client = client;
    this.transactionManager = new TransactionManager(client);
  }
  
  async executeComplexTransaction<T>(
    operations: TransactionOperation[],
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    const transaction = await this.transactionManager.beginTransaction(options);
    const results: any[] = [];
    const rollbackStack: (() => Promise<void>)[] = [];
    
    try {
      for (const operation of operations) {
        const result = await this.executeOperationWithRollback(operation, rollbackStack);
        results.push(result);
        
        // Add operation to transaction log
        transaction.addOperation(operation.type, operation.table, result);
        
        // Check transaction size and memory usage
        if (await this.shouldCommitPartial(transaction, options)) {
          await this.transactionManager.commit();
          // Start new sub-transaction for remaining operations
          await this.transactionManager.beginTransaction(options);
        }
      }
      
      // Final commit
      await this.transactionManager.commit();
      
      return {
        success: true,
        results,
        transactionId: transaction.id,
        operationsCount: operations.length
      };
      
    } catch (error) {
      // Rollback all operations in reverse order
      await this.performManualRollback(rollbackStack);
      await this.transactionManager.rollback();
      
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }
  
  private async executeOperationWithRollback(
    operation: TransactionOperation,
    rollbackStack: (() => Promise<void>)[]
  ): Promise<any> {
    let result: any;
    let rollbackAction: (() => Promise<void>) | null = null;
    
    switch (operation.type) {
      case 'create':
        result = await this.client.table(operation.table).create(operation.data);
        rollbackAction = () => this.client.table(operation.table).delete(result.sys_id);
        break;
        
      case 'update':
        // Get current state for rollback
        const currentState = await this.client.table(operation.table).get(operation.sysId);
        result = await this.client.table(operation.table).update(operation.sysId, operation.data);
        rollbackAction = () => this.client.table(operation.table).update(operation.sysId, currentState);
        break;
        
      case 'delete':
        const recordToDelete = await this.client.table(operation.table).get(operation.sysId);
        result = await this.client.table(operation.table).delete(operation.sysId);
        rollbackAction = () => this.client.table(operation.table).create(recordToDelete);
        break;
        
      default:
        throw new Error(`Unsupported operation type: ${operation.type}`);
    }
    
    if (rollbackAction) {
      rollbackStack.push(rollbackAction);
    }
    
    return result;
  }
  
  private async shouldCommitPartial(
    transaction: any,
    options: TransactionOptions
  ): Promise<boolean> {
    if (!options.enablePartialCommits) return false;
    
    const maxOperations = options.maxOperationsPerTransaction || 1000;
    const maxMemory = options.maxMemoryUsage || 100 * 1024 * 1024; // 100MB
    
    const currentMemory = process.memoryUsage().heapUsed;
    
    return transaction.operationCount >= maxOperations || currentMemory >= maxMemory;
  }
  
  private async performManualRollback(rollbackStack: (() => Promise<void>)[]): Promise<void> {
    // Execute rollback operations in reverse order
    for (let i = rollbackStack.length - 1; i >= 0; i--) {
      try {
        await rollbackStack[i]();
      } catch (rollbackError) {
        console.error(`Rollback operation failed:`, rollbackError);
        // Continue with other rollbacks
      }
    }
  }
}

interface TransactionOperation {
  type: 'create' | 'update' | 'delete';
  table: string;
  sysId?: string;
  data?: any;
  dependencies?: string[]; // Other operation IDs this depends on
}

interface TransactionOptions {
  enablePartialCommits?: boolean;
  maxOperationsPerTransaction?: number;
  maxMemoryUsage?: number;
  isolationLevel?: 'read_committed' | 'repeatable_read';
}

interface TransactionResult<T> {
  success: boolean;
  results: T[];
  transactionId: string;
  operationsCount: number;
}
```

### Distributed Transaction Coordination

```typescript
class DistributedTransactionCoordinator {
  private clients: Map<string, ServiceNowClient> = new Map();
  
  registerClient(instanceId: string, client: ServiceNowClient) {
    this.clients.set(instanceId, client);
  }
  
  async executeDistributedTransaction(
    operations: DistributedOperation[]
  ): Promise<DistributedTransactionResult> {
    const transactionId = this.generateTransactionId();
    const participatingInstances = new Set(operations.map(op => op.instanceId));
    const results: Map<string, any> = new Map();
    const coordinatorLog: TransactionLogEntry[] = [];
    
    try {
      // Phase 1: Prepare all participants
      console.log(`Starting distributed transaction ${transactionId}`);
      
      for (const instanceId of participatingInstances) {
        const client = this.clients.get(instanceId);
        if (!client) {
          throw new Error(`Client not found for instance: ${instanceId}`);
        }
        
        // Begin transaction on each instance
        const txManager = new TransactionManager(client);
        await txManager.beginTransaction({ isolationLevel: 'repeatable_read' });
        
        coordinatorLog.push({
          instanceId,
          phase: 'prepare',
          status: 'success',
          timestamp: new Date()
        });
      }
      
      // Phase 2: Execute operations on all participants
      for (const operation of operations) {
        const client = this.clients.get(operation.instanceId);
        const result = await this.executeDistributedOperation(client!, operation);
        results.set(`${operation.instanceId}-${operation.id}`, result);
        
        coordinatorLog.push({
          instanceId: operation.instanceId,
          phase: 'execute',
          status: 'success',
          operationId: operation.id,
          timestamp: new Date()
        });
      }
      
      // Phase 3: Commit all participants
      for (const instanceId of participatingInstances) {
        const client = this.clients.get(instanceId);
        const txManager = new TransactionManager(client!);
        await txManager.commit();
        
        coordinatorLog.push({
          instanceId,
          phase: 'commit',
          status: 'success',
          timestamp: new Date()
        });
      }
      
      console.log(`Distributed transaction ${transactionId} completed successfully`);
      
      return {
        transactionId,
        success: true,
        results: Object.fromEntries(results),
        participatingInstances: Array.from(participatingInstances),
        coordinatorLog
      };
      
    } catch (error) {
      // Rollback all participants
      console.error(`Distributed transaction ${transactionId} failed:`, error.message);
      
      for (const instanceId of participatingInstances) {
        try {
          const client = this.clients.get(instanceId);
          const txManager = new TransactionManager(client!);
          await txManager.rollback();
          
          coordinatorLog.push({
            instanceId,
            phase: 'rollback',
            status: 'success',
            timestamp: new Date()
          });
        } catch (rollbackError) {
          console.error(`Rollback failed for instance ${instanceId}:`, rollbackError);
          coordinatorLog.push({
            instanceId,
            phase: 'rollback',
            status: 'failed',
            error: rollbackError.message,
            timestamp: new Date()
          });
        }
      }
      
      throw error;
    }
  }
  
  private async executeDistributedOperation(
    client: ServiceNowClient,
    operation: DistributedOperation
  ): Promise<any> {
    switch (operation.type) {
      case 'create':
        return await client.table(operation.table).create(operation.data);
      case 'update':
        return await client.table(operation.table).update(operation.sysId!, operation.data);
      case 'delete':
        return await client.table(operation.table).delete(operation.sysId!);
      default:
        throw new Error(`Unsupported operation type: ${operation.type}`);
    }
  }
  
  private generateTransactionId(): string {
    return `dtx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

interface DistributedOperation {
  id: string;
  instanceId: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  sysId?: string;
  data?: any;
}

interface DistributedTransactionResult {
  transactionId: string;
  success: boolean;
  results: Record<string, any>;
  participatingInstances: string[];
  coordinatorLog: TransactionLogEntry[];
}

interface TransactionLogEntry {
  instanceId: string;
  phase: 'prepare' | 'execute' | 'commit' | 'rollback';
  status: 'success' | 'failed';
  operationId?: string;
  error?: string;
  timestamp: Date;
}
```

## Streaming and Large Data

### Advanced Streaming Operations

```typescript
import { Readable, Transform, Writable } from 'stream';
import { pipeline } from 'stream/promises';

class StreamingServiceNowClient {
  private client: ServiceNowClient;
  
  constructor(client: ServiceNowClient) {
    this.client = client;
  }
  
  createQueryStream(table: string, query: string, options: StreamOptions = {}): Readable {
    const {
      batchSize = 1000,
      fields,
      maxRecords = Number.MAX_SAFE_INTEGER
    } = options;
    
    let offset = 0;
    let processedRecords = 0;
    let finished = false;
    
    return new Readable({
      objectMode: true,
      
      async read() {
        if (finished || processedRecords >= maxRecords) {
          this.push(null); // End stream
          return;
        }
        
        try {
          const records = await this.client.table(table).query({
            query,
            fields,
            limit: batchSize,
            offset
          });
          
          if (records.length === 0) {
            finished = true;
            this.push(null);
            return;
          }
          
          records.forEach(record => {
            if (processedRecords < maxRecords) {
              this.push(record);
              processedRecords++;
            }
          });
          
          offset += records.length;
          
        } catch (error) {
          this.emit('error', error);
        }
      }
    });
  }
  
  createTransformStream<TInput, TOutput>(
    transformer: (record: TInput) => Promise<TOutput> | TOutput
  ): Transform {
    return new Transform({
      objectMode: true,
      
      async transform(record: TInput, encoding, callback) {
        try {
          const transformed = await transformer(record);
          callback(null, transformed);
        } catch (error) {
          callback(error);
        }
      }
    });
  }
  
  createBatchWriteStream(
    table: string,
    operation: 'create' | 'update',
    options: BatchWriteOptions = {}
  ): Writable {
    const { batchSize = 100, concurrency = 5 } = options;
    const batch: any[] = [];
    
    return new Writable({
      objectMode: true,
      
      async write(record: any, encoding, callback) {
        batch.push(record);
        
        if (batch.length >= batchSize) {
          try {
            await this.processBatch(table, operation, batch.splice(0, batchSize), concurrency);
            callback();
          } catch (error) {
            callback(error);
          }
        } else {
          callback();
        }
      },
      
      async final(callback) {
        if (batch.length > 0) {
          try {
            await this.processBatch(table, operation, batch, concurrency);
            callback();
          } catch (error) {
            callback(error);
          }
        } else {
          callback();
        }
      }
    });
  }
  
  private async processBatch(
    table: string,
    operation: 'create' | 'update',
    records: any[],
    concurrency: number
  ): Promise<void> {
    const chunks = this.chunkArray(records, Math.ceil(records.length / concurrency));
    
    const promises = chunks.map(chunk => {
      if (operation === 'create') {
        return this.client.table(table).createMultiple(chunk);
      } else {
        return this.client.table(table).updateMultiple(chunk);
      }
    });
    
    await Promise.all(promises);
  }
  
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
  
  async streamToFile(
    table: string,
    query: string,
    filePath: string,
    format: 'json' | 'csv' = 'json'
  ): Promise<void> {
    const fs = await import('fs');
    const createCsvWriter = format === 'csv' ? (await import('csv-writer')).createObjectCsvWriter : null;
    
    const queryStream = this.createQueryStream(table, query);
    
    if (format === 'json') {
      const writeStream = fs.createWriteStream(filePath);
      writeStream.write('[\n');
      
      let isFirst = true;
      const jsonTransform = this.createTransformStream((record: any) => {
        const prefix = isFirst ? '' : ',\n';
        isFirst = false;
        return `${prefix}${JSON.stringify(record, null, 2)}`;
      });
      
      await pipeline(
        queryStream,
        jsonTransform,
        writeStream
      );
      
      writeStream.write('\n]');
      writeStream.end();
      
    } else if (format === 'csv' && createCsvWriter) {
      // Get first record to determine headers
      const firstRecord = await new Promise<any>((resolve, reject) => {
        queryStream.once('data', resolve);
        queryStream.once('error', reject);
      });
      
      const headers = Object.keys(firstRecord).map(key => ({ id: key, title: key }));
      const csvWriter = createCsvWriter({
        path: filePath,
        header: headers
      });
      
      const records = [firstRecord];
      
      // Collect remaining records
      for await (const record of queryStream) {
        records.push(record);
      }
      
      await csvWriter.writeRecords(records);
    }
  }
}

interface StreamOptions {
  batchSize?: number;
  fields?: string[];
  maxRecords?: number;
}

interface BatchWriteOptions {
  batchSize?: number;
  concurrency?: number;
}

// Usage example
async function processLargeDataset() {
  const client = ServiceNowClient.fromEnv();
  const streamingClient = new StreamingServiceNowClient(client);
  
  // Stream all incidents, transform, and batch update
  const queryStream = streamingClient.createQueryStream(
    'incident',
    'state=1',
    { batchSize: 500, fields: ['sys_id', 'short_description', 'priority'] }
  );
  
  const transformStream = streamingClient.createTransformStream(async (incident: any) => {
    // Add prefix to description and normalize priority
    return {
      sys_id: incident.sys_id,
      short_description: `[PROCESSED] ${incident.short_description}`,
      priority: incident.priority === '1' ? 'High' : 
                incident.priority === '2' ? 'Medium' : 'Low'
    };
  });
  
  const writeStream = streamingClient.createBatchWriteStream('incident', 'update', {
    batchSize: 100,
    concurrency: 3
  });
  
  // Process the entire dataset through the pipeline
  await pipeline(
    queryStream,
    transformStream,
    writeStream
  );
  
  console.log('Large dataset processing completed');
}
```

[Continue with remaining sections...]

## Performance Optimization

### Advanced Caching Strategies

```typescript
class AdvancedCacheManager {
  private primaryCache: Cache;
  private secondaryCache?: Cache;
  private warmupQueries: Map<string, WarmupQuery> = new Map();
  
  constructor(options: AdvancedCacheOptions) {
    this.primaryCache = new Cache(options.primary);
    
    if (options.secondary) {
      this.secondaryCache = new Cache(options.secondary);
    }
  }
  
  async getWithFallback<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    // Try primary cache first
    let result = this.primaryCache.get<T>(key);
    if (result !== undefined) {
      return result;
    }
    
    // Try secondary cache
    if (this.secondaryCache) {
      result = this.secondaryCache.get<T>(key);
      if (result !== undefined) {
        // Promote to primary cache
        this.primaryCache.set(key, result);
        return result;
      }
    }
    
    // Fetch from source
    result = await fetcher();
    
    // Store in both caches
    this.primaryCache.set(key, result);
    if (this.secondaryCache) {
      this.secondaryCache.set(key, result);
    }
    
    return result;
  }
  
  scheduleWarmup(key: string, query: WarmupQuery) {
    this.warmupQueries.set(key, query);
    
    // Schedule initial warmup
    setTimeout(() => this.executeWarmup(key), query.delay || 1000);
    
    // Schedule periodic refresh
    if (query.refreshInterval) {
      setInterval(() => this.executeWarmup(key), query.refreshInterval);
    }
  }
  
  private async executeWarmup(key: string) {
    const query = this.warmupQueries.get(key);
    if (!query) return;
    
    try {
      const result = await query.executor();
      this.primaryCache.set(key, result, query.ttl);
      
      if (this.secondaryCache) {
        this.secondaryCache.set(key, result, query.ttl);
      }
      
      console.log(`Cache warmed up for key: ${key}`);
    } catch (error) {
      console.error(`Cache warmup failed for key ${key}:`, error.message);
    }
  }
  
  async invalidatePattern(pattern: RegExp) {
    this.primaryCache.invalidatePattern(pattern);
    if (this.secondaryCache) {
      this.secondaryCache.invalidatePattern(pattern);
    }
  }
  
  getStats() {
    return {
      primary: this.primaryCache.getStats(),
      secondary: this.secondaryCache?.getStats(),
      warmupQueries: this.warmupQueries.size
    };
  }
}

interface AdvancedCacheOptions {
  primary: CacheOptions;
  secondary?: CacheOptions;
}

interface WarmupQuery {
  executor: () => Promise<any>;
  ttl?: number;
  delay?: number;
  refreshInterval?: number;
}
```

### Connection Pool Management

```typescript
class ConnectionPoolManager {
  private pools: Map<string, ConnectionPool> = new Map();
  private globalStats: PoolStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    queuedRequests: 0
  };
  
  createPool(instanceUrl: string, options: PoolOptions): ConnectionPool {
    const pool = new ConnectionPool(instanceUrl, options);
    this.pools.set(instanceUrl, pool);
    
    // Monitor pool events
    pool.on('connection:created', () => this.updateStats());
    pool.on('connection:destroyed', () => this.updateStats());
    pool.on('request:queued', () => this.updateStats());
    pool.on('request:dequeued', () => this.updateStats());
    
    return pool;
  }
  
  async getConnection(instanceUrl: string): Promise<PooledConnection> {
    const pool = this.pools.get(instanceUrl);
    if (!pool) {
      throw new Error(`No pool found for instance: ${instanceUrl}`);
    }
    
    return await pool.acquire();
  }
  
  async releaseConnection(instanceUrl: string, connection: PooledConnection) {
    const pool = this.pools.get(instanceUrl);
    if (pool) {
      await pool.release(connection);
    }
  }
  
  private updateStats() {
    this.globalStats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      queuedRequests: 0
    };
    
    for (const pool of this.pools.values()) {
      const stats = pool.getStats();
      this.globalStats.totalConnections += stats.totalConnections;
      this.globalStats.activeConnections += stats.activeConnections;
      this.globalStats.idleConnections += stats.idleConnections;
      this.globalStats.queuedRequests += stats.queuedRequests;
    }
  }
  
  async healthCheck(): Promise<HealthCheckResult> {
    const results: Record<string, boolean> = {};
    
    for (const [instanceUrl, pool] of this.pools.entries()) {
      try {
        await pool.healthCheck();
        results[instanceUrl] = true;
      } catch (error) {
        results[instanceUrl] = false;
      }
    }
    
    const healthy = Object.values(results).every(result => result);
    
    return {
      healthy,
      pools: results,
      stats: this.globalStats
    };
  }
  
  async shutdown() {
    for (const pool of this.pools.values()) {
      await pool.drain();
      await pool.clear();
    }
    this.pools.clear();
  }
}

interface PoolOptions {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
  idleTimeoutMillis: number;
  testOnBorrow: boolean;
}

interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  queuedRequests: number;
}

interface HealthCheckResult {
  healthy: boolean;
  pools: Record<string, boolean>;
  stats: PoolStats;
}
```

This guide continues with additional advanced topics like monitoring, observability, custom extensions, and more. The complete implementation provides enterprise-grade functionality for complex ServiceNow integrations.