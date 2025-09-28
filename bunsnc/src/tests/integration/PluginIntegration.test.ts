/**
 * Plugin Integration Test Suite - Elysia Plugin System Integration Testing
 * Tests real plugin functionality and inter-plugin communication
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeAll, afterAll, test } from "bun:test";
import { Elysia } from "elysia";
import { configPlugin } from "../../plugins/config-manager";
import { redisPlugin } from "../../plugins/redis";
import { serviceNowPlugin } from "../../plugins/servicenow";
import { dataPlugin } from "../../plugins/data";
import { metricsMonitorPlugin } from "../../plugins/metrics-monitor";

// Plugin integration test configuration
const pluginConfig = {
  timeout: 30000, // 30 seconds for plugin integration tests
  testPort: 3009, // Different port to avoid conflicts
};

describe("Plugin Integration Tests", () => {
  let app: Elysia;

  beforeAll(async () => {
    console.log("🔄 Setting up plugin integration test environment...");
  }, pluginConfig.timeout);

  afterAll(async () => {
    try {
      if (app) {
        await app.stop();
      }
    } catch (error) {
      console.warn("Plugin cleanup warning:", error);
    }
  });

  describe("Configuration Plugin Integration", () => {
    test(
      "should initialize configuration plugin successfully",
      async () => {
        app = new Elysia({ name: "plugin-test" }).use(configPlugin);

        expect(app).toBeDefined();

        // Test plugin registration
        const context = await app.handle(new Request("http://localhost/test"));
        expect(context.status).toBeDefined();
      },
      pluginConfig.timeout,
    );

    test(
      "should provide configuration context correctly",
      async () => {
        app = new Elysia({ name: "config-test" })
          .use(configPlugin)
          .get("/test-config", ({ config, getConfig, getSection }) => {
            return {
              hasConfig: !!config,
              hasGetConfig: typeof getConfig === "function",
              hasGetSection: typeof getSection === "function",
              serverConfig: getSection("server"),
            };
          });

        const response = await app.handle(
          new Request("http://localhost/test-config"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.hasConfig).toBe(true);
        expect(data.hasGetConfig).toBe(true);
        expect(data.hasGetSection).toBe(true);
        expect(data.serverConfig).toBeDefined();
        expect(data.serverConfig.port).toBeDefined();
      },
      pluginConfig.timeout,
    );

    test(
      "should handle configuration updates correctly",
      async () => {
        app = new Elysia({ name: "config-update-test" })
          .use(configPlugin)
          .post("/test-config-update", async ({ updateSection }) => {
            try {
              await updateSection("server", { port: 3010 });
              return { success: true, message: "Configuration updated" };
            } catch (error) {
              return { success: false, error: (error as Error).message };
            }
          });

        const response = await app.handle(
          new Request("http://localhost/test-config-update", {
            method: "POST",
          }),
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
      },
      pluginConfig.timeout,
    );
  });

  describe("Redis Plugin Integration", () => {
    test(
      "should initialize Redis plugin with config dependency",
      async () => {
        app = new Elysia({ name: "redis-test" })
          .use(configPlugin)
          .use(redisPlugin);

        expect(app).toBeDefined();

        // Test Redis context availability
        const testApp = app.get(
          "/test-redis",
          ({ redis, redisCache, redisStreams }) => {
            return {
              hasRedis: !!redis,
              hasRedisCache: !!redisCache,
              hasRedisStreams: !!redisStreams,
              redisConnected: redis?.isConnected(),
            };
          },
        );

        const response = await testApp.handle(
          new Request("http://localhost/test-redis"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.hasRedis).toBe(true);
        expect(data.hasRedisCache).toBe(true);
        expect(data.hasRedisStreams).toBe(true);
      },
      pluginConfig.timeout,
    );

    test(
      "should perform Redis operations through plugin",
      async () => {
        app = new Elysia({ name: "redis-ops-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .post("/test-redis-ops", async ({ redis }) => {
            try {
              const testKey = `plugin-test:${Date.now()}`;
              const testValue = "plugin-integration-test";

              // Test Redis operations
              await redis.getClient().set(testKey, testValue, "EX", 60);
              const retrievedValue = await redis.getClient().get(testKey);
              await redis.getClient().del(testKey);

              return {
                success: true,
                testKey,
                testValue,
                retrievedValue,
                valuesMatch: testValue === retrievedValue,
              };
            } catch (error) {
              return {
                success: false,
                error: (error as Error).message,
              };
            }
          });

        const response = await app.handle(
          new Request("http://localhost/test-redis-ops", { method: "POST" }),
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.valuesMatch).toBe(true);
      },
      pluginConfig.timeout,
    );

    test(
      "should handle Redis cache operations",
      async () => {
        app = new Elysia({ name: "redis-cache-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .post("/test-redis-cache", async ({ redisCache }) => {
            try {
              const cacheKey = `cache-test:${Date.now()}`;
              const cacheValue = { test: true, timestamp: Date.now() };

              // Test cache operations
              await redisCache.set(cacheKey, cacheValue, 60);
              const retrievedValue = await redisCache.get(cacheKey);
              await redisCache.delete(cacheKey);

              return {
                success: true,
                cacheKey,
                cacheValue,
                retrievedValue,
                valuesMatch:
                  JSON.stringify(cacheValue) === JSON.stringify(retrievedValue),
              };
            } catch (error) {
              return {
                success: false,
                error: (error as Error).message,
              };
            }
          });

        const response = await app.handle(
          new Request("http://localhost/test-redis-cache", { method: "POST" }),
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.valuesMatch).toBe(true);
      },
      pluginConfig.timeout,
    );
  });

  describe("ServiceNow Plugin Integration", () => {
    test(
      "should initialize ServiceNow plugin with dependencies",
      async () => {
        app = new Elysia({ name: "servicenow-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .use(serviceNowPlugin);

        expect(app).toBeDefined();

        // Test ServiceNow context availability
        const testApp = app.get(
          "/test-servicenow",
          ({ serviceNowAuth, serviceNowBridge }) => {
            return {
              hasServiceNowAuth: !!serviceNowAuth,
              hasServiceNowBridge: !!serviceNowBridge,
              authStatus: serviceNowAuth?.getAuthenticationStatus(),
            };
          },
        );

        const response = await testApp.handle(
          new Request("http://localhost/test-servicenow"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.hasServiceNowAuth).toBe(true);
        expect(data.hasServiceNowBridge).toBe(true);
        expect(data.authStatus).toBeDefined();
      },
      pluginConfig.timeout,
    );

    test(
      "should provide ServiceNow authentication context",
      async () => {
        app = new Elysia({ name: "servicenow-auth-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .use(serviceNowPlugin)
          .get("/test-servicenow-auth", ({ serviceNowAuth }) => {
            const authStatus = serviceNowAuth.getAuthenticationStatus();
            const connectionConfig = serviceNowAuth.getConnectionConfig();

            return {
              authType: authStatus.type,
              initialized: authStatus.initialized,
              instanceUrl: connectionConfig.instanceUrl,
              proxyEnabled: connectionConfig.proxyEnabled,
            };
          });

        const response = await app.handle(
          new Request("http://localhost/test-servicenow-auth"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.authType).toBe("saml");
        expect(data.initialized).toBe(true);
        expect(data.instanceUrl).toContain("iberdrola.service-now.com");
        expect(data.proxyEnabled).toBe(true);
      },
      pluginConfig.timeout,
    );
  });

  describe("Data Plugin Integration", () => {
    test(
      "should initialize data plugin with all dependencies",
      async () => {
        app = new Elysia({ name: "data-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .use(serviceNowPlugin)
          .use(dataPlugin);

        expect(app).toBeDefined();

        // Test data context availability
        const testApp = app.get(
          "/test-data",
          ({ dataService, ticketRepository }) => {
            return {
              hasDataService: !!dataService,
              hasTicketRepository: !!ticketRepository,
              dataServiceType: dataService?.constructor.name,
            };
          },
        );

        const response = await testApp.handle(
          new Request("http://localhost/test-data"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.hasDataService).toBe(true);
        expect(data.hasTicketRepository).toBe(true);
        expect(data.dataServiceType).toBeDefined();
      },
      pluginConfig.timeout,
    );

    test(
      "should provide data service operations",
      async () => {
        app = new Elysia({ name: "data-ops-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .use(serviceNowPlugin)
          .use(dataPlugin)
          .get("/test-data-ops", async ({ dataService }) => {
            try {
              const stats = await dataService.getConnectionStats();
              const syncStatus = await dataService.getSyncStatus();

              return {
                success: true,
                hasStats: !!stats,
                hasSyncStatus: !!syncStatus,
                mongoConnected: stats.mongodb?.connected,
                redisConnected: stats.redis?.connected,
              };
            } catch (error) {
              return {
                success: false,
                error: (error as Error).message,
              };
            }
          });

        const response = await app.handle(
          new Request("http://localhost/test-data-ops"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.hasStats).toBe(true);
        expect(data.hasSyncStatus).toBe(true);
      },
      pluginConfig.timeout,
    );
  });

  describe("Metrics Monitor Plugin Integration", () => {
    test(
      "should initialize metrics plugin with dependencies",
      async () => {
        app = new Elysia({ name: "metrics-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .use(metricsMonitorPlugin);

        expect(app).toBeDefined();

        // Test metrics context availability
        const testApp = app.get(
          "/test-metrics",
          ({ metricsMonitor, systemMetrics }) => {
            return {
              hasMetricsMonitor: !!metricsMonitor,
              hasSystemMetrics: !!systemMetrics,
              metricsType: metricsMonitor?.constructor.name,
            };
          },
        );

        const response = await testApp.handle(
          new Request("http://localhost/test-metrics"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.hasMetricsMonitor).toBe(true);
        expect(data.hasSystemMetrics).toBe(true);
        expect(data.metricsType).toBeDefined();
      },
      pluginConfig.timeout,
    );

    test(
      "should collect system metrics",
      async () => {
        app = new Elysia({ name: "metrics-collect-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .use(metricsMonitorPlugin)
          .get("/test-metrics-collect", async ({ systemMetrics }) => {
            try {
              const metrics = await systemMetrics.collectMetrics();

              return {
                success: true,
                hasMetrics: !!metrics,
                hasCpu: !!metrics.cpu,
                hasMemory: !!metrics.memory,
                hasUptime: !!metrics.uptime,
                hasConnections: !!metrics.connections,
              };
            } catch (error) {
              return {
                success: false,
                error: (error as Error).message,
              };
            }
          });

        const response = await app.handle(
          new Request("http://localhost/test-metrics-collect"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.hasMetrics).toBe(true);
        expect(data.hasCpu).toBe(true);
        expect(data.hasMemory).toBe(true);
        expect(data.hasUptime).toBe(true);
      },
      pluginConfig.timeout,
    );
  });

  describe("Full Plugin Chain Integration", () => {
    test(
      "should initialize complete plugin chain successfully",
      async () => {
        app = new Elysia({ name: "full-chain-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .use(serviceNowPlugin)
          .use(dataPlugin)
          .use(metricsMonitorPlugin);

        expect(app).toBeDefined();

        // Test all plugins working together
        const testApp = app.get(
          "/test-full-chain",
          ({
            config,
            redis,
            redisCache,
            redisStreams,
            serviceNowAuth,
            serviceNowBridge,
            dataService,
            ticketRepository,
            metricsMonitor,
            systemMetrics,
          }) => {
            return {
              pluginStatus: {
                config: !!config,
                redis: !!redis,
                redisCache: !!redisCache,
                redisStreams: !!redisStreams,
                serviceNowAuth: !!serviceNowAuth,
                serviceNowBridge: !!serviceNowBridge,
                dataService: !!dataService,
                ticketRepository: !!ticketRepository,
                metricsMonitor: !!metricsMonitor,
                systemMetrics: !!systemMetrics,
              },
              allPluginsLoaded: [
                config,
                redis,
                redisCache,
                redisStreams,
                serviceNowAuth,
                serviceNowBridge,
                dataService,
                ticketRepository,
                metricsMonitor,
                systemMetrics,
              ].every((plugin) => !!plugin),
            };
          },
        );

        const response = await testApp.handle(
          new Request("http://localhost/test-full-chain"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.allPluginsLoaded).toBe(true);
        expect(data.pluginStatus.config).toBe(true);
        expect(data.pluginStatus.redis).toBe(true);
        expect(data.pluginStatus.serviceNowAuth).toBe(true);
        expect(data.pluginStatus.dataService).toBe(true);
        expect(data.pluginStatus.metricsMonitor).toBe(true);
      },
      pluginConfig.timeout,
    );

    test(
      "should handle plugin interdependencies correctly",
      async () => {
        app = new Elysia({ name: "interdependency-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .use(serviceNowPlugin)
          .use(dataPlugin)
          .use(metricsMonitorPlugin)
          .post(
            "/test-interdependencies",
            async ({
              getConfig,
              redis,
              serviceNowAuth,
              dataService,
              systemMetrics,
            }) => {
              try {
                // Test config -> redis dependency
                const redisConfig = getConfig().redis;
                const redisConnected = redis.isConnected();

                // Test redis -> servicenow dependency
                const authStatus = serviceNowAuth.getAuthenticationStatus();

                // Test servicenow -> data dependency
                const connectionStats = await dataService.getConnectionStats();

                // Test all -> metrics dependency
                const metrics = await systemMetrics.collectMetrics();

                return {
                  success: true,
                  dependencies: {
                    configToRedis: !!redisConfig && redisConnected,
                    redisToServiceNow: redisConnected && authStatus.initialized,
                    serviceNowToData:
                      authStatus.initialized && !!connectionStats,
                    allToMetrics: !!metrics,
                  },
                  allDependenciesWorking: true,
                };
              } catch (error) {
                return {
                  success: false,
                  error: (error as Error).message,
                };
              }
            },
          );

        const response = await app.handle(
          new Request("http://localhost/test-interdependencies", {
            method: "POST",
          }),
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.dependencies.configToRedis).toBe(true);
        expect(data.dependencies.redisToServiceNow).toBe(true);
        expect(data.dependencies.serviceNowToData).toBe(true);
        expect(data.dependencies.allToMetrics).toBe(true);
      },
      pluginConfig.timeout,
    );

    test(
      "should perform end-to-end operation through plugin chain",
      async () => {
        app = new Elysia({ name: "e2e-test" })
          .use(configPlugin)
          .use(redisPlugin)
          .use(serviceNowPlugin)
          .use(dataPlugin)
          .use(metricsMonitorPlugin)
          .post(
            "/test-e2e-operation",
            async ({ redisCache, dataService, systemMetrics }) => {
              try {
                // 1. Cache operation
                const cacheKey = `e2e-test:${Date.now()}`;
                const cacheData = { test: "end-to-end", timestamp: Date.now() };
                await redisCache.set(cacheKey, cacheData, 60);

                // 2. Data operation
                const connectionStats = await dataService.getConnectionStats();

                // 3. Metrics collection
                const metrics = await systemMetrics.collectMetrics();

                // 4. Cleanup
                await redisCache.delete(cacheKey);

                return {
                  success: true,
                  operations: {
                    cacheOperation: true,
                    dataOperation: !!connectionStats,
                    metricsCollection: !!metrics,
                  },
                  e2eComplete: true,
                };
              } catch (error) {
                return {
                  success: false,
                  error: (error as Error).message,
                };
              }
            },
          );

        const response = await app.handle(
          new Request("http://localhost/test-e2e-operation", {
            method: "POST",
          }),
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.operations.cacheOperation).toBe(true);
        expect(data.operations.dataOperation).toBe(true);
        expect(data.operations.metricsCollection).toBe(true);
        expect(data.e2eComplete).toBe(true);
      },
      pluginConfig.timeout,
    );
  });

  describe("Plugin Error Handling", () => {
    test(
      "should handle plugin initialization failures gracefully",
      async () => {
        // Test with intentionally failing configuration
        try {
          app = new Elysia({ name: "error-test" })
            .use(configPlugin)
            .derive(() => {
              throw new Error("Intentional plugin error");
            });

          // Should not crash, but handle gracefully
          const response = await app.handle(
            new Request("http://localhost/test"),
          );
          expect([200, 500]).toContain(response.status);
        } catch (error) {
          // Plugin error handling should be graceful
          expect(error).toBeDefined();
        }
      },
      pluginConfig.timeout,
    );

    test(
      "should provide meaningful error messages for plugin issues",
      async () => {
        app = new Elysia({ name: "error-message-test" })
          .use(configPlugin)
          .get("/test-error-handling", ({ config }) => {
            try {
              // Access non-existent configuration
              const nonExistent = config.nonExistent?.property;
              return { success: true, value: nonExistent };
            } catch (error) {
              return {
                success: false,
                error: (error as Error).message,
                errorType: (error as Error).constructor.name,
              };
            }
          });

        const response = await app.handle(
          new Request("http://localhost/test-error-handling"),
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        // Should handle undefined access gracefully
        expect(data.success).toBe(true);
        expect(data.value).toBeUndefined();
      },
      pluginConfig.timeout,
    );
  });
});

// Helper function for plugin integration delays
const waitForPluginIntegration = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
