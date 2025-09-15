/**
 * Embedding Client - Neural embeddings generation service integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from '../utils/Logger';

export interface EmbeddingRequest {
  texts: string[];
  model?: string;
  normalize?: boolean;
  batch_size?: number;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  dimensions: number;
  processing_time_ms: number;
  tokens_used?: number;
}

export interface EmbeddingConfig {
  host: string;
  port: number;
  timeout: number;
  max_batch_size: number;
  default_model: string;
}

export class EmbeddingClient {
  private baseUrl: string;
  private config: EmbeddingConfig;
  private timeout: number;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      host: config?.host || process.env.EMBEDDING_HOST || '10.219.8.210',
      port: config?.port || parseInt(process.env.EMBEDDING_PORT || '8010'),
      timeout: config?.timeout || parseInt(process.env.EMBEDDING_TIMEOUT || '30000'),
      max_batch_size: config?.max_batch_size || parseInt(process.env.EMBEDDING_MAX_BATCH || '100'),
      default_model: config?.default_model || process.env.EMBEDDING_MODEL || 'sentence-transformers'
    };

    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
    this.timeout = this.config.timeout;

    logger.info(`🔢 [EmbeddingClient] Initialized with URL: ${this.baseUrl}`);
  }

  async generateEmbeddings(
    texts: string[],
    options: {
      model?: string;
      normalize?: boolean;
      batch_size?: number;
    } = {}
  ): Promise<EmbeddingResponse> {
    try {
      if (texts.length === 0) {
        throw new Error('At least one text is required for embedding generation');
      }

      if (texts.length > this.config.max_batch_size) {
        throw new Error(`Batch size exceeds maximum allowed: ${this.config.max_batch_size}`);
      }

      const requestBody: EmbeddingRequest = {
        texts,
        model: options.model || this.config.default_model,
        normalize: options.normalize !== false,
        batch_size: options.batch_size || Math.min(texts.length, this.config.max_batch_size)
      };

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding generation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result: EmbeddingResponse = await response.json();

      logger.debug(` [EmbeddingClient] Generated ${result.embeddings.length} embeddings with ${result.dimensions} dimensions`);

      return result;

    } catch (error) {
      logger.error(' [EmbeddingClient] Embedding generation failed:', error);
      throw error;
    }
  }

  async generateSingleEmbedding(
    text: string,
    options: {
      model?: string;
      normalize?: boolean;
    } = {}
  ): Promise<number[]> {
    const response = await this.generateEmbeddings([text], options);
    return response.embeddings[0];
  }

  async generateBatchEmbeddings(
    texts: string[],
    options: {
      model?: string;
      normalize?: boolean;
      batch_size?: number;
    } = {}
  ): Promise<EmbeddingResponse[]> {
    const batchSize = options.batch_size || this.config.max_batch_size;
    const batches: EmbeddingResponse[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResponse = await this.generateEmbeddings(batch, options);
      batches.push(batchResponse);
    }

    return batches;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const health = await response.json();
        logger.debug(` [EmbeddingClient] Health check passed - Status: ${health.status || 'OK'}`);
        return true;
      }

      logger.warn(` [EmbeddingClient] Health check returned status: ${response.status}`);
      return false;

    } catch (error) {
      logger.error(' [EmbeddingClient] Health check failed:', error);
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Failed to get models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.models || [this.config.default_model];

    } catch (error) {
      logger.error(' [EmbeddingClient] Failed to get models:', error);
      return [this.config.default_model];
    }
  }

  async getModelInfo(modelName?: string): Promise<any> {
    try {
      const model = modelName || this.config.default_model;
      const response = await fetch(`${this.baseUrl}/models/${model}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.status} ${response.statusText}`);
      }

      const info = await response.json();
      logger.debug(` [EmbeddingClient] Model info for ${model}:`, info);
      return info;

    } catch (error) {
      logger.error(` [EmbeddingClient] Failed to get model info for ${modelName}:`, error);
      return null;
    }
  }

  async calculateSimilarity(
    embedding1: number[],
    embedding2: number[]
  ): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/similarity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          embedding1,
          embedding2
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Similarity calculation failed: ${response.status}`);
      }

      const result = await response.json();
      return result.similarity || this.cosineSimilarity(embedding1, embedding2);

    } catch (error) {
      logger.warn(' [EmbeddingClient] Using local similarity calculation due to API error:', error);
      return this.cosineSimilarity(embedding1, embedding2);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embedding dimensions must match for similarity calculation');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async getServiceInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/info`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const info = await response.json();
        logger.debug('📋 [EmbeddingClient] Service info:', info);
        return info;
      }

      return null;

    } catch (error) {
      logger.error(' [EmbeddingClient] Failed to get service info:', error);
      return null;
    }
  }

  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      const healthy = await this.healthCheck();
      const latency = Date.now() - startTime;

      if (healthy) {
        return {
          success: true,
          latency
        };
      } else {
        return {
          success: false,
          error: 'Health check failed'
        };
      }

    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async warmup(): Promise<boolean> {
    try {
      logger.info('🔥 [EmbeddingClient] Warming up embedding service...');

      const testText = 'This is a test embedding to warm up the service.';
      await this.generateSingleEmbedding(testText);

      logger.info(' [EmbeddingClient] Service warmup completed');
      return true;

    } catch (error) {
      logger.error(' [EmbeddingClient] Service warmup failed:', error);
      return false;
    }
  }
}

export default EmbeddingClient;