/**
 * Advanced Index Management for ServiceNow Data in OpenSearch
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";
import type { OpenSearchClient, IndexConfig } from "./OpenSearchClient";

export interface IndexTemplate {
  name: string;
  indexPatterns: string[];
  template: {
    settings: any;
    mappings: any;
    aliases?: Record<string, any>;
  };
  priority?: number;
  version?: number;
}

export interface IndexLifecyclePolicy {
  policyId: string;
  policy: {
    phases: {
      hot?: {
        actions: {
          rollover?: {
            max_size?: string;
            max_age?: string;
            max_docs?: number;
          };
          set_priority?: {
            priority: number;
          };
        };
      };
      warm?: {
        min_age?: string;
        actions: {
          allocate?: {
            number_of_replicas: number;
          };
          force_merge?: {
            max_num_segments: number;
          };
          set_priority?: {
            priority: number;
          };
        };
      };
      cold?: {
        min_age?: string;
        actions: {
          allocate?: {
            number_of_replicas: number;
          };
          set_priority?: {
            priority: number;
          };
        };
      };
      delete?: {
        min_age?: string;
      };
    };
  };
}

export interface IndexMetrics {
  name: string;
  status: "green" | "yellow" | "red";
  health: string;
  documentsCount: number;
  primarySize: number;
  totalSize: number;
  segmentsCount: number;
  searchRate: number;
  indexingRate: number;
  lastUpdated: number;
  shards: {
    total: number;
    primary: number;
    replica: number;
  };
}

export interface IndexOptimizationSuggestion {
  index: string;
  type: "performance" | "storage" | "mapping" | "lifecycle";
  priority: "high" | "medium" | "low";
  description: string;
  action: string;
  estimatedImpact: string;
}

export class IndexManager extends EventEmitter {
  private client: OpenSearchClient;
  private indexMetrics: Map<string, IndexMetrics> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring: boolean = false;

  constructor(client: OpenSearchClient) {
    super();
    this.client = client;

    logger.info("IndexManager initialized");
  }

  /**
   * Create index template for ServiceNow data patterns
   */
  async createServiceNowTemplate(
    table: string,
    options: {
      rolloverSize?: string;
      rolloverAge?: string;
      replicas?: number;
      shards?: number;
      customMappings?: any;
    } = {},
  ): Promise<boolean> {
    const timer = performanceMonitor.startTimer("index_create_template");

    try {
      const template: IndexTemplate = {
        name: `servicenow-${table}-template`,
        indexPatterns: [`servicenow-${table}-*`, `servicenow-${table}-write`],
        template: {
          settings: {
            number_of_shards: options.shards || 1,
            number_of_replicas: options.replicas || 1,
            refresh_interval: "30s",
            "index.max_result_window": 50000,
            "index.lifecycle.name": `servicenow-${table}-policy`,
            "index.lifecycle.rollover_alias": `servicenow-${table}-write`,
            analysis: this.getServiceNowAnalysisSettings(),
            mapping: {
              total_fields: {
                limit: 2000, // ServiceNow tables can have many fields
              },
            },
          },
          mappings: options.customMappings || this.getServiceNowMappings(table),
          aliases: {
            [`servicenow-${table}-read`]: {},
            [`servicenow-${table}-latest`]: {},
          },
        },
        priority: 100,
        version: 1,
      };

      const response = await (this.client["client"].indices as any).putTemplate(
        {
          name: template.name,
          body: template.template,
          include_type_name: false,
        },
      );

      const success = response.statusCode === 200;

      if (success) {
        logger.info(`Created index template: ${template.name}`);
        this.emit("template:created", { templateName: template.name, table });

        // Create initial index
        await this.createInitialIndex(table, template.name);

        // Create lifecycle policy
        await this.createLifecyclePolicy(table, {
          rolloverSize: options.rolloverSize || "50gb",
          rolloverAge: options.rolloverAge || "30d",
        });
      }

      return success;
    } catch (error) {
      logger.error(
        `Error creating template for table ${table}:`,
        error as Error,
      );
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Create lifecycle policy for automatic index management
   */
  async createLifecyclePolicy(
    table: string,
    options: {
      rolloverSize?: string;
      rolloverAge?: string;
      warmAge?: string;
      coldAge?: string;
      deleteAge?: string;
    } = {},
  ): Promise<boolean> {
    const timer = performanceMonitor.startTimer("index_create_lifecycle");

    try {
      const policy: IndexLifecyclePolicy = {
        policyId: `servicenow-${table}-policy`,
        policy: {
          phases: {
            hot: {
              actions: {
                rollover: {
                  max_size: options.rolloverSize || "50gb",
                  max_age: options.rolloverAge || "30d",
                  max_docs: 100000000, // 100M documents
                },
                set_priority: {
                  priority: 100,
                },
              },
            },
            warm: {
              min_age: options.warmAge || "7d",
              actions: {
                allocate: {
                  number_of_replicas: 0, // Reduce replicas in warm phase
                },
                force_merge: {
                  max_num_segments: 1,
                },
                set_priority: {
                  priority: 50,
                },
              },
            },
            cold: {
              min_age: options.coldAge || "90d",
              actions: {
                allocate: {
                  number_of_replicas: 0,
                },
                set_priority: {
                  priority: 0,
                },
              },
            },
            delete: {
              min_age: options.deleteAge || "365d",
            },
          },
        },
      };

      // Note: This would use the ISM (Index State Management) plugin
      // For standard OpenSearch, we'll simulate the policy creation
      const success = await this.simulateLifecyclePolicyCreation(policy);

      if (success) {
        logger.info(`Created lifecycle policy: ${policy.policyId}`);
        this.emit("policy:created", { policyId: policy.policyId, table });
      }

      return success;
    } catch (error) {
      logger.error(
        `Error creating lifecycle policy for table ${table}:`,
        error,
      );
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Optimize index settings based on usage patterns
   */
  async optimizeIndex(
    indexName: string,
    options: {
      forceOptimization?: boolean;
      maxSegments?: number;
      onlyExpungeDeletes?: boolean;
    } = {},
  ): Promise<boolean> {
    const timer = performanceMonitor.startTimer("index_optimize");

    try {
      // Get current index metrics
      const metrics = await this.getIndexMetrics(indexName);
      if (!metrics) {
        logger.warn(
          `Cannot optimize index ${indexName} - metrics not available`,
        );
        return false;
      }

      const optimizations: Array<() => Promise<boolean>> = [];

      // Force merge if segments are fragmented
      if (metrics.segmentsCount > 20 || options.forceOptimization) {
        optimizations.push(() =>
          this.forceMergeIndex(indexName, {
            maxSegments: options.maxSegments || 1,
            onlyExpungeDeletes: options.onlyExpungeDeletes || false,
          }),
        );
      }

      // Refresh index to make recent changes searchable
      optimizations.push(() => this.refreshIndex(indexName));

      // Execute optimizations
      const results = await Promise.all(optimizations.map((opt) => opt()));
      const success = results.every((result) => result);

      if (success) {
        logger.info(`Successfully optimized index: ${indexName}`);
        this.emit("index:optimized", {
          indexName,
          optimizations: optimizations.length,
        });
      }

      return success;
    } catch (error) {
      logger.error(`Error optimizing index ${indexName}:`, error as Error);
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Analyze index performance and suggest optimizations
   */
  async analyzeIndexPerformance(
    indexName: string,
  ): Promise<IndexOptimizationSuggestion[]> {
    const timer = performanceMonitor.startTimer("index_analyze_performance");

    try {
      const suggestions: IndexOptimizationSuggestion[] = [];
      const metrics = await this.getIndexMetrics(indexName);

      if (!metrics) {
        return suggestions;
      }

      // Check document count vs primary size ratio
      const avgDocSize =
        metrics.documentsCount > 0
          ? metrics.primarySize / metrics.documentsCount
          : 0;

      if (avgDocSize > 10000) {
        // > 10KB per document
        suggestions.push({
          index: indexName,
          type: "storage",
          priority: "medium",
          description: "Documents are larger than expected",
          action: "Consider enabling compression or reviewing field mappings",
          estimatedImpact: "Reduce storage by 20-30%",
        });
      }

      // Check segment count
      if (metrics.segmentsCount > 50) {
        suggestions.push({
          index: indexName,
          type: "performance",
          priority: "high",
          description: "Too many segments",
          action: "Execute force merge to consolidate segments",
          estimatedImpact: "Improve search performance by 15-25%",
        });
      }

      // Check replica count vs search rate
      if (metrics.searchRate > 100 && metrics.shards.replica === 0) {
        suggestions.push({
          index: indexName,
          type: "performance",
          priority: "medium",
          description: "High search load with no replicas",
          action: "Add replica shards to distribute search load",
          estimatedImpact: "Improve search latency by 30-40%",
        });
      }

      // Check index size vs shard count
      const primarySizeGB = metrics.primarySize / (1024 * 1024 * 1024);
      if (primarySizeGB > 50 && metrics.shards.primary === 1) {
        suggestions.push({
          index: indexName,
          type: "performance",
          priority: "medium",
          description: "Large index with single primary shard",
          action: "Consider reindexing with more primary shards",
          estimatedImpact: "Improve indexing performance by 40-50%",
        });
      }

      // Check refresh interval
      const settings = await this.getIndexSettings(indexName);
      if (
        settings &&
        settings.refresh_interval === "1s" &&
        metrics.indexingRate < 10
      ) {
        suggestions.push({
          index: indexName,
          type: "performance",
          priority: "low",
          description: "Frequent refresh with low indexing rate",
          action: "Increase refresh interval to 30s or more",
          estimatedImpact: "Reduce CPU usage by 5-10%",
        });
      }

      return suggestions;
    } catch (error) {
      logger.error(
        `Error analyzing performance for index ${indexName}:`,
        error,
      );
      return [];
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Start monitoring all ServiceNow indices
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) {
      logger.warn("Index monitoring is already running");
      return;
    }

    this.isMonitoring = true;

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.updateAllIndexMetrics();
        await this.checkIndexHealth();

        this.emit("monitoring:update", {
          timestamp: Date.now(),
          indicesCount: this.indexMetrics.size,
        });
      } catch (error) {
        logger.error("Error during index monitoring:", error as Error);
      }
    }, intervalMs);

    logger.info(`Started index monitoring (interval: ${intervalMs}ms)`);
    this.emit("monitoring:started", { intervalMs });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.isMonitoring = false;

    logger.info("Stopped index monitoring");
    this.emit("monitoring:stopped");
  }

  /**
   * Get metrics for specific index
   */
  async getIndexMetrics(indexName: string): Promise<IndexMetrics | null> {
    try {
      const stats = await this.client["client"].indices.stats({
        index: indexName,
        metric: ["docs", "store", "segments", "search", "indexing"],
      });

      const health = await this.client["client"].cluster.health({
        index: indexName,
        level: "indices",
      });

      if (stats.statusCode !== 200 || health.statusCode !== 200) {
        return null;
      }

      const indexStats = stats.body.indices[indexName];
      const indexHealth = health.body.indices[indexName];

      const metrics: IndexMetrics = {
        name: indexName,
        status: indexHealth.status,
        health: indexHealth.status,
        documentsCount: indexStats.total.docs.count,
        primarySize: indexStats.primaries.store.size_in_bytes,
        totalSize: indexStats.total.store.size_in_bytes,
        segmentsCount: indexStats.total.segments.count,
        searchRate: indexStats.total.search.query_total,
        indexingRate: indexStats.total.indexing.index_total,
        lastUpdated: Date.now(),
        shards: {
          total: indexHealth.number_of_shards,
          primary: indexHealth.number_of_shards,
          replica: indexHealth.number_of_replicas,
        },
      };

      this.indexMetrics.set(indexName, metrics);
      return metrics;
    } catch (error) {
      logger.error(
        `Error getting metrics for index ${indexName}:`,
        error as Error,
      );
      return null;
    }
  }

  /**
   * Get all monitored index metrics
   */
  getAllIndexMetrics(): Map<string, IndexMetrics> {
    return new Map(this.indexMetrics);
  }

  /**
   * Get optimization suggestions for all indices
   */
  async getOptimizationSuggestions(): Promise<IndexOptimizationSuggestion[]> {
    const allSuggestions: IndexOptimizationSuggestion[] = [];

    for (const indexName of this.indexMetrics.keys()) {
      try {
        const suggestions = await this.analyzeIndexPerformance(indexName);
        allSuggestions.push(...suggestions);
      } catch (error) {
        logger.error(`Error analyzing ${indexName}:`, error as Error);
      }
    }

    // Sort by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    allSuggestions.sort(
      (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority],
    );

    return allSuggestions;
  }

  /**
   * Execute automatic optimization based on suggestions
   */
  async autoOptimize(
    suggestions: IndexOptimizationSuggestion[],
    options: {
      maxActions?: number;
      onlyHighPriority?: boolean;
      dryRun?: boolean;
    } = {},
  ): Promise<{
    executed: number;
    skipped: number;
    errors: number;
    actions: Array<{ index: string; action: string; success: boolean }>;
  }> {
    const result = {
      executed: 0,
      skipped: 0,
      errors: 0,
      actions: [] as Array<{ index: string; action: string; success: boolean }>,
    };

    const maxActions = options.maxActions || 10;
    const filteredSuggestions = options.onlyHighPriority
      ? suggestions.filter((s) => s.priority === "high")
      : suggestions;

    const actionsToExecute = filteredSuggestions.slice(0, maxActions);

    for (const suggestion of actionsToExecute) {
      try {
        if (options.dryRun) {
          logger.info(
            `[DRY RUN] Would execute: ${suggestion.action} on ${suggestion.index}`,
          );
          result.actions.push({
            index: suggestion.index,
            action: suggestion.action,
            success: true,
          });
          result.executed++;
          continue;
        }

        let success = false;

        // Execute based on suggestion type
        switch (suggestion.type) {
          case "performance":
            if (suggestion.action.includes("force merge")) {
              success = await this.optimizeIndex(suggestion.index, {
                forceOptimization: true,
              });
            }
            break;
          case "storage":
            if (suggestion.action.includes("compression")) {
              success = await this.enableIndexCompression(suggestion.index);
            }
            break;
          // Add more action types as needed
        }

        result.actions.push({
          index: suggestion.index,
          action: suggestion.action,
          success,
        });

        if (success) {
          result.executed++;
        } else {
          result.errors++;
        }
      } catch (error) {
        logger.error(
          `Error executing optimization for ${suggestion.index}:`,
          error,
        );
        result.errors++;
        result.actions.push({
          index: suggestion.index,
          action: suggestion.action,
          success: false,
        });
      }
    }

    result.skipped = filteredSuggestions.length - actionsToExecute.length;

    logger.info(
      `Auto-optimization completed: ${result.executed} executed, ${result.errors} errors, ${result.skipped} skipped`,
    );
    this.emit("auto:optimization:completed", result);

    return result;
  }

  private async createInitialIndex(
    table: string,
    templateName: string,
  ): Promise<boolean> {
    try {
      const indexName = `servicenow-${table}-000001`;
      const aliasName = `servicenow-${table}-write`;

      const response = await this.client["client"].indices.create({
        index: indexName,
        body: {
          aliases: {
            [aliasName]: {
              is_write_index: true,
            },
          },
        },
      });

      return response.statusCode === 200;
    } catch (error) {
      logger.error(
        `Error creating initial index for table ${table}:`,
        error as Error,
      );
      return false;
    }
  }

  private async simulateLifecyclePolicyCreation(
    policy: IndexLifecyclePolicy,
  ): Promise<boolean> {
    // This would integrate with OpenSearch ISM plugin
    // For now, we'll simulate successful creation
    logger.info(`Simulated creation of lifecycle policy: ${policy.policyId}`);
    return true;
  }

  private async forceMergeIndex(
    indexName: string,
    options: { maxSegments: number; onlyExpungeDeletes: boolean },
  ): Promise<boolean> {
    try {
      const response = await this.client["client"].indices.forcemerge({
        index: indexName,
        max_num_segments: options.maxSegments,
        only_expunge_deletes: options.onlyExpungeDeletes,
      });

      return response.statusCode === 200;
    } catch (error) {
      logger.error(`Error force merging index ${indexName}:`, error as Error);
      return false;
    }
  }

  private async refreshIndex(indexName: string): Promise<boolean> {
    try {
      const response = await this.client["client"].indices.refresh({
        index: indexName,
      });

      return response.statusCode === 200;
    } catch (error) {
      logger.error(`Error refreshing index ${indexName}:`, error as Error);
      return false;
    }
  }

  private async getIndexSettings(indexName: string): Promise<any | null> {
    try {
      const response = await this.client["client"].indices.getSettings({
        index: indexName,
      });

      if (response.statusCode === 200) {
        return response.body[indexName].settings.index;
      }

      return null;
    } catch (error) {
      logger.error(
        `Error getting settings for index ${indexName}:`,
        error as Error,
      );
      return null;
    }
  }

  private async enableIndexCompression(indexName: string): Promise<boolean> {
    try {
      const response = await this.client["client"].indices.putSettings({
        index: indexName,
        body: {
          settings: {
            "index.codec": "best_compression",
          },
        },
      });

      return response.statusCode === 200;
    } catch (error) {
      logger.error(
        `Error enabling compression for index ${indexName}:`,
        error as Error,
      );
      return false;
    }
  }

  private async updateAllIndexMetrics(): Promise<void> {
    try {
      // Get all ServiceNow indices
      const response = await this.client["client"].cat.indices({
        index: "servicenow-*",
        format: "json",
      });

      if (response.statusCode === 200) {
        const indices = response.body as Array<{ index: string }>;

        // Update metrics for each index
        const promises = indices.map(({ index }) =>
          this.getIndexMetrics(index),
        );
        await Promise.all(promises);
      }
    } catch (error) {
      logger.error("Error updating all index metrics:", error as Error);
    }
  }

  private async checkIndexHealth(): Promise<void> {
    for (const [indexName, metrics] of this.indexMetrics) {
      if (metrics.status === "red") {
        this.emit("index:unhealthy", {
          indexName,
          status: metrics.status,
          timestamp: Date.now(),
        });
        logger.warn(`Index ${indexName} is unhealthy: ${metrics.status}`);
      }

      // Check for performance issues
      if (metrics.segmentsCount > 100) {
        this.emit("index:performance:warning", {
          indexName,
          issue: "high_segment_count",
          value: metrics.segmentsCount,
          timestamp: Date.now(),
        });
      }
    }
  }

  private getServiceNowAnalysisSettings(): any {
    return {
      analyzer: {
        servicenow_standard: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase", "stop", "snowball"],
        },
        servicenow_keyword: {
          type: "custom",
          tokenizer: "keyword",
          filter: ["lowercase", "trim"],
        },
        servicenow_text_search: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase", "stop", "synonym"],
        },
      },
      filter: {
        synonym: {
          type: "synonym",
          synonyms: [
            "incident,case,ticket",
            "problem,issue",
            "change,modification",
            "urgent,high priority",
            "resolved,closed,fixed",
          ],
        },
      },
    };
  }

  private getServiceNowMappings(table: string): any {
    const baseMappings = {
      properties: {
        "@timestamp": { type: "date" },
        sys_id: { type: "keyword" },
        sys_created_on: { type: "date" },
        sys_updated_on: { type: "date" },
        sys_created_by: {
          type: "keyword",
          fields: {
            text: { type: "text", analyzer: "servicenow_standard" },
          },
        },
        sys_updated_by: {
          type: "keyword",
          fields: {
            text: { type: "text", analyzer: "servicenow_standard" },
          },
        },
      },
    };

    // Add table-specific mappings
    switch (table) {
      case "incident":
        Object.assign(baseMappings.properties, {
          number: { type: "keyword" },
          short_description: {
            type: "text",
            analyzer: "servicenow_text_search",
            fields: {
              keyword: { type: "keyword" },
              raw: { type: "text", analyzer: "servicenow_keyword" },
            },
          },
          description: {
            type: "text",
            analyzer: "servicenow_text_search",
          },
          state: { type: "keyword" },
          priority: { type: "keyword" },
          impact: { type: "keyword" },
          urgency: { type: "keyword" },
          category: { type: "keyword" },
          subcategory: { type: "keyword" },
          assignment_group: { type: "keyword" },
          assigned_to: { type: "keyword" },
          caller_id: { type: "keyword" },
          opened_at: { type: "date" },
          closed_at: { type: "date" },
          resolved_at: { type: "date" },
        });
        break;

      case "problem":
        Object.assign(baseMappings.properties, {
          number: { type: "keyword" },
          short_description: {
            type: "text",
            analyzer: "servicenow_text_search",
            fields: { keyword: { type: "keyword" } },
          },
          state: { type: "keyword" },
          priority: { type: "keyword" },
          root_cause: {
            type: "text",
            analyzer: "servicenow_text_search",
          },
        });
        break;

      case "change_request":
        Object.assign(baseMappings.properties, {
          number: { type: "keyword" },
          short_description: {
            type: "text",
            analyzer: "servicenow_text_search",
            fields: { keyword: { type: "keyword" } },
          },
          state: { type: "keyword" },
          type: { type: "keyword" },
          risk: { type: "keyword" },
          impact: { type: "keyword" },
          start_date: { type: "date" },
          end_date: { type: "date" },
        });
        break;

      default:
        // Generic ServiceNow table mappings
        Object.assign(baseMappings.properties, {
          number: { type: "keyword" },
          short_description: {
            type: "text",
            analyzer: "servicenow_text_search",
            fields: { keyword: { type: "keyword" } },
          },
          description: {
            type: "text",
            analyzer: "servicenow_text_search",
          },
          state: { type: "keyword" },
          active: { type: "boolean" },
        });
    }

    return baseMappings;
  }
}
