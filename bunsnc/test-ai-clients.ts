/**
 * Simple AI Clients Test Script
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TikaClient } from './src/clients/TikaClient';
import { EmbeddingClient } from './src/clients/EmbeddingClient';
import { RerankClient } from './src/clients/RerankClient';
import { LLMClient } from './src/clients/LLMClient';

async function testClient(clientName: string, testFn: () => Promise<any>): Promise<void> {
  const startTime = Date.now();
  try {
    console.log(`🔄 Testing ${clientName}...`);
    await testFn();
    console.log(`✅ ${clientName} - ${Date.now() - startTime}ms`);
  } catch (error) {
    console.log(`❌ ${clientName} - ${Date.now() - startTime}ms - ${error}`);
  }
}

async function main() {
  console.log('🚀 Testing AI Service Connections...\n');

  // Test Tika Client
  await testClient('Tika Client Health', async () => {
    const client = new TikaClient();
    const healthy = await client.healthCheck();
    if (!healthy) throw new Error('Health check failed');
  });

  // Test Embedding Client
  await testClient('Embedding Client Health', async () => {
    const client = new EmbeddingClient();
    const result = await client.testConnection();
    if (!result.success) throw new Error(result.error || 'Connection failed');
  });

  // Test Rerank Client
  await testClient('Rerank Client Health', async () => {
    const client = new RerankClient();
    const result = await client.testConnection();
    if (!result.success) throw new Error(result.error || 'Connection failed');
  });

  // Test LLM Client
  await testClient('LLM Client Health', async () => {
    const client = new LLMClient();
    const result = await client.testConnection();
    if (!result.success) throw new Error(result.error || 'Connection failed');
  });

  console.log('\n🎉 AI Services connection test completed!');
}

main().catch(console.error);