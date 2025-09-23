/**
 * OpenSearch Neural Search Setup Script
 * Configures neural search plugin, models, and indices for ServiceNow integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { OpenSearchClient } from "../src/clients/OpenSearchClient";
import { logger } from "../src/utils/Logger";

interface NeuralModel {
  name: string;
  version: string;
  model_format: string;
  model_config: {
    model_type: string;
    embedding_dimension: number;
    framework_type: string;
    all_config?: string;
  };
  url?: string;
}

interface IndexTemplate {
  name: string;
  mappings: {
    properties: Record<string, any>;
  };
  settings: {
    index: Record<string, any>;
    "knn.algo_param.ef_search"?: number;
  };
}

export class OpenSearchNeuralSetup {
  private client: OpenSearchClient;
  private baseUrl: string;

  constructor() {
    const config = {
      host: process.env.OPENSEARCH_HOST || "10.219.8.210",
      port: parseInt(process.env.OPENSEARCH_PORT || "9200"),
      ssl: false,
      timeout: 60000,
    };

    this.client = new OpenSearchClient(config);
    this.baseUrl = `http://${config.host}:${config.port}`;
  }

  private async makeRequest(endpoint: string, method: string = "GET", body?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Skip authentication for now due to cluster issues
    // if (process.env.OPENSEARCH_USERNAME && process.env.OPENSEARCH_PASSWORD) {
    //   const credentials = btoa(`${process.env.OPENSEARCH_USERNAME}:${process.env.OPENSEARCH_PASSWORD}`);
    //   headers["Authorization"] = `Basic ${credentials}`;
    // }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error: unknown) {
      logger.error(`OpenSearch request failed: ${method} ${endpoint}`, error);
      throw error;
    }
  }

  async checkClusterHealth(): Promise<void> {
    try {
      logger.info("🔍 Checking OpenSearch cluster health...");
      const health = await this.makeRequest("/_cluster/health");
      logger.info(`✅ Cluster status: ${health.status} (${health.number_of_nodes} nodes)`);

      if (health.status === "red") {
        logger.warn("⚠️ Cluster is in RED status - will proceed with caution");
      }
    } catch (error: unknown) {
      logger.error("❌ Failed to check cluster health:", error);
      throw error;
    }
  }

  async checkNeuralSearchPlugin(): Promise<boolean> {
    try {
      logger.info("🔍 Checking neural search plugin installation...");
      const plugins = await this.makeRequest("/_cat/plugins?format=json");

      const neuralPlugin = plugins.find((p: any) =>
        p.component === "opensearch-neural-search" ||
        p.name === "opensearch-neural-search"
      );

      if (neuralPlugin) {
        logger.info(`✅ Neural search plugin found: ${neuralPlugin.version || "installed"}`);
        return true;
      } else {
        logger.warn("⚠️ Neural search plugin not found");
        return false;
      }
    } catch (error: unknown) {
      logger.error("❌ Failed to check neural search plugin:", error);
      return false;
    }
  }

  async setupMLModels(): Promise<void> {
    try {
      logger.info("🤖 Setting up ML models for neural search...");

      // Check if models are already registered
      const models = await this.makeRequest("/_plugins/_ml/models?size=100");

      const sentenceTransformerModel = models.hits?.hits?.find((hit: any) =>
        hit._source?.name?.includes("sentence-transformers") ||
        hit._source?.name?.includes("all-MiniLM-L6-v2")
      );

      if (sentenceTransformerModel) {
        logger.info("✅ Sentence transformer model already registered");
        return;
      }

      // Register a lightweight sentence transformer model
      const modelConfig: NeuralModel = {
        name: "sentence-transformers/all-MiniLM-L6-v2",
        version: "1.0.1",
        model_format: "TORCH_SCRIPT",
        model_config: {
          model_type: "bert",
          embedding_dimension: 384,
          framework_type: "sentence_transformers",
          all_config: JSON.stringify({
            "sentence_transformers_config": {
              "do_lower_case": true,
              "model_max_length": 512,
              "pooling_mode": "mean_pooling"
            }
          })
        }
      };

      logger.info("📥 Registering sentence transformer model...");
      const registerResponse = await this.makeRequest(
        "/_plugins/_ml/models/_register",
        "POST",
        modelConfig
      );

      if (registerResponse.task_id) {
        logger.info(`⏳ Model registration started with task ID: ${registerResponse.task_id}`);
        await this.waitForTask(registerResponse.task_id);
      }

    } catch (error: unknown) {
      logger.error("❌ Failed to setup ML models:", error);
      // Don't throw - we'll use fallback
      logger.warn("⚠️ Continuing without neural models - will use traditional search");
    }
  }

  private async waitForTask(taskId: string, maxWaitTime: number = 300000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 5000; // 5 seconds

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const task = await this.makeRequest(`/_plugins/_ml/tasks/${taskId}`);

        if (task.state === "COMPLETED") {
          logger.info("✅ Model registration completed successfully");
          return;
        } else if (task.state === "FAILED") {
          throw new Error(`Model registration failed: ${task.error || "Unknown error"}`);
        }

        logger.info(`⏳ Task status: ${task.state}, waiting...`);
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error: unknown) {
        logger.error("❌ Failed to check task status:", error);
        throw error;
      }
    }

    throw new Error(`Task ${taskId} did not complete within ${maxWaitTime}ms`);
  }

  async createSearchIndices(): Promise<void> {
    try {
      logger.info("📝 Creating neural search indices...");

      const indices: IndexTemplate[] = [
        {
          name: "servicenow_tickets",
          mappings: {
            properties: {
              sys_id: { type: "keyword" },
              number: { type: "keyword" },
              table: { type: "keyword" },
              title: {
                type: "text",
                analyzer: "standard",
                search_analyzer: "standard"
              },
              description: {
                type: "text",
                analyzer: "standard"
              },
              content: {
                type: "text",
                analyzer: "standard"
              },
              content_embedding: {
                type: "knn_vector",
                dimension: 384,
                method: {
                  name: "hnsw",
                  space_type: "cosinesimil",
                  engine: "nmslib",
                  parameters: {
                    ef_construction: 200,
                    m: 16
                  }
                }
              },
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
            index: {
              "knn": true,
              "knn.algo_param.ef_search": 100,
              "number_of_shards": 2,
              "number_of_replicas": 0
            }
          }
        },
        {
          name: "knowledge_base",
          mappings: {
            properties: {
              id: { type: "keyword" },
              title: {
                type: "text",
                analyzer: "standard",
                search_analyzer: "standard"
              },
              content: {
                type: "text",
                analyzer: "standard"
              },
              content_embedding: {
                type: "knn_vector",
                dimension: 384,
                method: {
                  name: "hnsw",
                  space_type: "cosinesimil",
                  engine: "nmslib",
                  parameters: {
                    ef_construction: 200,
                    m: 16
                  }
                }
              },
              category: { type: "keyword" },
              support_group: { type: "keyword" },
              document_type: { type: "keyword" },
              created_at: { type: "date" },
              updated_at: { type: "date" },
              tags: { type: "keyword" }
            }
          },
          settings: {
            index: {
              "knn": true,
              "knn.algo_param.ef_search": 100,
              "number_of_shards": 1,
              "number_of_replicas": 0
            }
          }
        }
      ];

      for (const indexTemplate of indices) {
        try {
          // Check if index already exists
          const exists = await this.makeRequest(`/${indexTemplate.name}`, "HEAD")
            .then(() => true)
            .catch(() => false);

          if (exists) {
            logger.info(`✅ Index ${indexTemplate.name} already exists`);
            continue;
          }

          // Create the index
          await this.makeRequest(
            `/${indexTemplate.name}`,
            "PUT",
            {
              mappings: indexTemplate.mappings,
              settings: indexTemplate.settings
            }
          );

          logger.info(`✅ Created index: ${indexTemplate.name}`);
        } catch (error: unknown) {
          logger.error(`❌ Failed to create index ${indexTemplate.name}:`, error);
          // Continue with other indices
        }
      }

    } catch (error: unknown) {
      logger.error("❌ Failed to create search indices:", error);
      throw error;
    }
  }

  async setupIngestPipeline(): Promise<void> {
    try {
      logger.info("⚙️ Setting up neural search ingest pipeline...");

      const pipelineConfig = {
        description: "Neural search pipeline for ServiceNow tickets",
        processors: [
          {
            text_embedding: {
              model_id: "sentence-transformers/all-MiniLM-L6-v2",
              field_map: {
                content: "content_embedding"
              }
            }
          }
        ]
      };

      await this.makeRequest(
        "/_ingest/pipeline/neural_search_pipeline",
        "PUT",
        pipelineConfig
      );

      logger.info("✅ Neural search ingest pipeline created");
    } catch (error: unknown) {
      logger.error("❌ Failed to setup ingest pipeline:", error);
      // Continue without pipeline - embeddings can be generated externally
      logger.warn("⚠️ Continuing without ingest pipeline - embeddings must be generated externally");
    }
  }

  async testNeuralSearch(): Promise<void> {
    try {
      logger.info("🧪 Testing neural search functionality...");

      // Test with a simple document
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

      // Index test document
      await this.makeRequest(
        "/knowledge_base/_doc/test_doc_1?pipeline=neural_search_pipeline",
        "PUT",
        testDoc
      );

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test neural search
      const searchQuery = {
        size: 5,
        query: {
          neural: {
            content_embedding: {
              query_text: "database connectivity problems",
              model_id: "sentence-transformers/all-MiniLM-L6-v2",
              k: 10
            }
          }
        }
      };

      const searchResults = await this.makeRequest(
        "/knowledge_base/_search",
        "POST",
        searchQuery
      );

      if (searchResults.hits.total.value > 0) {
        logger.info("✅ Neural search test successful!");
        logger.info(`Found ${searchResults.hits.total.value} results`);
      } else {
        logger.warn("⚠️ Neural search test returned no results");
      }

      // Clean up test document
      await this.makeRequest("/knowledge_base/_doc/test_doc_1", "DELETE")
        .catch(() => {}); // Ignore errors

    } catch (error: unknown) {
      logger.error("❌ Neural search test failed:", error);
      logger.warn("⚠️ Neural search may not be fully functional");
    }
  }

  async run(): Promise<void> {
    try {
      logger.info("🚀 Starting OpenSearch Neural Search setup...");

      await this.checkClusterHealth();

      const hasNeuralPlugin = await this.checkNeuralSearchPlugin();
      if (!hasNeuralPlugin) {
        logger.warn("⚠️ Neural search plugin not installed. Install with:");
        logger.warn("bin/opensearch-plugin install https://github.com/opensearch-project/neural-search/releases/download/2.12.0.0/opensearch-neural-search-2.12.0.0.zip");
        logger.warn("Continuing with basic setup...");
      } else {
        await this.setupMLModels();
        await this.setupIngestPipeline();
      }

      await this.createSearchIndices();

      if (hasNeuralPlugin) {
        await this.testNeuralSearch();
      }

      logger.info("🎉 OpenSearch neural search setup completed!");

    } catch (error: unknown) {
      logger.error("❌ OpenSearch neural search setup failed:", error);
      process.exit(1);
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new OpenSearchNeuralSetup();
  setup.run().catch((error) => {
    logger.error("Setup failed:", error);
    process.exit(1);
  });
}