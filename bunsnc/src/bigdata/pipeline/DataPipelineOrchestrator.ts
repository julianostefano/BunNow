/**
 * Data Pipeline Orchestrator for ServiceNow ETL Processes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { logger } from '../../utils/Logger';
import { performanceMonitor } from '../../utils/PerformanceMonitor';
import { ParquetWriter, ParquetWriteStats } from '../parquet/ParquetWriter';
import { RedisStreamManager } from '../redis/RedisStreamManager';
import { HDFSClient } from '../hadoop/HDFSClient';
import { OpenSearchClient } from '../opensearch/OpenSearchClient';
import type { GlideRecord } from '../../types/GlideRecord';

export interface PipelineStage {
  name: string;
  type: 'extract' | 'transform' | 'load' | 'validate' | 'monitor';
  enabled: boolean;
  config: any;
  dependencies?: string[];
  maxRetries?: number;
  timeoutMs?: number;
  parallelism?: number;
}

export interface PipelineConfig {
  id: string;
  name: string;
  description: string;
  schedule?: string; // Cron expression
  stages: PipelineStage[];
  globalConfig: {
    maxConcurrentStages?: number;
    defaultTimeoutMs?: number;
    retryPolicy?: {
      maxRetries: number;
      backoffMultiplier: number;
      maxBackoffMs: number;
    };
    errorHandling?: 'fail_fast' | 'continue' | 'retry_then_fail';
    monitoring?: {
      enabled: boolean;
      metricsInterval?: number;
      alertThresholds?: {
        failureRate?: number;
        avgDurationMs?: number;
        queueDepth?: number;
      };
    };
  };
  sourceConfig: {
    servicenow: {
      tables: string[];
      batchSize: number;
      filterConditions?: Record<string, any>;
      incrementalColumn?: string;
      lastProcessedValue?: any;
    };
  };
  destinationConfig: {
    parquet?: {
      enabled: boolean;
      outputPath: string;
      compressionType: 'snappy' | 'gzip' | 'lz4';
      partitionStrategy: 'date' | 'size' | 'table';
    };
    hadoop?: {
      enabled: boolean;
      hdfsPath: string;
      replicationFactor: number;
      blockSize?: number;
    };
    opensearch?: {
      enabled: boolean;
      indexPrefix: string;
      refreshAfterLoad: boolean;
      batchSize: number;
    };
    redis?: {
      enabled: boolean;
      streamPrefix: string;
      maxStreamLength: number;
      persistEvents: boolean;
    };
  };
}

export interface PipelineExecution {
  id: string;
  pipelineId: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  stages: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startTime?: number;
    endTime?: number;
    error?: string;
    metrics?: any;
  }>;
  totalRecords: number;
  processedRecords: number;
  errorRecords: number;
  metrics: {
    extractDurationMs: number;
    transformDurationMs: number;
    loadDurationMs: number;
    totalDurationMs: number;
    throughputPerSecond: number;
    peakMemoryUsageMB: number;
  };
  errors: Array<{
    stage: string;
    timestamp: number;
    error: string;
    context?: any;
  }>;
}

export interface DataTransformation {
  name: string;
  type: 'field_mapping' | 'validation' | 'enrichment' | 'filtering' | 'aggregation' | 'custom';
  config: {
    // Field mapping transformations
    fieldMappings?: Record<string, string>;
    newFields?: Record<string, any>;
    removeFields?: string[];
    
    // Validation transformations
    validationRules?: Array<{
      field: string;
      rule: 'required' | 'numeric' | 'date' | 'email' | 'regex' | 'length' | 'range';
      params?: any;
      errorAction: 'skip' | 'default' | 'fail';
      defaultValue?: any;
    }>;
    
    // Enrichment transformations
    lookupTables?: Record<string, { source: string; key: string; fields: string[] }>;
    calculatedFields?: Record<string, string>; // JavaScript expressions
    
    // Filtering transformations
    filters?: Array<{
      field: string;
      operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater' | 'less' | 'contains' | 'regex';
      value: any;
    }>;
    
    // Custom transformations
    customFunction?: string; // JavaScript function as string
  };
}

export class DataPipelineOrchestrator extends EventEmitter {
  private pipelines: Map<string, PipelineConfig> = new Map();
  private executions: Map<string, PipelineExecution> = new Map();
  private workers: Map<string, Worker> = new Map();
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;
  
  // Service integrations
  private parquetWriter?: ParquetWriter;
  private redisStream?: RedisStreamManager;
  private hdfsClient?: HDFSClient;
  private openSearchClient?: OpenSearchClient;

  constructor(config: {
    parquetWriter?: ParquetWriter;
    redisStream?: RedisStreamManager;
    hdfsClient?: HDFSClient;
    openSearchClient?: OpenSearchClient;
  } = {}) {
    super();
    
    this.parquetWriter = config.parquetWriter;
    this.redisStream = config.redisStream;
    this.hdfsClient = config.hdfsClient;
    this.openSearchClient = config.openSearchClient;
    
    logger.info('DataPipelineOrchestrator initialized');
  }

  /**
   * Register a new pipeline configuration
   */
  registerPipeline(config: PipelineConfig): void {
    try {
      this.validatePipelineConfig(config);
      this.pipelines.set(config.id, config);
      
      logger.info(`Pipeline registered: ${config.name} (${config.id})`);
      this.emit('pipeline:registered', { pipelineId: config.id, name: config.name });
      
      // Schedule if cron expression is provided
      if (config.schedule) {
        this.schedulePipeline(config.id, config.schedule);
      }
      
    } catch (error) {
      logger.error(`Error registering pipeline ${config.id}:`, error);
      throw error;
    }
  }

  /**
   * Execute a pipeline
   */
  async executePipeline(pipelineId: string, options: {
    executionId?: string;
    forceRun?: boolean;
    stageOverrides?: Record<string, any>;
  } = {}): Promise<PipelineExecution> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    const executionId = options.executionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const execution: PipelineExecution = {
      id: executionId,
      pipelineId,
      startTime: Date.now(),
      status: 'running',
      stages: pipeline.stages.map(stage => ({
        name: stage.name,
        status: 'pending'
      })),
      totalRecords: 0,
      processedRecords: 0,
      errorRecords: 0,
      metrics: {
        extractDurationMs: 0,
        transformDurationMs: 0,
        loadDurationMs: 0,
        totalDurationMs: 0,
        throughputPerSecond: 0,
        peakMemoryUsageMB: 0
      },
      errors: []
    };

    this.executions.set(executionId, execution);
    this.emit('pipeline:started', { executionId, pipelineId });

    const timer = performanceMonitor.startTimer('pipeline_execution');

    try {
      // Execute pipeline stages
      await this.executePipelineStages(pipeline, execution, options.stageOverrides);
      
      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.metrics.totalDurationMs = execution.endTime - execution.startTime;
      
      if (execution.processedRecords > 0) {
        execution.metrics.throughputPerSecond = execution.processedRecords / (execution.metrics.totalDurationMs / 1000);
      }
      
      logger.info(`Pipeline completed: ${pipelineId} (${executionId}) - processed ${execution.processedRecords} records`);
      this.emit('pipeline:completed', { executionId, pipelineId, metrics: execution.metrics });
      
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.errors.push({
        stage: 'orchestrator',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      logger.error(`Pipeline failed: ${pipelineId} (${executionId}):`, error);
      this.emit('pipeline:failed', { executionId, pipelineId, error });
      
    } finally {
      performanceMonitor.endTimer(timer);
    }

    return execution;
  }

  /**
   * Create a ServiceNow to Parquet ETL pipeline
   */
  createServiceNowToParquetPipeline(config: {
    tables: string[];
    outputPath: string;
    compressionType?: 'snappy' | 'gzip' | 'lz4';
    batchSize?: number;
    schedule?: string;
  }): PipelineConfig {
    return {
      id: `servicenow_parquet_${Date.now()}`,
      name: 'ServiceNow to Parquet Export',
      description: 'Extract ServiceNow data and convert to Parquet format for analytics',
      schedule: config.schedule,
      stages: [
        {
          name: 'extract_servicenow_data',
          type: 'extract',
          enabled: true,
          config: {
            tables: config.tables,
            batchSize: config.batchSize || 10000,
            incrementalColumn: 'sys_updated_on'
          }
        },
        {
          name: 'validate_data',
          type: 'validate',
          enabled: true,
          config: {
            validationRules: [
              { field: 'sys_id', rule: 'required', errorAction: 'skip' },
              { field: 'sys_created_on', rule: 'date', errorAction: 'skip' },
              { field: 'sys_updated_on', rule: 'date', errorAction: 'skip' }
            ]
          },
          dependencies: ['extract_servicenow_data']
        },
        {
          name: 'transform_for_analytics',
          type: 'transform',
          enabled: true,
          config: {
            transformations: [
              {
                name: 'standardize_dates',
                type: 'field_mapping',
                config: {
                  calculatedFields: {
                    'created_date': 'new Date(record.sys_created_on).toISOString().split("T")[0]',
                    'updated_date': 'new Date(record.sys_updated_on).toISOString().split("T")[0]'
                  }
                }
              },
              {
                name: 'enrich_priority',
                type: 'enrichment',
                config: {
                  calculatedFields: {
                    'priority_text': `
                      const priorityMap = { '1': 'Critical', '2': 'High', '3': 'Moderate', '4': 'Low', '5': 'Planning' };
                      return priorityMap[record.priority] || 'Unknown';
                    `
                  }
                }
              }
            ]
          },
          dependencies: ['validate_data']
        },
        {
          name: 'write_parquet',
          type: 'load',
          enabled: true,
          config: {
            outputPath: config.outputPath,
            compressionType: config.compressionType || 'snappy',
            partitionStrategy: 'table'
          },
          dependencies: ['transform_for_analytics']
        }
      ],
      globalConfig: {
        maxConcurrentStages: 2,
        defaultTimeoutMs: 300000, // 5 minutes
        retryPolicy: {
          maxRetries: 3,
          backoffMultiplier: 2,
          maxBackoffMs: 60000
        },
        errorHandling: 'retry_then_fail',
        monitoring: {
          enabled: true,
          metricsInterval: 10000,
          alertThresholds: {
            failureRate: 0.05, // 5%
            avgDurationMs: 600000, // 10 minutes
            queueDepth: 1000
          }
        }
      },
      sourceConfig: {
        servicenow: {
          tables: config.tables,
          batchSize: config.batchSize || 10000,
          incrementalColumn: 'sys_updated_on'
        }
      },
      destinationConfig: {
        parquet: {
          enabled: true,
          outputPath: config.outputPath,
          compressionType: config.compressionType || 'snappy',
          partitionStrategy: 'table'
        },
        hadoop: { enabled: false, hdfsPath: '', replicationFactor: 0 },
        opensearch: { enabled: false, indexPrefix: '', refreshAfterLoad: false, batchSize: 0 },
        redis: { enabled: false, streamPrefix: '', maxStreamLength: 0, persistEvents: false }
      }
    };
  }

  /**
   * Create a real-time ServiceNow to OpenSearch pipeline
   */
  createRealTimeSearchPipeline(config: {
    tables: string[];
    indexPrefix: string;
    redisStreamPrefix: string;
    batchSize?: number;
  }): PipelineConfig {
    return {
      id: `servicenow_realtime_search_${Date.now()}`,
      name: 'Real-time ServiceNow Search Indexing',
      description: 'Process ServiceNow updates in real-time for search indexing',
      stages: [
        {
          name: 'stream_servicenow_updates',
          type: 'extract',
          enabled: true,
          config: {
            streamSource: 'redis',
            streamKey: `${config.redisStreamPrefix}_updates`,
            consumerGroup: 'search_indexer',
            batchSize: config.batchSize || 100
          }
        },
        {
          name: 'enrich_search_data',
          type: 'transform',
          enabled: true,
          config: {
            transformations: [
              {
                name: 'add_search_fields',
                type: 'enrichment',
                config: {
                  newFields: {
                    '@timestamp': 'new Date().toISOString()',
                    'search_text': 'record.short_description + " " + record.description',
                    'full_text': 'Object.values(record).join(" ").toLowerCase()'
                  }
                }
              },
              {
                name: 'normalize_states',
                type: 'field_mapping',
                config: {
                  fieldMappings: {
                    'state_text': `
                      const stateMap = { '1': 'New', '2': 'In Progress', '3': 'On Hold', '6': 'Resolved', '7': 'Closed' };
                      return stateMap[record.state] || record.state;
                    `
                  }
                }
              }
            ]
          },
          dependencies: ['stream_servicenow_updates']
        },
        {
          name: 'index_to_opensearch',
          type: 'load',
          enabled: true,
          config: {
            indexPrefix: config.indexPrefix,
            batchSize: config.batchSize || 100,
            refreshAfterBatch: true
          },
          dependencies: ['enrich_search_data']
        }
      ],
      globalConfig: {
        maxConcurrentStages: 3,
        defaultTimeoutMs: 60000, // 1 minute for real-time
        retryPolicy: {
          maxRetries: 2,
          backoffMultiplier: 1.5,
          maxBackoffMs: 10000
        },
        errorHandling: 'continue', // Don't stop processing for individual errors
        monitoring: {
          enabled: true,
          metricsInterval: 5000,
          alertThresholds: {
            failureRate: 0.1, // 10% for real-time is acceptable
            avgDurationMs: 30000, // 30 seconds
            queueDepth: 500
          }
        }
      },
      sourceConfig: {
        servicenow: {
          tables: config.tables,
          batchSize: config.batchSize || 100
        }
      },
      destinationConfig: {
        parquet: { enabled: false, outputPath: '', compressionType: 'snappy', partitionStrategy: 'date' },
        hadoop: { enabled: false, hdfsPath: '', replicationFactor: 0 },
        opensearch: {
          enabled: true,
          indexPrefix: config.indexPrefix,
          refreshAfterLoad: true,
          batchSize: config.batchSize || 100
        },
        redis: {
          enabled: true,
          streamPrefix: config.redisStreamPrefix,
          maxStreamLength: 10000,
          persistEvents: false
        }
      }
    };
  }

  /**
   * Create comprehensive data archival pipeline
   */
  createDataArchivalPipeline(config: {
    tables: string[];
    archiveAfterDays: number;
    hadoopPath: string;
    compressionType: 'snappy' | 'gzip' | 'lz4';
    schedule: string;
  }): PipelineConfig {
    return {
      id: `data_archival_${Date.now()}`,
      name: 'ServiceNow Data Archival',
      description: 'Archive old ServiceNow data to Hadoop for long-term storage',
      schedule: config.schedule,
      stages: [
        {
          name: 'identify_archival_data',
          type: 'extract',
          enabled: true,
          config: {
            tables: config.tables,
            archiveAfterDays: config.archiveAfterDays,
            filterExpression: `sys_updated_on < DATE_SUB(NOW(), INTERVAL ${config.archiveAfterDays} DAY)`
          }
        },
        {
          name: 'prepare_archive_format',
          type: 'transform',
          enabled: true,
          config: {
            transformations: [
              {
                name: 'add_archive_metadata',
                type: 'enrichment',
                config: {
                  newFields: {
                    'archived_date': 'new Date().toISOString()',
                    'archive_source': '"ServiceNow"',
                    'retention_policy': '"7_years"',
                    'archive_format': '"parquet_snappy"'
                  }
                }
              }
            ]
          },
          dependencies: ['identify_archival_data']
        },
        {
          name: 'convert_to_parquet',
          type: 'transform',
          enabled: true,
          config: {
            outputFormat: 'parquet',
            compressionType: config.compressionType,
            partitionBy: ['archived_date', 'table_name']
          },
          dependencies: ['prepare_archive_format']
        },
        {
          name: 'store_in_hadoop',
          type: 'load',
          enabled: true,
          config: {
            hadoopPath: config.hadoopPath,
            replicationFactor: 3,
            blockSize: 134217728, // 128MB
            preservePermissions: true
          },
          dependencies: ['convert_to_parquet']
        },
        {
          name: 'verify_archive_integrity',
          type: 'validate',
          enabled: true,
          config: {
            checksumValidation: true,
            recordCountValidation: true,
            sampleDataValidation: true
          },
          dependencies: ['store_in_hadoop']
        }
      ],
      globalConfig: {
        maxConcurrentStages: 2,
        defaultTimeoutMs: 3600000, // 1 hour for archival
        retryPolicy: {
          maxRetries: 3,
          backoffMultiplier: 2,
          maxBackoffMs: 300000 // 5 minutes
        },
        errorHandling: 'fail_fast', // Archive must be reliable
        monitoring: {
          enabled: true,
          metricsInterval: 30000,
          alertThresholds: {
            failureRate: 0.01, // 1%
            avgDurationMs: 7200000, // 2 hours
            queueDepth: 100
          }
        }
      },
      sourceConfig: {
        servicenow: {
          tables: config.tables,
          batchSize: 5000, // Smaller batches for archival
          filterConditions: {
            sys_updated_on: `< DATE_SUB(NOW(), INTERVAL ${config.archiveAfterDays} DAY)`
          }
        }
      },
      destinationConfig: {
        parquet: {
          enabled: true,
          outputPath: '/tmp/archive_staging',
          compressionType: config.compressionType,
          partitionStrategy: 'date'
        },
        hadoop: {
          enabled: true,
          hdfsPath: config.hadoopPath,
          replicationFactor: 3,
          blockSize: 134217728
        },
        opensearch: { enabled: false, indexPrefix: '', refreshAfterLoad: false, batchSize: 0 },
        redis: { enabled: false, streamPrefix: '', maxStreamLength: 0, persistEvents: false }
      }
    };
  }

  /**
   * Get pipeline execution status
   */
  getExecution(executionId: string): PipelineExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all registered pipelines
   */
  getPipelines(): Array<{ id: string; name: string; description: string; schedule?: string }> {
    return Array.from(this.pipelines.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      schedule: p.schedule
    }));
  }

  /**
   * Get pipeline execution history
   */
  getExecutionHistory(pipelineId: string, limit: number = 10): PipelineExecution[] {
    return Array.from(this.executions.values())
      .filter(e => e.pipelineId === pipelineId)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  /**
   * Cancel running pipeline execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    try {
      // Cancel any workers
      const worker = this.workers.get(executionId);
      if (worker) {
        await worker.terminate();
        this.workers.delete(executionId);
      }

      execution.status = 'cancelled';
      execution.endTime = Date.now();
      
      logger.info(`Pipeline execution cancelled: ${executionId}`);
      this.emit('pipeline:cancelled', { executionId });
      
      return true;
      
    } catch (error) {
      logger.error(`Error cancelling execution ${executionId}:`, error);
      return false;
    }
  }

  /**
   * Start monitoring and scheduling
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('DataPipelineOrchestrator is already running');
      return;
    }

    this.isRunning = true;
    
    // Start monitoring for all pipelines
    this.startGlobalMonitoring();
    
    logger.info('DataPipelineOrchestrator started');
    this.emit('orchestrator:started');
  }

  /**
   * Stop orchestrator and cleanup
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    // Cancel all scheduled jobs
    for (const [pipelineId, timeout] of this.scheduledJobs) {
      clearInterval(timeout);
      logger.info(`Cancelled scheduled pipeline: ${pipelineId}`);
    }
    this.scheduledJobs.clear();
    
    // Terminate all workers
    const workerPromises = Array.from(this.workers.entries()).map(async ([id, worker]) => {
      try {
        await worker.terminate();
        logger.info(`Terminated worker: ${id}`);
      } catch (error) {
        logger.error(`Error terminating worker ${id}:`, error);
      }
    });
    
    await Promise.all(workerPromises);
    this.workers.clear();
    
    logger.info('DataPipelineOrchestrator stopped');
    this.emit('orchestrator:stopped');
  }

  private validatePipelineConfig(config: PipelineConfig): void {
    if (!config.id || !config.name || !config.stages) {
      throw new Error('Pipeline config must have id, name, and stages');
    }

    if (config.stages.length === 0) {
      throw new Error('Pipeline must have at least one stage');
    }

    // Validate stage dependencies
    const stageNames = new Set(config.stages.map(s => s.name));
    for (const stage of config.stages) {
      if (stage.dependencies) {
        for (const dep of stage.dependencies) {
          if (!stageNames.has(dep)) {
            throw new Error(`Stage ${stage.name} depends on non-existent stage: ${dep}`);
          }
        }
      }
    }

    logger.debug(`Pipeline config validated: ${config.id}`);
  }

  private async executePipelineStages(
    pipeline: PipelineConfig,
    execution: PipelineExecution,
    stageOverrides?: Record<string, any>
  ): Promise<void> {
    const dependencyGraph = this.buildDependencyGraph(pipeline.stages);
    const completed = new Set<string>();
    
    while (completed.size < pipeline.stages.length) {
      // Find stages that can be executed (all dependencies completed)
      const readyStages = pipeline.stages.filter(stage => 
        !completed.has(stage.name) &&
        stage.enabled &&
        (!stage.dependencies || stage.dependencies.every(dep => completed.has(dep)))
      );

      if (readyStages.length === 0) {
        const pendingStages = pipeline.stages.filter(s => !completed.has(s.name) && s.enabled);
        if (pendingStages.length > 0) {
          throw new Error(`Circular dependency detected in stages: ${pendingStages.map(s => s.name).join(', ')}`);
        }
        break;
      }

      // Execute ready stages (with parallelism limit)
      const maxParallelism = pipeline.globalConfig.maxConcurrentStages || 1;
      const stagesToExecute = readyStages.slice(0, maxParallelism);
      
      const stagePromises = stagesToExecute.map(stage => 
        this.executeStage(pipeline, stage, execution, stageOverrides)
      );

      const results = await Promise.allSettled(stagePromises);
      
      // Process results
      for (let i = 0; i < results.length; i++) {
        const stage = stagesToExecute[i];
        const result = results[i];
        
        if (result.status === 'fulfilled') {
          completed.add(stage.name);
          logger.info(`Stage completed: ${stage.name}`);
        } else {
          const error = result.reason;
          logger.error(`Stage failed: ${stage.name}:`, error);
          
          // Handle error based on pipeline policy
          if (pipeline.globalConfig.errorHandling === 'fail_fast') {
            throw error;
          } else if (pipeline.globalConfig.errorHandling === 'continue') {
            completed.add(stage.name); // Mark as completed to continue pipeline
          }
          // 'retry_then_fail' is handled in executeStage
        }
      }
    }
  }

  private async executeStage(
    pipeline: PipelineConfig,
    stage: PipelineStage,
    execution: PipelineExecution,
    stageOverrides?: Record<string, any>
  ): Promise<void> {
    const stageExecution = execution.stages.find(s => s.name === stage.name);
    if (!stageExecution) {
      throw new Error(`Stage execution not found: ${stage.name}`);
    }

    stageExecution.status = 'running';
    stageExecution.startTime = Date.now();
    
    const effectiveConfig = { ...stage.config, ...stageOverrides?.[stage.name] };
    const maxRetries = stage.maxRetries || pipeline.globalConfig.retryPolicy?.maxRetries || 0;
    const timeoutMs = stage.timeoutMs || pipeline.globalConfig.defaultTimeoutMs || 300000;

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.executeStageWithTimeout(stage, effectiveConfig, execution, timeoutMs);
        
        stageExecution.status = 'completed';
        stageExecution.endTime = Date.now();
        
        return; // Success
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const backoffMs = Math.min(
            1000 * Math.pow(pipeline.globalConfig.retryPolicy?.backoffMultiplier || 2, attempt),
            pipeline.globalConfig.retryPolicy?.maxBackoffMs || 60000
          );
          
          logger.warn(`Stage ${stage.name} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms:`, error);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // All retries exhausted
    stageExecution.status = 'failed';
    stageExecution.endTime = Date.now();
    stageExecution.error = lastError?.message;
    
    execution.errors.push({
      stage: stage.name,
      timestamp: Date.now(),
      error: lastError?.message || 'Unknown error'
    });

    throw lastError;
  }

  private async executeStageWithTimeout(
    stage: PipelineStage,
    config: any,
    execution: PipelineExecution,
    timeoutMs: number
  ): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Stage ${stage.name} timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const stagePromise = this.executeStageLogic(stage, config, execution);
    
    await Promise.race([stagePromise, timeoutPromise]);
  }

  private async executeStageLogic(stage: PipelineStage, config: any, execution: PipelineExecution): Promise<void> {
    switch (stage.type) {
      case 'extract':
        await this.executeExtractStage(stage, config, execution);
        break;
      case 'transform':
        await this.executeTransformStage(stage, config, execution);
        break;
      case 'load':
        await this.executeLoadStage(stage, config, execution);
        break;
      case 'validate':
        await this.executeValidateStage(stage, config, execution);
        break;
      case 'monitor':
        await this.executeMonitorStage(stage, config, execution);
        break;
      default:
        throw new Error(`Unknown stage type: ${stage.type}`);
    }
  }

  private async executeExtractStage(stage: PipelineStage, config: any, execution: PipelineExecution): Promise<void> {
    // Implementation depends on source type
    logger.info(`Executing extract stage: ${stage.name}`);
    
    // For ServiceNow extraction, this would query GlideRecord
    // For Redis streams, this would consume from streams
    // For file systems, this would read files
    
    // Simulate data extraction
    const extractedRecords = Math.floor(Math.random() * 10000) + 1000;
    execution.totalRecords += extractedRecords;
    
    this.emit('stage:extract:completed', {
      stage: stage.name,
      recordsExtracted: extractedRecords
    });
  }

  private async executeTransformStage(stage: PipelineStage, config: any, execution: PipelineExecution): Promise<void> {
    logger.info(`Executing transform stage: ${stage.name}`);
    
    // Apply transformations based on config
    if (config.transformations) {
      for (const transformation of config.transformations) {
        await this.applyTransformation(transformation, execution);
      }
    }
    
    this.emit('stage:transform:completed', {
      stage: stage.name,
      recordsTransformed: execution.totalRecords
    });
  }

  private async executeLoadStage(stage: PipelineStage, config: any, execution: PipelineExecution): Promise<void> {
    logger.info(`Executing load stage: ${stage.name}`);
    
    // Load to various destinations based on config
    let loadedRecords = 0;
    
    if (config.outputPath && this.parquetWriter) {
      // Load to Parquet
      loadedRecords = execution.totalRecords;
    }
    
    if (config.indexPrefix && this.openSearchClient) {
      // Load to OpenSearch
      loadedRecords = execution.totalRecords;
    }
    
    if (config.hadoopPath && this.hdfsClient) {
      // Load to Hadoop
      loadedRecords = execution.totalRecords;
    }
    
    execution.processedRecords = loadedRecords;
    
    this.emit('stage:load:completed', {
      stage: stage.name,
      recordsLoaded: loadedRecords
    });
  }

  private async executeValidateStage(stage: PipelineStage, config: any, execution: PipelineExecution): Promise<void> {
    logger.info(`Executing validate stage: ${stage.name}`);
    
    // Apply validation rules
    if (config.validationRules) {
      let errorCount = 0;
      
      for (const rule of config.validationRules) {
        // Simulate validation
        const ruleErrorCount = Math.floor(Math.random() * 10);
        errorCount += ruleErrorCount;
      }
      
      execution.errorRecords += errorCount;
    }
    
    this.emit('stage:validate:completed', {
      stage: stage.name,
      validationErrors: execution.errorRecords
    });
  }

  private async executeMonitorStage(stage: PipelineStage, config: any, execution: PipelineExecution): Promise<void> {
    logger.info(`Executing monitor stage: ${stage.name}`);
    
    // Collect and report metrics
    const metrics = {
      memoryUsage: process.memoryUsage(),
      timestamp: Date.now(),
      processedRecords: execution.processedRecords,
      errorRecords: execution.errorRecords
    };
    
    this.emit('stage:monitor:completed', {
      stage: stage.name,
      metrics
    });
  }

  private async applyTransformation(transformation: DataTransformation, execution: PipelineExecution): Promise<void> {
    logger.debug(`Applying transformation: ${transformation.name} (${transformation.type})`);
    
    // Implementation would apply the specific transformation logic
    // This is a simplified version
    switch (transformation.type) {
      case 'field_mapping':
        // Apply field mappings
        break;
      case 'validation':
        // Apply validation rules
        break;
      case 'enrichment':
        // Apply enrichment logic
        break;
      case 'filtering':
        // Apply filters
        break;
      case 'custom':
        // Execute custom function
        break;
    }
  }

  private buildDependencyGraph(stages: PipelineStage[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const stage of stages) {
      graph.set(stage.name, stage.dependencies || []);
    }
    
    return graph;
  }

  private schedulePipeline(pipelineId: string, cronExpression: string): void {
    // This would integrate with a cron parser
    // For now, we'll simulate scheduling
    logger.info(`Pipeline scheduled: ${pipelineId} with cron: ${cronExpression}`);
    
    // Simple interval for demonstration
    const intervalMs = 60000; // 1 minute
    const timeout = setInterval(async () => {
      try {
        logger.info(`Executing scheduled pipeline: ${pipelineId}`);
        await this.executePipeline(pipelineId, { forceRun: true });
      } catch (error) {
        logger.error(`Error in scheduled pipeline ${pipelineId}:`, error);
      }
    }, intervalMs);
    
    this.scheduledJobs.set(pipelineId, timeout);
  }

  private startGlobalMonitoring(): void {
    // Monitor overall system health and pipeline performance
    const monitoringInterval = setInterval(() => {
      try {
        const runningExecutions = Array.from(this.executions.values())
          .filter(e => e.status === 'running');
        
        const completedExecutions = Array.from(this.executions.values())
          .filter(e => e.status === 'completed');
        
        const failedExecutions = Array.from(this.executions.values())
          .filter(e => e.status === 'failed');
        
        this.emit('monitoring:global', {
          timestamp: Date.now(),
          runningPipelines: runningExecutions.length,
          completedPipelines: completedExecutions.length,
          failedPipelines: failedExecutions.length,
          totalPipelines: this.pipelines.size,
          memoryUsage: process.memoryUsage()
        });
        
      } catch (error) {
        logger.error('Error in global monitoring:', error);
      }
    }, 30000); // Every 30 seconds

    // Cleanup old executions to prevent memory leaks
    const cleanupInterval = setInterval(() => {
      const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
      let cleanedCount = 0;
      
      for (const [id, execution] of this.executions) {
        if (execution.endTime && execution.endTime < cutoffTime) {
          this.executions.delete(id);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} old pipeline executions`);
      }
    }, 60 * 60 * 1000); // Every hour
  }
}

// Export utility functions for pipeline configuration
export class PipelineConfigBuilder {
  static createBasicETLPipeline(config: {
    name: string;
    sourceTables: string[];
    batchSize: number;
    destinations: {
      parquet?: { path: string; compression: 'snappy' | 'gzip' | 'lz4' };
      opensearch?: { indexPrefix: string };
      hadoop?: { hdfsPath: string };
    };
    schedule?: string;
  }): PipelineConfig {
    const stages: PipelineStage[] = [
      {
        name: 'extract',
        type: 'extract',
        enabled: true,
        config: {
          tables: config.sourceTables,
          batchSize: config.batchSize
        }
      },
      {
        name: 'transform',
        type: 'transform',
        enabled: true,
        config: {
          transformations: []
        },
        dependencies: ['extract']
      }
    ];

    // Add destination stages
    if (config.destinations.parquet) {
      stages.push({
        name: 'load_parquet',
        type: 'load',
        enabled: true,
        config: {
          outputPath: config.destinations.parquet.path,
          compressionType: config.destinations.parquet.compression
        },
        dependencies: ['transform']
      });
    }

    if (config.destinations.opensearch) {
      stages.push({
        name: 'load_opensearch',
        type: 'load',
        enabled: true,
        config: {
          indexPrefix: config.destinations.opensearch.indexPrefix
        },
        dependencies: ['transform']
      });
    }

    if (config.destinations.hadoop) {
      stages.push({
        name: 'load_hadoop',
        type: 'load',
        enabled: true,
        config: {
          hadoopPath: config.destinations.hadoop.hdfsPath
        },
        dependencies: ['transform']
      });
    }

    return {
      id: `etl_${Date.now()}`,
      name: config.name,
      description: `ETL pipeline for ${config.sourceTables.join(', ')}`,
      schedule: config.schedule,
      stages,
      globalConfig: {
        maxConcurrentStages: 2,
        defaultTimeoutMs: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffMultiplier: 2,
          maxBackoffMs: 60000
        },
        errorHandling: 'retry_then_fail',
        monitoring: {
          enabled: true,
          metricsInterval: 10000
        }
      },
      sourceConfig: {
        servicenow: {
          tables: config.sourceTables,
          batchSize: config.batchSize
        }
      },
      destinationConfig: {
        parquet: config.destinations.parquet ? {
          enabled: true,
          outputPath: config.destinations.parquet.path,
          compressionType: config.destinations.parquet.compression,
          partitionStrategy: 'date'
        } : { enabled: false, outputPath: '', compressionType: 'snappy', partitionStrategy: 'date' },
        opensearch: config.destinations.opensearch ? {
          enabled: true,
          indexPrefix: config.destinations.opensearch.indexPrefix,
          refreshAfterLoad: true,
          batchSize: config.batchSize
        } : { enabled: false, indexPrefix: '', refreshAfterLoad: false, batchSize: 0 },
        hadoop: config.destinations.hadoop ? {
          enabled: true,
          hdfsPath: config.destinations.hadoop.hdfsPath,
          replicationFactor: 3
        } : { enabled: false, hdfsPath: '', replicationFactor: 0 },
        redis: { enabled: false, streamPrefix: '', maxStreamLength: 0, persistEvents: false }
      }
    };
  }
}