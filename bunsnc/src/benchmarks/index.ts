/**
 * BunSNC Benchmarks - Performance measurement and comparison suite
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { performanceMonitor } from '../utils/PerformanceMonitor';

interface BenchmarkResult {
  name: string;
  duration: number;
  opsPerSecond: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
  memoryUsed: number;
  iterations: number;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  totalTime: number;
  summary: {
    fastest: string;
    slowest: string;
    averageOps: number;
  };
}

class BenchmarkRunner {
  private results: BenchmarkResult[] = [];

  async run(name: string, fn: () => Promise<any>, iterations: number = 1000): Promise<BenchmarkResult> {
    console.log(`\n Running benchmark: ${name} (${iterations} iterations)`);
    
    // Warm up
    for (let i = 0; i < Math.min(10, iterations / 10); i++) {
      await fn();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const initialMemory = process.memoryUsage().heapUsed;
    const times: number[] = [];
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      const iterationStart = performance.now();
      await fn();
      const iterationEnd = performance.now();
      times.push(iterationEnd - iterationStart);

      // Log progress for long-running benchmarks
      if (iterations > 100 && i % Math.floor(iterations / 10) === 0) {
        process.stdout.write(`\r  Progress: ${Math.floor((i / iterations) * 100)}%`);
      }
    }

    const endTime = performance.now();
    const finalMemory = process.memoryUsage().heapUsed;

    // Sort times for percentile calculation
    times.sort((a, b) => a - b);
    
    const totalTime = endTime - startTime;
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const opsPerSecond = (iterations / totalTime) * 1000;
    const p95Index = Math.floor(times.length * 0.95);

    const result: BenchmarkResult = {
      name,
      duration: totalTime,
      opsPerSecond,
      avgTime,
      minTime: times[0],
      maxTime: times[times.length - 1],
      p95Time: times[p95Index],
      memoryUsed: finalMemory - initialMemory,
      iterations
    };

    this.results.push(result);
    this.printResult(result);
    
    return result;
  }

  private printResult(result: BenchmarkResult) {
    console.log(`\n ${result.name} Results:`);
    console.log(`   Duration: ${result.duration.toFixed(2)}ms`);
    console.log(`   Ops/sec: ${result.opsPerSecond.toFixed(2)}`);
    console.log(`   Avg time: ${result.avgTime.toFixed(3)}ms`);
    console.log(`   Min time: ${result.minTime.toFixed(3)}ms`);
    console.log(`   Max time: ${result.maxTime.toFixed(3)}ms`);
    console.log(`   P95 time: ${result.p95Time.toFixed(3)}ms`);
    console.log(`   Memory: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
  }

  getSummary(): BenchmarkSuite {
    const fastest = this.results.reduce((prev, current) => 
      prev.opsPerSecond > current.opsPerSecond ? prev : current
    );
    
    const slowest = this.results.reduce((prev, current) => 
      prev.opsPerSecond < current.opsPerSecond ? prev : current
    );

    const averageOps = this.results.reduce((sum, result) => 
      sum + result.opsPerSecond, 0
    ) / this.results.length;

    const totalTime = this.results.reduce((sum, result) => 
      sum + result.duration, 0
    );

    return {
      name: 'BunSNC Benchmarks',
      results: [...this.results],
      totalTime,
      summary: {
        fastest: fastest.name,
        slowest: slowest.name,
        averageOps
      }
    };
  }

  printSummary() {
    const summary = this.getSummary();
    
    console.log('\n' + '='.repeat(80));
    console.log(` BENCHMARK SUMMARY - ${summary.name}`);
    console.log('='.repeat(80));
    console.log(`Total execution time: ${summary.totalTime.toFixed(2)}ms`);
    console.log(`Fastest operation: ${summary.summary.fastest}`);
    console.log(`Slowest operation: ${summary.summary.slowest}`);
    console.log(`Average ops/sec: ${summary.summary.averageOps.toFixed(2)}`);
    console.log('\n📈 Performance Comparison:');
    
    // Sort by ops/sec descending
    const sorted = summary.results.sort((a, b) => b.opsPerSecond - a.opsPerSecond);
    const fastest_ops = sorted[0].opsPerSecond;
    
    sorted.forEach((result, index) => {
      const relative = (result.opsPerSecond / fastest_ops) * 100;
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      console.log(`${medal} ${result.name}: ${result.opsPerSecond.toFixed(2)} ops/sec (${relative.toFixed(1)}%)`);
    });
    
    console.log('='.repeat(80) + '\n');
  }

  clear() {
    this.results = [];
  }
}

// Mock ServiceNow operations for benchmarking
class BenchmarkServiceNowClient {
  private latencyMs: number = 50;

  setLatency(ms: number) {
    this.latencyMs = ms;
  }

  async fastQuery(): Promise<any[]> {
    await this.delay(this.latencyMs * 0.5);
    return Array.from({ length: 10 }, (_, i) => ({ sys_id: `fast_${i}` }));
  }

  async normalQuery(): Promise<any[]> {
    await this.delay(this.latencyMs);
    return Array.from({ length: 50 }, (_, i) => ({ sys_id: `normal_${i}` }));
  }

  async complexQuery(): Promise<any[]> {
    await this.delay(this.latencyMs * 2);
    // Simulate complex processing
    const data = Array.from({ length: 100 }, (_, i) => ({
      sys_id: `complex_${i}`,
      computed_field: i * Math.random(),
      nested: { value: i, processed: true }
    }));
    
    // Additional processing simulation
    data.forEach(item => {
      item.computed_field = item.computed_field * 1.1;
    });
    
    return data;
  }

  async create(data: any): Promise<any> {
    await this.delay(this.latencyMs * 0.8);
    return { sys_id: `created_${Date.now()}`, ...data };
  }

  async update(sysId: string, data: any): Promise<any> {
    await this.delay(this.latencyMs * 0.9);
    return { sys_id: sysId, ...data, updated: true };
  }

  async delete(sysId: string): Promise<boolean> {
    await this.delay(this.latencyMs * 0.7);
    return true;
  }

  async batchOperation(operations: any[]): Promise<any[]> {
    // Simulate batch efficiency
    const batchLatency = this.latencyMs * Math.sqrt(operations.length) / 2;
    await this.delay(batchLatency);
    
    return operations.map((op, i) => ({
      success: true,
      result: { sys_id: `batch_${i}`, ...op }
    }));
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main benchmark execution
async function runBenchmarks() {
  console.log('🎯 BunSNC Performance Benchmarks Starting...\n');
  console.log('Environment:', {
    platform: process.platform,
    nodeVersion: process.version,
    bunVersion: process.env.BUN_VERSION || 'unknown'
  });

  const runner = new BenchmarkRunner();
  const client = new BenchmarkServiceNowClient();

  // Set realistic latency
  client.setLatency(75); // 75ms base latency

  try {
    // Query Performance Benchmarks
    await runner.run('Fast Query (10 records)', () => client.fastQuery(), 500);
    await runner.run('Normal Query (50 records)', () => client.normalQuery(), 300);
    await runner.run('Complex Query (100 records)', () => client.complexQuery(), 200);

    // CRUD Operation Benchmarks
    await runner.run('Create Operation', () => 
      client.create({ short_description: 'Benchmark record' }), 400);
    
    await runner.run('Update Operation', () => 
      client.update('benchmark_id', { state: '2' }), 400);
    
    await runner.run('Delete Operation', () => 
      client.delete('benchmark_id'), 400);

    // Batch Operation Benchmarks
    await runner.run('Small Batch (5 operations)', () => {
      const operations = Array.from({ length: 5 }, (_, i) => ({
        action: 'create',
        data: { description: `Batch ${i}` }
      }));
      return client.batchOperation(operations);
    }, 200);

    await runner.run('Medium Batch (20 operations)', () => {
      const operations = Array.from({ length: 20 }, (_, i) => ({
        action: 'create',
        data: { description: `Batch ${i}` }
      }));
      return client.batchOperation(operations);
    }, 100);

    await runner.run('Large Batch (50 operations)', () => {
      const operations = Array.from({ length: 50 }, (_, i) => ({
        action: 'create',
        data: { description: `Batch ${i}` }
      }));
      return client.batchOperation(operations);
    }, 50);

    // Memory and Performance Monitoring Benchmarks
    await runner.run('Performance Monitor Recording', () => {
      performanceMonitor.recordMetric({
        name: 'benchmark_metric',
        value: Math.random() * 100,
        unit: 'ms',
        timestamp: Date.now()
      });
      return Promise.resolve();
    }, 1000);

    await runner.run('Timer Operations', () => {
      const timerName = `benchmark_timer_${Date.now()}`;
      performanceMonitor.startTimer(timerName, 'BenchmarkTest');
      return new Promise(resolve => {
        setTimeout(() => {
          performanceMonitor.endTimer(timerName);
          resolve(undefined);
        }, Math.random() * 10);
      });
    }, 500);

    // Concurrent Operation Benchmarks
    await runner.run('Concurrent Queries (5 parallel)', () => {
      return Promise.all([
        client.fastQuery(),
        client.fastQuery(),
        client.fastQuery(),
        client.fastQuery(),
        client.fastQuery()
      ]);
    }, 100);

    await runner.run('Mixed Concurrent Operations', () => {
      return Promise.all([
        client.fastQuery(),
        client.create({ desc: 'concurrent' }),
        client.update('concurrent_id', { updated: true }),
        client.normalQuery()
      ]);
    }, 100);

    // Print comprehensive summary
    runner.printSummary();

    // Generate performance report
    const report = performanceMonitor.getReport(60); // Last 60 minutes
    console.log('📋 Performance Monitor Report:');
    console.log(`   Total metrics recorded: ${report.metrics.detailed.length}`);
    console.log(`   Average operation time: ${report.metrics.summary ? 'Available' : 'N/A'}`);

  } catch (error) {
    console.error(' Benchmark execution failed:', error);
    process.exit(1);
  }
}

// Comparison benchmarks (simulating different implementations)
async function runComparisonBenchmarks() {
  console.log('\n Running Implementation Comparison Benchmarks...\n');

  const runner = new BenchmarkRunner();
  runner.clear();

  // Simulate different implementation approaches
  const implementations = {
    async optimized() {
      // Simulate optimized implementation
      await new Promise(resolve => setTimeout(resolve, 20));
      return Array.from({ length: 50 }, (_, i) => ({ sys_id: `opt_${i}` }));
    },

    async standard() {
      // Simulate standard implementation
      await new Promise(resolve => setTimeout(resolve, 50));
      return Array.from({ length: 50 }, (_, i) => ({ sys_id: `std_${i}` }));
    },

    async legacy() {
      // Simulate legacy implementation
      await new Promise(resolve => setTimeout(resolve, 100));
      // Less efficient processing
      const results = [];
      for (let i = 0; i < 50; i++) {
        results.push({ sys_id: `leg_${i}` });
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 5)); // Blocking operations
        }
      }
      return results;
    }
  };

  // Run comparison
  for (const [name, impl] of Object.entries(implementations)) {
    await runner.run(`${name.toUpperCase()} Implementation`, impl, 200);
  }

  runner.printSummary();
}

// Memory benchmark
async function runMemoryBenchmarks() {
  console.log('\n Running Memory Performance Benchmarks...\n');

  const runner = new BenchmarkRunner();
  runner.clear();

  // Memory allocation patterns
  await runner.run('Small Object Creation', () => {
    const obj = { id: Math.random(), data: 'small' };
    return Promise.resolve(obj);
  }, 10000);

  await runner.run('Large Object Creation', () => {
    const obj = {
      id: Math.random(),
      data: 'x'.repeat(1000),
      array: new Array(100).fill(0).map((_, i) => ({ index: i })),
      nested: {
        level1: { level2: { level3: 'deep' } },
        arrays: [new Array(50).fill('data')]
      }
    };
    return Promise.resolve(obj);
  }, 1000);

  await runner.run('Array Processing', () => {
    const arr = new Array(1000).fill(0).map((_, i) => ({ id: i, value: Math.random() }));
    const processed = arr
      .filter(item => item.value > 0.5)
      .map(item => ({ ...item, processed: true }))
      .sort((a, b) => a.value - b.value);
    return Promise.resolve(processed);
  }, 500);

  runner.printSummary();
}

// Export for programmatic usage
export {
  BenchmarkRunner,
  BenchmarkServiceNowClient,
  type BenchmarkResult,
  type BenchmarkSuite
};

// Run benchmarks if this file is executed directly
if (import.meta.main) {
  (async () => {
    await runBenchmarks();
    await runComparisonBenchmarks();
    await runMemoryBenchmarks();
    
    console.log('🎉 All benchmarks completed successfully!');
    process.exit(0);
  })().catch(error => {
    console.error(' Benchmark suite failed:', error);
    process.exit(1);
  });
}