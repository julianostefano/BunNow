/**
 * Comprehensive Tests for OpenSearch Integration with Elysia.js
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Elysia } from "elysia";
import { OpenSearchClient } from "../opensearch/OpenSearchClient";
import { IndexManager } from "../opensearch/IndexManager";
import {
  SearchQuery,
  ServiceNowSearchPatterns,
} from "../opensearch/SearchQuery";
import { ServiceNowOpenSearchFactory } from "../opensearch/index";

// Mock OpenSearch Client
class MockOpenSearchClient {
  private indices = new Map<string, any[]>();
  private indexSettings = new Map<string, any>();
  private templates = new Map<string, any>();

  async index(params: any) {
    const { index, id, body } = params;

    if (!this.indices.has(index)) {
      this.indices.set(index, []);
    }

    const docs = this.indices.get(index)!;
    const existingIndex = docs.findIndex((doc) => doc._id === id);

    const document = {
      _index: index,
      _id: id,
      _source: body,
      _version: existingIndex >= 0 ? docs[existingIndex]._version + 1 : 1,
    };

    if (existingIndex >= 0) {
      docs[existingIndex] = document;
    } else {
      docs.push(document);
    }

    return {
      statusCode: 200,
      body: {
        _index: index,
        _id: id,
        _version: document._version,
        result: existingIndex >= 0 ? "updated" : "created",
      },
    };
  }

  async bulk(params: any) {
    const { body } = params;
    const results = [];

    for (let i = 0; i < body.length; i += 2) {
      const action = body[i];
      const doc = body[i + 1];

      const actionType = Object.keys(action)[0];
      const { _index, _id } = action[actionType];

      try {
        if (actionType === "index") {
          const result = await this.index({
            index: _index,
            id: _id,
            body: doc,
          });

          results.push({
            index: {
              _index,
              _id,
              _version: result.body._version,
              result: result.body.result,
              status: 201,
            },
          });
        }
      } catch (error) {
        results.push({
          index: {
            _index,
            _id,
            status: 400,
            error: { reason: error.message },
          },
        });
      }
    }

    return {
      statusCode: 200,
      body: {
        took: 10,
        errors: results.some((r) => r.index?.error),
        items: results,
      },
    };
  }

  async search(params: any) {
    const { index, body } = params;
    const indices = Array.isArray(index) ? index : [index];

    let allDocs: any[] = [];
    indices.forEach((idx) => {
      const pattern = idx.replace("*", "");
      for (const [indexName, docs] of this.indices) {
        if (indexName.startsWith(pattern)) {
          allDocs.push(...docs);
        }
      }
    });

    // Apply query filtering (simplified)
    let filteredDocs = allDocs;
    if (body?.query && body.query !== "match_all") {
      // Simple filtering for tests
      filteredDocs = allDocs.filter((doc) => {
        if (body.query.match) {
          const field = Object.keys(body.query.match)[0];
          const value = body.query.match[field];
          return doc._source[field]
            ?.toString()
            .toLowerCase()
            .includes(value.toString().toLowerCase());
        }
        return true;
      });
    }

    // Apply size and from
    const from = body?.from || 0;
    const size = body?.size || 10;
    const paginatedDocs = filteredDocs.slice(from, from + size);

    return {
      statusCode: 200,
      body: {
        took: 5,
        timed_out: false,
        hits: {
          total: { value: filteredDocs.length, relation: "eq" },
          max_score: 1.0,
          hits: paginatedDocs.map((doc) => ({
            ...doc,
            _score: 1.0,
          })),
        },
        aggregations: body?.aggs
          ? this.generateMockAggregations(filteredDocs, body.aggs)
          : undefined,
      },
    };
  }

  indices = {
    create: async (params: any) => ({
      statusCode: 200,
      body: {
        acknowledged: true,
        shards_acknowledged: true,
        index: params.index,
      },
    }),
    delete: async (params: any) => ({
      statusCode: 200,
      body: { acknowledged: true },
    }),
    exists: async (params: any) => ({
      statusCode: this.indices.has(params.index) ? 200 : 404,
    }),
    putTemplate: async (params: any) => {
      this.templates.set(params.name, params.body);
      return { statusCode: 200, body: { acknowledged: true } };
    },
    getSettings: async (params: any) => {
      const settings = this.indexSettings.get(params.index) || {};
      return {
        statusCode: 200,
        body: {
          [params.index]: {
            settings: { index: settings },
          },
        },
      };
    },
    putSettings: async (params: any) => {
      this.indexSettings.set(params.index, params.body.settings);
      return { statusCode: 200, body: { acknowledged: true } };
    },
    refresh: async (params: any) => ({
      statusCode: 200,
      body: { _shards: { total: 1, successful: 1, failed: 0 } },
    }),
    stats: async (params: any) => {
      const indexName = params.index;
      const docs = this.indices.get(indexName) || [];

      return {
        statusCode: 200,
        body: {
          indices: {
            [indexName]: {
              total: {
                docs: { count: docs.length },
                store: { size_in_bytes: docs.length * 1000 },
                segments: {
                  count: Math.max(1, Math.floor(docs.length / 1000)),
                },
                search: { query_total: 100 },
                indexing: { index_total: docs.length },
              },
              primaries: {
                docs: { count: docs.length },
                store: { size_in_bytes: docs.length * 800 },
                segments: {
                  count: Math.max(1, Math.floor(docs.length / 1000)),
                },
              },
            },
          },
        },
      };
    },
    forcemerge: async (params: any) => ({
      statusCode: 200,
      body: { _shards: { total: 1, successful: 1, failed: 0 } },
    }),
  };

  cluster = {
    health: async (params?: any) => ({
      statusCode: 200,
      body: {
        cluster_name: "test-cluster",
        status: "green",
        timed_out: false,
        number_of_nodes: 1,
        number_of_data_nodes: 1,
        active_primary_shards: 5,
        active_shards: 5,
        relocating_shards: 0,
        initializing_shards: 0,
        unassigned_shards: 0,
        number_of_indices: this.indices.size,
        indices: params?.index
          ? {
              [params.index]: {
                status: "green",
                number_of_shards: 1,
                number_of_replicas: 0,
              },
            }
          : undefined,
      },
    }),
  };

  cat = {
    indices: async (params: any) => {
      const indices = Array.from(this.indices.keys()).filter(
        (name) =>
          params.index === "*" ||
          name.startsWith(params.index.replace("*", "")),
      );

      return {
        statusCode: 200,
        body: indices.map((index) => ({ index })),
      };
    },
  };

  private generateMockAggregations(docs: any[], aggs: any): any {
    const results: any = {};

    for (const [aggName, aggConfig] of Object.entries(aggs)) {
      const config = aggConfig as any;

      if (config.terms) {
        const field = config.terms.field;
        const buckets = new Map<string, number>();

        docs.forEach((doc) => {
          const value = doc._source[field];
          if (value) {
            buckets.set(value, (buckets.get(value) || 0) + 1);
          }
        });

        results[aggName] = {
          buckets: Array.from(buckets.entries())
            .map(([key, count]) => ({
              key,
              doc_count: count,
            }))
            .slice(0, config.terms.size || 10),
        };
      }

      if (config.date_histogram) {
        results[aggName] = {
          buckets: [
            {
              key_as_string: "2025-01-01",
              key: 1704067200000,
              doc_count: Math.floor(docs.length / 3),
            },
            {
              key_as_string: "2025-01-02",
              key: 1704153600000,
              doc_count: Math.floor(docs.length / 3),
            },
            {
              key_as_string: "2025-01-03",
              key: 1704240000000,
              doc_count: Math.floor(docs.length / 3),
            },
          ],
        };
      }
    }

    return results;
  }
}

// Test data
const sampleServiceNowData = {
  incidents: [
    {
      sys_id: "inc001",
      number: "INC0000001",
      short_description: "Database connection timeout",
      description: "Users unable to connect to main database server",
      priority: "1",
      state: "2",
      impact: "1",
      urgency: "1",
      category: "Database",
      subcategory: "Connection",
      assignment_group: "Database Team",
      assigned_to: "db.admin",
      caller_id: "john.doe",
      sys_created_on: "2025-01-01T10:00:00Z",
      sys_updated_on: "2025-01-01T10:30:00Z",
    },
    {
      sys_id: "inc002",
      number: "INC0000002",
      short_description: "Email server down",
      description: "Exchange server not responding to client requests",
      priority: "2",
      state: "1",
      impact: "2",
      urgency: "2",
      category: "Email",
      subcategory: "Server",
      assignment_group: "Email Team",
      assigned_to: "email.admin",
      caller_id: "jane.smith",
      sys_created_on: "2025-01-02T09:00:00Z",
      sys_updated_on: "2025-01-02T09:15:00Z",
    },
  ],
};

describe("OpenSearchClient with Elysia Integration", () => {
  let client: OpenSearchClient;
  let mockClient: MockOpenSearchClient;
  let app: Elysia;

  beforeEach(() => {
    mockClient = new MockOpenSearchClient();
    client = new OpenSearchClient({
      host: "localhost",
      port: 9200,
      auth: {
        username: "admin",
        password: "admin",
      },
      ssl: {
        enabled: false,
      },
      requestTimeout: 30000,
      maxRetries: 3,
      enableCompression: true,
      enableKeepAlive: true,
    });

    // Override with mock client
    (client as any).client = mockClient;

    // Create Elysia app with OpenSearch endpoints
    app = new Elysia()
      .derive(async () => ({ searchClient: client }))
      .group("/search", (app) =>
        app
          .post("/incident", async ({ body, searchClient }) => {
            const result = await searchClient.indexDocument(
              "servicenow-incidents-write",
              (body as any).sys_id,
              body as any,
            );
            return result;
          })
          .get("/incident/:id", async ({ params, searchClient }) => {
            const result = await searchClient.getDocument(
              "servicenow-incidents-*",
              params.id,
            );
            return result;
          })
          .post("/bulk", async ({ body, searchClient }) => {
            const operations = body as any[];
            const result = await searchClient.bulkIndex(operations);
            return result;
          })
          .post("/query", async ({ body, searchClient }) => {
            const searchQuery = body as any;
            const result = await searchClient.search(searchQuery);
            return result;
          }),
      );
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it("should index ServiceNow incident via Elysia endpoint", async () => {
    const incident = sampleServiceNowData.incidents[0];

    const response = await app.handle(
      new Request("http://localhost/search/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(incident),
      }),
    );

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.documentId).toBe(incident.sys_id);
  });

  it("should perform bulk indexing with error handling", async () => {
    const operations = sampleServiceNowData.incidents.map((incident) => ({
      index: {
        _index: "servicenow-incidents-write",
        _id: incident.sys_id,
      },
      document: incident,
    }));

    const response = await app.handle(
      new Request("http://localhost/search/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operations),
      }),
    );

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.indexed).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it("should execute complex search queries", async () => {
    // First index some data
    for (const incident of sampleServiceNowData.incidents) {
      await mockClient.index({
        index: "servicenow-incidents-001",
        id: incident.sys_id,
        body: incident,
      });
    }

    const searchQuery = {
      query: {
        bool: {
          must: [{ match: { category: "Database" } }],
          filter: [{ term: { priority: "1" } }],
        },
      },
      aggs: {
        by_priority: {
          terms: { field: "priority", size: 5 },
        },
        by_assignment_group: {
          terms: { field: "assignment_group", size: 10 },
        },
      },
    };

    const response = await app.handle(
      new Request("http://localhost/search/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchQuery),
      }),
    );

    const result = await response.json();
    expect(result.hits).toBeDefined();
    expect(result.total).toBeGreaterThan(0);
    expect(result.aggregations).toBeDefined();
  });

  it("should handle high-volume indexing efficiently", async () => {
    const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
      sys_id: `bulk_inc_${i}`,
      number: `INC${String(i).padStart(7, "0")}`,
      short_description: `Bulk test incident ${i}`,
      description: `This is bulk test incident number ${i} for performance testing`,
      priority: String((i % 4) + 1),
      state: String((i % 6) + 1),
      category: ["Database", "Network", "Application", "Hardware"][i % 4],
      assignment_group: [
        "Database Team",
        "Network Team",
        "App Team",
        "Hardware Team",
      ][i % 4],
      sys_created_on: new Date(Date.now() - i * 1000).toISOString(),
    }));

    const bulkOperations = largeDataset.map((doc) => ({
      index: {
        _index: "servicenow-incidents-bulk",
        _id: doc.sys_id,
      },
      document: doc,
    }));

    const startTime = Date.now();
    const response = await app.handle(
      new Request("http://localhost/search/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bulkOperations),
      }),
    );

    const result = await response.json();
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.indexed).toBe(10000);
    expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

    const throughput = result.indexed / (duration / 1000);
    expect(throughput).toBeGreaterThan(100); // At least 100 docs/second
  });

  it("should support ServiceNow-specific search patterns", async () => {
    // Index test data
    for (const incident of sampleServiceNowData.incidents) {
      await mockClient.index({
        index: "servicenow-incidents-001",
        id: incident.sys_id,
        body: incident,
      });
    }

    // Test incident search
    const incidentQuery = SearchQuery.builder()
      .searchIncidents("database timeout", {
        includeResolved: false,
        priority: ["1", "2"],
      })
      .incidentAnalytics()
      .build();

    const searchResult = await client.search(incidentQuery, {
      indices: ["servicenow-incidents-*"],
    });

    expect(searchResult.hits.length).toBeGreaterThan(0);
    expect(searchResult.aggregations).toBeDefined();
  });

  it("should provide comprehensive search analytics", async () => {
    // Index incidents across multiple days
    const analyticsData = Array.from({ length: 100 }, (_, i) => ({
      sys_id: `analytics_${i}`,
      number: `INC${String(i).padStart(7, "0")}`,
      short_description: `Analytics test ${i}`,
      priority: String((i % 4) + 1),
      state: String((i % 8) + 1),
      category: ["Database", "Network", "Application"][i % 3],
      assignment_group: ["Team A", "Team B", "Team C"][i % 3],
      sys_created_on: new Date(Date.now() - i * 86400000).toISOString(), // One per day
    }));

    // Bulk index analytics data
    const bulkOps = analyticsData.map((doc) => ({
      index: { _index: "servicenow-incidents-analytics", _id: doc.sys_id },
      document: doc,
    }));

    await client.bulkIndex(bulkOps);

    // Run analytics query
    const analyticsQuery = SearchQuery.incidentTrendAnalysis(30);
    const result = await client.search(analyticsQuery.build(), {
      indices: ["servicenow-incidents-analytics"],
    });

    expect(result.aggregations).toBeDefined();
    expect(result.aggregations.daily_incidents).toBeDefined();
    expect(result.aggregations.top_categories).toBeDefined();
    expect(result.aggregations.resolution_stats).toBeDefined();
  });
});

describe("IndexManager with Elysia Admin API", () => {
  let indexManager: IndexManager;
  let openSearchClient: OpenSearchClient;
  let mockClient: MockOpenSearchClient;
  let app: Elysia;

  beforeEach(() => {
    mockClient = new MockOpenSearchClient();
    openSearchClient = new OpenSearchClient({
      host: "localhost",
      port: 9200,
    });
    (openSearchClient as any).client = mockClient;

    indexManager = new IndexManager(openSearchClient);

    // Create Elysia admin app
    app = new Elysia()
      .derive(async () => ({ indexManager }))
      .group("/admin/indices", (app) =>
        app
          .post("/template/:table", async ({ params, body, indexManager }) => {
            const options = body as any;
            const result = await indexManager.createServiceNowTemplate(
              params.table,
              options,
            );
            return { success: result, table: params.table };
          })
          .post("/optimize/:index", async ({ params, indexManager }) => {
            const result = await indexManager.optimizeIndex(params.index);
            return { success: result, index: params.index };
          })
          .get("/metrics/:index", async ({ params, indexManager }) => {
            const metrics = await indexManager.getIndexMetrics(params.index);
            return metrics;
          })
          .get("/suggestions", async ({ indexManager }) => {
            const suggestions = await indexManager.getOptimizationSuggestions();
            return { suggestions };
          })
          .post("/auto-optimize", async ({ body, indexManager }) => {
            const options = body as any;
            const result = await indexManager.autoOptimize([], options);
            return result;
          }),
      );
  });

  it("should create ServiceNow index templates via Elysia admin API", async () => {
    const templateOptions = {
      rolloverSize: "50gb",
      rolloverAge: "30d",
      replicas: 1,
      shards: 2,
    };

    const response = await app.handle(
      new Request("http://localhost/admin/indices/template/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateOptions),
      }),
    );

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.table).toBe("incident");
  });

  it("should provide index optimization recommendations", async () => {
    // Create some mock indices with different characteristics
    await Promise.all([
      mockClient.index({
        index: "servicenow-incidents-001",
        id: "test1",
        body: sampleServiceNowData.incidents[0],
      }),
      mockClient.index({
        index: "servicenow-problems-001",
        id: "test2",
        body: { sys_id: "prb001", priority: "2" },
      }),
    ]);

    const response = await app.handle(
      new Request("http://localhost/admin/indices/suggestions"),
    );
    const result = await response.json();

    expect(result.suggestions).toBeDefined();
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("should execute auto-optimization with safety controls", async () => {
    const optimizationOptions = {
      maxActions: 5,
      onlyHighPriority: true,
      dryRun: true,
    };

    const response = await app.handle(
      new Request("http://localhost/admin/indices/auto-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optimizationOptions),
      }),
    );

    const result = await response.json();
    expect(result.executed).toBeDefined();
    expect(result.skipped).toBeDefined();
    expect(result.errors).toBeDefined();
    expect(result.actions).toBeDefined();
  });

  it("should monitor index health and performance", async () => {
    // Start monitoring
    indexManager.startMonitoring(5000);

    await new Promise((resolve) => setTimeout(resolve, 6000)); // Wait for monitoring cycle

    const response = await app.handle(
      new Request(
        "http://localhost/admin/indices/metrics/servicenow-incidents-001",
      ),
    );
    const metrics = await response.json();

    if (metrics) {
      expect(metrics.name).toBe("servicenow-incidents-001");
      expect(metrics.status).toBeDefined();
      expect(metrics.documentsCount).toBeDefined();
      expect(metrics.primarySize).toBeDefined();
    }

    indexManager.stopMonitoring();
  });
});

describe("ServiceNowOpenSearchFactory Integration", () => {
  let factory: ServiceNowOpenSearchFactory;
  let mockClient: MockOpenSearchClient;
  let app: Elysia;

  beforeEach(() => {
    mockClient = new MockOpenSearchClient();

    factory = new ServiceNowOpenSearchFactory({
      host: "localhost",
      port: 9200,
      auth: { username: "admin", password: "admin" },
    });

    // Override client with mock
    (factory.getClient() as any).client = mockClient;

    // Create comprehensive ServiceNow search API
    app = new Elysia()
      .derive(async () => ({ searchFactory: factory }))
      .group("/servicenow-search", (app) =>
        app
          .post("/initialize", async ({ body, searchFactory }) => {
            const tables = body as string[];
            const result =
              await searchFactory.initializeServiceNowSearch(tables);
            return result;
          })
          .post("/index/:table", async ({ params, body, searchFactory }) => {
            const records = body as any[];
            const result = await searchFactory.indexServiceNowData(
              params.table,
              records,
              { batchSize: 1000, refreshIndex: true },
            );
            return result;
          })
          .post("/search", async ({ body, searchFactory }) => {
            const { query, options } = body as any;
            const result = await searchFactory.intelligentSearch(
              query,
              options,
            );
            return result;
          })
          .get("/analytics", async ({ query, searchFactory }) => {
            const timeRange = {
              from: new Date(query.from as string),
              to: new Date(query.to as string),
            };
            const result =
              await searchFactory.generateAnalyticsDashboard(timeRange);
            return result;
          })
          .get("/health", async ({ searchFactory }) => {
            const health = await searchFactory.getHealthStatus();
            return health;
          }),
      );
  });

  afterEach(async () => {
    await factory.getClient().disconnect();
  });

  it("should initialize complete ServiceNow search infrastructure", async () => {
    const tables = ["incident", "problem", "change_request"];

    const response = await app.handle(
      new Request("http://localhost/servicenow-search/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tables),
      }),
    );

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.initializedTables.length).toBe(3);
    expect(result.indexTemplatesCreated).toBe(3);
    expect(result.errors.length).toBe(0);
  });

  it("should perform intelligent search with suggestions", async () => {
    // First index some data
    await app.handle(
      new Request("http://localhost/servicenow-search/index/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sampleServiceNowData.incidents),
      }),
    );

    // Then search with intelligence features
    const searchRequest = {
      query: "database connection",
      options: {
        tables: ["incident"],
        maxResults: 10,
        includeAggregations: true,
        autoSuggest: true,
      },
    };

    const response = await app.handle(
      new Request("http://localhost/servicenow-search/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchRequest),
      }),
    );

    const result = await response.json();
    expect(result.results).toBeDefined();
    expect(result.total).toBeGreaterThan(0);
    expect(result.suggestions).toBeDefined();
    expect(result.aggregations).toBeDefined();
    expect(result.searchTime).toBeGreaterThan(0);
  });

  it("should generate comprehensive analytics dashboard", async () => {
    // Index analytics test data
    const analyticsData = Array.from({ length: 200 }, (_, i) => ({
      sys_id: `analytics_${i}`,
      number: `INC${String(i).padStart(7, "0")}`,
      short_description: `Analytics incident ${i}`,
      priority: String((i % 4) + 1),
      state: String((i % 8) + 1),
      category: ["Database", "Network", "Application", "Hardware"][i % 4],
      assignment_group: ["Team A", "Team B", "Team C", "Team D"][i % 4],
      sys_created_on: new Date(Date.now() - i * 3600000).toISOString(), // One per hour
      resolved_at:
        i % 3 === 0
          ? new Date(Date.now() - i * 3600000 + 7200000).toISOString()
          : undefined, // Some resolved
    }));

    await app.handle(
      new Request("http://localhost/servicenow-search/index/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analyticsData),
      }),
    );

    // Generate analytics
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const to = new Date();

    const response = await app.handle(
      new Request(
        `http://localhost/servicenow-search/analytics?from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
    );
    const analytics = await response.json();

    expect(analytics.overview).toBeDefined();
    expect(analytics.overview.totalTickets).toBeGreaterThan(0);
    expect(analytics.overview.openTickets).toBeGreaterThan(0);
    expect(analytics.trends).toBeDefined();
    expect(analytics.topCategories).toBeDefined();
  });

  it("should provide system health monitoring", async () => {
    const response = await app.handle(
      new Request("http://localhost/servicenow-search/health"),
    );
    const health = await response.json();

    expect(health.cluster).toBeDefined();
    expect(health.cluster.status).toBeDefined();
    expect(health.servicenow).toBeDefined();
    expect(health.performance).toBeDefined();
    expect(health.recommendations).toBeDefined();
  });

  it("should handle search performance under load", async () => {
    // Index large dataset for performance testing
    const largeDataset = Array.from({ length: 5000 }, (_, i) => ({
      sys_id: `perf_${i}`,
      number: `INC${String(i).padStart(7, "0")}`,
      short_description: `Performance test incident ${i}`,
      description: `This is performance test incident ${i} with detailed description for testing search capabilities`,
      priority: String((i % 4) + 1),
      state: String((i % 6) + 1),
      category: ["Database", "Network", "Application", "Hardware", "Security"][
        i % 5
      ],
      assignment_group: `Team_${i % 10}`,
      caller_id: `user_${i % 100}`,
      sys_created_on: new Date(Date.now() - i * 60000).toISOString(),
    }));

    await app.handle(
      new Request("http://localhost/servicenow-search/index/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(largeDataset),
      }),
    );

    // Perform multiple concurrent searches
    const searchPromises = Array.from({ length: 10 }, (_, i) =>
      app.handle(
        new Request("http://localhost/servicenow-search/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `performance test ${i}`,
            options: {
              tables: ["incident"],
              maxResults: 50,
              includeAggregations: true,
            },
          }),
        }),
      ),
    );

    const startTime = Date.now();
    const responses = await Promise.all(searchPromises);
    const duration = Date.now() - startTime;

    const results = await Promise.all(responses.map((r) => r.json()));

    expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    results.forEach((result) => {
      expect(result.results).toBeDefined();
      expect(result.searchTime).toBeLessThan(5000); // Each search under 5 seconds
    });
  });
});
