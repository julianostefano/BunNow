/**
 * OpenSearch Connection Test Script
 * Tests connectivity and basic functionality before neural search setup
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from "../src/utils/Logger";

interface OpenSearchInfo {
  name: string;
  cluster_name: string;
  cluster_uuid: string;
  version: {
    distribution: string;
    number: string;
    build_type: string;
    build_hash: string;
    build_date: string;
    build_snapshot: boolean;
    lucene_version: string;
    minimum_wire_compatibility_version: string;
    minimum_index_compatibility_version: string;
  };
  tagline: string;
}

export class OpenSearchConnectionTest {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    const host = process.env.OPENSEARCH_HOST || "10.219.8.210";
    const port = process.env.OPENSEARCH_PORT || "9200";
    const username = process.env.OPENSEARCH_USERNAME || "admin";
    const password = process.env.OPENSEARCH_PASSWORD || "admin";

    this.baseUrl = `http://${host}:${port}`;
    this.headers = {
      "Content-Type": "application/json",
    };

    if (username && password) {
      const credentials = btoa(`${username}:${password}`);
      this.headers["Authorization"] = `Basic ${credentials}`;
    }

    logger.info(`🔗 Testing OpenSearch connection to: ${this.baseUrl}`);
  }

  private async makeRequest(endpoint: string, method: string = "GET", body?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "TimeoutError") {
          throw new Error(`Request timeout: ${endpoint}`);
        }
        if (error.message.includes("ECONNREFUSED")) {
          throw new Error(`Connection refused: OpenSearch may not be running at ${this.baseUrl}`);
        }
        if (error.message.includes("ENOTFOUND")) {
          throw new Error(`Host not found: ${this.baseUrl}`);
        }
      }
      throw error;
    }
  }

  async testBasicConnection(): Promise<OpenSearchInfo> {
    try {
      logger.info("🔍 Testing basic OpenSearch connection...");
      const info = await this.makeRequest("/");

      logger.info("✅ Connection successful!");
      logger.info(`   Distribution: ${info.version.distribution}`);
      logger.info(`   Version: ${info.version.number}`);
      logger.info(`   Cluster: ${info.cluster_name}`);

      return info;
    } catch (error: unknown) {
      logger.error("❌ Basic connection failed:", error);
      throw error;
    }
  }

  async testClusterHealth(): Promise<any> {
    try {
      logger.info("🏥 Checking cluster health...");
      const health = await this.makeRequest("/_cluster/health");

      const statusEmoji = {
        green: "🟢",
        yellow: "🟡",
        red: "🔴"
      }[health.status] || "⚪";

      logger.info(`${statusEmoji} Cluster status: ${health.status}`);
      logger.info(`   Nodes: ${health.number_of_nodes} (${health.number_of_data_nodes} data nodes)`);
      logger.info(`   Shards: ${health.active_shards} active, ${health.unassigned_shards} unassigned`);

      if (health.status === "red") {
        logger.warn("⚠️ Cluster is in RED state - some functionality may be limited");
      }

      return health;
    } catch (error: unknown) {
      logger.error("❌ Cluster health check failed:", error);
      throw error;
    }
  }

  async testAuthentication(): Promise<void> {
    try {
      logger.info("🔐 Testing authentication...");
      const security = await this.makeRequest("/_plugins/_security/whoami");

      logger.info("✅ Authentication successful!");
      logger.info(`   User: ${security.user_name || "Unknown"}`);
      logger.info(`   Roles: ${(security.roles || []).join(", ") || "None"}`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("404")) {
        logger.info("ℹ️ Security plugin not available or authentication disabled");
      } else {
        logger.error("❌ Authentication test failed:", error);
        throw error;
      }
    }
  }

  async testPlugins(): Promise<any[]> {
    try {
      logger.info("🔌 Checking installed plugins...");
      const plugins = await this.makeRequest("/_cat/plugins?format=json");

      if (plugins.length === 0) {
        logger.info("ℹ️ No plugins installed");
        return [];
      }

      logger.info("✅ Installed plugins:");
      plugins.forEach((plugin: any) => {
        logger.info(`   - ${plugin.component || plugin.name}: ${plugin.version || "unknown version"}`);
      });

      // Check for neural search plugin specifically
      const neuralPlugin = plugins.find((p: any) =>
        (p.component || p.name || "").includes("neural")
      );

      if (neuralPlugin) {
        logger.info("🧠 Neural search plugin detected!");
      } else {
        logger.warn("⚠️ Neural search plugin not found");
      }

      return plugins;
    } catch (error: unknown) {
      logger.error("❌ Plugin check failed:", error);
      throw error;
    }
  }

  async testIndexOperations(): Promise<void> {
    try {
      logger.info("📝 Testing index operations...");

      const testIndexName = "connection_test_index";

      // Create test index
      const indexConfig = {
        mappings: {
          properties: {
            title: { type: "text" },
            content: { type: "text" },
            timestamp: { type: "date" }
          }
        },
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0
        }
      };

      await this.makeRequest(`/${testIndexName}`, "PUT", indexConfig);
      logger.info("✅ Index creation successful");

      // Index a test document
      const testDoc = {
        title: "Connection Test Document",
        content: "This is a test document to verify OpenSearch functionality",
        timestamp: new Date().toISOString()
      };

      await this.makeRequest(`/${testIndexName}/_doc/1`, "PUT", testDoc);
      logger.info("✅ Document indexing successful");

      // Wait a moment for indexing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Search for the document
      const searchQuery = {
        query: {
          match: {
            content: "test"
          }
        }
      };

      const searchResult = await this.makeRequest(`/${testIndexName}/_search`, "POST", searchQuery);

      if (searchResult.hits.total.value > 0) {
        logger.info("✅ Search functionality working");
      } else {
        logger.warn("⚠️ Search returned no results");
      }

      // Clean up test index
      await this.makeRequest(`/${testIndexName}`, "DELETE");
      logger.info("✅ Test index cleanup completed");

    } catch (error: unknown) {
      logger.error("❌ Index operations test failed:", error);
      throw error;
    }
  }

  async testMLCapabilities(): Promise<void> {
    try {
      logger.info("🤖 Testing ML capabilities...");

      // Check if ML plugin is available
      const nodes = await this.makeRequest("/_plugins/_ml/stats");
      logger.info("✅ ML plugin is available");
      logger.info(`   Algorithm stats: ${Object.keys(nodes.nodes || {}).length} nodes`);

    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("404")) {
        logger.info("ℹ️ ML plugin not available");
      } else {
        logger.error("❌ ML capabilities test failed:", error);
      }
    }
  }

  async runAllTests(): Promise<{
    success: boolean;
    info?: OpenSearchInfo;
    capabilities: string[];
    warnings: string[];
  }> {
    const capabilities: string[] = [];
    const warnings: string[] = [];

    try {
      logger.info("🚀 Starting comprehensive OpenSearch connection test...");
      logger.info("=" * 60);

      // Basic connection test
      const info = await this.testBasicConnection();
      capabilities.push("basic_connection");

      // Cluster health
      const health = await this.testClusterHealth();
      if (health.status !== "red") {
        capabilities.push("cluster_healthy");
      } else {
        warnings.push("Cluster in RED state");
      }

      // Authentication
      try {
        await this.testAuthentication();
        capabilities.push("authentication");
      } catch {
        warnings.push("Authentication issues detected");
      }

      // Plugins
      const plugins = await this.testPlugins();
      const hasNeuralPlugin = plugins.some((p: any) =>
        (p.component || p.name || "").includes("neural")
      );

      if (hasNeuralPlugin) {
        capabilities.push("neural_search_plugin");
      } else {
        warnings.push("Neural search plugin not installed");
      }

      // Index operations
      try {
        await this.testIndexOperations();
        capabilities.push("index_operations");
      } catch {
        warnings.push("Index operations issues detected");
      }

      // ML capabilities
      try {
        await this.testMLCapabilities();
        capabilities.push("ml_plugin");
      } catch {
        warnings.push("ML plugin not available");
      }

      logger.info("=" * 60);
      logger.info("🎉 Connection test completed!");
      logger.info(`✅ Capabilities: ${capabilities.join(", ")}`);

      if (warnings.length > 0) {
        logger.info(`⚠️ Warnings: ${warnings.join(", ")}`);
      }

      return {
        success: true,
        info,
        capabilities,
        warnings
      };

    } catch (error: unknown) {
      logger.error("=" * 60);
      logger.error("❌ Connection test failed:", error);

      return {
        success: false,
        capabilities,
        warnings: [...warnings, "Connection test failed"]
      };
    }
  }
}

// Run test if called directly
if (require.main === module) {
  const test = new OpenSearchConnectionTest();
  test.runAllTests().then(result => {
    if (result.success) {
      logger.info("✅ All tests completed successfully");
      process.exit(0);
    } else {
      logger.error("❌ Connection test failed");
      process.exit(1);
    }
  }).catch(error => {
    logger.error("Test runner failed:", error);
    process.exit(1);
  });
}