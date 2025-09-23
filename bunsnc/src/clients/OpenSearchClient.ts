/**
 * OpenSearch Client - Neural Search Integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from "../utils/Logger";
import { SearchOptions, SearchResult, SearchContext } from "../types/AI";

export interface OpenSearchConfig {
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
  ssl?: boolean;
  timeout?: number;
}

export interface NeuralSearchQuery {
  query_string: string;
  model_id: string;
  k?: number;
  size?: number;
  search_type: "neural" | "sparse" | "hybrid" | "reranked";
  filters?: Record<string, any>;
}

export interface OpenSearchResponse {
  hits: {
    total: { value: number };
    hits: Array<{
      _id: string;
      _score: number;
      _source: any;
      _explanation?: any;
    }>;
  };
  took: number;
  timed_out: boolean;
}

export class OpenSearchClient {
  private baseUrl: string;
  private config: OpenSearchConfig;
  private timeout: number;

  constructor(config: OpenSearchConfig) {
    if (!config) {
      throw new Error(
        "[OpenSearchClient] Configuration is required but was undefined. Please ensure OPENSEARCH_HOST and OPENSEARCH_PORT environment variables are set.",
      );
    }

    if (!config.host || !config.port) {
      throw new Error(
        `[OpenSearchClient] Invalid configuration: host=${config.host}, port=${config.port}. Please check OPENSEARCH_HOST and OPENSEARCH_PORT environment variables.`,
      );
    }

    this.config = config;
    this.baseUrl = `${config.ssl ? "https" : "http"}://${config.host}:${config.port}`;
    this.timeout = config.timeout || 30000;
    logger.info(` [OpenSearchClient] Initialized with URL: ${this.baseUrl}`);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.auth) {
      const credentials = btoa(
        `${this.config.auth.username}:${this.config.auth.password}`,
      );
      headers["Authorization"] = `Basic ${credentials}`;
    }

    return headers;
  }

  async neuralSearch(
    indexName: string,
    query: NeuralSearchQuery,
    context?: SearchContext,
  ): Promise<SearchResult[]> {
    try {
      const searchBody = this.buildNeuralQuery(query, context);

      const response = await fetch(`${this.baseUrl}/${indexName}/_search`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(searchBody),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(
          `Neural search failed: ${response.status} ${response.statusText}`,
        );
      }

      const data: OpenSearchResponse = await response.json();
      return this.transformSearchResults(data);
    } catch (error: unknown) {
      logger.error(" [OpenSearchClient] Neural search failed:", error);
      throw error;
    }
  }

  async hybridSearch(
    indexName: string,
    query: string,
    options: SearchOptions = {},
    context?: SearchContext,
  ): Promise<SearchResult[]> {
    try {
      const searchBody = {
        size: options.size || 10,
        query: {
          hybrid: {
            queries: [
              {
                neural: {
                  content_embedding: {
                    query_text: query,
                    model_id: "msmarco-distilbert-base-tas-b",
                    k: 500,
                  },
                },
              },
              {
                bool: {
                  should: [
                    {
                      match: {
                        content: {
                          query: query,
                          boost: 1.2,
                        },
                      },
                    },
                    {
                      match: {
                        title: {
                          query: query,
                          boost: 2.0,
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        ...this.buildContextFilters(context),
        ...this.buildReranking(query, options),
      };

      const response = await fetch(`${this.baseUrl}/${indexName}/_search`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(searchBody),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(
          `Hybrid search failed: ${response.status} ${response.statusText}`,
        );
      }

      const data: OpenSearchResponse = await response.json();
      return this.transformSearchResults(data);
    } catch (error: unknown) {
      logger.error(" [OpenSearchClient] Hybrid search failed:", error);
      throw error;
    }
  }

  async rerankSearch(
    indexName: string,
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    try {
      const searchBody = {
        size: options.size || 10,
        query: {
          match_all: {},
        },
        ext: {
          rerank: {
            query_context: {
              query_text: query,
            },
            rerank_context: {
              document_fields: ["content", "title"],
            },
            ml_opensearch: {
              model_id: "cross-encoder-ms-marco-MiniLM-L-6-v2",
            },
            top_n: options.size || 10,
          },
        },
      };

      const response = await fetch(`${this.baseUrl}/${indexName}/_search`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(searchBody),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(
          `Rerank search failed: ${response.status} ${response.statusText}`,
        );
      }

      const data: OpenSearchResponse = await response.json();
      return this.transformSearchResults(data);
    } catch (error: unknown) {
      logger.error(" [OpenSearchClient] Rerank search failed:", error);
      throw error;
    }
  }

  private buildNeuralQuery(
    query: NeuralSearchQuery,
    context?: SearchContext,
  ): any {
    const baseQuery = {
      size: query.size || 10,
      query: {
        neural: {
          content_embedding: {
            query_text: query.query_string,
            model_id: query.model_id,
            k: query.k || 500,
          },
        },
      },
    };

    if (context) {
      return {
        ...baseQuery,
        ...this.buildContextFilters(context),
      };
    }

    return baseQuery;
  }

  private buildContextFilters(context?: SearchContext): any {
    if (!context) return {};

    const filters: any[] = [];

    if (context.support_group) {
      filters.push({
        term: { support_group: context.support_group },
      });
    }

    if (context.technology_stack && context.technology_stack.length > 0) {
      filters.push({
        terms: { technology: context.technology_stack },
      });
    }

    if (context.business_unit) {
      filters.push({
        term: { business_unit: context.business_unit },
      });
    }

    if (context.priority) {
      filters.push({
        term: { priority: context.priority },
      });
    }

    if (filters.length === 0) return {};

    return {
      post_filter: {
        bool: {
          must: filters,
        },
      },
    };
  }

  private buildReranking(query: string, options: SearchOptions): any {
    if (options.search_type !== "reranked") return {};

    return {
      ext: {
        rerank: {
          query_context: {
            query_text: query,
          },
          rerank_context: {
            document_fields: ["content", "title"],
          },
          ml_opensearch: {
            model_id: "cross-encoder-ms-marco-MiniLM-L-6-v2",
          },
          top_n: options.size || 10,
        },
      },
    };
  }

  private transformSearchResults(data: OpenSearchResponse): SearchResult[] {
    return data.hits.hits.map((hit) => ({
      id: hit._id,
      score: hit._score,
      title: hit._source.title || "Untitled",
      content: hit._source.content || "",
      file_path: hit._source.file_path || "",
      technology: hit._source.technology || [],
      business_unit: hit._source.business_unit || [],
      document_type: hit._source.document_type || "unknown",
      created_date: hit._source.created_date || "",
      modified_date: hit._source.modified_date || "",
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/_cluster/health`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const health = await response.json();
        logger.debug(
          ` [OpenSearchClient] Health check passed - Status: ${health.status}`,
        );
        return health.status !== "red";
      }

      return false;
    } catch (error: unknown) {
      logger.error(" [OpenSearchClient] Health check failed:", error);
      return false;
    }
  }

  async getIndices(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/_cat/indices?format=json`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`Failed to get indices: ${response.status}`);
      }

      const indices = await response.json();
      return indices.map((idx: any) => idx.index);
    } catch (error: unknown) {
      logger.error(" [OpenSearchClient] Failed to get indices:", error);
      throw error;
    }
  }

  getConfig(): OpenSearchConfig {
    return { ...this.config };
  }
}

export default OpenSearchClient;
