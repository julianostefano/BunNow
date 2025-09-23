/**
 * Rerank Client - Neural reranking service integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from "../utils/Logger";

export interface RerankRequest {
  query: string;
  documents: string[] | RerankDocument[];
  model?: string;
  top_k?: number;
  return_documents?: boolean;
}

export interface RerankDocument {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}

export interface RerankResult {
  index: number;
  document: RerankDocument;
  relevance_score: number;
}

export interface RerankResponse {
  results: RerankResult[];
  model: string;
  query: string;
  processing_time_ms: number;
  total_documents: number;
  returned_documents: number;
}

export interface RerankConfig {
  host: string;
  port: number;
  timeout: number;
  max_documents: number;
  default_model: string;
  default_top_k: number;
}

export class RerankClient {
  private baseUrl: string;
  private config: RerankConfig;
  private timeout: number;

  constructor(config?: Partial<RerankConfig>) {
    this.config = {
      host: config?.host || process.env.RERANK_HOST || "10.219.8.210",
      port: config?.port || parseInt(process.env.RERANK_PORT || "8011"),
      timeout:
        config?.timeout || parseInt(process.env.RERANK_TIMEOUT || "30000"),
      max_documents:
        config?.max_documents ||
        parseInt(process.env.RERANK_MAX_DOCS || "1000"),
      default_model:
        config?.default_model ||
        process.env.RERANK_MODEL ||
        "cross-encoder/ms-marco-MiniLM-L-6-v2",
      default_top_k:
        config?.default_top_k || parseInt(process.env.RERANK_TOP_K || "10"),
    };

    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
    this.timeout = this.config.timeout;

    logger.info(` [RerankClient] Initialized with URL: ${this.baseUrl}`);
  }

  async rerank(
    query: string,
    documents: string[] | RerankDocument[],
    options: {
      model?: string;
      top_k?: number;
      return_documents?: boolean;
    } = {},
  ): Promise<RerankResponse> {
    try {
      if (!query || query.trim().length === 0) {
        throw new Error("Query cannot be empty");
      }

      if (!documents || documents.length === 0) {
        throw new Error("At least one document is required for reranking");
      }

      if (documents.length > this.config.max_documents) {
        throw new Error(
          `Number of documents exceeds maximum allowed: ${this.config.max_documents}`,
        );
      }

      const normalizedDocuments = this.normalizeDocuments(documents);

      const requestBody: RerankRequest = {
        query: query.trim(),
        documents: normalizedDocuments,
        model: options.model || this.config.default_model,
        top_k: options.top_k || this.config.default_top_k,
        return_documents: options.return_documents !== false,
      };

      const response = await fetch(`${this.baseUrl}/rerank`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Reranking failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const result: RerankResponse = await response.json();

      logger.debug(
        ` [RerankClient] Reranked ${result.total_documents} documents, returned top ${result.returned_documents}`,
      );

      return result;
    } catch (error: unknown) {
      logger.error(" [RerankClient] Reranking failed:", error);
      throw error;
    }
  }

  async rerankWithScores(
    query: string,
    documents: string[] | RerankDocument[],
    options: {
      model?: string;
      top_k?: number;
    } = {},
  ): Promise<Array<{ document: string; score: number; index: number }>> {
    const response = await this.rerank(query, documents, {
      ...options,
      return_documents: true,
    });

    return response.results.map((result) => ({
      document: result.document.text,
      score: result.relevance_score,
      index: result.index,
    }));
  }

  async rerankTopK(
    query: string,
    documents: string[],
    k: number,
    options: {
      model?: string;
    } = {},
  ): Promise<string[]> {
    const response = await this.rerank(query, documents, {
      ...options,
      top_k: k,
      return_documents: true,
    });

    return response.results.map((result) => result.document.text);
  }

  async batchRerank(
    queries: string[],
    documents: string[] | RerankDocument[],
    options: {
      model?: string;
      top_k?: number;
      return_documents?: boolean;
    } = {},
  ): Promise<RerankResponse[]> {
    const results: RerankResponse[] = [];

    for (const query of queries) {
      try {
        const result = await this.rerank(query, documents, options);
        results.push(result);
      } catch (error: unknown) {
        logger.error(
          ` [RerankClient] Batch reranking failed for query: "${query}"`,
          error,
        );
        results.push({
          results: [],
          model: options.model || this.config.default_model,
          query,
          processing_time_ms: 0,
          total_documents: documents.length,
          returned_documents: 0,
        });
      }
    }

    return results;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const health = await response.json();
        logger.debug(
          ` [RerankClient] Health check passed - Status: ${health.status || "OK"}`,
        );
        return true;
      }

      logger.warn(
        ` [RerankClient] Health check returned status: ${response.status}`,
      );
      return false;
    } catch (error: unknown) {
      logger.error(" [RerankClient] Health check failed:", error);
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get models: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      return data.models || [this.config.default_model];
    } catch (error: unknown) {
      logger.error(" [RerankClient] Failed to get models:", error);
      return [this.config.default_model];
    }
  }

  async getModelInfo(modelName?: string): Promise<any> {
    try {
      const model = modelName || this.config.default_model;
      const response = await fetch(
        `${this.baseUrl}/models/${encodeURIComponent(model)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(this.timeout),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to get model info: ${response.status} ${response.statusText}`,
        );
      }

      const info = await response.json();
      logger.debug(` [RerankClient] Model info for ${model}:`, info);
      return info;
    } catch (error: unknown) {
      logger.error(
        ` [RerankClient] Failed to get model info for ${modelName}:`,
        error,
      );
      return null;
    }
  }

  async getServiceInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/info`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const info = await response.json();
        logger.debug("📋 [RerankClient] Service info:", info);
        return info;
      }

      return null;
    } catch (error: unknown) {
      logger.error(" [RerankClient] Failed to get service info:", error);
      return null;
    }
  }

  private normalizeDocuments(
    documents: string[] | RerankDocument[],
  ): RerankDocument[] {
    return documents.map((doc, index) => {
      if (typeof doc === "string") {
        return {
          id: `doc_${index}`,
          text: doc,
          metadata: {},
        };
      } else {
        return {
          id: doc.id || `doc_${index}`,
          text: doc.text,
          metadata: doc.metadata || {},
        };
      }
    });
  }

  getConfig(): RerankConfig {
    return { ...this.config };
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async testConnection(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const healthy = await this.healthCheck();
      const latency = Date.now() - startTime;

      if (healthy) {
        return {
          success: true,
          latency,
        };
      } else {
        return {
          success: false,
          error: "Health check failed",
        };
      }
    } catch (error: unknown) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async warmup(): Promise<boolean> {
    try {
      logger.info("🔥 [RerankClient] Warming up reranking service...");

      const testQuery = "database connection error";
      const testDocuments = [
        "How to troubleshoot database connection issues",
        "Network configuration for applications",
        "Database connection pooling best practices",
        "Application server configuration guide",
      ];

      await this.rerank(testQuery, testDocuments, { top_k: 2 });

      logger.info(" [RerankClient] Service warmup completed");
      return true;
    } catch (error: unknown) {
      logger.error(" [RerankClient] Service warmup failed:", error);
      return false;
    }
  }

  async benchmark(
    queries: string[],
    documents: string[],
    options: {
      model?: string;
      top_k?: number;
      iterations?: number;
    } = {},
  ): Promise<{
    avg_latency_ms: number;
    min_latency_ms: number;
    max_latency_ms: number;
    success_rate: number;
    total_requests: number;
  }> {
    const iterations = options.iterations || 10;
    const latencies: number[] = [];
    let successCount = 0;

    logger.info(
      `🏁 [RerankClient] Starting benchmark with ${iterations} iterations...`,
    );

    for (let i = 0; i < iterations; i++) {
      const query = queries[i % queries.length];
      const startTime = Date.now();

      try {
        await this.rerank(query, documents, {
          model: options.model,
          top_k: options.top_k || 5,
        });

        const latency = Date.now() - startTime;
        latencies.push(latency);
        successCount++;
      } catch (error: unknown) {
        logger.warn(
          ` [RerankClient] Benchmark iteration ${i + 1} failed:`,
          error,
        );
      }
    }

    const avgLatency =
      latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length || 0;
    const minLatency = Math.min(...latencies) || 0;
    const maxLatency = Math.max(...latencies) || 0;
    const successRate = successCount / iterations;

    const results = {
      avg_latency_ms: Math.round(avgLatency),
      min_latency_ms: minLatency,
      max_latency_ms: maxLatency,
      success_rate: successRate,
      total_requests: iterations,
    };

    logger.info(" [RerankClient] Benchmark results:", results);
    return results;
  }
}

export default RerankClient;
