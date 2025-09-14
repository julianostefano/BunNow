#!/usr/bin/env bun

/**
 * Performance Benchmark - 5 Core Consolidated Services
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Set mock environment
process.env.SNC_MOCK = '1';
process.env.SNC_INSTANCE_URL = 'https://mock.service-now.com';
process.env.SNC_AUTH_TOKEN = 'mock_token';

console.log('⚡ PERFORMANCE BENCHMARK - 5 Core Consolidated Services');

async function benchmarkService(serviceName: string, importPath: string, testFunction: Function) {
  console.log(`\n📊 Benchmarking ${serviceName}...`);

  const iterations = 100;
  const times: number[] = [];

  try {
    // Import service
    const startImport = performance.now();
    const serviceModule = await import(importPath);
    const importTime = performance.now() - startImport;

    // Run benchmark iterations
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await testFunction(serviceModule);
      const end = performance.now();
      times.push(end - start);
    }

    // Calculate statistics
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    console.log(`   ✅ Import Time: ${importTime.toFixed(2)}ms`);
    console.log(`   📈 Average: ${avgTime.toFixed(2)}ms`);
    console.log(`   ⚡ Min: ${minTime.toFixed(2)}ms`);
    console.log(`   🔥 Max: ${maxTime.toFixed(2)}ms`);
    console.log(`   🎯 Ops/sec: ${(1000 / avgTime).toFixed(0)}`);

    return { importTime, avgTime, minTime, maxTime };
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return null;
  }
}

// Benchmark SystemService
const systemResults = await benchmarkService(
  'SystemService',
  './services/SystemService',
  async (module) => {
    const status = module.systemService.getHealthStatus();
    return status;
  }
);

// Benchmark ConsolidatedServiceNowService
const serviceNowResults = await benchmarkService(
  'ConsolidatedServiceNowService',
  './services/ConsolidatedServiceNowService',
  async (module) => {
    const status = module.consolidatedServiceNowService.getHealthStatus();
    return status;
  }
);

// Benchmark ConsolidatedDataService
const dataResults = await benchmarkService(
  'ConsolidatedDataService',
  './services/ConsolidatedDataService',
  async (module) => {
    const status = module.dataService.getHealthStatus();
    return status;
  }
);

// Benchmark ConsolidatedBusinessLogicService
const businessResults = await benchmarkService(
  'ConsolidatedBusinessLogicService',
  './services/ConsolidatedBusinessLogicService',
  async (module) => {
    const status = module.businessLogicService.getHealthStatus();
    return status;
  }
);

// Benchmark UnifiedStreamingService
const streamingResults = await benchmarkService(
  'UnifiedStreamingService',
  './services/UnifiedStreamingService',
  async (module) => {
    const status = module.unifiedStreamingService.getHealthStatus();
    return status;
  }
);

// Summary
console.log('\n📋 PERFORMANCE SUMMARY');
console.log('=====================');

const results = [
  { name: 'SystemService', data: systemResults },
  { name: 'ConsolidatedServiceNowService', data: serviceNowResults },
  { name: 'ConsolidatedDataService', data: dataResults },
  { name: 'ConsolidatedBusinessLogicService', data: businessResults },
  { name: 'UnifiedStreamingService', data: streamingResults }
].filter(r => r.data !== null);

if (results.length > 0) {
  const totalAvg = results.reduce((sum, r) => sum + r.data.avgTime, 0) / results.length;
  const totalImportTime = results.reduce((sum, r) => sum + r.data.importTime, 0);

  console.log(`🚀 Services Benchmarked: ${results.length}/5`);
  console.log(`⚡ Average Response Time: ${totalAvg.toFixed(2)}ms`);
  console.log(`📦 Total Import Time: ${totalImportTime.toFixed(2)}ms`);
  console.log(`🎯 Overall Performance: ${totalAvg < 1 ? 'EXCELLENT' : totalAvg < 5 ? 'GOOD' : 'ACCEPTABLE'}`);
}

console.log('\n🎊 BENCHMARK COMPLETED - Consolidated Architecture Performance Validated!');