/**
 * OpenSearch Integration for ServiceNow Historical Data Indexing and Search
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Client } from "@opensearch-project/opensearch";
import { EventEmitter } from "events";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";

export interface OpenSearchConfig {
  node: string | string[]; // OpenSearch node(s)
  auth?: {
    username: string;
    password: string;
  };
  ssl?: {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
  requestTimeout?: number; // Default: 30000
  maxRetries?: number; // Default: 3
  enableCompression?: boolean; // Default: true
  maxConnections?: number; // Default: 10
  keepAlive?: boolean; // Default: true
}

export interface IndexConfig {
  name: string;
  settings?: {
    numberOfShards?: number;
    numberOfReplicas?: number;
    refreshInterval?: string;
    maxResultWindow?: number;
    analysis?: any;
  };
  mappings?: {
    properties: Record<string, any>;
  };
  aliases?: string[];
}

export interface SearchQuery {
  index: string;
  body: {
    query?: any;
    aggs?: any;
    sort?: any;
    size?: number;
    from?: number;
    _source?: string[] | boolean;
    highlight?: any;
  };
  routing?: string;
}

export interface BulkOperation {
  operation: "index" | "create" | "update" | "delete";
  index: string;
  id?: string;
  document?: any;
  routing?: string;
}

export interface OpenSearchStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  documentsIndexed: number;
  documentsSearched: number;
  averageLatency: number;
  bulkOperations: number;
  indexingThroughput: number; // documents/second
  lastOperation: number;
}

export class OpenSearchClient extends EventEmitter {
  private client: Client;
  private config: Required<OpenSearchConfig>;
  private stats: OpenSearchStats = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    documentsIndexed: 0,
    documentsSearched: 0,
    averageLatency: 0,
    bulkOperations: 0,
    indexingThroughput: 0,
    lastOperation: 0,
  };
  private isConnected: boolean = false;

  constructor(config: OpenSearchConfig) {
    super();

    this.config = {
      node: config.node,
      auth: config.auth,
      ssl: config.ssl,
      requestTimeout: config.requestTimeout || 30000,
      maxRetries: config.maxRetries || 3,
      enableCompression: config.enableCompression ?? true,
      maxConnections: config.maxConnections || 10,
      keepAlive: config.keepAlive ?? true,
    };

    this.client = new Client({
      node: this.config.node,
      auth: this.config.auth,
      ssl: this.config.ssl,
      requestTimeout: this.config.requestTimeout,
      maxRetries: this.config.maxRetries,
      compression: this.config.enableCompression,
      maxConnections: this.config.maxConnections,
      keepAlive: this.config.keepAlive,
    });

    this.setupEventHandlers();

    logger.info("OpenSearchClient initialized");
  }

  /**
   * Test connection to OpenSearch cluster
   */
  async connect(): Promise<boolean> {
    const timer = performanceMonitor.startTimer("opensearch_connect");

    try {
      const response = await this.client.cluster.health();

      if (response.statusCode === 200) {
        this.isConnected = true;
        this.emit("connected", response.body);
        logger.info(
          "Connected to OpenSearch cluster:",
          response.body.cluster_name,
        );
        return true;
      }

      return false;
    } catch (error) {
      this.isConnected = false;
      logger.error("Failed to connect to OpenSearch:", error);
      this.emit("connection:error", error);
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Create index with optimized settings for ServiceNow data
   */
  async createIndex(config: IndexConfig): Promise<boolean> {
    const timer = performanceMonitor.startTimer("opensearch_create_index");

    try {
      this.stats.totalOperations++;

      // Check if index already exists
      const exists = await this.client.indices.exists({
        index: config.name,
      });

      if (exists.statusCode === 200) {
        logger.info(`Index ${config.name} already exists`);
        return true;
      }

      // Create index with settings and mappings
      const response = await this.client.indices.create({
        index: config.name,
        body: {
          settings: {
            number_of_shards: config.settings?.numberOfShards || 1,
            number_of_replicas: config.settings?.numberOfReplicas || 1,
            refresh_interval: config.settings?.refreshInterval || "1s",
            "index.max_result_window":
              config.settings?.maxResultWindow || 10000,
            analysis:
              config.settings?.analysis || this.getDefaultAnalysisSettings(),
          },
          mappings: config.mappings || this.getDefaultMappings(),
          aliases: config.aliases
            ? Object.fromEntries(config.aliases.map((alias) => [alias, {}]))
            : undefined,
        },
      });

      const success = response.statusCode === 200;

      if (success) {
        this.stats.successfulOperations++;
        logger.info(`Successfully created index: ${config.name}`);
        this.emit("index:created", { indexName: config.name });
      } else {
        this.stats.failedOperations++;
      }

      return success;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error creating index ${config.name}:`, error);
      this.emit("operation:error", {
        operation: "create_index",
        index: config.name,
        error,
      });
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Index single document
   */
  async indexDocument(
    index: string,
    document: any,
    options: {
      id?: string;
      routing?: string;
      refresh?: boolean;
      timeout?: string;
    } = {},
  ): Promise<boolean> {
    const timer = performanceMonitor.startTimer("opensearch_index_document");

    try {
      this.stats.totalOperations++;

      const response = await this.client.index({
        index,
        id: options.id,
        body: this.preprocessDocument(document),
        routing: options.routing,
        refresh: options.refresh,
        timeout: options.timeout,
      });

      const success =
        response.statusCode === 200 || response.statusCode === 201;

      if (success) {
        this.stats.successfulOperations++;
        this.stats.documentsIndexed++;
        this.stats.lastOperation = Date.now();

        this.emit("document:indexed", {
          index,
          id: response.body._id,
          version: response.body._version,
        });
      } else {
        this.stats.failedOperations++;
      }

      return success;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error indexing document in ${index}:`, error);
      this.emit("operation:error", { operation: "index", index, error });
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Bulk index documents for high throughput
   */
  async bulkIndex(
    operations: BulkOperation[],
    options: {
      refresh?: boolean;
      timeout?: string;
      routing?: string;
    } = {},
  ): Promise<{
    success: boolean;
    indexed: number;
    errors: any[];
  }> {
    const timer = performanceMonitor.startTimer("opensearch_bulk_index");

    try {
      this.stats.totalOperations++;
      this.stats.bulkOperations++;

      // Build bulk request body
      const body = [];

      for (const op of operations) {
        // Action header
        const action: any = {
          [op.operation]: {
            _index: op.index,
            _id: op.id,
            routing: op.routing || options.routing,
          },
        };

        body.push(action);

        // Document body (for index, create, update operations)
        if (
          op.document &&
          (op.operation === "index" ||
            op.operation === "create" ||
            op.operation === "update")
        ) {
          body.push(this.preprocessDocument(op.document));
        }
      }

      const response = await this.client.bulk({
        body,
        refresh: options.refresh,
        timeout: options.timeout,
      });

      const result = {
        success: !response.body.errors,
        indexed: 0,
        errors: [] as any[],
      };

      // Process response items
      for (const item of response.body.items) {
        const operation = Object.keys(item)[0];
        const operationResult = item[operation];

        if (operationResult.error) {
          result.errors.push({
            index: operationResult._index,
            id: operationResult._id,
            error: operationResult.error,
          });
        } else {
          result.indexed++;
        }
      }

      if (result.success) {
        this.stats.successfulOperations++;
        this.stats.documentsIndexed += result.indexed;
        this.stats.lastOperation = Date.now();

        // Calculate indexing throughput
        this.updateIndexingThroughput(result.indexed);

        logger.info(`Bulk indexed ${result.indexed} documents`);
        this.emit("bulk:indexed", {
          total: operations.length,
          indexed: result.indexed,
          errors: result.errors.length,
        });
      } else {
        this.stats.failedOperations++;
        logger.error(`Bulk index had ${result.errors.length} errors`);
      }

      return result;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error("Error during bulk indexing:", error);
      this.emit("operation:error", { operation: "bulk_index", error });
      return { success: false, indexed: 0, errors: [error] };
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Search documents with advanced query capabilities
   */
  async search(query: SearchQuery): Promise<{
    hits: any[];
    total: number;
    maxScore: number;
    aggregations?: any;
    took: number;
  }> {
    const timer = performanceMonitor.startTimer("opensearch_search");

    try {
      this.stats.totalOperations++;

      const response = await this.client.search(query);

      const result = {
        hits: response.body.hits.hits.map((hit: any) => ({
          ...hit._source,
          _id: hit._id,
          _score: hit._score,
          _index: hit._index,
          highlight: hit.highlight,
        })),
        total:
          typeof response.body.hits.total === "object"
            ? response.body.hits.total.value
            : response.body.hits.total,
        maxScore: response.body.hits.max_score,
        aggregations: response.body.aggregations,
        took: response.body.took,
      };

      this.stats.successfulOperations++;
      this.stats.documentsSearched += result.hits.length;
      this.stats.lastOperation = Date.now();

      this.emit("search:completed", {
        index: query.index,
        hits: result.hits.length,
        total: result.total,
        took: result.took,
      });

      return result;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error searching index ${query.index}:`, error);
      this.emit("operation:error", {
        operation: "search",
        index: query.index,
        error,
      });
      return { hits: [], total: 0, maxScore: 0, took: 0 };
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Execute aggregation query for analytics
   */
  async aggregate(
    index: string,
    aggregations: any,
    query?: any,
    size: number = 0,
  ): Promise<{
    aggregations: any;
    took: number;
  }> {
    const searchQuery: SearchQuery = {
      index,
      body: {
        size,
        query: query || { match_all: {} },
        aggs: aggregations,
      },
    };

    const result = await this.search(searchQuery);

    return {
      aggregations: result.aggregations || {},
      took: result.took,
    };
  }

  /**
   * Get document by ID
   */
  async getDocument(
    index: string,
    id: string,
    options: {
      routing?: string;
      _source?: string[] | boolean;
    } = {},
  ): Promise<any | null> {
    const timer = performanceMonitor.startTimer("opensearch_get_document");

    try {
      this.stats.totalOperations++;

      const response = await this.client.get({
        index,
        id,
        routing: options.routing,
        _source: options._source,
      });

      if (response.statusCode === 200) {
        this.stats.successfulOperations++;
        return {
          ...response.body._source,
          _id: response.body._id,
          _version: response.body._version,
        };
      }

      return null;
    } catch (error) {
      if ((error as any).statusCode === 404) {
        return null; // Document not found
      }

      this.stats.failedOperations++;
      logger.error(`Error getting document ${id} from ${index}:`, error);
      return null;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Update document
   */
  async updateDocument(
    index: string,
    id: string,
    document: any,
    options: {
      routing?: string;
      refresh?: boolean;
      retryOnConflict?: number;
    } = {},
  ): Promise<boolean> {
    const timer = performanceMonitor.startTimer("opensearch_update_document");

    try {
      this.stats.totalOperations++;

      const response = await this.client.update({
        index,
        id,
        body: {
          doc: this.preprocessDocument(document),
          doc_as_upsert: true,
        },
        routing: options.routing,
        refresh: options.refresh,
        retry_on_conflict: options.retryOnConflict || 3,
      });

      const success = response.statusCode === 200;

      if (success) {
        this.stats.successfulOperations++;
        this.emit("document:updated", {
          index,
          id,
          version: response.body._version,
        });
      } else {
        this.stats.failedOperations++;
      }

      return success;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error updating document ${id} in ${index}:`, error);
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(
    index: string,
    id: string,
    options: {
      routing?: string;
      refresh?: boolean;
    } = {},
  ): Promise<boolean> {
    const timer = performanceMonitor.startTimer("opensearch_delete_document");

    try {
      this.stats.totalOperations++;

      const response = await this.client.delete({
        index,
        id,
        routing: options.routing,
        refresh: options.refresh,
      });

      const success = response.statusCode === 200;

      if (success) {
        this.stats.successfulOperations++;
        this.emit("document:deleted", { index, id });
      } else {
        this.stats.failedOperations++;
      }

      return success;
    } catch (error) {
      if ((error as any).statusCode === 404) {
        return true; // Already deleted
      }

      this.stats.failedOperations++;
      logger.error(`Error deleting document ${id} from ${index}:`, error);
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Delete documents by query
   */
  async deleteByQuery(
    index: string,
    query: any,
    options: {
      routing?: string;
      refresh?: boolean;
      conflicts?: "abort" | "proceed";
    } = {},
  ): Promise<{
    deleted: number;
    versionConflicts: number;
    batches: number;
  }> {
    const timer = performanceMonitor.startTimer("opensearch_delete_by_query");

    try {
      this.stats.totalOperations++;

      const response = await this.client.deleteByQuery({
        index,
        body: { query },
        routing: options.routing,
        refresh: options.refresh,
        conflicts: options.conflicts || "abort",
      });

      if (response.statusCode === 200) {
        this.stats.successfulOperations++;

        const result = {
          deleted: response.body.deleted,
          versionConflicts: response.body.version_conflicts,
          batches: response.body.batches,
        };

        this.emit("documents:deleted", {
          index,
          deleted: result.deleted,
          conflicts: result.versionConflicts,
        });

        return result;
      }

      return { deleted: 0, versionConflicts: 0, batches: 0 };
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error deleting by query in ${index}:`, error);
      return { deleted: 0, versionConflicts: 0, batches: 0 };
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(index: string): Promise<{
    documentCount: number;
    indexSize: number;
    searchRate: number;
    indexingRate: number;
  } | null> {
    try {
      const response = await this.client.indices.stats({
        index,
      });

      if (response.statusCode === 200) {
        const stats = response.body.indices[index];

        return {
          documentCount: stats.total.docs.count,
          indexSize: stats.total.store.size_in_bytes,
          searchRate: stats.total.search.query_total,
          indexingRate: stats.total.indexing.index_total,
        };
      }

      return null;
    } catch (error) {
      logger.error(`Error getting stats for index ${index}:`, error);
      return null;
    }
  }

  /**
   * Get cluster health and statistics
   */
  async getClusterHealth(): Promise<{
    status: "green" | "yellow" | "red";
    clusterName: string;
    numberOfNodes: number;
    numberOfDataNodes: number;
    activeShards: number;
    relocatingShards: number;
    initializingShards: number;
    unassignedShards: number;
  } | null> {
    try {
      const response = await this.client.cluster.health();

      if (response.statusCode === 200) {
        const health = response.body;

        return {
          status: health.status,
          clusterName: health.cluster_name,
          numberOfNodes: health.number_of_nodes,
          numberOfDataNodes: health.number_of_data_nodes,
          activeShards: health.active_shards,
          relocatingShards: health.relocating_shards,
          initializingShards: health.initializing_shards,
          unassignedShards: health.unassigned_shards,
        };
      }

      return null;
    } catch (error) {
      logger.error("Error getting cluster health:", error);
      return null;
    }
  }

  /**
   * Get comprehensive client statistics
   */
  getStats(): OpenSearchStats {
    // Update average latency
    if (this.stats.totalOperations > 0) {
      this.stats.averageLatency =
        (this.stats.successfulOperations + this.stats.failedOperations) /
        this.stats.totalOperations;
    }

    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      documentsIndexed: 0,
      documentsSearched: 0,
      averageLatency: 0,
      bulkOperations: 0,
      indexingThroughput: 0,
      lastOperation: 0,
    };

    this.emit("stats:reset");
  }

  /**
   * Close connection and cleanup
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      this.isConnected = false;
      this.removeAllListeners();

      logger.info("OpenSearchClient disconnected");
    } catch (error) {
      logger.error("Error disconnecting OpenSearchClient:", error);
    }
  }

  private setupEventHandlers(): void {
    this.client.on("response", (err, result) => {
      if (err) {
        this.emit("error", err);
      }
    });
  }

  private preprocessDocument(document: any): any {
    // Add timestamp if not present
    if (!document["@timestamp"]) {
      document["@timestamp"] = new Date().toISOString();
    }

    // Convert ServiceNow date fields to ISO format
    const dateFields = [
      "sys_created_on",
      "sys_updated_on",
      "opened_at",
      "closed_at",
      "resolved_at",
    ];
    for (const field of dateFields) {
      if (document[field] && typeof document[field] === "string") {
        try {
          document[field] = new Date(document[field]).toISOString();
        } catch (error) {
          // Keep original value if conversion fails
          logger.debug(`Failed to convert date field ${field}:`, error);
        }
      }
    }

    // Ensure sys_id is present for ServiceNow documents
    if (!document.sys_id && !document._id) {
      document.sys_id = `generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    return document;
  }

  private getDefaultAnalysisSettings(): any {
    return {
      analyzer: {
        servicenow_text: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase", "stop", "snowball"],
        },
        servicenow_search: {
          type: "custom",
          tokenizer: "keyword",
          filter: ["lowercase"],
        },
      },
    };
  }

  private getDefaultMappings(): any {
    return {
      properties: {
        "@timestamp": { type: "date" },
        sys_id: { type: "keyword" },
        sys_created_on: { type: "date" },
        sys_updated_on: { type: "date" },
        sys_created_by: { type: "keyword" },
        sys_updated_by: { type: "keyword" },
        number: { type: "keyword" },
        short_description: {
          type: "text",
          analyzer: "servicenow_text",
          fields: {
            keyword: { type: "keyword" },
            search: { type: "text", analyzer: "servicenow_search" },
          },
        },
        description: {
          type: "text",
          analyzer: "servicenow_text",
        },
        state: { type: "keyword" },
        priority: { type: "keyword" },
        category: { type: "keyword" },
        subcategory: { type: "keyword" },
        assignment_group: { type: "keyword" },
        assigned_to: { type: "keyword" },
        caller_id: { type: "keyword" },
        opened_at: { type: "date" },
        closed_at: { type: "date" },
        resolved_at: { type: "date" },
      },
    };
  }

  private updateIndexingThroughput(documentsIndexed: number): void {
    const currentTime = Date.now();
    const timeDelta = currentTime - this.stats.lastOperation;

    if (timeDelta > 0) {
      const throughput = (documentsIndexed / timeDelta) * 1000; // per second

      // Exponential moving average for smoothing
      this.stats.indexingThroughput =
        this.stats.indexingThroughput === 0
          ? throughput
          : this.stats.indexingThroughput * 0.7 + throughput * 0.3;
    }
  }
}
