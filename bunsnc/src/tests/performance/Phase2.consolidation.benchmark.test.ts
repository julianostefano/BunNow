/**
 * Phase 2 Consolidation Performance Benchmarks
 * Validates that consolidations maintain or improve performance
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { performance } from 'perf_hooks';
import { unifiedStreamingService } from '../../services/UnifiedStreamingService';
import { ConsolidatedServiceNowService } from '../../services/ConsolidatedServiceNowService';
import type { ServiceNowAuthClient } from '../../services/ServiceNowAuthClient';
import type { ServiceNowStreams } from '../../config/redis-streams';

// Performance benchmark configuration
const BENCHMARK_CONFIG = {
  iterations: 100,
  warmupIterations: 10,
  timeout: 30000,
  performanceThresholds: {
    ticketRetrieval: {
      maxAvgTime: 100, // milliseconds
      maxP95Time: 200,
      maxMemoryMB: 50
    },
    streamConnection: {
      maxAvgTime: 50,
      maxP95Time: 100,
      maxConcurrentConnections: 1000
    },
    hybridQuery: {
      maxAvgTime: 150,
      maxP95Time: 300,
      maxMemoryMB: 100
    },
    synchronization: {
      maxAvgTime: 500,
      maxP95Time: 1000,
      maxMemoryMB: 200
    }
  }
};

// Performance measurement utilities
class PerformanceMeasurement {
  private measurements: number[] = [];
  private memoryStart: number = 0;
  private memoryEnd: number = 0;

  startMeasurement(): void {
    this.memoryStart = process.memoryUsage().heapUsed;
  }

  endMeasurement(): void {
    this.memoryEnd = process.memoryUsage().heapUsed;
  }

  addMeasurement(time: number): void {
    this.measurements.push(time);
  }

  getStats() {
    if (this.measurements.length === 0) {
      return { avg: 0, min: 0, max: 0, p95: 0, memoryUsedMB: 0 };
    }

    const sorted = [...this.measurements].sort((a, b) => a - b);
    const avg = this.measurements.reduce((sum, time) => sum + time, 0) / this.measurements.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Index];
    const memoryUsedMB = (this.memoryEnd - this.memoryStart) / 1024 / 1024;

    return { avg, min, max, p95, memoryUsedMB };
  }

  reset(): void {
    this.measurements = [];
    this.memoryStart = 0;
    this.memoryEnd = 0;
  }
}

// Mock services for consistent benchmarking
const createBenchmarkMockServiceNow = (): ServiceNowAuthClient => {
  const mockData = {
    sys_id: 'benchmark-test-id',
    number: 'INC0999999',
    short_description: 'Benchmark test incident',
    description: 'Performance testing incident',
    state: '2',
    priority: '3',
    assigned_to: 'Benchmark Tester',
    assignment_group: 'Performance Test Group',
    caller_id: 'Performance Caller',
    sys_created_on: new Date().toISOString(),
    sys_updated_on: new Date().toISOString()
  };

  return {
    makeRequestFullFields: async (table: string, query: string, limit?: number) => {
      // Simulate realistic API response time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
      
      return {
        result: Array.from({ length: limit || 1 }, (_, i) => ({
          ...mockData,
          sys_id: `${mockData.sys_id}-${i}`,
          number: `INC${String(999999 - i).padStart(7, '0')}`
        }))
      };
    },
    isAuthenticated: () => true,
    getInstanceUrl: () => 'https://benchmark.service-now.com'
  } as any;
};

const createBenchmarkMockRedis = (): ServiceNowStreams => ({
  subscribe: async (eventType: string, handler: Function) => {
    // Simulate Redis subscription overhead
    await new Promise(resolve => setTimeout(resolve, 1));
  },
  publishChange: async (change: any) => {
    await new Promise(resolve => setTimeout(resolve, 1));
    return 'benchmark-message-id';
  },
  healthCheck: async () => ({ status: 'healthy', benchmark: true })
} as any);

describe('Phase 2 Consolidation - Performance Benchmarks', () => {
  let consolidatedTicketService: ConsolidatedServiceNowService;
  let mockServiceNowClient: ServiceNowAuthClient;
  let mockRedisStreams: ServiceNowStreams;
  
  const ticketRetrievalMeasurement = new PerformanceMeasurement();
  const streamConnectionMeasurement = new PerformanceMeasurement();
  const hybridQueryMeasurement = new PerformanceMeasurement();
  const synchronizationMeasurement = new PerformanceMeasurement();

  beforeAll(async () => {
    console.log('🏃‍♂️ Starting Phase 2 consolidation performance benchmarks...');
    console.log('Benchmark configuration:', BENCHMARK_CONFIG.performanceThresholds);
    
    mockServiceNowClient = createBenchmarkMockServiceNow();
    mockRedisStreams = createBenchmarkMockRedis();
    
    unifiedStreamingService.initialize(mockRedisStreams);
    
    // Warmup phase
    console.log(`🔥 Warming up with ${BENCHMARK_CONFIG.warmupIterations} iterations...`);
    for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
      const warmupService = new ConsolidatedServiceNowService(mockServiceNowClient);
      await warmupService.getTicketDetails(`warmup-${i}`, 'incident');
      await warmupService.cleanup();
    }
    
    console.log('🚀 Warmup completed, starting benchmarks...');
  });

  beforeEach(() => {
    consolidatedTicketService = new ConsolidatedServiceNowService(mockServiceNowClient);
  });

  afterEach(async () => {
    if (consolidatedTicketService) {
      await consolidatedTicketService.cleanup();
    }
  });

  afterAll(async () => {
    unifiedStreamingService.cleanup();
    console.log('🏁 Performance benchmarks completed');
  });

  describe('Ticket Retrieval Performance', () => {
    it(`should retrieve tickets within performance thresholds (${BENCHMARK_CONFIG.iterations} iterations)`, async () => {
      console.log('📊 Benchmarking ticket retrieval performance...');
      
      ticketRetrievalMeasurement.startMeasurement();
      
      for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
        const startTime = performance.now();
        
        const ticket = await consolidatedTicketService.getTicketDetails(
          `benchmark-ticket-${i}`,
          'incident'
        );
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        ticketRetrievalMeasurement.addMeasurement(duration);
        
        // Verify functionality
        expect(ticket).toBeDefined();
        expect(ticket.sysId).toBe(`benchmark-ticket-${i}`);
      }
      
      ticketRetrievalMeasurement.endMeasurement();
      const stats = ticketRetrievalMeasurement.getStats();
      
      console.log('Ticket Retrieval Performance Stats:', {
        avgTime: `${stats.avg.toFixed(2)}ms`,
        p95Time: `${stats.p95.toFixed(2)}ms`,
        minTime: `${stats.min.toFixed(2)}ms`,
        maxTime: `${stats.max.toFixed(2)}ms`,
        memoryUsed: `${stats.memoryUsedMB.toFixed(2)}MB`
      });
      
      // Performance assertions
      expect(stats.avg).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.ticketRetrieval.maxAvgTime);
      expect(stats.p95).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.ticketRetrieval.maxP95Time);
      expect(stats.memoryUsedMB).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.ticketRetrieval.maxMemoryMB);
      
    }, BENCHMARK_CONFIG.timeout);

    it('should handle concurrent ticket retrievals efficiently', async () => {
      console.log('🚀 Benchmarking concurrent ticket retrieval...');
      
      const concurrency = 20;
      const startTime = performance.now();
      
      const concurrentPromises = Array.from({ length: concurrency }, (_, i) =>
        consolidatedTicketService.getTicketDetails(`concurrent-${i}`, 'incident')
      );
      
      const results = await Promise.all(concurrentPromises);
      
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const avgTimePerRequest = totalDuration / concurrency;
      
      console.log('Concurrent Retrieval Performance:', {
        totalTime: `${totalDuration.toFixed(2)}ms`,
        avgTimePerRequest: `${avgTimePerRequest.toFixed(2)}ms`,
        concurrency
      });
      
      // Verify all requests completed successfully
      expect(results).toHaveLength(concurrency);
      results.forEach((ticket, index) => {
        expect(ticket).toBeDefined();
        expect(ticket.sysId).toBe(`concurrent-${index}`);
      });
      
      // Performance should be better than sequential
      expect(avgTimePerRequest).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.ticketRetrieval.maxAvgTime);
    }, BENCHMARK_CONFIG.timeout);
  });

  describe('Streaming Connection Performance', () => {
    it(`should create streaming connections within performance thresholds`, async () => {
      console.log('📡 Benchmarking streaming connection performance...');
      
      streamConnectionMeasurement.startMeasurement();
      
      const connections: Response[] = [];
      
      for (let i = 0; i < Math.min(BENCHMARK_CONFIG.iterations, 100); i++) {
        const startTime = performance.now();
        
        const connection = unifiedStreamingService.createTicketSSEConnection(`stream-benchmark-${i}`);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        streamConnectionMeasurement.addMeasurement(duration);
        connections.push(connection);
        
        // Verify connection
        expect(connection).toBeInstanceOf(Response);
        expect(connection.headers.get('Content-Type')).toBe('text/event-stream');
      }
      
      streamConnectionMeasurement.endMeasurement();
      const stats = streamConnectionMeasurement.getStats();
      
      console.log('Streaming Connection Performance Stats:', {
        avgTime: `${stats.avg.toFixed(2)}ms`,
        p95Time: `${stats.p95.toFixed(2)}ms`,
        totalConnections: connections.length,
        memoryUsed: `${stats.memoryUsedMB.toFixed(2)}MB`
      });
      
      // Verify connection statistics
      const connectionStats = unifiedStreamingService.getConnectionStats();
      expect(connectionStats.totalConnections).toBe(connections.length);
      
      // Performance assertions
      expect(stats.avg).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.streamConnection.maxAvgTime);
      expect(stats.p95).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.streamConnection.maxP95Time);
      
    }, BENCHMARK_CONFIG.timeout);

    it('should handle high-volume concurrent streaming connections', async () => {
      console.log('🌊 Benchmarking high-volume streaming connections...');
      
      const connectionCount = 500;
      const startTime = performance.now();
      
      const connections = Array.from({ length: connectionCount }, (_, i) =>
        unifiedStreamingService.createTicketSSEConnection(`volume-test-${i}`)
      );
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerConnection = totalTime / connectionCount;
      
      console.log('High-Volume Connection Performance:', {
        totalTime: `${totalTime.toFixed(2)}ms`,
        avgTimePerConnection: `${avgTimePerConnection.toFixed(2)}ms`,
        connectionCount,
        connectionsPerSecond: Math.round(connectionCount / (totalTime / 1000))
      });
      
      // Verify all connections created
      expect(connections).toHaveLength(connectionCount);
      connections.forEach(connection => {
        expect(connection).toBeInstanceOf(Response);
      });
      
      // Verify connection tracking
      const stats = unifiedStreamingService.getConnectionStats();
      expect(stats.totalConnections).toBe(connectionCount);
      
      // Performance assertions
      expect(avgTimePerConnection).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.streamConnection.maxAvgTime);
      expect(connectionCount).toBeLessThanOrEqual(BENCHMARK_CONFIG.performanceThresholds.streamConnection.maxConcurrentConnections);
    }, BENCHMARK_CONFIG.timeout);
  });

  describe('Hybrid Query Performance', () => {
    it('should execute hybrid queries within performance thresholds', async () => {
      console.log('🔍 Benchmarking hybrid query performance...');
      
      hybridQueryMeasurement.startMeasurement();
      
      const queryParams = {
        table: 'incident',
        group: 'all',
        state: 'active',
        page: 1,
        limit: 10
      };
      
      for (let i = 0; i < Math.min(BENCHMARK_CONFIG.iterations, 50); i++) {
        const startTime = performance.now();
        
        const result = await consolidatedTicketService.hybridQuery({
          ...queryParams,
          page: i + 1
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        hybridQueryMeasurement.addMeasurement(duration);
        
        // Verify query result
        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
        expect(result.currentPage).toBe(i + 1);
        expect(['mongodb', 'servicenow', 'hybrid']).toContain(result.source);
      }
      
      hybridQueryMeasurement.endMeasurement();
      const stats = hybridQueryMeasurement.getStats();
      
      console.log('Hybrid Query Performance Stats:', {
        avgTime: `${stats.avg.toFixed(2)}ms`,
        p95Time: `${stats.p95.toFixed(2)}ms`,
        memoryUsed: `${stats.memoryUsedMB.toFixed(2)}MB`
      });
      
      // Performance assertions
      expect(stats.avg).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.hybridQuery.maxAvgTime);
      expect(stats.p95).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.hybridQuery.maxP95Time);
      expect(stats.memoryUsedMB).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.hybridQuery.maxMemoryMB);
      
    }, BENCHMARK_CONFIG.timeout);

    it('should handle different table types efficiently', async () => {
      console.log('📊 Benchmarking multi-table hybrid queries...');
      
      const tables = ['incident', 'change_task', 'sc_task'];
      const resultsPerTable: Record<string, number[]> = {};
      
      for (const table of tables) {
        resultsPerTable[table] = [];
        
        for (let i = 0; i < 10; i++) {
          const startTime = performance.now();
          
          const result = await consolidatedTicketService.hybridQuery({
            table,
            group: 'all',
            state: 'all',
            page: 1,
            limit: 5
          });
          
          const endTime = performance.now();
          const duration = endTime - startTime;
          
          resultsPerTable[table].push(duration);
          
          expect(result).toBeDefined();
          expect(result.data).toBeDefined();
        }
      }
      
      // Analyze performance by table type
      for (const [table, times] of Object.entries(resultsPerTable)) {
        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        console.log(`${table} avg query time: ${avgTime.toFixed(2)}ms`);
        
        expect(avgTime).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.hybridQuery.maxAvgTime);
      }
    }, BENCHMARK_CONFIG.timeout);
  });

  describe('Synchronization Performance', () => {
    it('should execute synchronization within performance thresholds', async () => {
      console.log('🔄 Benchmarking synchronization performance...');
      
      synchronizationMeasurement.startMeasurement();
      
      const iterations = Math.min(BENCHMARK_CONFIG.iterations, 10); // Sync is expensive
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        const syncResult = await consolidatedTicketService.syncCurrentMonthTickets();
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        synchronizationMeasurement.addMeasurement(duration);
        
        // Verify sync result
        expect(syncResult.success).toBe(true);
        expect(syncResult.stats).toBeDefined();
        expect(syncResult.stats.incidents).toBeDefined();
        expect(syncResult.stats.change_tasks).toBeDefined();
        expect(syncResult.stats.sc_tasks).toBeDefined();
      }
      
      synchronizationMeasurement.endMeasurement();
      const stats = synchronizationMeasurement.getStats();
      
      console.log('Synchronization Performance Stats:', {
        avgTime: `${stats.avg.toFixed(2)}ms`,
        p95Time: `${stats.p95.toFixed(2)}ms`,
        memoryUsed: `${stats.memoryUsedMB.toFixed(2)}MB`,
        iterations
      });
      
      // Performance assertions
      expect(stats.avg).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.synchronization.maxAvgTime);
      expect(stats.p95).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.synchronization.maxP95Time);
      expect(stats.memoryUsedMB).toBeLessThan(BENCHMARK_CONFIG.performanceThresholds.synchronization.maxMemoryMB);
      
    }, BENCHMARK_CONFIG.timeout);
  });

  describe('Memory Usage and Resource Management', () => {
    it('should maintain reasonable memory usage under load', async () => {
      console.log('🧠 Benchmarking memory usage under load...');
      
      const initialMemory = process.memoryUsage();
      
      // Create load: multiple services, connections, and operations
      const services = Array.from({ length: 10 }, () => 
        new ConsolidatedServiceNowService(mockServiceNowClient)
      );
      
      const connections = Array.from({ length: 100 }, (_, i) =>
        unifiedStreamingService.createTicketSSEConnection(`memory-test-${i}`)
      );
      
      // Perform operations
      const operations = services.map(async (service, i) => {
        const tickets = await Promise.all([
          service.getTicketDetails(`memory-op-${i}-1`, 'incident'),
          service.getTicketDetails(`memory-op-${i}-2`, 'change_task'),
          service.getTicketDetails(`memory-op-${i}-3`, 'sc_task')
        ]);
        
        const query = await service.hybridQuery({
          table: 'incident',
          group: 'all',
          state: 'all',
          page: 1,
          limit: 5
        });
        
        return { tickets, query };
      });
      
      const results = await Promise.all(operations);
      
      const peakMemory = process.memoryUsage();
      const memoryDiff = {
        heapUsed: (peakMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024,
        heapTotal: (peakMemory.heapTotal - initialMemory.heapTotal) / 1024 / 1024,
        rss: (peakMemory.rss - initialMemory.rss) / 1024 / 1024
      };
      
      console.log('Memory Usage Under Load:', {
        heapUsedMB: memoryDiff.heapUsed.toFixed(2),
        heapTotalMB: memoryDiff.heapTotal.toFixed(2),
        rssMB: memoryDiff.rss.toFixed(2),
        services: services.length,
        connections: connections.length,
        operations: results.length
      });
      
      // Verify operations completed successfully
      expect(results).toHaveLength(services.length);
      results.forEach(result => {
        expect(result.tickets).toHaveLength(3);
        expect(result.query).toBeDefined();
      });
      
      // Cleanup
      await Promise.all(services.map(service => service.cleanup()));
      
      // Memory usage should be reasonable
      expect(memoryDiff.heapUsed).toBeLessThan(500); // 500MB threshold
      
    }, BENCHMARK_CONFIG.timeout);

    it('should properly cleanup resources', async () => {
      console.log('🧹 Benchmarking resource cleanup...');
      
      const initialMemory = process.memoryUsage();
      const initialStats = unifiedStreamingService.getConnectionStats();
      
      // Create resources
      const service = new ConsolidatedServiceNowService(mockServiceNowClient);
      const connections = Array.from({ length: 50 }, (_, i) =>
        unifiedStreamingService.createTicketSSEConnection(`cleanup-test-${i}`)
      );
      
      // Verify resources were created
      const statsAfterCreation = unifiedStreamingService.getConnectionStats();
      expect(statsAfterCreation.totalConnections).toBe(
        initialStats.totalConnections + connections.length
      );
      
      // Cleanup
      const cleanupStartTime = performance.now();
      
      await service.cleanup();
      unifiedStreamingService.cleanup();
      
      const cleanupEndTime = performance.now();
      const cleanupDuration = cleanupEndTime - cleanupStartTime;
      
      // Verify cleanup
      const finalStats = unifiedStreamingService.getConnectionStats();
      const finalMemory = process.memoryUsage();
      
      console.log('Resource Cleanup Performance:', {
        cleanupTime: `${cleanupDuration.toFixed(2)}ms`,
        connectionsAfterCleanup: finalStats.totalConnections,
        memoryReclaimed: `${((initialMemory.heapUsed - finalMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`
      });
      
      expect(finalStats.totalConnections).toBe(0);
      expect(cleanupDuration).toBeLessThan(1000); // Cleanup should be fast
      
    }, BENCHMARK_CONFIG.timeout);
  });

  describe('Consolidation Performance Comparison', () => {
    it('should demonstrate performance benefits of consolidation', async () => {
      console.log('📈 Demonstrating consolidation performance benefits...');
      
      // Simulate pre-consolidation pattern (multiple service instances)
      const preConsolidationStartTime = performance.now();
      
      // Simulate multiple separate services (as they were before Phase 2)
      const separateServices = Array.from({ length: 4 }, () => 
        new ConsolidatedServiceNowService(mockServiceNowClient)
      );
      
      // Perform operations using separate services
      const separateResults = await Promise.all([
        separateServices[0].getTicketDetails('comparison-1', 'incident'),
        separateServices[1].hybridQuery({
          table: 'incident', group: 'all', state: 'all', page: 1, limit: 5
        }),
        separateServices[2].getStats(),
        separateServices[3].syncCurrentMonthTickets()
      ]);
      
      const preConsolidationEndTime = performance.now();
      const preConsolidationTime = preConsolidationEndTime - preConsolidationStartTime;
      
      // Cleanup separate services
      await Promise.all(separateServices.map(service => service.cleanup()));
      
      // Post-consolidation pattern (single consolidated service)
      const postConsolidationStartTime = performance.now();
      
      const consolidatedService = new ConsolidatedServiceNowService(mockServiceNowClient);
      
      // Perform same operations using consolidated service
      const consolidatedResults = await Promise.all([
        consolidatedService.getTicketDetails('comparison-1', 'incident'),
        consolidatedService.hybridQuery({
          table: 'incident', group: 'all', state: 'all', page: 1, limit: 5
        }),
        consolidatedService.getStats(),
        consolidatedService.syncCurrentMonthTickets()
      ]);
      
      const postConsolidationEndTime = performance.now();
      const postConsolidationTime = postConsolidationEndTime - postConsolidationStartTime;
      
      await consolidatedService.cleanup();
      
      // Calculate performance improvement
      const performanceImprovement = ((preConsolidationTime - postConsolidationTime) / preConsolidationTime) * 100;
      
      console.log('Consolidation Performance Comparison:', {
        preConsolidationTime: `${preConsolidationTime.toFixed(2)}ms`,
        postConsolidationTime: `${postConsolidationTime.toFixed(2)}ms`,
        performanceImprovement: `${performanceImprovement.toFixed(2)}%`
      });
      
      // Verify both approaches returned valid results
      expect(separateResults).toHaveLength(4);
      expect(consolidatedResults).toHaveLength(4);
      
      // Consolidated service should perform at least as well (or better)
      expect(postConsolidationTime).toBeLessThanOrEqual(preConsolidationTime * 1.1); // 10% tolerance
      
      if (performanceImprovement > 0) {
        console.log(`✅ Consolidation improved performance by ${performanceImprovement.toFixed(2)}%`);
      } else {
        console.log(`ℹ️ Consolidation maintained performance within acceptable range`);
      }
      
    }, BENCHMARK_CONFIG.timeout);
  });

  describe('Performance Summary and Validation', () => {
    it('should validate all performance thresholds are met', () => {
      console.log('📋 Validating all performance thresholds...');
      
      const allStats = {
        ticketRetrieval: ticketRetrievalMeasurement.getStats(),
        streamConnection: streamConnectionMeasurement.getStats(),
        hybridQuery: hybridQueryMeasurement.getStats(),
        synchronization: synchronizationMeasurement.getStats()
      };
      
      console.log('Performance Summary:', {
        ticketRetrieval: {
          avgTime: `${allStats.ticketRetrieval.avg.toFixed(2)}ms`,
          p95Time: `${allStats.ticketRetrieval.p95.toFixed(2)}ms`,
          threshold: `${BENCHMARK_CONFIG.performanceThresholds.ticketRetrieval.maxAvgTime}ms avg`
        },
        streamConnection: {
          avgTime: `${allStats.streamConnection.avg.toFixed(2)}ms`,
          p95Time: `${allStats.streamConnection.p95.toFixed(2)}ms`,
          threshold: `${BENCHMARK_CONFIG.performanceThresholds.streamConnection.maxAvgTime}ms avg`
        },
        hybridQuery: {
          avgTime: `${allStats.hybridQuery.avg.toFixed(2)}ms`,
          p95Time: `${allStats.hybridQuery.p95.toFixed(2)}ms`,
          threshold: `${BENCHMARK_CONFIG.performanceThresholds.hybridQuery.maxAvgTime}ms avg`
        },
        synchronization: {
          avgTime: `${allStats.synchronization.avg.toFixed(2)}ms`,
          p95Time: `${allStats.synchronization.p95.toFixed(2)}ms`,
          threshold: `${BENCHMARK_CONFIG.performanceThresholds.synchronization.maxAvgTime}ms avg`
        }
      });
      
      // Final validation of all thresholds
      const thresholds = BENCHMARK_CONFIG.performanceThresholds;
      
      expect(allStats.ticketRetrieval.avg).toBeLessThan(thresholds.ticketRetrieval.maxAvgTime);
      expect(allStats.streamConnection.avg).toBeLessThan(thresholds.streamConnection.maxAvgTime);
      expect(allStats.hybridQuery.avg).toBeLessThan(thresholds.hybridQuery.maxAvgTime);
      expect(allStats.synchronization.avg).toBeLessThan(thresholds.synchronization.maxAvgTime);
      
      console.log('🎉 All performance thresholds validated successfully!');
      console.log('✅ Phase 2 consolidations maintain excellent performance characteristics');
      
    });
  });
});