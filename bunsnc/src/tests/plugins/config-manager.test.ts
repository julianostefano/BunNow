/**
 * Plugin Configuration Manager Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { writeFile, unlink, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import {
  PluginConfigurationManager,
  createConfigManager,
  type PluginConfig,
  type ConfigurationSource,
  PluginConfigSchema,
} from "../../plugins/config-manager";

describe("PluginConfigurationManager", () => {
  let configManager: PluginConfigurationManager;
  let tempConfigPath: string;

  beforeEach(async () => {
    tempConfigPath = resolve(__dirname, "temp-config.json");
    configManager = createConfigManager(tempConfigPath);
  });

  afterEach(async () => {
    try {
      await unlink(tempConfigPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe("Configuration Loading", () => {
    it("should load configuration from environment variables", async () => {
      // Mock environment variables
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NODE_ENV: "production",
        SNC_INSTANCE_URL: "https://test.service-now.com",
        SNC_USERNAME: "testuser",
        REDIS_HOST: "redis.example.com",
        REDIS_PORT: "6380",
        PORT: "4000",
      };

      const config = await configManager.load();

      expect(config.environment).toBe("production");
      expect(config.serviceNow?.instanceUrl).toBe(
        "https://test.service-now.com",
      );
      expect(config.serviceNow?.username).toBe("testuser");
      expect(config.redis?.host).toBe("redis.example.com");
      expect(config.redis?.port).toBe(6380);
      expect(config.server?.port).toBe(4000);

      process.env = originalEnv;
    });

    it("should load configuration from file", async () => {
      const fileConfig: Partial<PluginConfig> = {
        version: "2.0.0",
        environment: "staging",
        serviceNow: {
          instanceUrl: "https://staging.service-now.com",
          timeout: 60000,
        },
        mongodb: {
          database: "staging_db",
          port: 27018,
        },
      };

      await mkdir(dirname(tempConfigPath), { recursive: true });
      await writeFile(tempConfigPath, JSON.stringify(fileConfig, null, 2));

      const config = await configManager.load();

      expect(config.version).toBe("2.0.0");
      expect(config.environment).toBe("staging");
      expect(config.serviceNow?.instanceUrl).toBe(
        "https://staging.service-now.com",
      );
      expect(config.serviceNow?.timeout).toBe(60000);
      expect(config.mongodb?.database).toBe("staging_db");
    });

    it("should merge configurations with correct priority", async () => {
      // File config
      const fileConfig: Partial<PluginConfig> = {
        environment: "development",
        serviceNow: {
          instanceUrl: "https://dev.service-now.com",
          timeout: 30000,
        },
        redis: {
          host: "localhost",
          port: 6379,
        },
      };

      await mkdir(dirname(tempConfigPath), { recursive: true });
      await writeFile(tempConfigPath, JSON.stringify(fileConfig, null, 2));

      // Environment config (higher priority)
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NODE_ENV: "production", // Should override file
        SNC_INSTANCE_URL: "https://prod.service-now.com", // Should override file
        REDIS_PORT: "6380", // Should override file
      };

      const config = await configManager.load();

      // Environment should win
      expect(config.environment).toBe("production");
      expect(config.serviceNow?.instanceUrl).toBe(
        "https://prod.service-now.com",
      );
      expect(config.redis?.port).toBe(6380);

      // File should provide other values
      expect(config.serviceNow?.timeout).toBe(30000);
      expect(config.redis?.host).toBe("localhost");

      process.env = originalEnv;
    });

    it("should use default values when no config provided", async () => {
      const config = await configManager.load();

      expect(config.version).toBe("1.0.0");
      expect(config.environment).toBe("development");
      expect(config.hotReload?.enabled).toBe(true);
      expect(config.server?.port).toBe(3000);
    });
  });

  describe("Configuration Validation", () => {
    it("should validate configuration schema", async () => {
      const validConfig: Partial<PluginConfig> = {
        serviceNow: {
          instanceUrl: "https://valid.service-now.com",
          timeout: 30000,
          retries: 3,
        },
        redis: {
          host: "localhost",
          port: 6379,
          database: 0,
        },
      };

      await mkdir(dirname(tempConfigPath), { recursive: true });
      await writeFile(tempConfigPath, JSON.stringify(validConfig, null, 2));

      const config = await configManager.load();
      expect(config.serviceNow?.instanceUrl).toBe(
        "https://valid.service-now.com",
      );
    });

    it("should reject invalid configuration", async () => {
      const invalidConfig = {
        serviceNow: {
          instanceUrl: "not-a-url", // Invalid URL
          timeout: "invalid", // Should be number
          retries: -1, // Should be >= 0
        },
        redis: {
          port: 70000, // Out of range
        },
      };

      await mkdir(dirname(tempConfigPath), { recursive: true });
      await writeFile(tempConfigPath, JSON.stringify(invalidConfig, null, 2));

      await expect(configManager.load()).rejects.toThrow();
    });
  });

  describe("Configuration Updates", () => {
    it("should update configuration section", async () => {
      await configManager.load();

      await configManager.updateSection("serviceNow", {
        instanceUrl: "https://updated.service-now.com",
        timeout: 45000,
      });

      const config = configManager.getConfig();
      expect(config.serviceNow?.instanceUrl).toBe(
        "https://updated.service-now.com",
      );
      expect(config.serviceNow?.timeout).toBe(45000);
    });

    it("should update entire configuration", async () => {
      await configManager.load();

      const updates: Partial<PluginConfig> = {
        version: "3.0.0",
        environment: "testing",
        serviceNow: {
          instanceUrl: "https://test.service-now.com",
        },
      };

      await configManager.updateConfiguration(updates);

      const config = configManager.getConfig();
      expect(config.version).toBe("3.0.0");
      expect(config.environment).toBe("testing");
      expect(config.serviceNow?.instanceUrl).toBe(
        "https://test.service-now.com",
      );
    });

    it("should persist configuration updates to file", async () => {
      await configManager.load();

      await configManager.updateSection("mongodb", {
        host: "updated-mongo.com",
        port: 27019,
      });

      // Create new manager to verify persistence
      const newManager = createConfigManager(tempConfigPath);
      const config = await newManager.load();

      expect(config.mongodb?.host).toBe("updated-mongo.com");
      expect(config.mongodb?.port).toBe(27019);
    });
  });

  describe("Configuration Watching", () => {
    it("should notify watchers of configuration changes", async () => {
      await configManager.load();

      let notificationCount = 0;
      let lastConfig: PluginConfig | null = null;

      const unwatch = configManager.watch((config) => {
        notificationCount++;
        lastConfig = config;
      });

      await configManager.updateSection("redis", {
        host: "new-redis.com",
      });

      expect(notificationCount).toBe(1);
      expect(lastConfig?.redis?.host).toBe("new-redis.com");

      unwatch();

      // Should not receive notifications after unwatching
      await configManager.updateSection("redis", {
        host: "another-redis.com",
      });

      expect(notificationCount).toBe(1);
    });
  });

  describe("Configuration Sections", () => {
    it("should get specific configuration sections", async () => {
      const config: Partial<PluginConfig> = {
        serviceNow: {
          instanceUrl: "https://example.service-now.com",
          username: "user",
        },
        redis: {
          host: "redis.example.com",
          port: 6379,
        },
      };

      await mkdir(dirname(tempConfigPath), { recursive: true });
      await writeFile(tempConfigPath, JSON.stringify(config, null, 2));

      await configManager.load();

      const serviceNowSection = configManager.getSection("serviceNow");
      expect(serviceNowSection?.instanceUrl).toBe(
        "https://example.service-now.com",
      );

      const redisSection = configManager.getSection("redis");
      expect(redisSection?.host).toBe("redis.example.com");
    });
  });

  describe("Configuration Sources", () => {
    it("should register custom configuration sources", async () => {
      const customSource: ConfigurationSource = {
        name: "custom",
        priority: 200, // Higher than environment
        async load() {
          return {
            version: "custom-version",
            serviceNow: {
              instanceUrl: "https://custom.service-now.com",
            },
          };
        },
      };

      configManager.registerSource(customSource);

      const config = await configManager.load();
      expect(config.version).toBe("custom-version");
      expect(config.serviceNow?.instanceUrl).toBe(
        "https://custom.service-now.com",
      );
    });

    it("should handle source loading errors gracefully", async () => {
      const faultySource: ConfigurationSource = {
        name: "faulty",
        priority: 300,
        async load() {
          throw new Error("Source failed");
        },
      };

      configManager.registerSource(faultySource);

      // Should still load despite faulty source
      const config = await configManager.load();
      expect(config).toBeDefined();
    });
  });

  describe("Configuration Summary", () => {
    it("should provide configuration summary", async () => {
      await configManager.load();

      const summary = configManager.getSummary();

      expect(summary).toHaveProperty("version");
      expect(summary).toHaveProperty("environment");
      expect(summary).toHaveProperty("sources");
      expect(summary).toHaveProperty("watchers");
      expect(summary).toHaveProperty("isLoaded");
      expect(summary.isLoaded).toBe(true);
      expect(Array.isArray(summary.sources)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should throw error when accessing config before loading", () => {
      expect(() => configManager.getConfig()).toThrow();
    });

    it("should handle file read errors gracefully", async () => {
      // Use non-existent directory
      const badConfigManager = createConfigManager(
        "/non/existent/path/config.json",
      );

      // Should still load with defaults
      const config = await badConfigManager.load();
      expect(config).toBeDefined();
      expect(config.version).toBe("1.0.0");
    });
  });
});

describe("Configuration Schema Validation", () => {
  it("should validate ServiceNow configuration", () => {
    const validServiceNow = {
      instanceUrl: "https://test.service-now.com",
      username: "user",
      password: "pass",
      authType: "basic" as const,
      timeout: 30000,
      retries: 3,
    };

    expect(() => {
      PluginConfigSchema.parse({ serviceNow: validServiceNow });
    }).not.toThrow();

    const invalidServiceNow = {
      instanceUrl: "not-a-url",
      timeout: -1,
      retries: "invalid",
    };

    expect(() => {
      PluginConfigSchema.parse({ serviceNow: invalidServiceNow });
    }).toThrow();
  });

  it("should validate Redis configuration", () => {
    const validRedis = {
      host: "localhost",
      port: 6379,
      password: "secret",
      database: 0,
      maxRetries: 3,
      connectTimeout: 10000,
    };

    expect(() => {
      PluginConfigSchema.parse({ redis: validRedis });
    }).not.toThrow();

    const invalidRedis = {
      port: 70000, // Out of range
      database: 20, // Out of range
      maxRetries: -1,
    };

    expect(() => {
      PluginConfigSchema.parse({ redis: invalidRedis });
    }).toThrow();
  });

  it("should validate complete configuration", () => {
    const validConfig: Partial<PluginConfig> = {
      version: "1.0.0",
      environment: "production",
      serviceNow: {
        instanceUrl: "https://prod.service-now.com",
        authType: "oauth",
        timeout: 60000,
      },
      redis: {
        host: "redis.prod.com",
        port: 6379,
        password: "secure-password",
      },
      server: {
        port: 8080,
        host: "0.0.0.0",
        cors: {
          enabled: true,
          origin: ["https://app.example.com"],
        },
      },
      hotReload: {
        enabled: false, // Disabled in production
        safeMode: true,
      },
    };

    expect(() => {
      PluginConfigSchema.parse(validConfig);
    }).not.toThrow();
  });
});
