/**
 * AI Services Integration Test Suite
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from '../utils/Logger';
import { TikaClient } from '../clients/TikaClient';
import { OpenSearchClient } from '../clients/OpenSearchClient';
import { EmbeddingClient } from '../clients/EmbeddingClient';
import { RerankClient } from '../clients/RerankClient';
import { LLMClient } from '../clients/LLMClient';
import { AIServicesBootstrap } from '../services/ai/AIServicesBootstrap';

interface TestResult {
  service: string;
  test: string;
  success: boolean;
  latency?: number;
  error?: string;
  details?: any;
}

export class AIServicesTestSuite {
  private results: TestResult[] = [];

  async runAllTests(): Promise<TestResult[]> {
    logger.info('🚀 [AIServicesTest] Starting comprehensive AI services test suite...');

    await this.testTikaClient();
    await this.testOpenSearchClient();
    await this.testEmbeddingClient();
    await this.testRerankClient();
    await this.testLLMClient();
    await this.testAIServicesBootstrap();

    this.printSummary();
    return this.results;
  }

  private async testTikaClient(): Promise<void> {
    logger.info('📄 [AIServicesTest] Testing Tika Client...');

    const client = new TikaClient();

    await this.runTest('TikaClient', 'Health Check', async () => {
      return await client.healthCheck();
    });

    await this.runTest('TikaClient', 'Server Info', async () => {
      const info = client.getServerInfo();
      return info.url && info.timeout > 0;
    });

    // Test with sample text
    const testBuffer = Buffer.from('This is a test document for Tika processing.');

    await this.runTest('TikaClient', 'Text Extraction', async () => {
      const text = await client.extractText(testBuffer, 'text/plain');
      return text.length > 0;
    });

    await this.runTest('TikaClient', 'Metadata Extraction', async () => {
      const metadata = await client.extractMetadata(testBuffer, 'text/plain');
      return metadata && typeof metadata === 'object';
    });

    await this.runTest('TikaClient', 'Full Extraction', async () => {
      const result = await client.extractFull(testBuffer, 'text/plain');
      return result.content && result.metadata;
    });

    await this.runTest('TikaClient', 'MIME Type Detection', async () => {
      const mimeType = client.detectMimeType('test.pdf', testBuffer);
      return mimeType === 'application/pdf';
    });
  }

  private async testOpenSearchClient(): Promise<void> {
    logger.info('🔍 [AIServicesTest] Testing OpenSearch Client...');

    const client = new OpenSearchClient({
      host: '10.219.8.210',
      port: 9200,
      ssl: false
    });

    await this.runTest('OpenSearchClient', 'Health Check', async () => {
      return await client.healthCheck();
    });

    await this.runTest('OpenSearchClient', 'Get Indices', async () => {
      const indices = await client.getIndices();
      return Array.isArray(indices);
    });

    await this.runTest('OpenSearchClient', 'Configuration', async () => {
      const config = client.getConfig();
      return config.host === '10.219.8.210' && config.port === 9200;
    });
  }

  private async testEmbeddingClient(): Promise<void> {
    logger.info('🔢 [AIServicesTest] Testing Embedding Client...');

    const client = new EmbeddingClient();

    await this.runTest('EmbeddingClient', 'Health Check', async () => {
      return await client.healthCheck();
    });

    await this.runTest('EmbeddingClient', 'Connection Test', async () => {
      const result = await client.testConnection();
      return result.success;
    });

    await this.runTest('EmbeddingClient', 'Service Info', async () => {
      const info = await client.getServiceInfo();
      return info !== null;
    });

    await this.runTest('EmbeddingClient', 'Models List', async () => {
      const models = await client.getModels();
      return Array.isArray(models) && models.length > 0;
    });

    await this.runTest('EmbeddingClient', 'Single Embedding Generation', async () => {
      try {
        const embedding = await client.generateSingleEmbedding(
          'This is a test sentence for embedding generation.'
        );
        return Array.isArray(embedding) && embedding.length > 0;
      } catch (error) {
        // Service might not be available, not a critical failure
        return false;
      }
    });

    await this.runTest('EmbeddingClient', 'Batch Embedding Generation', async () => {
      try {
        const texts = [
          'Database connection error',
          'Network timeout issue',
          'Application performance problem'
        ];
        const response = await client.generateEmbeddings(texts);
        return response.embeddings.length === texts.length;
      } catch (error) {
        return false;
      }
    });

    await this.runTest('EmbeddingClient', 'Warmup', async () => {
      return await client.warmup();
    });
  }

  private async testRerankClient(): Promise<void> {
    logger.info('🔄 [AIServicesTest] Testing Rerank Client...');

    const client = new RerankClient();

    await this.runTest('RerankClient', 'Health Check', async () => {
      return await client.healthCheck();
    });

    await this.runTest('RerankClient', 'Connection Test', async () => {
      const result = await client.testConnection();
      return result.success;
    });

    await this.runTest('RerankClient', 'Service Info', async () => {
      const info = await client.getServiceInfo();
      return info !== null;
    });

    await this.runTest('RerankClient', 'Models List', async () => {
      const models = await client.getModels();
      return Array.isArray(models) && models.length > 0;
    });

    await this.runTest('RerankClient', 'Document Reranking', async () => {
      try {
        const query = 'database connection error';
        const documents = [
          'How to troubleshoot database connection issues',
          'Network configuration for applications',
          'Database connection pooling best practices',
          'Application server configuration guide'
        ];

        const response = await client.rerank(query, documents, { top_k: 2 });
        return response.results.length <= 2 && response.results.length > 0;
      } catch (error) {
        return false;
      }
    });

    await this.runTest('RerankClient', 'Top-K Reranking', async () => {
      try {
        const query = 'server error';
        const documents = [
          'Server configuration guide',
          'Error handling best practices',
          'Network troubleshooting',
          'Database optimization'
        ];

        const topDocs = await client.rerankTopK(query, documents, 2);
        return topDocs.length === 2;
      } catch (error) {
        return false;
      }
    });

    await this.runTest('RerankClient', 'Warmup', async () => {
      return await client.warmup();
    });
  }

  private async testLLMClient(): Promise<void> {
    logger.info('🧠 [AIServicesTest] Testing LLM Client...');

    const client = new LLMClient();

    await this.runTest('LLMClient', 'Health Check', async () => {
      return await client.healthCheck();
    });

    await this.runTest('LLMClient', 'Connection Test', async () => {
      const result = await client.testConnection();
      return result.success;
    });

    await this.runTest('LLMClient', 'Models List', async () => {
      const models = await client.getModels();
      return Array.isArray(models);
    });

    await this.runTest('LLMClient', 'Model Info', async () => {
      const info = await client.getModelInfo();
      return info !== null;
    });

    await this.runTest('LLMClient', 'Simple Completion', async () => {
      try {
        const response = await client.generateCompletion(
          'What is 2+2?',
          { temperature: 0.1, max_tokens: 50 }
        );
        return typeof response === 'string' && response.length > 0;
      } catch (error) {
        return false;
      }
    });

    await this.runTest('LLMClient', 'Ticket Analysis', async () => {
      try {
        const ticketData = {
          short_description: 'Database connection timeout',
          description: 'Application cannot connect to the database server',
          category: 'Database',
          priority: 'High'
        };

        const analysis = await client.analyzeTicket(ticketData, { temperature: 0.3 });
        return typeof analysis === 'string' && analysis.length > 0;
      } catch (error) {
        return false;
      }
    });

    await this.runTest('LLMClient', 'Resolution Steps Generation', async () => {
      try {
        const steps = await client.generateResolutionSteps(
          'Database connection timeout',
          'Oracle database on production server'
        );
        return Array.isArray(steps) && steps.length > 0;
      } catch (error) {
        return false;
      }
    });

    await this.runTest('LLMClient', 'Document Summarization', async () => {
      try {
        const longText = 'This is a long technical document that needs to be summarized. ' +
          'It contains important information about system configuration, ' +
          'troubleshooting steps, and best practices for maintenance. ' +
          'The document covers various aspects of system administration.';

        const summary = await client.summarizeDocument(longText, 100);
        return typeof summary === 'string' && summary.length <= 120;
      } catch (error) {
        return false;
      }
    });

    await this.runTest('LLMClient', 'Keyword Extraction', async () => {
      try {
        const text = 'Database connection error occurred while connecting to Oracle server. ' +
          'Network timeout and authentication failure detected.';

        const keywords = await client.extractKeywords(text, 5);
        return Array.isArray(keywords) && keywords.length <= 5;
      } catch (error) {
        return false;
      }
    });

    await this.runTest('LLMClient', 'Warmup', async () => {
      return await client.warmup();
    });
  }

  private async testAIServicesBootstrap(): Promise<void> {
    logger.info('🚀 [AIServicesTest] Testing AI Services Bootstrap...');

    const bootstrap = AIServicesBootstrap.getInstance();

    await this.runTest('AIServicesBootstrap', 'Configuration Loading', async () => {
      const config = bootstrap.getConfiguration();
      return config.tika && config.opensearch && config.servicenow;
    });

    await this.runTest('AIServicesBootstrap', 'Initialization', async () => {
      try {
        await bootstrap.initialize();
        return bootstrap.isInitialized();
      } catch (error) {
        logger.warn('⚠️ [AIServicesTest] Bootstrap initialization failed (expected if services unavailable):', error);
        return false;
      }
    });

    if (bootstrap.isInitialized()) {
      await this.runTest('AIServicesBootstrap', 'Service List', async () => {
        const services = bootstrap.getServiceList();
        return Array.isArray(services) && services.length > 0;
      });

      await this.runTest('AIServicesBootstrap', 'Health Status', async () => {
        const health = await bootstrap.getHealthStatus();
        return health.status !== undefined;
      });

      await this.runTest('AIServicesBootstrap', 'Service Metrics', async () => {
        const metrics = await bootstrap.getServiceMetrics();
        return typeof metrics === 'object';
      });
    }
  }

  private async runTest(
    service: string,
    testName: string,
    testFn: () => Promise<boolean>
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const success = await testFn();
      const latency = Date.now() - startTime;

      this.results.push({
        service,
        test: testName,
        success,
        latency
      });

      const status = success ? '✅' : '❌';
      logger.info(`${status} [${service}] ${testName} - ${latency}ms`);

    } catch (error) {
      const latency = Date.now() - startTime;

      this.results.push({
        service,
        test: testName,
        success: false,
        latency,
        error: error instanceof Error ? error.message : String(error)
      });

      logger.error(`❌ [${service}] ${testName} - ${latency}ms - ${error}`);
    }
  }

  private printSummary(): void {
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const avgLatency = Math.round(
      this.results.reduce((sum, r) => sum + (r.latency || 0), 0) / total
    );

    logger.info('\n📊 [AIServicesTest] Test Summary:');
    logger.info(`Total Tests: ${total}`);
    logger.info(`✅ Passed: ${passed}`);
    logger.info(`❌ Failed: ${failed}`);
    logger.info(`📈 Success Rate: ${Math.round((passed / total) * 100)}%`);
    logger.info(`⏱️ Average Latency: ${avgLatency}ms`);

    // Group by service
    const serviceResults = this.results.reduce((acc, result) => {
      if (!acc[result.service]) {
        acc[result.service] = { passed: 0, failed: 0, total: 0 };
      }
      acc[result.service].total++;
      if (result.success) {
        acc[result.service].passed++;
      } else {
        acc[result.service].failed++;
      }
      return acc;
    }, {} as Record<string, { passed: number; failed: number; total: number }>);

    logger.info('\n📋 [AIServicesTest] Results by Service:');
    for (const [service, stats] of Object.entries(serviceResults)) {
      const successRate = Math.round((stats.passed / stats.total) * 100);
      logger.info(`  ${service}: ${stats.passed}/${stats.total} (${successRate}%)`);
    }

    // Show failed tests
    const failedTests = this.results.filter(r => !r.success);
    if (failedTests.length > 0) {
      logger.info('\n⚠️ [AIServicesTest] Failed Tests:');
      failedTests.forEach(test => {
        logger.warn(`  ${test.service} - ${test.test}: ${test.error || 'Unknown error'}`);
      });
    }
  }

  getResults(): TestResult[] {
    return [...this.results];
  }

  getServiceStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};

    for (const result of this.results) {
      if (!status[result.service]) {
        status[result.service] = true;
      }
      if (!result.success && result.test === 'Health Check') {
        status[result.service] = false;
      }
    }

    return status;
  }
}

// Export for direct execution
export async function runAIServicesTests(): Promise<TestResult[]> {
  const testSuite = new AIServicesTestSuite();
  return await testSuite.runAllTests();
}

// CLI execution
if (import.meta.main) {
  runAIServicesTests()
    .then((results) => {
      process.exit(results.every(r => r.success) ? 0 : 1);
    })
    .catch((error) => {
      logger.error('❌ [AIServicesTest] Test suite execution failed:', error);
      process.exit(1);
    });
}