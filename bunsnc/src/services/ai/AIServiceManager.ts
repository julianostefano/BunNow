/**
 * AI Service Manager - Orchestrator central para todos os serviços de AI
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/Logger';
import {
  AIRequest,
  AIResponse,
  AIServiceMetrics,
  AIContext
} from '../../types/AI';

export abstract class AIService extends EventEmitter {
  protected name: string;
  protected initialized: boolean = false;
  protected metrics: AIServiceMetrics;

  constructor(name: string) {
    super();
    this.name = name;
    this.metrics = {
      requests_total: 0,
      requests_successful: 0,
      avg_response_time_ms: 0,
      last_request_time: null
    };
  }

  abstract async initialize(): Promise<void>;
  abstract async process(request: AIRequest): Promise<AIResponse>;
  abstract async healthCheck(): Promise<boolean>;

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    this.metrics.requests_total++;

    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const response = await this.process(request);

      if (response.success) {
        this.metrics.requests_successful++;
      }

      const processingTime = Date.now() - startTime;
      this.metrics.avg_response_time_ms =
        (this.metrics.avg_response_time_ms + processingTime) / 2;
      this.metrics.last_request_time = new Date();

      return {
        ...response,
        processing_time_ms: processingTime
      };

    } catch (error) {
      logger.error(`❌ [AIService:${this.name}] Error processing request:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processing_time_ms: Date.now() - startTime
      };
    }
  }

  getMetrics(): AIServiceMetrics {
    return { ...this.metrics };
  }
}

export class AIServiceManager extends EventEmitter {
  private static instance: AIServiceManager;
  private services: Map<string, AIService> = new Map();
  private initialized: boolean = false;

  private constructor() {
    super();
    logger.info('🧠 [AIServiceManager] Initializing AI Service Manager...');
  }

  static getInstance(): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager();
    }
    return AIServiceManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('🔧 [AIServiceManager] Loading AI services...');

      // Services will be registered by their respective modules
      // This allows for lazy loading and better dependency management

      this.initialized = true;
      logger.info('✅ [AIServiceManager] AI Service Manager initialized successfully');

      this.emit('initialized');
    } catch (error) {
      logger.error('❌ [AIServiceManager] Failed to initialize:', error);
      throw error;
    }
  }

  registerService(serviceId: string, service: AIService): void {
    if (this.services.has(serviceId)) {
      logger.warn(`⚠️ [AIServiceManager] Service ${serviceId} already registered, replacing...`);
    }

    this.services.set(serviceId, service);
    logger.info(`📝 [AIServiceManager] Service '${serviceId}' registered`);

    // Setup service event forwarding
    service.on('error', (error) => {
      this.emit('service-error', { serviceId, error });
    });

    service.on('metrics-update', (metrics) => {
      this.emit('service-metrics', { serviceId, metrics });
    });
  }

  async processRequest(serviceId: string, request: AIRequest): Promise<AIResponse> {
    const service = this.services.get(serviceId);

    if (!service) {
      return {
        success: false,
        error: `Service '${serviceId}' not found. Available services: ${Array.from(this.services.keys()).join(', ')}`
      };
    }

    try {
      const response = await service.execute(request);

      // Emit metrics for monitoring
      this.emit('request-processed', {
        serviceId,
        success: response.success,
        processingTime: response.processing_time_ms
      });

      return response;
    } catch (error) {
      logger.error(`❌ [AIServiceManager] Error processing request for service '${serviceId}':`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const healthStatus: Record<string, boolean> = {};

    for (const [serviceId, service] of this.services.entries()) {
      try {
        healthStatus[serviceId] = await service.healthCheck();
      } catch (error) {
        logger.error(`❌ [AIServiceManager] Health check failed for '${serviceId}':`, error);
        healthStatus[serviceId] = false;
      }
    }

    return healthStatus;
  }

  getServiceMetrics(): Record<string, AIServiceMetrics> {
    const metrics: Record<string, AIServiceMetrics> = {};

    for (const [serviceId, service] of this.services.entries()) {
      metrics[serviceId] = service.getMetrics();
    }

    return metrics;
  }

  listServices(): string[] {
    return Array.from(this.services.keys());
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    logger.info('🛑 [AIServiceManager] Shutting down AI services...');

    // Give services a chance to clean up
    for (const [serviceId, service] of this.services.entries()) {
      try {
        if (typeof (service as any).shutdown === 'function') {
          await (service as any).shutdown();
        }
        logger.info(`✅ [AIServiceManager] Service '${serviceId}' shutdown complete`);
      } catch (error) {
        logger.error(`❌ [AIServiceManager] Error shutting down service '${serviceId}':`, error);
      }
    }

    this.services.clear();
    this.initialized = false;
    this.emit('shutdown');
  }
}

export default AIServiceManager;