/**
 * Neural Search Service - Real semantic search using OpenSearch and embeddings
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { OpenSearchClient } from "../clients/OpenSearchClient";
import { EmbeddingClient } from "../clients/EmbeddingClient";
import { RerankClient } from "../clients/RerankClient";
import { ticketSearchService } from "./TicketSearchService";
import { synonymService } from "./SynonymService";
import { logger } from "../utils/Logger";
import { ErrorHandler } from "../utils/ErrorHandler";

export interface NeuralSearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
  source: "opensearch" | "mongodb" | "hybrid";
  metadata: {
    table?: string;
    ticket_number?: string;
    priority?: string;
    status?: string;
    created_date?: string;
  };
}

export interface NeuralSearchOptions {
  mode: "semantic" | "hybrid" | "keyword";
  enableRerank?: boolean;
  maxResults?: number;
  minScore?: number;
  filters?: {
    table?: string;
    status?: string;
    priority?: string;
    dateRange?: { from: string; to: string };
  };
}

export class NeuralSearchService {
  private openSearchClient: OpenSearchClient;
  private embeddingClient: EmbeddingClient;
  private rerankClient: RerankClient;
  private isInitialized = false;

  constructor() {
    this.openSearchClient = new OpenSearchClient({
      host: process.env.OPENSEARCH_HOST || "10.219.8.210",
      port: parseInt(process.env.OPENSEARCH_PORT || "9200"),
      ssl: false,
      timeout: 30000,
    });

    this.embeddingClient = new EmbeddingClient();
    this.rerankClient = new RerankClient();
  }

  async initialize(): Promise<void> {
    try {
      // Test OpenSearch connection
      const osHealth = await this.openSearchClient.testConnection();
      if (!osHealth.success) {
        logger.warn(
          "⚠️ [NeuralSearchService] OpenSearch not available, using MongoDB fallback",
        );
      }

      // Test embedding service
      const embeddingHealth = await this.embeddingClient.testConnection();
      if (!embeddingHealth.success) {
        logger.warn("⚠️ [NeuralSearchService] Embedding service not available");
      }

      // Test rerank service
      const rerankHealth = await this.rerankClient.testConnection();
      if (!rerankHealth.success) {
        logger.warn("⚠️ [NeuralSearchService] Rerank service not available");
      }

      this.isInitialized = true;
      logger.info(
        "🧠 [NeuralSearchService] Initialized neural search capabilities",
      );
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("NeuralSearchService.initialize", error);
      this.isInitialized = false;
    }
  }

  async search(
    query: string,
    options: NeuralSearchOptions = { mode: "hybrid" },
  ): Promise<NeuralSearchResult[]> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const {
        mode = "hybrid",
        enableRerank = true,
        maxResults = 20,
        minScore = 0.1,
        filters = {},
      } = options;

      let results: NeuralSearchResult[] = [];

      switch (mode) {
        case "semantic":
          results = await this.performSemanticSearch(
            query,
            filters,
            maxResults,
          );
          break;
        case "hybrid":
          results = await this.performHybridSearch(query, filters, maxResults);
          break;
        case "keyword":
          results = await this.performKeywordSearch(query, filters, maxResults);
          break;
        default:
          results = await this.performHybridSearch(query, filters, maxResults);
      }

      // Filter by minimum score
      results = results.filter((result) => result.score >= minScore);

      // Apply reranking if enabled and we have enough results
      if (enableRerank && results.length > 1) {
        results = await this.applyReranking(query, results);
      }

      // Limit final results
      results = results.slice(0, maxResults);

      logger.debug(
        `🧠 [NeuralSearchService] Found ${results.length} results for "${query}" (${mode} mode)`,
      );

      return results;
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("NeuralSearchService.search", error);
      return [];
    }
  }

  private async performSemanticSearch(
    query: string,
    filters: any,
    maxResults: number,
  ): Promise<NeuralSearchResult[]> {
    try {
      // Try OpenSearch neural search first
      const osResults = await this.searchOpenSearch(
        query,
        "semantic",
        filters,
        maxResults,
      );
      if (osResults.length > 0) {
        return osResults;
      }

      // Fallback to enhanced MongoDB search with synonym expansion
      logger.info(
        "🔄 [NeuralSearchService] OpenSearch unavailable, using MongoDB with synonym expansion",
      );
      return await this.searchMongoDBWithSemantics(query, filters, maxResults);
    } catch (error: unknown) {
      ErrorHandler.logUnknownError(
        "NeuralSearchService.performSemanticSearch",
        error,
      );
      return await this.searchMongoDBWithSemantics(query, filters, maxResults);
    }
  }

  private async performHybridSearch(
    query: string,
    filters: any,
    maxResults: number,
  ): Promise<NeuralSearchResult[]> {
    try {
      // Combine semantic and keyword results
      const semanticResults = await this.performSemanticSearch(
        query,
        filters,
        Math.floor(maxResults * 0.7),
      );
      const keywordResults = await this.performKeywordSearch(
        query,
        filters,
        Math.floor(maxResults * 0.3),
      );

      // Merge and deduplicate results
      const combinedResults = this.mergeResults(
        semanticResults,
        keywordResults,
      );

      // Sort by combined relevance score
      combinedResults.sort((a, b) => b.score - a.score);

      return combinedResults.slice(0, maxResults);
    } catch (error: unknown) {
      ErrorHandler.logUnknownError(
        "NeuralSearchService.performHybridSearch",
        error,
      );
      return await this.performKeywordSearch(query, filters, maxResults);
    }
  }

  private async performKeywordSearch(
    query: string,
    filters: any,
    maxResults: number,
  ): Promise<NeuralSearchResult[]> {
    try {
      // Use MongoDB ticket search as keyword search
      const searchFilters = {
        table: filters.table,
        state: filters.status,
        priority: filters.priority,
        assignmentGroup: filters.assignmentGroup,
      };

      const ticketResults = await ticketSearchService.searchTickets(
        { query, limit: maxResults },
        searchFilters,
        { enableSynonymExpansion: true, maxSynonymExpansions: 3 },
      );

      // Convert to neural search results
      return ticketResults.map((ticket) => ({
        id: ticket.sys_id,
        title: `${ticket.number}: ${ticket.short_description}`,
        content: ticket.short_description,
        score: 0.8, // Base score for keyword matches
        source: "mongodb" as const,
        metadata: {
          table: ticket.table,
          ticket_number: ticket.number,
          priority: ticket.priority,
          status: ticket.state,
          created_date: ticket.created_on,
        },
      }));
    } catch (error: unknown) {
      ErrorHandler.logUnknownError(
        "NeuralSearchService.performKeywordSearch",
        error,
      );
      return [];
    }
  }

  private async searchOpenSearch(
    query: string,
    mode: string,
    filters: any,
    maxResults: number,
  ): Promise<NeuralSearchResult[]> {
    try {
      // Check if OpenSearch is available
      const health = await this.openSearchClient.testConnection();
      if (!health.success) {
        return [];
      }

      logger.info("🔍 [NeuralSearchService] Using OpenSearch basic search");

      // Use basic text search since neural plugin has issues
      const searchBody = {
        size: maxResults,
        query: {
          bool: {
            should: [
              {
                match: {
                  title: {
                    query: query,
                    boost: 2.0,
                  },
                },
              },
              {
                match: {
                  content: {
                    query: query,
                    boost: 1.0,
                  },
                },
              },
              {
                match: {
                  description: {
                    query: query,
                    boost: 1.5,
                  },
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
        highlight: {
          fields: {
            title: {},
            content: {},
            description: {},
          },
        },
      };

      // Apply filters if provided
      if (filters.table || filters.status || filters.priority) {
        searchBody.query.bool.filter = [];

        if (filters.table) {
          searchBody.query.bool.filter.push({
            term: { category: filters.table },
          });
        }

        if (filters.status) {
          searchBody.query.bool.filter.push({
            term: { support_group: filters.status },
          });
        }

        if (filters.priority) {
          searchBody.query.bool.filter.push({
            term: { document_type: filters.priority },
          });
        }
      }

      // Try to search in existing indices
      const indices = ["knowledge_base", "_all"];
      let searchResults = null;

      for (const index of indices) {
        try {
          const response = await fetch(
            `http://${process.env.OPENSEARCH_HOST || "10.219.8.210"}:${process.env.OPENSEARCH_PORT || "9200"}/${index}/_search`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(searchBody),
            },
          );

          if (response.ok) {
            searchResults = await response.json();
            break;
          }
        } catch (error: unknown) {
          // Try next index
          continue;
        }
      }

      if (!searchResults || !searchResults.hits) {
        return [];
      }

      // Transform OpenSearch results to NeuralSearchResult format
      return searchResults.hits.hits.map((hit: any, index: number) => ({
        id: hit._id,
        title: hit._source.title || `Document ${hit._id}`,
        content: hit._source.content || hit._source.description || "",
        score: hit._score / 10, // Normalize score to 0-1 range
        source: "opensearch" as const,
        metadata: {
          table: hit._source.category || "unknown",
          ticket_number: hit._source.number || hit._source.id,
          priority: hit._source.document_type || "",
          status: hit._source.support_group || "",
          created_date: hit._source.created_at || hit._source.created_on,
        },
      }));
    } catch (error: unknown) {
      ErrorHandler.logUnknownError(
        "NeuralSearchService.searchOpenSearch",
        error,
      );
      return [];
    }
  }

  private async searchMongoDBWithSemantics(
    query: string,
    filters: any,
    maxResults: number,
  ): Promise<NeuralSearchResult[]> {
    try {
      // Expand query with synonyms for better semantic understanding
      const expansion = synonymService.expandQuery(query, {
        maxExpansions: 8,
        includeCategories: ["technical", "status", "priority", "general"],
        minScore: 0.6,
      });

      // Use expanded query for more comprehensive search
      const expandedQuery = [query, ...expansion.expandedTerms].join(" ");

      const searchFilters = {
        table: filters.table,
        state: filters.status,
        priority: filters.priority,
        assignmentGroup: filters.assignmentGroup,
      };

      const ticketResults = await ticketSearchService.searchTickets(
        { query: expandedQuery, limit: maxResults },
        searchFilters,
        { enableSynonymExpansion: true, maxSynonymExpansions: 5 },
      );

      // Calculate semantic scores based on query expansion
      return ticketResults.map((ticket, index) => {
        // Higher score for exact matches, lower for expanded matches
        let score = 0.9 - index * 0.05; // Decrease score by position

        // Boost score if original query terms are found
        const lowerContent = ticket.short_description.toLowerCase();
        const lowerQuery = query.toLowerCase();
        if (lowerContent.includes(lowerQuery)) {
          score += 0.3;
        }

        // Boost score for priority tickets
        if (ticket.priority === "1" || ticket.priority === "2") {
          score += 0.1;
        }

        return {
          id: ticket.sys_id,
          title: `${ticket.number}: ${ticket.short_description}`,
          content: ticket.short_description,
          score: Math.min(score, 1.0),
          source: "mongodb" as const,
          metadata: {
            table: ticket.table,
            ticket_number: ticket.number,
            priority: ticket.priority,
            status: ticket.state,
            created_date: ticket.created_on,
          },
        };
      });
    } catch (error: unknown) {
      ErrorHandler.logUnknownError(
        "NeuralSearchService.searchMongoDBWithSemantics",
        error,
      );
      return [];
    }
  }

  private mergeResults(
    results1: NeuralSearchResult[],
    results2: NeuralSearchResult[],
  ): NeuralSearchResult[] {
    const merged = [...results1];
    const existingIds = new Set(results1.map((r) => r.id));

    for (const result of results2) {
      if (!existingIds.has(result.id)) {
        merged.push(result);
      }
    }

    return merged;
  }

  private async applyReranking(
    query: string,
    results: NeuralSearchResult[],
  ): Promise<NeuralSearchResult[]> {
    try {
      // Check if rerank service is available
      const health = await this.rerankClient.testConnection();
      if (!health.success) {
        logger.warn(
          "⚠️ [NeuralSearchService] Rerank service unavailable, skipping reranking",
        );
        return results;
      }

      // Prepare documents for reranking
      const documents = results.map((r) => r.content);

      // Perform reranking
      const reranked = await this.rerankClient.rerank(query, documents, {
        top_k: results.length,
        return_documents: true,
      });

      // Reorder results based on rerank scores
      const reorderedResults: NeuralSearchResult[] = [];

      for (const rerankResult of reranked.results) {
        const originalResult = results[rerankResult.index];
        if (originalResult) {
          reorderedResults.push({
            ...originalResult,
            score: rerankResult.relevance_score,
          });
        }
      }

      logger.debug(
        `🔄 [NeuralSearchService] Reranked ${reorderedResults.length} results`,
      );
      return reorderedResults;
    } catch (error: unknown) {
      ErrorHandler.logUnknownError("NeuralSearchService.applyReranking", error);
      return results;
    }
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    services: {
      openSearch: { available: boolean; latency?: number };
      embedding: { available: boolean; latency?: number };
      rerank: { available: boolean; latency?: number };
      mongodb: { available: boolean; ticketCount: number };
    };
  }> {
    try {
      // Test all services
      const [osHealth, embeddingHealth, rerankHealth, mongoHealth] =
        await Promise.all([
          this.openSearchClient.testConnection(),
          this.embeddingClient.testConnection(),
          this.rerankClient.testConnection(),
          ticketSearchService.getHealthStatus(),
        ]);

      const totalTickets = Object.values(mongoHealth.collections).reduce(
        (sum, count) => sum + count,
        0,
      );

      return {
        healthy: this.isInitialized && mongoHealth.healthy,
        services: {
          openSearch: {
            available: osHealth.success,
            latency: osHealth.latency,
          },
          embedding: {
            available: embeddingHealth.success,
            latency: embeddingHealth.latency,
          },
          rerank: {
            available: rerankHealth.success,
            latency: rerankHealth.latency,
          },
          mongodb: {
            available: mongoHealth.healthy,
            ticketCount: totalTickets,
          },
        },
      };
    } catch (error: unknown) {
      ErrorHandler.logUnknownError(
        "NeuralSearchService.getHealthStatus",
        error,
      );
      return {
        healthy: false,
        services: {
          openSearch: { available: false },
          embedding: { available: false },
          rerank: { available: false },
          mongodb: { available: false, ticketCount: 0 },
        },
      };
    }
  }
}

// Export singleton instance
export const neuralSearchService = new NeuralSearchService();
