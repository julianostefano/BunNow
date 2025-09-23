/**
 * Simple OpenSearch Setup - Create basic indices for ServiceNow integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from "../src/utils/Logger";

export class SimpleOpenSearchSetup {
  private baseUrl: string;

  constructor() {
    const host = process.env.OPENSEARCH_HOST || "10.219.8.210";
    const port = process.env.OPENSEARCH_PORT || "9200";
    this.baseUrl = `http://${host}:${port}`;
  }

  private async makeRequest(endpoint: string, method: string = "GET", body?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 404 && method === "HEAD") {
        return null; // Index doesn't exist
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(`OpenSearch request failed: ${method} ${endpoint} - ${response.status}: ${errorText}`);
        return null;
      }

      if (method === "HEAD") {
        return true; // Index exists
      }

      return await response.json();
    } catch (error: unknown) {
      logger.warn(`OpenSearch request error: ${method} ${endpoint}`, error);
      return null;
    }
  }

  async createBasicIndices(): Promise<void> {
    logger.info("📝 Creating basic search indices for ServiceNow...");

    const indices = [
      {
        name: "servicenow_tickets",
        config: {
          mappings: {
            properties: {
              sys_id: { type: "keyword" },
              number: { type: "keyword" },
              table: { type: "keyword" },
              title: { type: "text", analyzer: "standard" },
              description: { type: "text", analyzer: "standard" },
              content: { type: "text", analyzer: "standard" },
              state: { type: "keyword" },
              priority: { type: "keyword" },
              assignment_group: { type: "keyword" },
              assigned_to: { type: "keyword" },
              created_on: { type: "date" },
              updated_on: { type: "date" },
              tags: { type: "keyword" }
            }
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0
          }
        }
      },
      {
        name: "knowledge_base",
        config: {
          mappings: {
            properties: {
              id: { type: "keyword" },
              title: { type: "text", analyzer: "standard" },
              content: { type: "text", analyzer: "standard" },
              category: { type: "keyword" },
              support_group: { type: "keyword" },
              document_type: { type: "keyword" },
              created_at: { type: "date" },
              updated_at: { type: "date" },
              tags: { type: "keyword" }
            }
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0
          }
        }
      }
    ];

    for (const index of indices) {
      try {
        // Check if index exists
        const exists = await this.makeRequest(`/${index.name}`, "HEAD");

        if (exists) {
          logger.info(`✅ Index ${index.name} already exists`);
          continue;
        }

        // Create index
        const result = await this.makeRequest(`/${index.name}`, "PUT", index.config);

        if (result) {
          logger.info(`✅ Created index: ${index.name}`);
        } else {
          logger.warn(`⚠️ Could not create index: ${index.name}`);
        }

      } catch (error: unknown) {
        logger.warn(`⚠️ Error with index ${index.name}:`, error);
      }
    }
  }

  async testBasicSearch(): Promise<void> {
    try {
      logger.info("🧪 Testing basic search functionality...");

      // Test document
      const testDoc = {
        id: "test_doc_1",
        title: "Database Connection Issue",
        content: "Unable to connect to production database server. Connection timeout after 30 seconds.",
        category: "database",
        support_group: "Database Administration",
        document_type: "troubleshooting",
        created_at: new Date().toISOString(),
        tags: ["database", "connection", "timeout"]
      };

      // Try to index document
      const indexResult = await this.makeRequest(
        "/knowledge_base/_doc/test_doc_1",
        "PUT",
        testDoc
      );

      if (indexResult) {
        logger.info("✅ Test document indexed successfully");

        // Wait for indexing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test search
        const searchQuery = {
          query: {
            match: {
              content: "database"
            }
          }
        };

        const searchResult = await this.makeRequest(
          "/knowledge_base/_search",
          "POST",
          searchQuery
        );

        if (searchResult && searchResult.hits.total.value > 0) {
          logger.info("✅ Basic search test successful!");
        } else {
          logger.warn("⚠️ Search test returned no results");
        }

        // Clean up
        await this.makeRequest("/knowledge_base/_doc/test_doc_1", "DELETE");

      } else {
        logger.warn("⚠️ Could not index test document");
      }

    } catch (error: unknown) {
      logger.warn("⚠️ Search test failed:", error);
    }
  }

  async run(): Promise<void> {
    try {
      logger.info("🚀 Starting simple OpenSearch setup...");

      // Test connection
      const health = await this.makeRequest("/_cluster/health");
      if (health) {
        logger.info(`✅ OpenSearch connected: ${health.status} cluster`);
      } else {
        logger.warn("⚠️ Could not connect to OpenSearch");
        return;
      }

      await this.createBasicIndices();
      await this.testBasicSearch();

      logger.info("🎉 Basic OpenSearch setup completed!");
      logger.info("📝 Next steps:");
      logger.info("   1. Update NeuralSearchService to use basic search");
      logger.info("   2. Implement document indexing from MongoDB");
      logger.info("   3. Configure neural search when cluster is stable");

    } catch (error: unknown) {
      logger.error("❌ Simple OpenSearch setup failed:", error);
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new SimpleOpenSearchSetup();
  setup.run().catch((error) => {
    logger.error("Setup failed:", error);
    process.exit(1);
  });
}