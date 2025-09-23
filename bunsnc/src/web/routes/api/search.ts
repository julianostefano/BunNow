/**
 * Intelligent Search API Routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { logger } from "../../../utils/Logger";
import { OpenSearchClient } from "../../../clients/OpenSearchClient";
import { EmbeddingClient } from "../../../clients/EmbeddingClient";
import { RerankClient } from "../../../clients/RerankClient";
import { ServiceNowAuthClient } from "../../../services/ServiceNowAuthClient";

// Search request schema
const IntelligentSearchRequestSchema = t.Object({
  query: t.String({ minLength: 2 }),
  search_type: t.Optional(
    t.Union([
      t.Literal("semantic"),
      t.Literal("hybrid"),
      t.Literal("neural_sparse"),
      t.Literal("bm25"),
      t.Literal("all"),
    ]),
  ),
  targets: t.Optional(
    t.Array(
      t.Union([
        t.Literal("documents"),
        t.Literal("tickets"),
        t.Literal("knowledge_base"),
        t.Literal("all"),
      ]),
    ),
  ),
  max_results: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  enable_reranking: t.Optional(t.Boolean()),
  filters: t.Optional(
    t.Object({
      date_range: t.Optional(
        t.Object({
          from: t.String(),
          to: t.String(),
        }),
      ),
      categories: t.Optional(t.Array(t.String())),
      priority: t.Optional(t.Array(t.String())),
      assignment_groups: t.Optional(t.Array(t.String())),
      document_types: t.Optional(t.Array(t.String())),
      technology_stack: t.Optional(t.Array(t.String())),
    }),
  ),
  context: t.Optional(
    t.Object({
      user_id: t.Optional(t.String()),
      ticket_context: t.Optional(t.String()),
      previous_searches: t.Optional(t.Array(t.String())),
    }),
  ),
});

export class IntelligentSearchController {
  private openSearch: OpenSearchClient;
  private embedding: EmbeddingClient;
  private rerank: RerankClient;
  private serviceNow: ServiceNowAuthClient;

  constructor() {
    this.openSearch = new OpenSearchClient({
      host: process.env.OPENSEARCH_HOST || "10.219.8.210",
      port: parseInt(process.env.OPENSEARCH_PORT || "9200"),
      ssl: false,
      timeout: 30000,
    });
    this.embedding = new EmbeddingClient();
    this.rerank = new RerankClient();
    this.serviceNow = new ServiceNowAuthClient();
  }

  async performIntelligentSearch(request: any): Promise<any> {
    const startTime = Date.now();

    try {
      logger.info(
        ` [IntelligentSearch] Query: "${request.query}" | Type: ${request.search_type || "hybrid"}`,
      );

      // 1. Generate query embedding
      const queryEmbedding = await this.embedding.generateEmbeddings([
        request.query,
      ]);
      const embedding = queryEmbedding.data.embeddings[0];

      // 2. Perform searches based on targets
      const targets = request.targets || ["all"];
      const searchPromises: Promise<any>[] = [];

      if (targets.includes("documents") || targets.includes("all")) {
        searchPromises.push(this.searchDocuments(request, embedding));
      }

      if (targets.includes("tickets") || targets.includes("all")) {
        searchPromises.push(this.searchTickets(request, embedding));
      }

      if (targets.includes("knowledge_base") || targets.includes("all")) {
        searchPromises.push(this.searchKnowledgeBase(request, embedding));
      }

      const searchResults = await Promise.all(searchPromises);

      // 3. Combine and deduplicate results
      const combinedResults = this.combineResults(searchResults, request.query);

      // 4. Apply reranking if enabled
      let finalResults = combinedResults;
      if (request.enable_reranking !== false && combinedResults.length > 1) {
        finalResults = await this.applyReranking(
          request.query,
          combinedResults,
          request.max_results || 20,
        );
      } else {
        finalResults = combinedResults.slice(0, request.max_results || 20);
      }

      // 5. Build response
      const response = {
        query: request.query,
        search_strategy: this.getSearchStrategy(request),
        results: finalResults,
        metadata: {
          total_found: combinedResults.length,
          returned: finalResults.length,
          processing_time_ms: Date.now() - startTime,
          reranking_applied:
            request.enable_reranking !== false && combinedResults.length > 1,
          targets_searched: targets,
          embedding_model: queryEmbedding.model,
        },
      };

      logger.info(
        ` [IntelligentSearch] Found ${finalResults.length} results in ${response.metadata.processing_time_ms}ms`,
      );
      return response;
    } catch (error: unknown) {
      logger.error(" [IntelligentSearch] Search failed:", error);
      throw error;
    }
  }

  private async searchDocuments(
    request: any,
    embedding: number[],
  ): Promise<any[]> {
    try {
      const searchType = request.search_type || "hybrid";
      let results: any[] = [];

      switch (searchType) {
        case "semantic":
          results = await this.openSearch.neuralSearch({
            index: "technical_documents",
            query_vector: embedding,
            k: request.max_results || 50,
            filters: this.buildDocumentFilters(request.filters),
          });
          break;

        case "hybrid":
          results = await this.openSearch.hybridSearch({
            index: "technical_documents",
            query_text: request.query,
            query_vector: embedding,
            size: request.max_results || 50,
            filters: this.buildDocumentFilters(request.filters),
            weights: { text: 0.3, semantic: 0.7 },
          });
          break;

        case "neural_sparse":
          results = await this.openSearch.neuralSparseSearch({
            index: "technical_documents",
            query_text: request.query,
            size: request.max_results || 50,
            filters: this.buildDocumentFilters(request.filters),
          });
          break;

        case "bm25":
          results = await this.openSearch.search({
            index: "technical_documents",
            body: {
              query: {
                bool: {
                  must: [{ match: { content: request.query } }],
                  filter: this.buildDocumentFilters(request.filters),
                },
              },
              size: request.max_results || 50,
            },
          });
          break;

        case "all":
          const [semanticRes, hybridRes, sparseRes] = await Promise.all([
            this.openSearch.neuralSearch({
              index: "technical_documents",
              query_vector: embedding,
              k: 20,
              filters: this.buildDocumentFilters(request.filters),
            }),
            this.openSearch.hybridSearch({
              index: "technical_documents",
              query_text: request.query,
              query_vector: embedding,
              size: 20,
              filters: this.buildDocumentFilters(request.filters),
            }),
            this.openSearch.neuralSparseSearch({
              index: "technical_documents",
              query_text: request.query,
              size: 20,
              filters: this.buildDocumentFilters(request.filters),
            }),
          ]);
          results = [...semanticRes, ...hybridRes, ...sparseRes];
          break;
      }

      // Transform results to standard format
      return results.map((result) => ({
        id: result._id || result.sys_id,
        title: result._source?.title || result._source?.filename,
        content: result._source?.content || result._source?.description,
        type: "document",
        source: "technical_documents",
        relevance_score: result._score,
        metadata: {
          filename: result._source?.filename,
          classification: result._source?.classification,
          knowledge: result._source?.knowledge,
          indexed_at: result._source?.indexed_at,
        },
      }));
    } catch (error: unknown) {
      logger.warn(" [IntelligentSearch] Document search failed:", error);
      return [];
    }
  }

  private async searchTickets(
    request: any,
    embedding: number[],
  ): Promise<any[]> {
    try {
      const searchType = request.search_type || "hybrid";
      let results: any[] = [];

      switch (searchType) {
        case "semantic":
          results = await this.openSearch.neuralSearch({
            index: "servicenow_tickets",
            query_vector: embedding,
            k: request.max_results || 50,
            filters: this.buildTicketFilters(request.filters),
          });
          break;

        case "hybrid":
          results = await this.openSearch.hybridSearch({
            index: "servicenow_tickets",
            query_text: request.query,
            query_vector: embedding,
            size: request.max_results || 50,
            filters: this.buildTicketFilters(request.filters),
            weights: { text: 0.4, semantic: 0.6 },
          });
          break;

        default:
          // Fallback to ServiceNow API search if OpenSearch not available
          const serviceNowResults = await this.searchServiceNowTickets(request);
          results = serviceNowResults;
          break;
      }

      // Transform results to standard format
      return results.map((result) => ({
        id: result._id || result.sys_id,
        title: result._source?.short_description || result.short_description,
        content: result._source?.description || result.description,
        type: "ticket",
        source: "servicenow",
        relevance_score: result._score || 1.0,
        metadata: {
          number: result._source?.number || result.number,
          state: result._source?.state || result.state,
          priority: result._source?.priority || result.priority,
          category: result._source?.category || result.category,
          assignment_group:
            result._source?.assignment_group || result.assignment_group,
          created_on: result._source?.sys_created_on || result.sys_created_on,
        },
      }));
    } catch (error: unknown) {
      logger.warn(" [IntelligentSearch] Ticket search failed:", error);
      return [];
    }
  }

  private async searchServiceNowTickets(request: any): Promise<any[]> {
    try {
      // Search across incident, change_request, and sc_task tables
      const tables = ["incident", "change_request", "sc_task"];
      const searchPromises = tables.map((table) =>
        this.serviceNow
          .makeRequest("GET", `/${table}`, {
            sysparm_query: `short_descriptionLIKE${request.query}^ORdescriptionLIKE${request.query}`,
            sysparm_limit: Math.ceil(
              (request.max_results || 20) / tables.length,
            ),
            sysparm_fields:
              "sys_id,number,short_description,description,state,priority,category,assignment_group,sys_created_on",
          })
          .catch(() => ({ result: [] })),
      );

      const results = await Promise.all(searchPromises);
      return results.flatMap((result) => result.result || []);
    } catch (error: unknown) {
      logger.warn(
        " [IntelligentSearch] ServiceNow ticket search failed:",
        error,
      );
      return [];
    }
  }

  private async searchKnowledgeBase(
    request: any,
    embedding: number[],
  ): Promise<any[]> {
    try {
      // Search knowledge articles and FAQs
      const results = await this.openSearch.hybridSearch({
        index: "knowledge_base",
        query_text: request.query,
        query_vector: embedding,
        size: request.max_results || 50,
        weights: { text: 0.5, semantic: 0.5 },
      });

      return results.map((result) => ({
        id: result._id,
        title: result._source?.title,
        content: result._source?.content,
        type: "knowledge",
        source: "knowledge_base",
        relevance_score: result._score,
        metadata: {
          article_type: result._source?.article_type,
          topics: result._source?.topics,
          last_updated: result._source?.last_updated,
          views: result._source?.views,
        },
      }));
    } catch (error: unknown) {
      logger.warn(" [IntelligentSearch] Knowledge base search failed:", error);
      return [];
    }
  }

  private combineResults(searchResults: any[][], query: string): any[] {
    const resultsMap = new Map<string, any>();

    // Combine results from different sources
    searchResults.flat().forEach((result) => {
      const existingResult = resultsMap.get(result.id);
      if (existingResult) {
        // Boost relevance if found in multiple sources
        existingResult.relevance_score = Math.min(
          1.0,
          existingResult.relevance_score * 1.2,
        );
        existingResult.metadata.multi_source = true;
      } else {
        resultsMap.set(result.id, result);
      }
    });

    // Sort by relevance score
    return Array.from(resultsMap.values()).sort(
      (a, b) => b.relevance_score - a.relevance_score,
    );
  }

  private async applyReranking(
    query: string,
    results: any[],
    maxResults: number,
  ): Promise<any[]> {
    try {
      const documents = results.map((result) => ({
        id: result.id,
        text: `${result.title} ${result.content}`.substring(0, 1000),
      }));

      const rerankResponse = await this.rerank.rerank(query, documents, {
        top_k: maxResults,
      });

      // Map reranked results back to original data
      return rerankResponse.results
        .map((rerankResult) => {
          const originalResult = results.find(
            (r) => r.id === rerankResult.document.id,
          );
          if (originalResult) {
            return {
              ...originalResult,
              rerank_score: rerankResult.relevance_score,
              final_score:
                (originalResult.relevance_score +
                  rerankResult.relevance_score) /
                2,
            };
          }
          return null;
        })
        .filter((result) => result !== null);
    } catch (error: unknown) {
      logger.warn(
        " [IntelligentSearch] Reranking failed, returning original results:",
        error,
      );
      return results.slice(0, maxResults);
    }
  }

  private buildDocumentFilters(filters: any): any[] {
    const esFilters: any[] = [];

    if (filters?.document_types?.length > 0) {
      esFilters.push({
        terms: { "classification.document_type": filters.document_types },
      });
    }

    if (filters?.technology_stack?.length > 0) {
      esFilters.push({
        terms: { "classification.technology_stack": filters.technology_stack },
      });
    }

    if (filters?.date_range) {
      esFilters.push({
        range: {
          "metadata.Creation-Date": {
            gte: filters.date_range.from,
            lte: filters.date_range.to,
          },
        },
      });
    }

    return esFilters;
  }

  private buildTicketFilters(filters: any): any[] {
    const esFilters: any[] = [];

    if (filters?.categories?.length > 0) {
      esFilters.push({
        terms: { category: filters.categories },
      });
    }

    if (filters?.priority?.length > 0) {
      esFilters.push({
        terms: { priority: filters.priority },
      });
    }

    if (filters?.assignment_groups?.length > 0) {
      esFilters.push({
        terms: { assignment_group: filters.assignment_groups },
      });
    }

    if (filters?.date_range) {
      esFilters.push({
        range: {
          sys_created_on: {
            gte: filters.date_range.from,
            lte: filters.date_range.to,
          },
        },
      });
    }

    return esFilters;
  }

  private getSearchStrategy(request: any): string {
    const searchType = request.search_type || "hybrid";
    const reranking = request.enable_reranking !== false ? "_reranked" : "";
    const targets = (request.targets || ["all"]).join("_");
    return `${searchType}_${targets}${reranking}`;
  }
}

export const searchRoutes = new Elysia({ prefix: "/api/search" })
  .decorate("intelligentSearch", new IntelligentSearchController())

  .post(
    "/intelligent",
    async ({ body, intelligentSearch, set }) => {
      try {
        const result = await intelligentSearch.performIntelligentSearch(body);

        return {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        logger.error(" [SearchAPI] Intelligent search failed:", error);

        set.status = 500;
        return {
          success: false,
          error: error instanceof Error ? error.message : "Search failed",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: IntelligentSearchRequestSchema,
      detail: {
        summary: "Intelligent multi-source search",
        description:
          "Performs intelligent search across documents, tickets, and knowledge base using semantic, hybrid, or neural sparse search with optional reranking",
        tags: ["Search", "AI"],
      },
    },
  )

  .get(
    "/suggestions",
    async ({ query: { q, limit = 10 }, intelligentSearch }) => {
      try {
        if (!q || q.length < 2) {
          return {
            success: true,
            data: { suggestions: [] },
            timestamp: new Date().toISOString(),
          };
        }

        // Generate search suggestions based on query
        const suggestions = await intelligentSearch.performIntelligentSearch({
          query: q,
          search_type: "semantic",
          targets: ["all"],
          max_results: Math.min(limit, 20),
          enable_reranking: false,
        });

        // Extract unique titles/descriptions as suggestions
        const uniqueSuggestions = new Set<string>();
        suggestions.results.forEach((result: any) => {
          if (result.title && result.title.length < 100) {
            uniqueSuggestions.add(result.title);
          }
          if (result.content && result.content.length < 100) {
            uniqueSuggestions.add(result.content.substring(0, 80) + "...");
          }
        });

        return {
          success: true,
          data: {
            query: q,
            suggestions: Array.from(uniqueSuggestions).slice(0, limit),
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        logger.error(" [SearchAPI] Search suggestions failed:", error);
        return {
          success: false,
          error: "Failed to generate suggestions",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        q: t.String({ minLength: 2 }),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
      }),
      detail: {
        summary: "Get search suggestions",
        description:
          "Returns intelligent search suggestions based on partial query",
        tags: ["Search"],
      },
    },
  )

  .get(
    "/filters",
    async () => {
      try {
        // Return available filter options
        const filterOptions = {
          document_types: [
            "Documentation",
            "SQL Script",
            "Code Documentation",
            "Process Guide",
            "Troubleshooting",
            "Technical Document",
          ],
          technology_stack: [
            "Oracle",
            "PostgreSQL",
            "AWS",
            "Java",
            "Python",
            "JavaScript",
            "Docker",
            "Kubernetes",
            "Linux",
          ],
          categories: [
            "Hardware",
            "Software",
            "Network",
            "Security",
            "Database",
            "Application",
            "Infrastructure",
          ],
          priorities: [
            "1 - Critical",
            "2 - High",
            "3 - Moderate",
            "4 - Low",
            "5 - Planning",
          ],
          search_types: ["semantic", "hybrid", "neural_sparse", "bm25", "all"],
          targets: ["documents", "tickets", "knowledge_base", "all"],
        };

        return {
          success: true,
          data: filterOptions,
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        logger.error(" [SearchAPI] Failed to get filter options:", error);
        throw error;
      }
    },
    {
      detail: {
        summary: "Get available search filters",
        description:
          "Returns all available filter options for intelligent search",
        tags: ["Search"],
      },
    },
  );
