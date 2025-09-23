/**
 * Neural Search Service Test Script
 * Tests the updated NeuralSearchService with OpenSearch integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { neuralSearchService } from "../src/services/NeuralSearchService";
import { logger } from "../src/utils/Logger";

export class NeuralSearchTest {
  async testHealthStatus(): Promise<void> {
    try {
      logger.info("🏥 Testing NeuralSearchService health status...");
      const health = await neuralSearchService.getHealthStatus();

      logger.info("✅ Health Status Results:");
      logger.info(`   Overall Health: ${health.healthy ? "🟢 Healthy" : "🔴 Unhealthy"}`);
      logger.info(`   OpenSearch: ${health.services.openSearch.available ? "🟢 Available" : "🔴 Unavailable"}`);
      logger.info(`   Embedding: ${health.services.embedding.available ? "🟢 Available" : "🔴 Unavailable"}`);
      logger.info(`   Rerank: ${health.services.rerank.available ? "🟢 Available" : "🔴 Unavailable"}`);
      logger.info(`   MongoDB: ${health.services.mongodb.available ? "🟢 Available" : "🔴 Unavailable"} (${health.services.mongodb.ticketCount} tickets)`);

      if (health.services.openSearch.latency) {
        logger.info(`   OpenSearch Latency: ${health.services.openSearch.latency}ms`);
      }

    } catch (error: unknown) {
      logger.error("❌ Health status test failed:", error);
    }
  }

  async testSemanticSearch(): Promise<void> {
    try {
      logger.info("🧠 Testing semantic search functionality...");

      const testQueries = [
        "database connection timeout",
        "network connectivity issues",
        "application server restart",
        "user authentication problems",
      ];

      for (const query of testQueries) {
        logger.info(`\n🔍 Testing query: "${query}"`);

        const results = await neuralSearchService.search(query, {
          mode: "semantic",
          maxResults: 5,
          minScore: 0.1,
          enableRerank: false,
        });

        if (results.length > 0) {
          logger.info(`✅ Found ${results.length} results:`);
          results.forEach((result, index) => {
            logger.info(`   ${index + 1}. ${result.title} (score: ${result.score.toFixed(3)}, source: ${result.source})`);
          });
        } else {
          logger.info("ℹ️ No results found");
        }
      }

    } catch (error: unknown) {
      logger.error("❌ Semantic search test failed:", error);
    }
  }

  async testHybridSearch(): Promise<void> {
    try {
      logger.info("\n🔀 Testing hybrid search functionality...");

      const query = "incident priority high database";

      logger.info(`🔍 Testing hybrid query: "${query}"`);

      const results = await neuralSearchService.search(query, {
        mode: "hybrid",
        maxResults: 10,
        minScore: 0.05,
        enableRerank: false,
        filters: {
          table: "incident",
          status: "Database Administration",
        },
      });

      if (results.length > 0) {
        logger.info(`✅ Found ${results.length} hybrid results:`);
        results.forEach((result, index) => {
          logger.info(`   ${index + 1}. ${result.title}`);
          logger.info(`      Score: ${result.score.toFixed(3)}, Source: ${result.source}`);
          logger.info(`      Table: ${result.metadata.table}, Priority: ${result.metadata.priority}`);
        });
      } else {
        logger.info("ℹ️ No hybrid results found");
      }

    } catch (error: unknown) {
      logger.error("❌ Hybrid search test failed:", error);
    }
  }

  async testKeywordSearch(): Promise<void> {
    try {
      logger.info("\n🔤 Testing keyword search functionality...");

      const query = "timeout error";

      logger.info(`🔍 Testing keyword query: "${query}"`);

      const results = await neuralSearchService.search(query, {
        mode: "keyword",
        maxResults: 5,
        minScore: 0.1,
        enableRerank: false,
      });

      if (results.length > 0) {
        logger.info(`✅ Found ${results.length} keyword results:`);
        results.forEach((result, index) => {
          logger.info(`   ${index + 1}. ${result.title} (${result.source})`);
          logger.info(`      Content: ${result.content.substring(0, 100)}...`);
        });
      } else {
        logger.info("ℹ️ No keyword results found");
      }

    } catch (error: unknown) {
      logger.error("❌ Keyword search test failed:", error);
    }
  }

  async testWithReranking(): Promise<void> {
    try {
      logger.info("\n🎯 Testing search with reranking...");

      const query = "database connection issues";

      logger.info(`🔍 Testing reranked query: "${query}"`);

      const results = await neuralSearchService.search(query, {
        mode: "hybrid",
        maxResults: 8,
        minScore: 0.05,
        enableRerank: true,
      });

      if (results.length > 0) {
        logger.info(`✅ Found ${results.length} reranked results:`);
        results.forEach((result, index) => {
          logger.info(`   ${index + 1}. ${result.title}`);
          logger.info(`      Reranked Score: ${result.score.toFixed(3)}, Source: ${result.source}`);
        });
      } else {
        logger.info("ℹ️ No reranked results found");
      }

    } catch (error: unknown) {
      logger.error("❌ Reranking test failed:", error);
    }
  }

  async runAllTests(): Promise<void> {
    try {
      logger.info("🚀 Starting Neural Search Service comprehensive testing...");
      logger.info("=" * 80);

      await this.testHealthStatus();
      await this.testSemanticSearch();
      await this.testHybridSearch();
      await this.testKeywordSearch();
      await this.testWithReranking();

      logger.info("\n" + "=" * 80);
      logger.info("🎉 Neural Search Service testing completed!");

    } catch (error: unknown) {
      logger.error("❌ Neural Search Service testing failed:", error);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const test = new NeuralSearchTest();
  test.runAllTests().catch((error) => {
    logger.error("Test runner failed:", error);
    process.exit(1);
  });
}