/**
 * OpenSearch Integration Module - Historical Data Search and Analytics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export {
  OpenSearchClient,
  ServiceNowOpenSearchIntegration,
} from "./OpenSearchClient";
export { IndexManager } from "./IndexManager";
export { SearchQuery, ServiceNowSearchPatterns } from "./SearchQuery";

export type {
  OpenSearchConfig,
  IndexConfig,
  BulkOperation,
  SearchQuery as ISearchQuery,
  SearchResult,
  OpenSearchStats,
  IndexTemplate,
  IndexLifecyclePolicy,
  IndexMetrics,
  IndexOptimizationSuggestion,
  SearchOptions,
  AggregationConfig,
  FilterCondition,
  TextSearchConfig,
  DateRangeFilter,
} from "./OpenSearchClient";

import {
  OpenSearchClient,
  ServiceNowOpenSearchIntegration,
} from "./OpenSearchClient";
import { IndexManager } from "./IndexManager";
import { SearchQuery } from "./SearchQuery";
import type { OpenSearchConfig, IndexConfig } from "./OpenSearchClient";

/**
 * Factory class for creating integrated OpenSearch services for ServiceNow data
 */
export class ServiceNowOpenSearchFactory {
  private client: OpenSearchClient;
  private indexManager: IndexManager;
  private integration: ServiceNowOpenSearchIntegration;

  constructor(config: OpenSearchConfig) {
    this.client = new OpenSearchClient(config);
    this.indexManager = new IndexManager(this.client);
    this.integration = new ServiceNowOpenSearchIntegration(this.client);
  }

  /**
   * Get OpenSearch client for direct operations
   */
  getClient(): OpenSearchClient {
    return this.client;
  }

  /**
   * Get index manager for index lifecycle operations
   */
  getIndexManager(): IndexManager {
    return this.indexManager;
  }

  /**
   * Get ServiceNow integration utilities
   */
  getIntegration(): ServiceNowOpenSearchIntegration {
    return this.integration;
  }

  /**
   * Initialize complete ServiceNow search infrastructure
   */
  async initializeServiceNowSearch(
    tables: string[] = ["incident", "problem", "change_request"],
  ): Promise<{
    success: boolean;
    initializedTables: string[];
    errors: Array<{ table: string; error: string }>;
    indexTemplatesCreated: number;
    policiesCreated: number;
  }> {
    const result = {
      success: false,
      initializedTables: [] as string[],
      errors: [] as Array<{ table: string; error: string }>,
      indexTemplatesCreated: 0,
      policiesCreated: 0,
    };

    try {
      // Test connectivity first
      const connected = await this.client.testConnection();
      if (!connected) {
        result.errors.push({
          table: "all",
          error: "Cannot connect to OpenSearch cluster",
        });
        return result;
      }

      // Initialize each table
      for (const table of tables) {
        try {
          // Create index template
          const templateCreated =
            await this.indexManager.createServiceNowTemplate(table, {
              rolloverSize: "10gb",
              rolloverAge: "7d",
              replicas: 1,
              shards: 1,
            });

          if (templateCreated) {
            result.indexTemplatesCreated++;
            result.initializedTables.push(table);
          } else {
            result.errors.push({
              table,
              error: "Failed to create index template",
            });
          }
        } catch (error) {
          result.errors.push({
            table,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      result.errors.push({
        table: "all",
        error: error instanceof Error ? error.message : "Initialization failed",
      });
      return result;
    }
  }

  /**
   * Perform comprehensive data indexing from ServiceNow
   */
  async indexServiceNowData(
    table: string,
    records: any[],
    options: {
      batchSize?: number;
      refreshIndex?: boolean;
      updateMappings?: boolean;
      compressionEnabled?: boolean;
    } = {},
  ): Promise<{
    success: boolean;
    indexed: number;
    failed: number;
    totalBatches: number;
    errors: any[];
    indexName: string;
    mappingsUpdated: boolean;
  }> {
    const result = {
      success: false,
      indexed: 0,
      failed: 0,
      totalBatches: 0,
      errors: [] as any[],
      indexName: `servicenow-${table}-write`,
      mappingsUpdated: false,
    };

    try {
      const batchSize = options.batchSize || 1000;
      const batches = Math.ceil(records.length / batchSize);
      result.totalBatches = batches;

      // Process records in batches
      for (let i = 0; i < batches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, records.length);
        const batch = records.slice(start, end);

        try {
          const bulkResult = await this.integration.bulkIndexServiceNowRecords(
            table,
            batch,
            {
              refreshAfterBulk: false, // We'll refresh once at the end
              compressionEnabled: options.compressionEnabled,
            },
          );

          result.indexed += bulkResult.indexed;
          result.failed += bulkResult.errors.length;
          result.errors.push(...bulkResult.errors);
        } catch (error) {
          result.errors.push({
            batch: i + 1,
            error:
              error instanceof Error
                ? error.message
                : "Batch processing failed",
          });
          result.failed += batch.length;
        }
      }

      // Refresh index if requested
      if (options.refreshIndex) {
        await this.client.refreshIndex(result.indexName);
      }

      // Update mappings if needed
      if (options.updateMappings && records.length > 0) {
        try {
          const mappingResult = await this.integration.updateDynamicMapping(
            table,
            records[0],
          );
          result.mappingsUpdated = mappingResult;
        } catch (error) {
          result.errors.push({
            operation: "mapping_update",
            error:
              error instanceof Error ? error.message : "Mapping update failed",
          });
        }
      }

      result.success = result.indexed > 0 && result.failed < result.indexed;
      return result;
    } catch (error) {
      result.errors.push({
        operation: "indexing",
        error: error instanceof Error ? error.message : "Indexing failed",
      });
      return result;
    }
  }

  /**
   * Perform intelligent search with auto-completion and suggestions
   */
  async intelligentSearch(
    searchQuery: string,
    options: {
      tables?: string[];
      maxResults?: number;
      includeAggregations?: boolean;
      autoSuggest?: boolean;
      similarityThreshold?: number;
    } = {},
  ): Promise<{
    results: any[];
    total: number;
    suggestions: string[];
    aggregations?: any;
    searchTime: number;
    didYouMean?: string;
  }> {
    const startTime = Date.now();
    const tables = options.tables || ["incident", "problem", "change_request"];
    const maxResults = options.maxResults || 50;

    try {
      // Build intelligent search query
      const query = SearchQuery.builder()
        .search({
          fields: [
            "number^3",
            "short_description^2",
            "description",
            "caller_id.text",
          ],
          query: searchQuery,
          type: "multi_match",
          operator: "and",
          fuzziness: "AUTO",
        })
        .sort("_score", "desc")
        .sort("sys_updated_on", "desc")
        .size(maxResults)
        .highlight({
          fields: ["short_description", "description"],
          fragmentSize: 150,
          numberOfFragments: 2,
        });

      // Add aggregations if requested
      if (options.includeAggregations) {
        query
          .aggregation("by_table", {
            terms: { field: "_index", size: 10 },
          })
          .aggregation("by_priority", {
            terms: { field: "priority", size: 5 },
          })
          .aggregation("by_state", {
            terms: { field: "state", size: 10 },
          });
      }

      // Execute search across all ServiceNow tables
      const indices = tables.map((table) => `servicenow-${table}-*`);
      const searchResult = await this.client.search(query.build(), { indices });

      // Generate suggestions if requested
      let suggestions: string[] = [];
      let didYouMean: string | undefined;

      if (options.autoSuggest && searchResult.hits.length < 5) {
        // This would integrate with a suggestion service
        // For now, we'll provide basic suggestions based on common ServiceNow terms
        suggestions = await this.generateSearchSuggestions(searchQuery, tables);
        didYouMean = await this.generateDidYouMean(searchQuery);
      }

      return {
        results: searchResult.hits,
        total: searchResult.total,
        suggestions,
        aggregations: searchResult.aggregations,
        searchTime: Date.now() - startTime,
        didYouMean,
      };
    } catch (error) {
      console.error("Error in intelligent search:", error);
      return {
        results: [],
        total: 0,
        suggestions: [],
        searchTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Generate comprehensive ServiceNow analytics dashboard data
   */
  async generateAnalyticsDashboard(
    timeRange: { from: Date; to: Date },
    options: {
      tables?: string[];
      includePerformanceMetrics?: boolean;
      includeUserActivity?: boolean;
      includeSystemHealth?: boolean;
    } = {},
  ): Promise<{
    overview: {
      totalTickets: number;
      openTickets: number;
      resolvedTickets: number;
      avgResolutionTime: number;
    };
    trends: any[];
    topCategories: any[];
    performanceMetrics?: any;
    userActivity?: any;
    systemHealth?: any;
  }> {
    const tables = options.tables || ["incident", "problem", "change_request"];

    try {
      // Build comprehensive analytics query
      const analyticsQuery = SearchQuery.builder()
        .dateRange({
          field: "sys_created_on",
          from: timeRange.from.toISOString(),
          to: timeRange.to.toISOString(),
        })
        .aggregations({
          total_tickets: {
            cardinality: { field: "sys_id" },
          },
          by_state: {
            terms: { field: "state", size: 20 },
          },
          daily_trends: {
            date_histogram: {
              field: "sys_created_on",
              calendar_interval: "1d",
              format: "yyyy-MM-dd",
            },
          },
          top_categories: {
            terms: { field: "category", size: 20, order: { _count: "desc" } },
          },
          priority_distribution: {
            terms: { field: "priority", size: 5 },
          },
          resolution_times: {
            filter: { exists: { field: "resolved_at" } },
            aggs: {
              avg_resolution: {
                avg: {
                  script: {
                    source:
                      "(doc['resolved_at'].value.millis - doc['sys_created_on'].value.millis) / 1000 / 3600",
                  },
                },
              },
            },
          },
        })
        .size(0); // Only aggregations

      // Execute analytics query
      const indices = tables.map((table) => `servicenow-${table}-*`);
      const result = await this.client.search(analyticsQuery.build(), {
        indices,
      });

      // Process results
      const aggs = result.aggregations || {};
      const stateStats = aggs.by_state?.buckets || [];
      const openStates = ["1", "2", "3", "4", "5"]; // Adjust based on your state values

      return {
        overview: {
          totalTickets: aggs.total_tickets?.value || 0,
          openTickets: stateStats
            .filter((s: any) => openStates.includes(s.key))
            .reduce((sum: number, s: any) => sum + s.doc_count, 0),
          resolvedTickets: stateStats
            .filter((s: any) => !openStates.includes(s.key))
            .reduce((sum: number, s: any) => sum + s.doc_count, 0),
          avgResolutionTime: aggs.resolution_times?.avg_resolution?.value || 0,
        },
        trends: aggs.daily_trends?.buckets || [],
        topCategories: aggs.top_categories?.buckets || [],
      };
    } catch (error) {
      console.error("Error generating analytics dashboard:", error);
      return {
        overview: {
          totalTickets: 0,
          openTickets: 0,
          resolvedTickets: 0,
          avgResolutionTime: 0,
        },
        trends: [],
        topCategories: [],
      };
    }
  }

  /**
   * Start comprehensive monitoring
   */
  async startComprehensiveMonitoring(
    options: {
      indexMonitoringInterval?: number;
      performanceMetricsInterval?: number;
      alertThresholds?: {
        indexSizeGB?: number;
        segmentCount?: number;
        searchLatencyMs?: number;
      };
    } = {},
  ): Promise<void> {
    // Start index monitoring
    this.indexManager.startMonitoring(options.indexMonitoringInterval || 60000);

    // Set up event listeners for alerts
    this.indexManager.on("index:unhealthy", (event) => {
      console.warn(
        `INDEX ALERT: ${event.indexName} is unhealthy (${event.status})`,
      );
    });

    this.indexManager.on("index:performance:warning", (event) => {
      console.warn(
        `PERFORMANCE ALERT: ${event.indexName} - ${event.issue}: ${event.value}`,
      );
    });

    // Auto-optimization based on thresholds
    if (options.alertThresholds) {
      const checkAndOptimize = async () => {
        try {
          const suggestions =
            await this.indexManager.getOptimizationSuggestions();
          const highPrioritySuggestions = suggestions.filter(
            (s) => s.priority === "high",
          );

          if (highPrioritySuggestions.length > 0) {
            console.log(
              `Auto-optimizing ${highPrioritySuggestions.length} high-priority issues`,
            );
            await this.indexManager.autoOptimize(highPrioritySuggestions, {
              onlyHighPriority: true,
              maxActions: 5,
            });
          }
        } catch (error) {
          console.error("Error in auto-optimization:", error);
        }
      };

      // Run optimization check every 30 minutes
      setInterval(checkAndOptimize, 30 * 60 * 1000);
    }
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<{
    cluster: {
      status: string;
      nodes: number;
      indices: number;
      shards: number;
    };
    servicenow: {
      totalIndices: number;
      totalDocuments: number;
      totalSize: number;
      healthyIndices: number;
    };
    performance: {
      avgSearchLatency: number;
      indexingRate: number;
      searchRate: number;
    };
    recommendations: string[];
  }> {
    try {
      const [clusterHealth, indexMetrics, suggestions] = await Promise.all([
        this.client["client"].cluster.health(),
        this.indexManager.getAllIndexMetrics(),
        this.indexManager.getOptimizationSuggestions(),
      ]);

      const servicenowMetrics = Array.from(indexMetrics.values()).filter((m) =>
        m.name.startsWith("servicenow-"),
      );

      return {
        cluster: {
          status: clusterHealth.body.status,
          nodes: clusterHealth.body.number_of_nodes,
          indices: clusterHealth.body.number_of_indices,
          shards: clusterHealth.body.active_shards,
        },
        servicenow: {
          totalIndices: servicenowMetrics.length,
          totalDocuments: servicenowMetrics.reduce(
            (sum, m) => sum + m.documentsCount,
            0,
          ),
          totalSize: servicenowMetrics.reduce((sum, m) => sum + m.totalSize, 0),
          healthyIndices: servicenowMetrics.filter((m) => m.status === "green")
            .length,
        },
        performance: {
          avgSearchLatency:
            servicenowMetrics.reduce((sum, m) => sum + m.searchRate, 0) /
              servicenowMetrics.length || 0,
          indexingRate: servicenowMetrics.reduce(
            (sum, m) => sum + m.indexingRate,
            0,
          ),
          searchRate: servicenowMetrics.reduce(
            (sum, m) => sum + m.searchRate,
            0,
          ),
        },
        recommendations: suggestions.slice(0, 5).map((s) => s.description),
      };
    } catch (error) {
      console.error("Error getting health status:", error);
      return {
        cluster: { status: "unknown", nodes: 0, indices: 0, shards: 0 },
        servicenow: {
          totalIndices: 0,
          totalDocuments: 0,
          totalSize: 0,
          healthyIndices: 0,
        },
        performance: { avgSearchLatency: 0, indexingRate: 0, searchRate: 0 },
        recommendations: ["Health check failed - please check connectivity"],
      };
    }
  }

  private async generateSearchSuggestions(
    query: string,
    tables: string[],
  ): Promise<string[]> {
    // This would integrate with OpenSearch's suggest feature
    // For now, provide static suggestions based on common ServiceNow terms
    const commonTerms = [
      "incident",
      "problem",
      "change request",
      "high priority",
      "critical",
      "network issue",
      "server down",
      "application error",
      "user access",
      "email problem",
      "printer issue",
      "software installation",
      "password reset",
      "account locked",
      "performance issue",
    ];

    return commonTerms
      .filter(
        (term) =>
          term.toLowerCase().includes(query.toLowerCase()) ||
          query.toLowerCase().includes(term.toLowerCase()),
      )
      .slice(0, 5);
  }

  private async generateDidYouMean(query: string): Promise<string | undefined> {
    // This would integrate with OpenSearch's spell checking
    // For now, return undefined
    return undefined;
  }
}

// Constants for ServiceNow OpenSearch operations
export const SERVICENOW_OPENSEARCH_DEFAULTS = {
  INDEX_PATTERNS: {
    INCIDENT: "servicenow-incident-*",
    PROBLEM: "servicenow-problem-*",
    CHANGE_REQUEST: "servicenow-change_request-*",
    ALL_SERVICENOW: "servicenow-*",
  },
  SEARCH_CONFIGURATIONS: {
    MAX_RESULTS: 1000,
    TIMEOUT: "30s",
    HIGHLIGHT_FRAGMENT_SIZE: 150,
    AGGREGATION_SIZE: 50,
  },
  INDEX_SETTINGS: {
    ROLLOVER_SIZE: "10gb",
    ROLLOVER_AGE: "7d",
    WARM_AGE: "30d",
    COLD_AGE: "90d",
    DELETE_AGE: "2y",
  },
  FIELD_MAPPINGS: {
    KEYWORD_FIELDS: [
      "sys_id",
      "number",
      "state",
      "priority",
      "assignment_group",
    ],
    TEXT_FIELDS: ["short_description", "description", "work_notes"],
    DATE_FIELDS: [
      "sys_created_on",
      "sys_updated_on",
      "opened_at",
      "resolved_at",
      "closed_at",
    ],
  },
};
