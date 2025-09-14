#!/usr/bin/env bun

/**
 * Smoke Tests for 5 Core Consolidated Services
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

console.log('🧪 SMOKE TESTS - 5 Core Consolidated Services');

// Test 1: SystemService
console.log('\n1️⃣ Testing SystemService...');
try {
  const { systemService } = await import('../src/services/SystemService');
  console.log('✅ SystemService imported successfully');
  console.log(`   Health Status: ${systemService.getHealthStatus().status}`);
} catch (error) {
  console.log(`❌ SystemService failed: ${error.message}`);
}

// Test 2: ConsolidatedServiceNowService (without auth)
console.log('\n2️⃣ Testing ConsolidatedServiceNowService...');
try {
  const { consolidatedServiceNowService } = await import('../src/services/ConsolidatedServiceNowService');
  console.log('✅ ConsolidatedServiceNowService imported successfully');
  console.log(`   Health Status: ${consolidatedServiceNowService.getHealthStatus().status}`);
} catch (error) {
  console.log(`❌ ConsolidatedServiceNowService failed: ${error.message}`);
}

// Test 3: ConsolidatedDataService
console.log('\n3️⃣ Testing ConsolidatedDataService...');
try {
  const { dataService } = await import('../src/services/ConsolidatedDataService');
  console.log('✅ ConsolidatedDataService imported successfully');
  console.log(`   Health Status: ${dataService.getHealthStatus().status}`);
} catch (error) {
  console.log(`❌ ConsolidatedDataService failed: ${error.message}`);
}

// Test 4: ConsolidatedBusinessLogicService
console.log('\n4️⃣ Testing ConsolidatedBusinessLogicService...');
try {
  const { businessLogicService } = await import('../src/services/ConsolidatedBusinessLogicService');
  console.log('✅ ConsolidatedBusinessLogicService imported successfully');
  console.log(`   Health Status: ${businessLogicService.getHealthStatus().status}`);
} catch (error) {
  console.log(`❌ ConsolidatedBusinessLogicService failed: ${error.message}`);
}

// Test 5: UnifiedStreamingService
console.log('\n5️⃣ Testing UnifiedStreamingService...');
try {
  const { unifiedStreamingService } = await import('../src/services/UnifiedStreamingService');
  console.log('✅ UnifiedStreamingService imported successfully');
  console.log(`   Health Status: ${unifiedStreamingService.getHealthStatus().status}`);
} catch (error) {
  console.log(`❌ UnifiedStreamingService failed: ${error.message}`);
}

console.log('\n🎯 SMOKE TESTS COMPLETED');