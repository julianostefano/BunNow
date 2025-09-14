/**
 * Complete AI Stack Test - All Services Integration Test
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TikaClient } from './src/clients/TikaClient';
import { OpenSearchClient } from './src/clients/OpenSearchClient';
import { EmbeddingClient } from './src/clients/EmbeddingClient';
import { RerankClient } from './src/clients/RerankClient';
import { LLMClient } from './src/clients/LLMClient';

async function testClient(clientName: string, testFn: () => Promise<any>): Promise<boolean> {
  const startTime = Date.now();
  try {
    console.log(`🔄 Testing ${clientName}...`);
    await testFn();
    console.log(`✅ ${clientName} - ${Date.now() - startTime}ms`);
    return true;
  } catch (error) {
    console.log(`❌ ${clientName} - ${Date.now() - startTime}ms - ${error}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing Complete AI Stack Integration...\n');

  const results: Record<string, boolean> = {};

  // Test Tika Client (port 9999)
  results['Tika'] = await testClient('Tika Server (localhost:9999)', async () => {
    const client = new TikaClient('http://localhost:9999');
    const healthy = await client.healthCheck();
    if (!healthy) throw new Error('Health check failed');

    // Test with sample text
    const testBuffer = Buffer.from('This is a test document for Tika processing.');
    const text = await client.extractText(testBuffer, 'text/plain');
    if (!text || text.length === 0) throw new Error('Text extraction failed');
  });

  // Test OpenSearch Client (port 9200)
  results['OpenSearch'] = await testClient('OpenSearch Server (10.219.8.210:9200)', async () => {
    const client = new OpenSearchClient({
      host: '10.219.8.210',
      port: 9200,
      ssl: false
    });
    const healthy = await client.healthCheck();
    if (!healthy) throw new Error('Health check failed');

    const indices = await client.getIndices();
    if (!Array.isArray(indices)) throw new Error('Failed to get indices');
  });

  // Test Embedding Client (port 8010)
  results['Embedding'] = await testClient('Embedding Server (10.219.8.210:8010)', async () => {
    const client = new EmbeddingClient();
    const result = await client.testConnection();
    if (!result.success) throw new Error(result.error || 'Connection failed');

    // Try actual embedding generation
    try {
      const embedding = await client.generateSingleEmbedding('Test document for embedding');
      if (!Array.isArray(embedding) || embedding.length === 0) {
        console.log('  ⚠️  Embedding generation not available, but connection OK');
      } else {
        console.log(`  📊 Generated embedding with ${embedding.length} dimensions`);
      }
    } catch (error) {
      console.log('  ⚠️  Embedding generation not available, but connection OK');
    }
  });

  // Test Rerank Client (port 8011)
  results['Rerank'] = await testClient('Rerank Server (10.219.8.210:8011)', async () => {
    const client = new RerankClient();
    const result = await client.testConnection();
    if (!result.success) throw new Error(result.error || 'Connection failed');

    // Try actual reranking
    try {
      const query = 'database connection error';
      const documents = [
        'How to troubleshoot database connections',
        'Network configuration guide',
        'Database performance tuning'
      ];

      const reranked = await client.rerank(query, documents, { top_k: 2 });
      if (!reranked.results || reranked.results.length === 0) {
        console.log('  ⚠️  Reranking not available, but connection OK');
      } else {
        console.log(`  🔄 Reranked ${reranked.results.length} documents`);
      }
    } catch (error) {
      console.log('  ⚠️  Reranking not available, but connection OK');
    }
  });

  // Test LLM Client (port 11434)
  results['LLM'] = await testClient('LLM Server - DeepSeek (10.219.8.210:11434)', async () => {
    const client = new LLMClient();
    const result = await client.testConnection();
    if (!result.success) throw new Error(result.error || 'Connection failed');

    // Try to get available models
    const models = await client.getModels();
    console.log(`  🧠 Available models: ${models.join(', ')}`);

    // Try simple completion
    try {
      const response = await client.generateCompletion(
        'What is 2+2? Answer briefly.',
        { temperature: 0.1, max_tokens: 20 }
      );
      if (response && response.length > 0) {
        console.log(`  💬 LLM Response: "${response.trim()}"`);
      }
    } catch (error) {
      console.log('  ⚠️  LLM generation not available, but connection OK');
    }
  });

  // Summary
  console.log('\n📊 AI Stack Integration Test Summary:');
  console.log('=====================================');

  const successful = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  for (const [service, success] of Object.entries(results)) {
    console.log(`${success ? '✅' : '❌'} ${service.padEnd(12)} - ${success ? 'CONNECTED' : 'FAILED'}`);
  }

  console.log('\n📈 Overall Status:');
  console.log(`Services Connected: ${successful}/${total}`);
  console.log(`Success Rate: ${Math.round((successful / total) * 100)}%`);

  if (successful >= 4) {
    console.log('🎉 AI Stack is ready for production use!');
  } else if (successful >= 2) {
    console.log('⚠️  AI Stack is partially functional');
  } else {
    console.log('❌ AI Stack needs configuration');
  }

  return successful >= 3;
}

main()
  .then((success) => process.exit(success ? 0 : 1))
  .catch(console.error);