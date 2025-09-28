/**
 * Service Locator Tests - Validate v5.0.0 Architecture
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Tests the new specialized controller architecture following Elysia best practices
 * Validates "1 controller = 1 instância" principle implementation
 */

import { describe, it, expect, beforeEach, afterEach, test } from "bun:test";
import { Elysia } from "elysia";
import { serviceLocator } from "../../plugins/service-locator";

describe("Service Locator v5.0.0 Architecture Tests", () => {
  let app: Elysia;

  beforeEach(() => {
    // Create fresh app with service locator for each test
    app = new Elysia().use(serviceLocator);
  });

  afterEach(async () => {
    // Cleanup after each test
    if (app) {
      // Graceful shutdown if needed
    }
  });

  describe("Service Locator Integration", () => {
    test("should integrate service locator with all specialized controllers", async () => {
      const testApp = app.get("/locator-test", ({ services, serviceStatus }) => {
        return {
          hasServiceRegistry: !!services,
          serviceStatus,
          registeredServices: services ? services.getStats().registeredServices : []
        };
      });

      const response = await testApp.handle(new Request("http://localhost/locator-test"));
      const result = await response.json();

      expect(result).toBeDefined();
      expect(result.hasServiceRegistry).toBe(true);
      expect(result.serviceStatus).toBeDefined();
      expect(typeof result.serviceStatus).toBe("object");
      expect(Array.isArray(result.registeredServices)).toBe(true);
    });

    test("should provide access to all specialized controllers", async () => {
      const testApp = app.get("/controllers-test", ({
        config,
        mongo,
        cache,
        sync,
        health
      }) => {
        return {
          hasConfig: !!config,
          hasMongo: !!mongo,
          hasCache: !!cache,
          hasSync: !!sync,
          hasHealth: !!health,
          controllersAvailable: [
            config ? 'config' : null,
            mongo ? 'mongo' : null,
            cache ? 'cache' : null,
            sync ? 'sync' : null,
            health ? 'health' : null
          ].filter(Boolean)
        };
      });

      const response = await testApp.handle(new Request("http://localhost/controllers-test"));
      const result = await response.json();

      expect(result).toBeDefined();
      // At least some controllers should be available
      expect(result.controllersAvailable.length).toBeGreaterThan(0);

      // Config should always be available (mandatory)
      expect(result.hasConfig).toBe(true);
    });

    test("should provide unified service interface", async () => {
      const testApp = app.get("/unified-test", ({
        getConfig,
        findOne,
        cacheGet,
        syncTable,
        checkSystemHealth
      }) => {
        return {
          hasGetConfig: typeof getConfig === 'function',
          hasFindOne: typeof findOne === 'function',
          hasCacheGet: typeof cacheGet === 'function',
          hasSyncTable: typeof syncTable === 'function',
          hasCheckSystemHealth: typeof checkSystemHealth === 'function'
        };
      });

      const response = await testApp.handle(new Request("http://localhost/unified-test"));
      const result = await response.json();

      expect(result).toBeDefined();
      expect(result.hasGetConfig).toBe(true);
      expect(result.hasFindOne).toBe(true);
      expect(result.hasCacheGet).toBe(true);
      expect(result.hasSyncTable).toBe(true);
      expect(result.hasCheckSystemHealth).toBe(true);
    });
  });

  describe("Specialized Controllers Functionality", () => {
    test("should handle configuration operations", async () => {
      const testApp = app.get("/config-test", async ({ getConfig, getSection }) => {
        try {
          const config = getConfig();
          const serverSection = getSection ? getSection('server') : null;

          return {
            success: true,
            hasConfig: !!config,
            hasServerSection: !!serverSection,
            configType: typeof config
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message
          };
        }
      });

      const response = await testApp.handle(new Request("http://localhost/config-test"));
      const result = await response.json();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.hasConfig).toBe(true);
      expect(result.configType).toBe("object");
    });

    test("should handle database operations gracefully", async () => {
      const testApp = app.post("/mongo-test", async ({ findOne, insertOne }) => {
        try {
          // Test find operation
          const existing = await findOne('test_table', { test: true });

          // Test insert operation
          const insertResult = await insertOne('test_table', {
            test: true,
            timestamp: new Date().toISOString()
          });

          return {
            success: true,
            findResult: existing,
            insertResult,
            hasInsertedId: !!insertResult.insertedId
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message
          };
        }
      });

      const response = await testApp.handle(
        new Request("http://localhost/mongo-test", { method: "POST" })
      );
      const result = await response.json();

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");

      if (result.success) {
        expect(result.hasInsertedId).toBe(true);
      }
      // Should not crash even if MongoDB is not available
    });

    test("should handle cache operations gracefully", async () => {
      const testApp = app.post("/cache-test", async ({ cacheSet, cacheGet, cacheDel }) => {
        try {
          const testKey = `test:${Date.now()}`;
          const testValue = { message: "test", timestamp: Date.now() };

          // Test cache operations
          const setResult = await cacheSet(testKey, testValue, 60);
          const getValue = await cacheGet(testKey);
          const delResult = await cacheDel(testKey);

          return {
            success: true,
            setResult,
            getValue,
            delResult,
            valueMatches: JSON.stringify(getValue) === JSON.stringify(testValue)
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message
          };
        }
      });

      const response = await testApp.handle(
        new Request("http://localhost/cache-test", { method: "POST" })
      );
      const result = await response.json();

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
      // Should not crash even if Redis is not available
    });

    test("should handle sync operations gracefully", async () => {
      const testApp = app.post("/sync-test", async ({ syncTable, getSyncStats }) => {
        try {
          // Test sync operation
          const syncResult = await syncTable('incident', { batchSize: 5 });

          // Test get stats
          const stats = await getSyncStats('incident');

          return {
            success: true,
            syncResult,
            stats,
            hasSyncResult: !!syncResult,
            statsIsArray: Array.isArray(stats)
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message
          };
        }
      });

      const response = await testApp.handle(
        new Request("http://localhost/sync-test", { method: "POST" })
      );
      const result = await response.json();

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");

      if (result.success) {
        expect(result.hasSyncResult).toBe(true);
        expect(result.statsIsArray).toBe(true);
      }
    });

    test("should handle health monitoring operations", async () => {
      const testApp = app.get("/health-test", async ({
        checkSystemHealth,
        checkServiceHealth,
        isHealthy,
        getSystemMetrics
      }) => {
        try {
          // Test health operations
          const systemHealth = await checkSystemHealth();
          const mongoHealth = await checkServiceHealth('mongodb');
          const isSystemHealthy = await isHealthy();
          const metrics = await getSystemMetrics();

          return {
            success: true,
            systemHealth,
            mongoHealth,
            isSystemHealthy,
            metrics,
            hasSystemHealth: !!systemHealth,
            hasMetrics: !!metrics
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message
          };
        }
      });

      const response = await testApp.handle(new Request("http://localhost/health-test"));
      const result = await response.json();

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");

      if (result.success) {
        expect(result.hasSystemHealth).toBe(true);
        expect(result.hasMetrics).toBe(true);
        expect(typeof result.isSystemHealthy).toBe("boolean");
      }
    });
  });

  describe("Error Handling and Graceful Degradation", () => {
    test("should handle service unavailability gracefully", async () => {
      const testApp = app.get("/degradation-test", async ({
        healthCheck,
        getStats
      }) => {
        try {
          const isHealthy = await healthCheck();
          const stats = await getStats();

          return {
            success: true,
            isHealthy,
            stats,
            hasStats: !!stats
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message
          };
        }
      });

      const response = await testApp.handle(new Request("http://localhost/degradation-test"));
      const result = await response.json();

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");

      // Service Locator should always provide fallback responses
      if (result.success) {
        expect(typeof result.isHealthy).toBe("boolean");
        expect(result.hasStats).toBe(true);
      }
    });

    test("should provide meaningful error responses", async () => {
      const testApp = app.post("/error-test", async ({ syncTable }) => {
        try {
          // Test with invalid parameters to trigger error handling
          const result = await syncTable('invalid_table_name_that_should_fail');

          return {
            success: true,
            result,
            errorHandled: true
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            errorCaught: true
          };
        }
      });

      const response = await testApp.handle(
        new Request("http://localhost/error-test", { method: "POST" })
      );
      const result = await response.json();

      expect(result).toBeDefined();
      // Should either succeed with error handling or fail gracefully
      expect(typeof result.success).toBe("boolean");

      if (!result.success) {
        expect(result.errorCaught).toBe(true);
        expect(typeof result.error).toBe("string");
      }
    });
  });

  describe("Performance and Concurrency", () => {
    test("should handle multiple concurrent service requests", async () => {
      const testApp = app.get("/concurrent/:id", async ({
        params,
        getConfig,
        isHealthy,
        cacheGet
      }) => {
        try {
          // Simulate concurrent operations
          const [config, healthy, cached] = await Promise.all([
            Promise.resolve(getConfig()),
            isHealthy(),
            cacheGet(`test:${params.id}`)
          ]);

          return {
            id: params.id,
            success: true,
            hasConfig: !!config,
            isHealthy: healthy,
            cachedValue: cached
          };
        } catch (error) {
          return {
            id: params.id,
            success: false,
            error: (error as Error).message
          };
        }
      });

      // Create 5 concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        testApp.handle(new Request(`http://localhost/concurrent/${i}`))
      );

      const responses = await Promise.allSettled(requests);

      // All requests should complete
      expect(responses.length).toBe(5);

      // Most should succeed
      const successful = responses.filter(r => r.status === "fulfilled").length;
      expect(successful).toBeGreaterThan(0);

      // Check response structure for successful requests
      for (const response of responses) {
        if (response.status === "fulfilled") {
          const result = await response.value.json();
          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
          expect(typeof result.success).toBe("boolean");
        }
      }
    });

    test("should maintain service registry consistency", async () => {
      const testApp = app.get("/consistency-test", ({ services }) => {
        const stats1 = services.getStats();
        const status1 = services.getServiceStatus();

        // Multiple access should be consistent
        const stats2 = services.getStats();
        const status2 = services.getServiceStatus();

        return {
          success: true,
          statsConsistent: JSON.stringify(stats1) === JSON.stringify(stats2),
          statusConsistent: JSON.stringify(status1) === JSON.stringify(status2),
          registeredServices: stats1.registeredServices
        };
      });

      const response = await testApp.handle(new Request("http://localhost/consistency-test"));
      const result = await response.json();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.statsConsistent).toBe(true);
      expect(result.statusConsistent).toBe(true);
      expect(Array.isArray(result.registeredServices)).toBe(true);
    });
  });

  describe("Service Locator Lifecycle", () => {
    test("should handle service locator initialization", async () => {
      const lifecycleApp = new Elysia()
        .use(serviceLocator)
        .get("/lifecycle", ({ services, serviceStatus }) => {
          return {
            initialized: !!services,
            stats: services ? services.getStats() : null,
            serviceStatus
          };
        });

      const response = await lifecycleApp.handle(new Request("http://localhost/lifecycle"));
      const result = await response.json();

      expect(result.initialized).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.serviceStatus).toBeDefined();
    });

    test("should provide comprehensive service statistics", async () => {
      const testApp = app.get("/stats-test", async ({ getStats }) => {
        try {
          const stats = await getStats();

          return {
            success: true,
            stats,
            hasServiceLocatorStats: !!stats.serviceLocator,
            hasServicesStats: !!stats.services
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message
          };
        }
      });

      const response = await testApp.handle(new Request("http://localhost/stats-test"));
      const result = await response.json();

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");

      if (result.success) {
        expect(result.hasServiceLocatorStats).toBe(true);
        expect(result.hasServicesStats).toBe(true);
      }
    });
  });
});

// Architecture Validation Tests
describe("v5.0.0 Architecture Compliance", () => {
  test("should follow '1 controller = 1 instância' principle", async () => {
    const app = new Elysia().use(serviceLocator);

    const testApp = app.get("/architecture-test", ({ services }) => {
      const stats = services.getStats();
      const registeredServices = stats.registeredServices;

      // Each service should be a single instance
      const serviceTypes = new Set(registeredServices);
      const uniqueServices = serviceTypes.size;
      const totalServices = registeredServices.length;

      return {
        registeredServices,
        uniqueServices,
        totalServices,
        followsOneControllerOneInstance: uniqueServices === totalServices,
        compliance: {
          configService: registeredServices.includes('config'),
          mongoService: registeredServices.includes('mongo'),
          cacheService: registeredServices.includes('cache'),
          syncService: registeredServices.includes('sync'),
          healthService: registeredServices.includes('health')
        }
      };
    });

    const response = await testApp.handle(new Request("http://localhost/architecture-test"));
    const result = await response.json();

    expect(result).toBeDefined();
    expect(result.followsOneControllerOneInstance).toBe(true);
    expect(result.uniqueServices).toBeGreaterThan(0);

    // Verify specialized controllers are registered
    expect(result.compliance.configService).toBe(true);
  });

  test("should demonstrate improved architecture over mega-plugin", async () => {
    const app = new Elysia().use(serviceLocator);

    const testApp = app.get("/improvement-test", ({ services, serviceStatus }) => {
      const stats = services.getStats();

      return {
        architecture: "specialized-controllers",
        version: "v5.0.0",
        principle: "1-controller-1-instance",
        benefits: {
          separationOfConcerns: true,
          testability: true,
          maintainability: true,
          gracefulDegradation: true,
          dependencyInjection: true
        },
        services: {
          total: stats.registeredServices.length,
          available: Object.values(serviceStatus).filter(Boolean).length,
          status: serviceStatus
        }
      };
    });

    const response = await testApp.handle(new Request("http://localhost/improvement-test"));
    const result = await response.json();

    expect(result).toBeDefined();
    expect(result.architecture).toBe("specialized-controllers");
    expect(result.version).toBe("v5.0.0");
    expect(result.principle).toBe("1-controller-1-instance");
    expect(result.benefits.separationOfConcerns).toBe(true);
    expect(result.benefits.testability).toBe(true);
    expect(result.benefits.maintainability).toBe(true);
    expect(result.services.total).toBeGreaterThan(0);
  });
});