/**
 * Configuration Manager Plugin - Elysia Best Practices Implementation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Implements "Separate Instance Method" pattern for configuration management
 * Following "1 controller = 1 instância" principle
 *
 * Includes enterprise-grade configuration management:
 * - Environment-based configuration loading
 * - Configuration validation and type safety
 * - Dynamic configuration updates via Elysia DI
 * - Configuration versioning and migration
 * - Graceful degradation with safe defaults
 */

import { Elysia } from "elysia";
import { z } from "zod";
import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { logger } from "../utils/Logger";

// Base Configuration Schema
const BaseConfigSchema = z.object({
  version: z.string().default("1.0.0"),
  environment: z
    .enum(["development", "staging", "production"])
    .default("development"),
  lastModified: z
    .string()
    .datetime()
    .default(() => new Date().toISOString()),
  encrypted: z.boolean().default(false),
});

// ServiceNow Configuration Schema
const ServiceNowConfigSchema = z.object({
  instanceUrl: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
  authType: z.enum(["basic", "oauth", "saml", "bearer"]).default("basic"),
  timeout: z.number().min(1000).max(300000).default(30000),
  retries: z.number().min(0).max(10).default(3),
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    maxRequests: z.number().default(25),
    maxConcurrent: z.number().default(18),
    windowMs: z.number().default(1000),
  }),
  proxy: z
    .object({
      enabled: z.boolean().default(false),
      url: z.string().optional(),
      auth: z
        .object({
          username: z.string().optional(),
          password: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

// Redis Configuration Schema
const RedisConfigSchema = z.object({
  host: z.string().default("localhost"),
  port: z.number().min(1).max(65535).default(6379),
  password: z.string().optional(),
  database: z.number().min(0).max(15).default(0),
  keyPrefix: z.string().default("bunsnc:"),
  maxRetries: z.number().min(0).max(10).default(3),
  retryDelay: z.number().min(100).max(10000).default(1000),
  connectTimeout: z.number().min(1000).max(60000).default(10000),
  commandTimeout: z.number().min(1000).max(60000).default(5000),
  enableOfflineQueue: z.boolean().default(false),
  cluster: z
    .object({
      enabled: z.boolean().default(false),
      nodes: z
        .array(
          z.object({
            host: z.string(),
            port: z.number(),
          }),
        )
        .optional(),
    })
    .optional(),
});

// MongoDB Configuration Schema
const MongoDBConfigSchema = z.object({
  host: z.string().default("localhost"),
  port: z.number().min(1).max(65535).default(27017),
  database: z.string().default("bunsnc"),
  username: z.string().optional(),
  password: z.string().optional(),
  authSource: z.string().default("admin"),
  ssl: z.boolean().default(false),
  replicaSet: z.string().optional(),
  maxPoolSize: z.number().min(1).max(100).default(10),
  minPoolSize: z.number().min(0).max(50).default(0),
  maxIdleTimeMS: z.number().default(30000),
  serverSelectionTimeoutMS: z.number().default(30000),
  socketTimeoutMS: z.number().default(0),
  connectTimeoutMS: z.number().default(30000),
});

// Hot-Reload Configuration Schema
const HotReloadConfigSchema = z.object({
  enabled: z.boolean().default(true),
  watchPaths: z.array(z.string()).default(["src/plugins"]),
  debounceMs: z.number().min(100).max(10000).default(1000),
  safeMode: z.boolean().default(true),
  excludePatterns: z
    .array(z.string())
    .default(["*.test.ts", "*.spec.ts", "*.d.ts"]),
  maxReloadAttempts: z.number().min(1).max(10).default(3),
  reloadTimeout: z.number().min(5000).max(120000).default(30000),
});

// Server Configuration Schema
const ServerConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(3000),
  host: z.string().default("0.0.0.0"),
  cors: z.object({
    enabled: z.boolean().default(true),
    origin: z
      .union([z.string(), z.boolean(), z.array(z.string())])
      .default(true),
    credentials: z.boolean().default(true),
    methods: z
      .array(z.string())
      .default(["GET", "POST", "PUT", "DELETE", "OPTIONS"]),
    allowedHeaders: z
      .array(z.string())
      .default(["Content-Type", "Authorization", "X-Requested-With"]),
  }),
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    max: z.number().default(100),
    windowMs: z.number().default(60000),
    message: z.string().default("Too many requests"),
  }),
  compression: z.object({
    enabled: z.boolean().default(true),
    level: z.number().min(1).max(9).default(6),
  }),
  ssl: z
    .object({
      enabled: z.boolean().default(false),
      key: z.string().optional(),
      cert: z.string().optional(),
      ca: z.string().optional(),
    })
    .optional(),
});

// Logging Configuration Schema
const LoggingConfigSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  format: z.enum(["json", "text", "dev"]).default("text"),
  output: z.object({
    console: z.boolean().default(true),
    file: z.object({
      enabled: z.boolean().default(false),
      path: z.string().default("logs/app.log"),
      maxSize: z.string().default("10MB"),
      maxFiles: z.number().default(5),
    }),
    syslog: z
      .object({
        enabled: z.boolean().default(false),
        host: z.string().optional(),
        port: z.number().optional(),
        facility: z.string().default("local0"),
      })
      .optional(),
  }),
  includeTimestamp: z.boolean().default(true),
  includeLevel: z.boolean().default(true),
  includeLocation: z.boolean().default(false),
});

// Complete Plugin Configuration Schema
export const PluginConfigSchema = BaseConfigSchema.extend({
  serviceNow: ServiceNowConfigSchema.optional(),
  redis: RedisConfigSchema.optional(),
  mongodb: MongoDBConfigSchema.optional(),
  hotReload: HotReloadConfigSchema.optional(),
  server: ServerConfigSchema.default({}),
  logging: LoggingConfigSchema.optional(),

  // Plugin-specific configurations
  plugins: z.record(z.string(), z.any()).optional(),

  // Feature flags
  features: z.record(z.string(), z.boolean()).optional(),

  // Performance settings
  performance: z
    .object({
      memoryLimit: z.number().optional(),
      cpuLimit: z.number().optional(),
      gcInterval: z.number().optional(),
      metrics: z.object({
        enabled: z.boolean().default(true),
        interval: z.number().default(60000),
        retention: z.number().default(86400000), // 24 hours
      }),
    })
    .optional(),

  // Security settings
  security: z
    .object({
      encryption: z.object({
        enabled: z.boolean().default(false),
        algorithm: z.string().default("aes-256-gcm"),
        keyDerivation: z.string().default("pbkdf2"),
      }),
      secrets: z.object({
        vault: z
          .object({
            enabled: z.boolean().default(false),
            url: z.string().optional(),
            token: z.string().optional(),
            path: z.string().default("bunsnc"),
          })
          .optional(),
        environment: z.boolean().default(true),
        file: z
          .object({
            enabled: z.boolean().default(false),
            path: z.string().default(".secrets"),
          })
          .optional(),
      }),
    })
    .optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

export interface ConfigurationSource {
  name: string;
  priority: number;
  load(): Promise<Partial<PluginConfig>>;
  save?(config: Partial<PluginConfig>): Promise<void>;
  watch?(callback: (config: Partial<PluginConfig>) => void): void;
}

export class PluginConfigurationManager {
  private config: PluginConfig = {};
  private sources: ConfigurationSource[] = [];
  private watchers: Set<(config: PluginConfig) => void> = new Set();
  private configPath: string;
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(configPath?: string) {
    this.configPath =
      configPath || join(process.cwd(), "config", "plugins.json");

    // Register default configuration sources
    this.registerSource(new EnvironmentConfigSource());
    this.registerSource(new FileConfigSource(this.configPath));
  }

  /**
   * Register a configuration source
   */
  registerSource(source: ConfigurationSource): void {
    this.sources.push(source);
    this.sources.sort((a, b) => b.priority - a.priority);

    // Setup watcher if source supports it
    if (source.watch) {
      source.watch((partialConfig) => {
        this.mergeAndNotify(partialConfig);
      });
    }
  }

  /**
   * Load configuration from all sources
   */
  async load(): Promise<PluginConfig> {
    if (this.isLoaded) {
      return this.config;
    }

    if (this.loadPromise) {
      await this.loadPromise;
      return this.config;
    }

    this.loadPromise = this.performLoad();
    await this.loadPromise;
    return this.config;
  }

  private async performLoad(): Promise<void> {
    try {
      logger.info(
        "📦 Loading plugin configuration from all sources",
        "ConfigManager",
      );

      const configParts: Partial<PluginConfig>[] = [];

      // Load from all sources in priority order
      for (const source of this.sources) {
        try {
          const partialConfig = await source.load();
          if (partialConfig && Object.keys(partialConfig).length > 0) {
            configParts.push(partialConfig);
            logger.info(
              `✅ Configuration loaded from ${source.name}`,
              "ConfigManager",
            );
          }
        } catch (error: any) {
          logger.warn(
            `⚠️ Failed to load configuration from ${source.name}: ${error.message}`,
            "ConfigManager",
          );
        }
      }

      // Merge configurations (higher priority sources override lower)
      const mergedConfig = this.mergeConfigurations(configParts);

      // Validate merged configuration
      const validatedConfig = await this.validateConfiguration(mergedConfig);

      this.config = validatedConfig;
      this.isLoaded = true;

      logger.info(
        "🎯 Plugin configuration loaded and validated successfully",
        "ConfigManager",
        {
          sources: this.sources.length,
          environment: this.config.environment,
          version: this.config.version,
        },
      );

      // Notify watchers
      this.notifyWatchers();
    } catch (error: any) {
      logger.error("❌ Failed to load plugin configuration", "ConfigManager", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PluginConfig {
    if (!this.isLoaded) {
      throw new Error("Configuration not loaded. Call load() first.");
    }
    return { ...this.config };
  }

  /**
   * Get specific configuration section
   */
  getSection<K extends keyof PluginConfig>(section: K): PluginConfig[K] {
    return this.getConfig()[section];
  }

  /**
   * Update configuration section
   */
  async updateSection<K extends keyof PluginConfig>(
    section: K,
    updates: Partial<PluginConfig[K]>,
  ): Promise<void> {
    const currentConfig = this.getConfig();
    const updatedSection = {
      ...currentConfig[section],
      ...updates,
    };

    const newConfig = {
      ...currentConfig,
      [section]: updatedSection,
      lastModified: new Date().toISOString(),
    };

    await this.updateConfiguration(newConfig);
  }

  /**
   * Update entire configuration
   */
  async updateConfiguration(newConfig: Partial<PluginConfig>): Promise<void> {
    try {
      // Validate new configuration
      const validatedConfig = await this.validateConfiguration(newConfig);

      // Save to writable sources
      for (const source of this.sources) {
        if (source.save) {
          try {
            await source.save(validatedConfig);
            logger.info(
              `💾 Configuration saved to ${source.name}`,
              "ConfigManager",
            );
          } catch (error: any) {
            logger.warn(
              `⚠️ Failed to save configuration to ${source.name}: ${error.message}`,
              "ConfigManager",
            );
          }
        }
      }

      // Update in-memory configuration
      this.config = { ...this.config, ...validatedConfig };

      // Notify watchers
      this.notifyWatchers();

      logger.info("✅ Configuration updated successfully", "ConfigManager");
    } catch (error: any) {
      logger.error("❌ Failed to update configuration", "ConfigManager", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Watch for configuration changes
   */
  watch(callback: (config: PluginConfig) => void): () => void {
    this.watchers.add(callback);

    // Return unwatch function
    return () => {
      this.watchers.delete(callback);
    };
  }

  /**
   * Merge configurations from multiple sources
   */
  private mergeConfigurations(
    configs: Partial<PluginConfig>[],
  ): Partial<PluginConfig> {
    return configs.reduce((merged, config) => {
      return this.deepMerge(merged, config);
    }, {} as Partial<PluginConfig>);
  }

  /**
   * Deep merge two configuration objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Validate configuration against schema
   */
  private async validateConfiguration(
    config: Partial<PluginConfig>,
  ): Promise<PluginConfig> {
    try {
      const validatedConfig = PluginConfigSchema.parse(config);
      logger.info("✅ Configuration validation successful", "ConfigManager");
      return validatedConfig;
    } catch (error: any) {
      logger.error("❌ Configuration validation failed", "ConfigManager", {
        error: error.message,
        issues: error.issues || [],
      });
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
  }

  /**
   * Merge and notify watchers of configuration changes
   */
  private mergeAndNotify(partialConfig: Partial<PluginConfig>): void {
    try {
      const updatedConfig = this.deepMerge(this.config, partialConfig);
      this.config = updatedConfig;
      this.notifyWatchers();
      logger.info("🔄 Configuration updated from source", "ConfigManager");
    } catch (error: any) {
      logger.error("❌ Failed to merge configuration update", "ConfigManager", {
        error: error.message,
      });
    }
  }

  /**
   * Notify all watchers of configuration changes
   */
  private notifyWatchers(): void {
    for (const watcher of this.watchers) {
      try {
        watcher(this.config);
      } catch (error: any) {
        logger.error("❌ Configuration watcher error", "ConfigManager", {
          error: error.message,
        });
      }
    }
  }

  /**
   * Get configuration as JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Get configuration summary for logging
   */
  getSummary(): any {
    return {
      version: this.config.version,
      environment: this.config.environment,
      lastModified: this.config.lastModified,
      sources: this.sources.map((s) => s.name),
      watchers: this.watchers.size,
      isLoaded: this.isLoaded,
    };
  }
}

/**
 * Environment Variables Configuration Source
 */
class EnvironmentConfigSource implements ConfigurationSource {
  name = "environment";
  priority = 100; // Highest priority

  async load(): Promise<Partial<PluginConfig>> {
    const config: Partial<PluginConfig> = {};

    // Environment detection
    if (process.env.NODE_ENV) {
      config.environment = process.env.NODE_ENV as any;
    }

    // ServiceNow configuration from environment
    if (
      process.env.SNC_INSTANCE_URL ||
      process.env.SNC_USERNAME ||
      process.env.SNC_PASSWORD
    ) {
      config.serviceNow = {
        instanceUrl: process.env.SNC_INSTANCE_URL,
        username: process.env.SNC_USERNAME,
        password: process.env.SNC_PASSWORD,
        authType: (process.env.SNC_AUTH_TYPE as any) || "basic",
      };
    }

    // Redis configuration from environment
    if (process.env.REDIS_HOST || process.env.REDIS_PORT) {
      config.redis = {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
        database: parseInt(process.env.REDIS_DB || "0"),
      };
    }

    // MongoDB configuration from environment
    if (process.env.MONGODB_HOST || process.env.MONGODB_PORT) {
      config.mongodb = {
        host: process.env.MONGODB_HOST || "localhost",
        port: parseInt(process.env.MONGODB_PORT || "27017"),
        database: process.env.MONGODB_DATABASE || "bunsnc",
        username: process.env.MONGODB_USERNAME,
        password: process.env.MONGODB_PASSWORD,
      };
    }

    // Server configuration from environment (always provide defaults)
    config.server = {
      port: parseInt(process.env.PORT || "3008"),
      host: process.env.HOST || "0.0.0.0",
      // Ensure cors, rateLimit, and compression objects exist with defaults
      cors: {
        enabled: true,
        origin: true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      },
      rateLimit: {
        enabled: true,
        max: 100,
        windowMs: 60000,
        message: "Too many requests",
      },
      compression: {
        enabled: true,
        level: 6,
      },
    };

    return config;
  }
}

/**
 * File-based Configuration Source
 */
class FileConfigSource implements ConfigurationSource {
  name = "file";
  priority = 50; // Medium priority

  constructor(private filePath: string) {}

  async load(): Promise<Partial<PluginConfig>> {
    try {
      await access(this.filePath);
      const content = await readFile(this.filePath, "utf-8");
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        logger.info(
          `📁 Configuration file not found: ${this.filePath}`,
          "ConfigManager",
        );
        return {};
      }
      throw error;
    }
  }

  async save(config: Partial<PluginConfig>): Promise<void> {
    try {
      // Ensure directory exists
      await mkdir(dirname(this.filePath), { recursive: true });

      const content = JSON.stringify(config, null, 2);
      await writeFile(this.filePath, content, "utf-8");
    } catch (error: any) {
      throw new Error(`Failed to save configuration to file: ${error.message}`);
    }
  }
}

// Configuration Plugin Context Type
export interface ConfigPluginContext {
  config: PluginConfig;
  getConfig: () => PluginConfig;
  getSection: <K extends keyof PluginConfig>(section: K) => PluginConfig[K];
  updateSection: <K extends keyof PluginConfig>(
    section: K,
    updates: Partial<PluginConfig[K]>,
  ) => Promise<void>;
  reloadConfig: () => Promise<void>;
}

/**
 * Configuration Plugin - Following Elysia "Separate Instance Method" Pattern
 * Provides configuration management as dependency injection across all plugins
 */
export const configPlugin = new Elysia({ name: "config" })
  .derive(async () => {
    logger.info(
      "🔧 Configuration Plugin initializing with Elysia DI pattern",
      "ConfigPlugin",
    );

    // Create configuration manager instance
    const configManager = new PluginConfigurationManager();

    try {
      // Load configuration from all sources
      await configManager.load();
      const config = configManager.getConfig();

      logger.info("✅ Configuration loaded successfully", "ConfigPlugin", {
        environment: config.environment,
        version: config.version,
        sources: configManager.getSummary().sources,
      });

      // Ensure server configuration has proper defaults using Elysia DI pattern
      const serverConfig = {
        port: config.server?.port || 3008,
        host: config.server?.host || "0.0.0.0",
        cors: config.server?.cors || {
          enabled: true,
          origin: true,
          credentials: true,
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
          allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        },
        rateLimit: config.server?.rateLimit || {
          enabled: true,
          max: 100,
          windowMs: 60000,
          message: "Too many requests",
        },
        compression: config.server?.compression || {
          enabled: true,
          level: 6,
        },
      };

      // Update config with ensured defaults
      const configWithDefaults = {
        ...config,
        server: serverConfig,
      };

      return {
        config: configWithDefaults,
        getConfig: () => configWithDefaults,
        getSection: <K extends keyof PluginConfig>(section: K) =>
          configWithDefaults[section],
        updateSection: async <K extends keyof PluginConfig>(
          section: K,
          updates: Partial<PluginConfig[K]>,
        ) => {
          await configManager.updateSection(section, updates);
        },
        reloadConfig: async () => {
          await configManager.load();
        },
      } satisfies ConfigPluginContext;
    } catch (error: any) {
      logger.error("❌ Configuration initialization failed", "ConfigPlugin", {
        error: error.message,
      });

      // Return safe defaults for graceful degradation
      const safeDefaults: PluginConfig = {
        version: "1.0.0",
        environment: "development",
        lastModified: new Date().toISOString(),
        server: {
          port: 3008,
          host: "0.0.0.0",
          cors: {
            enabled: true,
            origin: true,
            credentials: true,
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowedHeaders: [
              "Content-Type",
              "Authorization",
              "X-Requested-With",
            ],
          },
          rateLimit: {
            enabled: true,
            max: 100,
            windowMs: 60000,
            message: "Too many requests",
          },
          compression: {
            enabled: true,
            level: 6,
          },
        },
      };

      return {
        config: safeDefaults,
        getConfig: () => safeDefaults,
        getSection: <K extends keyof PluginConfig>(section: K) =>
          safeDefaults[section],
        updateSection: async () => {
          logger.warn(
            "Config update disabled - using safe defaults",
            "ConfigPlugin",
          );
        },
        reloadConfig: async () => {
          logger.warn(
            "Config reload disabled - using safe defaults",
            "ConfigPlugin",
          );
        },
      } satisfies ConfigPluginContext;
    }
  })
  .get(
    "/config",
    ({ config }) => {
      return {
        success: true,
        result: config,
        timestamp: new Date().toISOString(),
      };
    },
    {
      detail: {
        summary: "Get Current Configuration",
        description: "Get the current plugin configuration",
        tags: ["Configuration"],
      },
    },
  )
  .get(
    "/config/:section",
    ({ params: { section }, getSection }) => {
      try {
        const sectionConfig = getSection(section as keyof PluginConfig);
        return {
          success: true,
          result: { section, config: sectionConfig },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Get Configuration Section",
        description: "Get a specific configuration section",
        tags: ["Configuration"],
      },
    },
  )
  .post(
    "/config/reload",
    async ({ reloadConfig }) => {
      try {
        await reloadConfig();
        return {
          success: true,
          result: { message: "Configuration reloaded successfully" },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Reload Configuration",
        description: "Reload configuration from all sources",
        tags: ["Configuration"],
      },
    },
  )
  .onStart(() => {
    logger.info(
      "🔧 Configuration Plugin started - following Elysia best practices",
      "ConfigPlugin",
    );
  })
  .onStop(() => {
    logger.info("🛑 Configuration Plugin stopped", "ConfigPlugin");
  });

// Export legacy instance for backward compatibility (deprecated)
// @deprecated Use configPlugin instead
export const pluginConfigManager = new PluginConfigurationManager();

// Export factory function for custom configurations
export const createConfigManager = (configPath?: string) => {
  return new PluginConfigurationManager(configPath);
};

// Export configuration schemas and plugin context type
export {
  ServiceNowConfigSchema,
  RedisConfigSchema,
  MongoDBConfigSchema,
  HotReloadConfigSchema,
  ServerConfigSchema,
  LoggingConfigSchema,
};

// Export plugin app type for Eden Treaty
export type ConfigPluginApp = typeof configPlugin;
