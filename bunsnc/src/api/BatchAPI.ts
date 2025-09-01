/**
 * BatchAPI - Advanced Batch Processing for ServiceNow operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { handleServiceNowError } from '../exceptions';
import { GlideRecord } from '../record/GlideRecord';
import { logger } from '../utils/Logger';
import { cache } from '../utils/Cache';
import type { ServiceNowRecord } from '../types/servicenow';

export interface BatchRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  table: string;
  sysId?: string;
  data?: ServiceNowRecord;
  callback?: (result: any, error?: Error) => void;
}

export interface BatchResult {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  statusCode?: number;
  duration?: number;
  retryCount?: number;
}

export interface IBatchAPI {
  addRequest(request: BatchRequest, callback?: Function): void;
  execute(attempt?: number): Promise<BatchResult[]>;
  get(record: GlideRecord, sysId: string, callback: Function): void;
  post(record: GlideRecord, callback: Function): void;
  put(record: GlideRecord, callback: Function): void;
  patch(record: GlideRecord, callback: Function): void;
  delete(record: GlideRecord, callback: Function): void;
  list(record: GlideRecord, callback: Function): void;
  transformResponse(request: BatchRequest, response: any): any;
  clear(): void;
  getRequestCount(): number;
  getStats(): any;
  enableCaching(enabled: boolean): void;
  executeParallel(requests: BatchRequest[]): Promise<BatchResult[]>;
  retryFailed(results: BatchResult[]): Promise<BatchResult[]>;
}

export class BatchAPI implements IBatchAPI {
  private requests: BatchRequest[] = [];
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second
  private concurrencyLimit: number = 10;
  private batchId: string;
  private cachingEnabled: boolean = true;
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retriedRequests: 0,
    totalDuration: 0,
    averageResponseTime: 0
  };

  constructor(
    private tableAPI: any, // TableAPI instance
    private attachmentAPI: any, // AttachmentAPI instance
    options: {
      maxRetries?: number;
      retryDelay?: number;
      concurrencyLimit?: number;
      enableCaching?: boolean;
    } = {}
  ) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.concurrencyLimit = options.concurrencyLimit || 10;
    this.cachingEnabled = options.enableCaching ?? true;
    this.batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.debug('BatchAPI initialized', 'BatchAPI', {
      batchId: this.batchId,
      maxRetries: this.maxRetries,
      concurrencyLimit: this.concurrencyLimit,
      cachingEnabled: this.cachingEnabled
    });
  }

  /**
   * Add a request to the batch
   */
  addRequest(request: BatchRequest, callback?: Function): void {
    if (callback) {
      request.callback = callback;
    }
    this.requests.push(request);
    
    logger.debug(`Request added to batch: ${request.id}`, 'BatchAPI', {
      batchId: this.batchId,
      method: request.method,
      table: request.table,
      totalRequests: this.requests.length
    });
  }

  /**
   * Execute all batch requests
   */
  async execute(attempt: number = 0): Promise<BatchResult[]> {
    if (this.requests.length === 0) {
      return [];
    }

    const operation = logger.operation('batch_execute', 'batch', this.batchId, {
      requestCount: this.requests.length,
      attempt: attempt + 1,
      concurrencyLimit: this.concurrencyLimit
    });

    const startTime = performance.now();
    const results: BatchResult[] = [];
    const chunks = this.chunkRequests(this.requests, this.concurrencyLimit);

    try {
      // Process chunks sequentially to manage load
      for (const chunk of chunks) {
        const chunkStartTime = performance.now();
        const chunkResults = await Promise.allSettled(
          chunk.map(request => this.executeRequest(request))
        );

        // Process results and call callbacks
        for (let i = 0; i < chunkResults.length; i++) {
          const result = chunkResults[i];
          const request = chunk[i];
          const requestDuration = performance.now() - chunkStartTime;
          let batchResult: BatchResult;

          if (result.status === 'fulfilled') {
            batchResult = {
              id: request.id,
              success: true,
              result: result.value,
              duration: requestDuration,
              retryCount: attempt
            };
            
            this.stats.successfulRequests++;
            
            // Cache result if enabled
            if (this.cachingEnabled && result.value && request.method === 'GET') {
              if (request.sysId) {
                cache.cacheRecord(request.table, request.sysId, result.value);
              }
            }
            
            // Call success callback
            if (request.callback) {
              try {
                request.callback(result.value);
              } catch (callbackError) {
                logger.warn('Batch callback error', 'BatchAPI', {
                  batchId: this.batchId,
                  requestId: request.id,
                  error: callbackError.message
                });
              }
            }
          } else {
            const error = result.reason;
            batchResult = {
              id: request.id,
              success: false,
              error: error.message || String(error),
              statusCode: error.statusCode,
              duration: requestDuration,
              retryCount: attempt
            };
            
            this.stats.failedRequests++;
            
            // Call error callback
            if (request.callback) {
              try {
                request.callback(null, error);
              } catch (callbackError) {
                logger.warn('Batch callback error', 'BatchAPI', {
                  batchId: this.batchId,
                  requestId: request.id,
                  error: callbackError.message
                });
              }
            }
          }

          results.push(batchResult);
        }
      }

      // Update statistics
      const totalDuration = performance.now() - startTime;
      this.stats.totalRequests += this.requests.length;
      this.stats.totalDuration += totalDuration;
      this.stats.averageResponseTime = this.stats.totalDuration / this.stats.totalRequests;

      operation.success('Batch execution completed', {
        totalRequests: this.requests.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        duration: totalDuration,
        attempt: attempt + 1
      });

      // Clear requests after successful execution
      this.clear();
      return results;

    } catch (error) {
      // Retry logic
      if (attempt < this.maxRetries) {
        this.stats.retriedRequests++;
        
        logger.warn(`Batch execution failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${this.retryDelay}ms...`, 'BatchAPI', {
          batchId: this.batchId,
          error: error.message,
          nextAttempt: attempt + 2
        });
        
        await this.sleep(this.retryDelay);
        return this.execute(attempt + 1);
      } else {
        // Max retries exceeded
        operation.error('Batch execution failed after max retries', error);
        
        const errorResult: BatchResult = {
          id: 'batch_error',
          success: false,
          error: `Batch execution failed after ${this.maxRetries} attempts: ${error.message}`,
          retryCount: attempt
        };
        
        this.stats.failedRequests += this.requests.length;
        return [errorResult];
      }
    }
  }

  /**
   * Add GET request for GlideRecord
   */
  get(record: GlideRecord, sysId: string, callback: Function): void {
    const request: BatchRequest = {
      id: `get_${record.table}_${sysId}_${Date.now()}`,
      method: 'GET',
      table: record.table,
      sysId,
      callback: (result, error) => {
        if (error) {
          callback(null, error);
        } else {
          // Transform result to GlideRecord
          const transformedResult = this.transformResponse(request, result);
          callback(transformedResult, null);
        }
      }
    };
    
    this.addRequest(request);
  }

  /**
   * Add POST request for GlideRecord
   */
  post(record: GlideRecord, callback: Function): void {
    const data = record.serialize() as ServiceNowRecord;
    
    const request: BatchRequest = {
      id: `post_${record.table}_${Date.now()}`,
      method: 'POST',
      table: record.table,
      data,
      callback: (result, error) => {
        if (error) {
          callback(null, error);
        } else {
          const transformedResult = this.transformResponse(request, result);
          callback(transformedResult, null);
        }
      }
    };
    
    this.addRequest(request);
  }

  /**
   * Add PUT request for GlideRecord
   */
  put(record: GlideRecord, callback: Function): void {
    const sysId = record.getValue('sys_id');
    if (!sysId) {
      callback(null, new Error('Cannot update record without sys_id'));
      return;
    }

    const data = record.serialize() as ServiceNowRecord;
    
    const request: BatchRequest = {
      id: `put_${record.table}_${sysId}_${Date.now()}`,
      method: 'PUT',
      table: record.table,
      sysId,
      data,
      callback: (result, error) => {
        if (error) {
          callback(null, error);
        } else {
          const transformedResult = this.transformResponse(request, result);
          callback(transformedResult, null);
        }
      }
    };
    
    this.addRequest(request);
  }

  /**
   * Add PATCH request for GlideRecord
   */
  patch(record: GlideRecord, callback: Function): void {
    const sysId = record.getValue('sys_id');
    if (!sysId) {
      callback(null, new Error('Cannot patch record without sys_id'));
      return;
    }

    // Only include changed fields for PATCH
    const data: ServiceNowRecord = {};
    // This would require tracking changed fields in GlideRecord
    // For now, use full serialization
    Object.assign(data, record.serialize());
    
    const request: BatchRequest = {
      id: `patch_${record.table}_${sysId}_${Date.now()}`,
      method: 'PATCH',
      table: record.table,
      sysId,
      data,
      callback: (result, error) => {
        if (error) {
          callback(null, error);
        } else {
          const transformedResult = this.transformResponse(request, result);
          callback(transformedResult, null);
        }
      }
    };
    
    this.addRequest(request);
  }

  /**
   * Add DELETE request for GlideRecord
   */
  delete(record: GlideRecord, callback: Function): void {
    const sysId = record.getValue('sys_id');
    if (!sysId) {
      callback(null, new Error('Cannot delete record without sys_id'));
      return;
    }
    
    const request: BatchRequest = {
      id: `delete_${record.table}_${sysId}_${Date.now()}`,
      method: 'DELETE',
      table: record.table,
      sysId,
      callback: (result, error) => {
        if (error) {
          callback(null, error);
        } else {
          callback(result, null);
        }
      }
    };
    
    this.addRequest(request);
  }

  /**
   * Add LIST request for GlideRecord
   */
  list(record: GlideRecord, callback: Function): void {
    const request: BatchRequest = {
      id: `list_${record.table}_${Date.now()}`,
      method: 'GET',
      table: record.table,
      callback: (result, error) => {
        if (error) {
          callback(null, error);
        } else {
          // Transform array result
          const transformedResult = Array.isArray(result) 
            ? result.map(item => this.transformResponse(request, item))
            : [this.transformResponse(request, result)];
          callback(transformedResult, null);
        }
      }
    };
    
    this.addRequest(request);
  }

  /**
   * Transform response data to appropriate format
   */
  transformResponse(request: BatchRequest, response: any): any {
    if (!response) return response;

    // Add metadata about the request
    return {
      ...response,
      _batchMetadata: {
        requestId: request.id,
        method: request.method,
        table: request.table,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    const requestCount = this.requests.length;
    this.requests = [];
    
    logger.debug(`Batch cleared: ${requestCount} requests removed`, 'BatchAPI', {
      batchId: this.batchId
    });
  }

  /**
   * Get number of pending requests
   */
  getRequestCount(): number {
    return this.requests.length;
  }

  /**
   * Get pending requests (for inspection)
   */
  getPendingRequests(): BatchRequest[] {
    return [...this.requests]; // Return copy
  }

  /**
   * Execute a single request
   */
  private async executeRequest(request: BatchRequest): Promise<any> {
    const requestStartTime = performance.now();
    
    try {
      // Check cache first for GET requests
      if (this.cachingEnabled && request.method === 'GET' && request.sysId) {
        const cached = cache.getCachedRecord(request.table, request.sysId);
        if (cached) {
          logger.debug(`Cache hit for batch request: ${request.id}`, 'BatchAPI', {
            batchId: this.batchId,
            table: request.table,
            sysId: request.sysId
          });
          return cached;
        }
      }

      let result: any;
      switch (request.method) {
        case 'GET':
          if (request.sysId) {
            result = await this.tableAPI.get(request.table, request.sysId);
          } else {
            result = await this.tableAPI.list(request.table);
          }
          break;
        
        case 'POST':
          result = await this.tableAPI.create(request.table, request.data!);
          // Invalidate table cache
          if (this.cachingEnabled) {
            cache.invalidateTable(request.table);
          }
          break;
        
        case 'PUT':
          result = await this.tableAPI.update(request.table, request.sysId!, request.data!);
          // Update cache
          if (this.cachingEnabled && result?.sys_id) {
            cache.cacheRecord(request.table, result.sys_id, result);
          }
          break;
        
        case 'PATCH':
          result = await this.tableAPI.patch(request.table, request.sysId!, request.data!);
          // Update cache
          if (this.cachingEnabled && result?.sys_id) {
            cache.cacheRecord(request.table, result.sys_id, result);
          }
          break;
        
        case 'DELETE':
          result = await this.tableAPI.delete(request.table, request.sysId!);
          // Remove from cache
          if (this.cachingEnabled) {
            cache.invalidateRecord(request.table, request.sysId!);
          }
          break;
        
        default:
          throw new Error(`Unsupported batch method: ${request.method}`);
      }

      const requestDuration = performance.now() - requestStartTime;
      logger.debug(`Batch request completed: ${request.id}`, 'BatchAPI', {
        batchId: this.batchId,
        method: request.method,
        table: request.table,
        duration: requestDuration
      });

      return result;
      
    } catch (error) {
      const requestDuration = performance.now() - requestStartTime;
      
      // Add request context to error
      const enrichedError = new Error(`Batch request ${request.id} failed: ${error.message}`);
      (enrichedError as any).requestId = request.id;
      (enrichedError as any).originalError = error;
      (enrichedError as any).duration = requestDuration;
      
      logger.error(`Batch request failed: ${request.id}`, enrichedError, 'BatchAPI', {
        batchId: this.batchId,
        method: request.method,
        table: request.table,
        duration: requestDuration
      });
      
      throw enrichedError;
    }
  }

  /**
   * Split requests into chunks for controlled concurrency
   */
  private chunkRequests(requests: BatchRequest[], size: number): BatchRequest[][] {
    const chunks: BatchRequest[][] = [];
    for (let i = 0; i < requests.length; i += size) {
      chunks.push(requests.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Sleep utility for retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get batch statistics
   */
  getStats(): any {
    return {
      ...this.stats,
      currentRequests: this.requests.length,
      batchId: this.batchId,
      configuration: {
        maxRetries: this.maxRetries,
        retryDelay: this.retryDelay,
        concurrencyLimit: this.concurrencyLimit,
        cachingEnabled: this.cachingEnabled
      }
    };
  }

  /**
   * Enable or disable caching
   */
  enableCaching(enabled: boolean): void {
    this.cachingEnabled = enabled;
    logger.info(`Batch caching ${enabled ? 'enabled' : 'disabled'}`, 'BatchAPI', {
      batchId: this.batchId
    });
  }

  /**
   * Execute requests in parallel (with controlled concurrency)
   */
  async executeParallel(requests: BatchRequest[]): Promise<BatchResult[]> {
    if (requests.length === 0) {
      return [];
    }

    const operation = logger.operation('batch_execute_parallel', 'batch', this.batchId, {
      requestCount: requests.length,
      concurrencyLimit: this.concurrencyLimit
    });

    const startTime = performance.now();
    const chunks = this.chunkRequests(requests, this.concurrencyLimit);
    const results: BatchResult[] = [];

    try {
      // Process all chunks in parallel (but each chunk is processed sequentially)
      const chunkPromises = chunks.map(async (chunk, chunkIndex) => {
        const chunkResults = await Promise.allSettled(
          chunk.map(request => this.executeRequest(request))
        );

        return chunkResults.map((result, i) => {
          const request = chunk[i];
          const requestDuration = performance.now() - startTime;

          if (result.status === 'fulfilled') {
            this.stats.successfulRequests++;
            return {
              id: request.id,
              success: true,
              result: result.value,
              duration: requestDuration,
              retryCount: 0
            } as BatchResult;
          } else {
            this.stats.failedRequests++;
            return {
              id: request.id,
              success: false,
              error: result.reason.message || String(result.reason),
              statusCode: result.reason.statusCode,
              duration: requestDuration,
              retryCount: 0
            } as BatchResult;
          }
        });
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults.flat());

      const totalDuration = performance.now() - startTime;
      this.stats.totalRequests += requests.length;
      this.stats.totalDuration += totalDuration;
      this.stats.averageResponseTime = this.stats.totalDuration / this.stats.totalRequests;

      operation.success('Parallel batch execution completed', {
        totalRequests: requests.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        duration: totalDuration
      });

      return results;

    } catch (error) {
      operation.error('Parallel batch execution failed', error);
      throw error;
    }
  }

  /**
   * Retry failed requests from a previous batch execution
   */
  async retryFailed(results: BatchResult[]): Promise<BatchResult[]> {
    const failedRequests: BatchRequest[] = [];
    
    // Find original requests for failed results
    for (const result of results) {
      if (!result.success) {
        const originalRequest = this.requests.find(r => r.id === result.id);
        if (originalRequest) {
          failedRequests.push(originalRequest);
        }
      }
    }

    if (failedRequests.length === 0) {
      return results;
    }

    const operation = logger.operation('batch_retry_failed', 'batch', this.batchId, {
      failedRequestCount: failedRequests.length
    });

    try {
      const retryResults = await this.executeParallel(failedRequests);
      
      // Merge results
      const mergedResults = results.map(originalResult => {
        if (originalResult.success) {
          return originalResult; // Keep successful results
        }
        
        const retryResult = retryResults.find(r => r.id === originalResult.id);
        return retryResult || originalResult; // Use retry result if available
      });

      operation.success('Failed requests retry completed', {
        retriedCount: failedRequests.length,
        newSuccessful: retryResults.filter(r => r.success).length,
        stillFailed: retryResults.filter(r => !r.success).length
      });

      return mergedResults;
      
    } catch (error) {
      operation.error('Retry failed requests failed', error);
      return results; // Return original results if retry fails
    }
  }

  /**
   * Create batch request with fluent interface
   */
  static createRequest(id: string): {
    get: (table: string, sysId: string) => BatchRequest;
    post: (table: string, data: ServiceNowRecord) => BatchRequest;
    put: (table: string, sysId: string, data: ServiceNowRecord) => BatchRequest;
    patch: (table: string, sysId: string, data: ServiceNowRecord) => BatchRequest;
    delete: (table: string, sysId: string) => BatchRequest;
  } {
    return {
      get: (table: string, sysId: string) => ({ id, method: 'GET', table, sysId }),
      post: (table: string, data: ServiceNowRecord) => ({ id, method: 'POST', table, data }),
      put: (table: string, sysId: string, data: ServiceNowRecord) => ({ id, method: 'PUT', table, sysId, data }),
      patch: (table: string, sysId: string, data: ServiceNowRecord) => ({ id, method: 'PATCH', table, sysId, data }),
      delete: (table: string, sysId: string) => ({ id, method: 'DELETE', table, sysId })
    };
  }
}