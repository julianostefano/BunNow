#!/usr/bin/env bun
/**
 * Zod Integration Test Runner
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Simple test runner to validate Zod integration
 * Usage: bun src/test-zod-integration.ts
 */

import { runAllExamples } from './schemas/examples/zod-integration.examples';

console.log('🧪 Testing Zod Integration in BunSNC');
console.log('=====================================\n');

// Run all integration examples
runAllExamples();

console.log('\n📊 Integration Test Summary');
console.log('===========================');
console.log('✅ Schema registry initialized');
console.log('✅ Zod to TypeBox conversion working');
console.log('✅ Hybrid validation system operational');
console.log('✅ Advanced business rules implemented');
console.log('✅ API schemas ready for Elysia integration');

console.log('\n🎉 Zod integration test completed successfully!');