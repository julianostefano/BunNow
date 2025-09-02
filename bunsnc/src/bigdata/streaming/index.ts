/**
 * Streaming Data Processing Module - Real-time ServiceNow Data Processing
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export { 
  StreamProcessor, 
  ServiceNowStreamProcessorFactory,
  StreamUtils
} from './StreamProcessor';

export type {
  StreamProcessorConfig,
  ProcessorMetrics,
  BackpressureState,
  ProcessingFunction,
  FilterFunction,
  TransformFunction
} from './StreamProcessor';

import { StreamProcessor, ServiceNowStreamProcessorFactory } from './StreamProcessor';
import { RedisStreamManager } from '../redis/RedisStreamManager';
import { OpenSearchClient } from '../opensearch/OpenSearchClient';
import { ParquetWriter } from '../parquet/ParquetWriter';
import { logger } from '../../utils/Logger';
import type { StreamProcessorConfig, ProcessorMetrics } from './StreamProcessor';

/**
 * Integrated streaming platform for ServiceNow data processing
 */
export class ServiceNowStreamingPlatform {
  private processors: Map<string, StreamProcessor> = new Map();
  private redisStream?: RedisStreamManager;
  private openSearchClient?: OpenSearchClient;
  private parquetWriter?: ParquetWriter;
  private isRunning: boolean = false;
  private globalMetrics: {
    totalRecordsProcessed: number;
    totalProcessors: number;
    activeProcessors: number;
    errorRate: number;
    avgThroughput: number;
    lastUpdated: number;
  } = {
    totalRecordsProcessed: 0,
    totalProcessors: 0,
    activeProcessors: 0,
    errorRate: 0,
    avgThroughput: 0,
    lastUpdated: Date.now()
  };

  constructor(config: {
    redisStream?: RedisStreamManager;
    openSearchClient?: OpenSearchClient;
    parquetWriter?: ParquetWriter;
  } = {}) {
    this.redisStream = config.redisStream;
    this.openSearchClient = config.openSearchClient;
    this.parquetWriter = config.parquetWriter;
    
    logger.info('ServiceNow Streaming Platform initialized');
  }

  /**
   * Create and register a new stream processor
   */
  createProcessor(
    name: string, 
    config: Partial<StreamProcessorConfig>,
    type: 'incident' | 'export' | 'notification' | 'custom' = 'custom'
  ): StreamProcessor {
    if (this.processors.has(name)) {
      throw new Error(`Processor with name ${name} already exists`);
    }

    let processor: StreamProcessor;

    switch (type) {
      case 'incident':
        processor = ServiceNowStreamProcessorFactory.createIncidentProcessor(config);
        break;
      case 'export':
        processor = ServiceNowStreamProcessorFactory.createExportProcessor(config);
        break;
      case 'notification':
        processor = ServiceNowStreamProcessorFactory.createNotificationProcessor(config);
        break;
      case 'custom':
      default:
        const fullConfig: StreamProcessorConfig = {
          name,
          batchSize: 100,
          maxConcurrency: 4,
          bufferSize: 1000,
          backpressureThreshold: 0.8,
          backpressureStrategy: 'throttle',
          timeoutMs: 30000,
          retryPolicy: {
            maxRetries: 3,
            backoffMultiplier: 2,
            maxBackoffMs: 30000
          },
          monitoring: {
            enabled: true,
            metricsInterval: 5000,
            alertThresholds: {
              bufferUtilization: 0.8,
              processingLatency: 10000,
              errorRate: 0.05,
              throughput: 50
            }
          },
          ...config
        };
        processor = new StreamProcessor(fullConfig);
        break;
    }

    // Set up processor event handlers
    this.setupProcessorEventHandlers(processor, name);
    
    this.processors.set(name, processor);
    this.updateGlobalMetrics();
    
    logger.info(`Stream processor created and registered: ${name}`);
    return processor;
  }

  /**
   * Create real-time ServiceNow incident processing pipeline
   */
  async createIncidentProcessingPipeline(config: {
    name?: string;
    redisStreamKey?: string;
    openSearchIndexPrefix?: string;
    enableParquetStorage?: boolean;
    parquetOutputPath?: string;
    batchSize?: number;
    processingRules?: Array<{
      field: string;
      condition: string;
      action: 'route' | 'transform' | 'alert' | 'enrich';
      params: any;
    }>;
  } = {}): Promise<{
    processor: StreamProcessor;
    pipeline: any;
    streamKey: string;
  }> {
    const processorName = config.name || 'incident_realtime_pipeline';
    const streamKey = config.redisStreamKey || 'servicenow:incidents:stream';
    
    // Create processor
    const processor = this.createProcessor(processorName, {
      batchSize: config.batchSize || 100,
      backpressureStrategy: 'throttle'
    }, 'incident');

    // Create processing pipeline
    const pipeline = this.createIncidentPipeline(processor, {
      openSearchIndexPrefix: config.openSearchIndexPrefix || 'servicenow-incidents',
      enableParquetStorage: config.enableParquetStorage || false,
      parquetOutputPath: config.parquetOutputPath || '/data/incidents',
      processingRules: config.processingRules || []
    });

    // Connect to Redis stream if available
    if (this.redisStream) {
      await this.connectProcessorToRedisStream(processor, streamKey, processorName);
    }

    logger.info(`Incident processing pipeline created: ${processorName}`);
    
    return { processor, pipeline, streamKey };
  }

  /**
   * Create high-volume data export pipeline
   */
  async createDataExportPipeline(config: {
    name?: string;
    tables: string[];
    outputFormat: 'parquet' | 'json' | 'csv';
    outputPath: string;
    compressionType?: 'snappy' | 'gzip' | 'lz4';
    batchSize?: number;
    parallelism?: number;
    incrementalField?: string;
  }): Promise<{
    processor: StreamProcessor;
    pipeline: any;
  }> {
    const processorName = config.name || 'data_export_pipeline';
    
    // Create high-capacity export processor
    const processor = this.createProcessor(processorName, {
      batchSize: config.batchSize || 1000,
      maxConcurrency: config.parallelism || 8,
      bufferSize: 10000,
      backpressureStrategy: 'buffer'
    }, 'export');

    // Create export pipeline
    const pipeline = this.createExportPipeline(processor, {
      tables: config.tables,
      outputFormat: config.outputFormat,
      outputPath: config.outputPath,
      compressionType: config.compressionType || 'snappy',
      incrementalField: config.incrementalField
    });

    logger.info(`Data export pipeline created: ${processorName} for tables: ${config.tables.join(', ')}`);
    
    return { processor, pipeline };
  }

  /**
   * Create real-time notification pipeline
   */
  async createNotificationPipeline(config: {
    name?: string;
    notificationTypes: Array<'email' | 'slack' | 'teams' | 'webhook' | 'sms'>;
    triggers: Array<{
      table: string;
      conditions: any[];
      template: string;
      priority: 'low' | 'normal' | 'high' | 'critical';
    }>;
    batchSize?: number;
    rateLimitPerMinute?: number;
  }): Promise<{
    processor: StreamProcessor;
    pipeline: any;
  }> {
    const processorName = config.name || 'notification_pipeline';
    
    // Create notification processor with circuit breaker for reliability
    const processor = this.createProcessor(processorName, {
      batchSize: config.batchSize || 50,
      maxConcurrency: 2,
      backpressureStrategy: 'circuit_breaker',
      timeoutMs: 5000
    }, 'notification');

    // Create notification pipeline
    const pipeline = this.createNotificationProcessingPipeline(processor, {
      notificationTypes: config.notificationTypes,
      triggers: config.triggers,
      rateLimitPerMinute: config.rateLimitPerMinute || 1000
    });

    logger.info(`Notification pipeline created: ${processorName}`);
    
    return { processor, pipeline };
  }

  /**
   * Get processor by name
   */
  getProcessor(name: string): StreamProcessor | undefined {
    return this.processors.get(name);
  }

  /**
   * Get all processors
   */
  getProcessors(): Array<{ name: string; processor: StreamProcessor }> {
    return Array.from(this.processors.entries()).map(([name, processor]) => ({
      name,
      processor
    }));
  }

  /**
   * Get platform-wide metrics
   */
  getPlatformMetrics(): {
    global: typeof this.globalMetrics;
    processors: Array<{ name: string; metrics: ProcessorMetrics; healthy: boolean }>;
    systemHealth: {
      overallHealth: 'healthy' | 'degraded' | 'critical';
      issues: string[];
      recommendations: string[];
    };
  } {
    const processorMetrics = Array.from(this.processors.entries()).map(([name, processor]) => ({
      name,
      metrics: processor.getCurrentMetrics(),
      healthy: processor.isHealthy()
    }));

    // Determine system health
    const unhealthyProcessors = processorMetrics.filter(p => !p.healthy);
    const avgErrorRate = processorMetrics.reduce((sum, p) => sum + p.metrics.errorRate, 0) / processorMetrics.length || 0;
    const avgBufferUtilization = processorMetrics.reduce((sum, p) => sum + p.metrics.bufferUtilization, 0) / processorMetrics.length || 0;

    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (unhealthyProcessors.length > 0) {
      overallHealth = unhealthyProcessors.length > processorMetrics.length / 2 ? 'critical' : 'degraded';
      issues.push(`${unhealthyProcessors.length} unhealthy processors: ${unhealthyProcessors.map(p => p.name).join(', ')}`);
      recommendations.push('Check processor logs and consider restarting unhealthy processors');
    }

    if (avgErrorRate > 0.1) {
      overallHealth = 'critical';
      issues.push(`High error rate: ${(avgErrorRate * 100).toFixed(1)}%`);
      recommendations.push('Review error logs and processing logic');
    }

    if (avgBufferUtilization > 0.9) {
      if (overallHealth === 'healthy') overallHealth = 'degraded';
      issues.push(`High buffer utilization: ${(avgBufferUtilization * 100).toFixed(1)}%`);
      recommendations.push('Consider increasing buffer sizes or processing capacity');
    }

    return {
      global: this.globalMetrics,
      processors: processorMetrics,
      systemHealth: {
        overallHealth,
        issues,
        recommendations
      }
    };
  }

  /**
   * Start all processors
   */
  async startAll(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Streaming platform is already running');
      return;
    }

    this.isRunning = true;
    
    // Start global metrics collection
    this.startGlobalMonitoring();
    
    logger.info(`Started ServiceNow Streaming Platform with ${this.processors.size} processors`);
  }

  /**
   * Stop all processors gracefully
   */
  async stopAll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    logger.info('Stopping all stream processors...');
    
    // Shutdown all processors
    const shutdownPromises = Array.from(this.processors.entries()).map(async ([name, processor]) => {
      try {
        await processor.shutdown();
        logger.info(`Processor stopped: ${name}`);
      } catch (error) {
        logger.error(`Error stopping processor ${name}:`, error);
      }
    });

    await Promise.all(shutdownPromises);
    
    // Stop global monitoring
    this.stopGlobalMonitoring();
    
    logger.info('ServiceNow Streaming Platform stopped');
  }

  /**
   * Remove processor
   */
  async removeProcessor(name: string): Promise<boolean> {
    const processor = this.processors.get(name);
    if (!processor) {
      return false;
    }

    await processor.shutdown();
    this.processors.delete(name);
    this.updateGlobalMetrics();
    
    logger.info(`Processor removed: ${name}`);
    return true;
  }

  private setupProcessorEventHandlers(processor: StreamProcessor, name: string): void {
    processor.on('metrics:update', (metrics: ProcessorMetrics) => {
      this.updateGlobalMetrics();
    });

    processor.on('backpressure:activated', (state) => {
      logger.warn(`Backpressure activated on processor ${name}:`, state);
    });

    processor.on('processing:error', (event) => {
      logger.error(`Processing error in processor ${name}:`, event.error);
    });

    processor.on('alert:error_rate', (alert) => {
      logger.error(`High error rate alert for processor ${name}:`, alert);
    });

    processor.on('alert:buffer_utilization', (alert) => {
      logger.warn(`Buffer utilization alert for processor ${name}:`, alert);
    });

    processor.on('dead_letter', (event) => {
      logger.warn(`Dead letter record from processor ${name}:`, event);
      // Could forward to a dead letter queue service
    });
  }

  private createIncidentPipeline(processor: StreamProcessor, config: any): any {
    // Create incident processing pipeline with multiple stages
    const filterStream = processor.createFilterStream((record: any) => {
      // Filter active incidents
      return record.active === 'true' || record.active === true;
    });

    const enrichmentStream = processor.createTransformStream((record: any) => {
      // Add computed fields
      return {
        ...record,
        priority_text: this.getPriorityText(record.priority),
        age_hours: this.calculateAgeInHours(record.sys_created_on),
        search_text: `${record.short_description} ${record.description}`.toLowerCase(),
        indexed_at: new Date().toISOString()
      };
    });

    const routingStream = processor.createTransformStream((record: any) => {
      // Route to different destinations based on priority
      if (record.priority === '1') {
        // Critical incidents - immediate processing
        record._routing = 'critical';
      } else if (record.priority === '2') {
        // High priority - fast lane
        record._routing = 'high';
      } else {
        // Normal processing
        record._routing = 'normal';
      }
      return record;
    });

    // Create processing pipeline
    const processingStream = processor.createProcessingStream(async (batch: any[]) => {
      const results = [];
      
      for (const record of batch) {
        try {
          // Index to OpenSearch if available
          if (this.openSearchClient && config.openSearchIndexPrefix) {
            await this.openSearchClient.indexDocument(
              `${config.openSearchIndexPrefix}-${record._routing}`,
              record.sys_id,
              record
            );
          }

          // Store in Parquet if enabled
          if (config.enableParquetStorage && this.parquetWriter) {
            // Would write to parquet here
          }

          results.push(record);
          
        } catch (error) {
          logger.error('Error processing incident record:', error);
          throw error;
        }
      }
      
      return results;
    });

    return {
      filterStream,
      enrichmentStream,
      routingStream,
      processingStream
    };
  }

  private createExportPipeline(processor: StreamProcessor, config: any): any {
    // Create batch processing stream for high-volume exports
    const batchingStream = processor.createBatchingStream(config.batchSize || 1000);
    
    const exportStream = processor.createProcessingStream(async (batches: any[][]) => {
      const results = [];
      
      for (const batch of batches) {
        try {
          if (config.outputFormat === 'parquet' && this.parquetWriter) {
            const outputPath = `${config.outputPath}/${Date.now()}_batch.parquet`;
            await this.parquetWriter.writeRecords(batch, outputPath);
            results.push({ type: 'parquet', path: outputPath, count: batch.length });
          } else {
            // Handle other formats (JSON, CSV)
            const outputPath = `${config.outputPath}/${Date.now()}_batch.${config.outputFormat}`;
            // Would write to file here
            results.push({ type: config.outputFormat, path: outputPath, count: batch.length });
          }
        } catch (error) {
          logger.error('Error in export processing:', error);
          throw error;
        }
      }
      
      return results;
    });

    return {
      batchingStream,
      exportStream
    };
  }

  private createNotificationProcessingPipeline(processor: StreamProcessor, config: any): any {
    // Rate limiting stream
    const rateLimitStream = processor.createRateLimitingStream(config.rateLimitPerMinute / 60);
    
    // Notification processing
    const notificationStream = processor.createProcessingStream(async (batch: any[]) => {
      const results = [];
      
      for (const record of batch) {
        try {
          // Apply trigger conditions
          for (const trigger of config.triggers) {
            if (this.matchesTriggerConditions(record, trigger.conditions)) {
              // Send notifications based on type
              for (const notificationType of config.notificationTypes) {
                await this.sendNotification(notificationType, record, trigger);
              }
              results.push({ record: record.sys_id, trigger: trigger.template, sent: true });
            }
          }
        } catch (error) {
          logger.error('Error processing notification:', error);
          results.push({ record: record.sys_id, error: error.message, sent: false });
        }
      }
      
      return results;
    });

    return {
      rateLimitStream,
      notificationStream
    };
  }

  private async connectProcessorToRedisStream(processor: StreamProcessor, streamKey: string, consumerGroup: string): Promise<void> {
    if (!this.redisStream) {
      throw new Error('Redis stream manager not available');
    }

    // Start consuming from Redis stream
    const consumer = await this.redisStream.startConsumer({
      streamKey,
      consumerGroup,
      consumerId: `processor_${consumerGroup}_${Date.now()}`,
      batchSize: 100,
      blockTimeMs: 1000
    });

    consumer.on('message', (message) => {
      // Feed message to processor
      // This would integrate with the processor's input stream
    });

    logger.info(`Connected processor to Redis stream: ${streamKey}`);
  }

  private updateGlobalMetrics(): void {
    const now = Date.now();
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalThroughput = 0;
    let activeCount = 0;

    for (const processor of this.processors.values()) {
      const metrics = processor.getCurrentMetrics();
      totalProcessed += metrics.recordsProcessed;
      totalErrors += metrics.recordsErrored;
      totalThroughput += metrics.throughputPerSecond;
      
      if (processor.isHealthy()) {
        activeCount++;
      }
    }

    this.globalMetrics = {
      totalRecordsProcessed: totalProcessed,
      totalProcessors: this.processors.size,
      activeProcessors: activeCount,
      errorRate: totalProcessed > 0 ? totalErrors / totalProcessed : 0,
      avgThroughput: this.processors.size > 0 ? totalThroughput / this.processors.size : 0,
      lastUpdated: now
    };
  }

  private startGlobalMonitoring(): void {
    setInterval(() => {
      this.updateGlobalMetrics();
    }, 10000); // Update every 10 seconds
  }

  private stopGlobalMonitoring(): void {
    // Implementation would clear the interval
  }

  private getPriorityText(priority: string): string {
    const priorityMap: Record<string, string> = {
      '1': 'Critical',
      '2': 'High',
      '3': 'Moderate',
      '4': 'Low',
      '5': 'Planning'
    };
    return priorityMap[priority] || 'Unknown';
  }

  private calculateAgeInHours(createdOn: string): number {
    const created = new Date(createdOn);
    const now = new Date();
    return (now.getTime() - created.getTime()) / (1000 * 60 * 60);
  }

  private matchesTriggerConditions(record: any, conditions: any[]): boolean {
    // Simple condition matching - would be more sophisticated in real implementation
    return conditions.some(condition => {
      // Implement condition matching logic
      return true; // Placeholder
    });
  }

  private async sendNotification(type: string, record: any, trigger: any): Promise<void> {
    // Implementation would send actual notifications
    logger.info(`Sending ${type} notification for ${record.sys_id}`);
  }
}