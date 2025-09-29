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

import { Elysia, t } from "elysia";
import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { logger } from "../utils/Logger";

// Base Configuration Schema
const BaseConfigSchema = t.Object({
  version: t.String({ default: "1.0.0" }),
  environment: t.Union(
    [t.Literal("development"), t.Literal("staging"), t.Literal("production")],
    { default: "development" },
  ),
  lastModified: t.String({
    format: "date-time",
    default: new Date().toISOString(),
  }),
  encrypted: t.Boolean({ default: false }),
});

// ServiceNow Configuration Schema
const ServiceNowConfigSchema = t.Object({
  instanceUrl: t.Optional(t.String({ format: "uri" })),
  username: t.Optional(t.String()),
  password: t.Optional(t.String()),
  token: t.Optional(t.String()),
  authType: t.Union(
    [
      t.Literal("basic"),
      t.Literal("oauth"),
      t.Literal("saml"),
      t.Literal("bearer"),
    ],
    { default: "basic" },
  ),
  timeout: t.Number({ minimum: 1000, maximum: 300000, default: 30000 }),
  retries: t.Number({ minimum: 0, maximum: 10, default: 3 }),
  rateLimit: t.Object({
    enabled: t.Boolean({ default: true }),
    maxRequests: t.Number({ default: 25 }),
    maxConcurrent: t.Number({ default: 18 }),
    windowMs: t.Number({ default: 1000 }),
  }),
  proxy: t.Optional(
    t.Object({
      enabled: t.Boolean({ default: false }),
      url: t.Optional(t.String()),
      auth: t.Optional(
        t.Object({
          username: t.Optional(t.String()),
          password: t.Optional(t.String()),
        }),
      ),
    }),
  ),
});

// Redis Configuration Schema
const RedisConfigSchema = t.Object({
  host: t.String({ default: "localhost" }),
  port: t.Number({ minimum: 1, maximum: 65535, default: 6379 }),
  password: t.Optional(t.String()),
  database: t.Number({ minimum: 0, maximum: 15, default: 0 }),
  keyPrefix: t.String({ default: "bunsnc:" }),
  maxRetries: t.Number({ minimum: 0, maximum: 10, default: 3 }),
  retryDelay: t.Number({ minimum: 100, maximum: 10000, default: 1000 }),
  connectTimeout: t.Number({ minimum: 1000, maximum: 60000, default: 10000 }),
  commandTimeout: t.Number({ minimum: 1000, maximum: 60000, default: 5000 }),
  enableOfflineQueue: t.Boolean({ default: false }),
  cluster: t.Optional(
    t.Object({
      enabled: t.Boolean({ default: false }),
      nodes: t.Optional(
        t.Array(
          t.Object({
            host: t.String(),
            port: t.Number(),
          }),
        ),
      ),
    }),
  ),
});

// MongoDB Configuration Schema
const MongoDBConfigSchema = t.Object({
  host: t.String({ default: "localhost" }),
  port: t.Number({ minimum: 1, maximum: 65535, default: 27017 }),
  database: t.String({ default: "bunsnc" }),
  username: t.Optional(t.String()),
  password: t.Optional(t.String()),
  authSource: t.String({ default: "admin" }),
  ssl: t.Boolean({ default: false }),
  replicaSet: t.Optional(t.String()),
  maxPoolSize: t.Number({ minimum: 1, maximum: 100, default: 10 }),
  minPoolSize: t.Number({ minimum: 0, maximum: 50, default: 0 }),
  maxIdleTimeMS: t.Number({ default: 30000 }),
  serverSelectionTimeoutMS: t.Number({ default: 30000 }),
  socketTimeoutMS: t.Number({ default: 0 }),
  connectTimeoutMS: t.Number({ default: 30000 }),
});

// Hot-Reload Configuration Schema
const HotReloadConfigSchema = t.Object({
  enabled: t.Boolean({ default: true }),
  watchPaths: t.Array(t.String(), { default: ["src/plugins"] }),
  debounceMs: t.Number({ minimum: 100, maximum: 10000, default: 1000 }),
  safeMode: t.Boolean({ default: true }),
  excludePatterns: t.Array(t.String(), {
    default: ["*.test.ts", "*.spec.ts", "*.d.ts"],
  }),
  maxReloadAttempts: t.Number({ minimum: 1, maximum: 10, default: 3 }),
  reloadTimeout: t.Number({ minimum: 5000, maximum: 120000, default: 30000 }),
});

// Server Configuration Schema
const ServerConfigSchema = t.Object({
  port: t.Number({ minimum: 1, maximum: 65535, default: 3000 }),
  host: t.String({ default: "0.0.0.0" }),
  cors: t.Object({
    enabled: t.Boolean({ default: true }),
    origin: t.Union([t.String(), t.Boolean(), t.Array(t.String())], {
      default: true,
    }),
    credentials: t.Boolean({ default: true }),
    methods: t.Array(t.String(), {
      default: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
    allowedHeaders: t.Array(t.String(), {
      default: ["Content-Type", "Authorization", "X-Requested-With"],
    }),
  }),
  rateLimit: t.Object({
    enabled: t.Boolean({ default: true }),
    max: t.Number({ default: 100 }),
    windowMs: t.Number({ default: 60000 }),
    message: t.String({ default: "Too many requests" }),
  }),
  compression: t.Object({
    enabled: t.Boolean({ default: true }),
    level: t.Number({ minimum: 1, maximum: 9, default: 6 }),
  }),
  ssl: t.Optional(
    t.Object({
      enabled: t.Boolean({ default: false }),
      key: t.Optional(t.String()),
      cert: t.Optional(t.String()),
      ca: t.Optional(t.String()),
    }),
  ),
});

// Logging Configuration Schema
const LoggingConfigSchema = t.Object({
  level: t.Union(
    [
      t.Literal("debug"),
      t.Literal("info"),
      t.Literal("warn"),
      t.Literal("error"),
    ],
    { default: "info" },
  ),
  format: t.Union([t.Literal("json"), t.Literal("text"), t.Literal("dev")], {
    default: "text",
  }),
  output: t.Object({
    console: t.Boolean({ default: true }),
    file: t.Object({
      enabled: t.Boolean({ default: false }),
      path: t.String({ default: "logs/app.log" }),
      maxSize: t.String({ default: "10MB" }),
      maxFiles: t.Number({ default: 5 }),
    }),
    syslog: t.Optional(
      t.Object({
        enabled: t.Boolean({ default: false }),
        host: t.Optional(t.String()),
        port: t.Optional(t.Number()),
        facility: t.String({ default: "local0" }),
      }),
    ),
  }),
  includeTimestamp: t.Boolean({ default: true }),
  includeLevel: t.Boolean({ default: true }),
  includeLocation: t.Boolean({ default: false }),
});

// Complete Plugin Configuration Schema
export const PluginConfigSchema = t.Object({
  ...BaseConfigSchema.properties,

  serviceNow: t.Optional(ServiceNowConfigSchema),
  redis: t.Optional(RedisConfigSchema),
  mongodb: t.Optional(MongoDBConfigSchema),
  hotReload: t.Optional(HotReloadConfigSchema),
  server: t.Optional(ServerConfigSchema),
  logging: t.Optional(LoggingConfigSchema),

  // Plugin-specific configurations
  plugins: t.Optional(t.Record(t.String(), t.Any())),

  // Feature flags
  features: t.Optional(t.Record(t.String(), t.Boolean())),

  // Performance settings
  performance: t.Optional(
    t.Object({
      memoryLimit: t.Optional(t.Number()),
      cpuLimit: t.Optional(t.Number()),
      gcInterval: t.Optional(t.Number()),
      metrics: t.Object({
        enabled: t.Boolean({ default: true }),
        interval: t.Number({ default: 60000 }),
        retention: t.Number({ default: 86400000 }), // 24 hours
      }),
    }),
  ),

  // Security settings
  security: t.Optional(
    t.Object({
      encryption: t.Object({
        enabled: t.Boolean({ default: false }),
        algorithm: t.String({ default: "aes-256-gcm" }),
        keyDerivation: t.String({ default: "pbkdf2" }),
      }),
      secrets: t.Object({
        vault: t.Optional(
          t.Object({
            enabled: t.Boolean({ default: false }),
            url: t.Optional(t.String()),
            token: t.Optional(t.String()),
            path: t.String({ default: "bunsnc" }),
          }),
        ),
        environment: t.Boolean({ default: true }),
        file: t.Optional(
          t.Object({
            enabled: t.Boolean({ default: false }),
            path: t.String({ default: ".secrets" }),
          }),
        ),
      }),
    }),
  ),
});

export type PluginConfig = typeof PluginConfigSchema.static;

export interface ConfigurationSource {
  name: string;
  priority: number;
  load(): Promise<Partial<PluginConfig>>;
  save?(config: Partial<PluginConfig>): Promise<void>;
  watch?(callback: (config: Partial<PluginConfig>) => void): void;
}

export class PluginConfigurationManager {
  private config: Partial<PluginConfig> = {};
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
  getConfig(): Partial<PluginConfig> {
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
      // TypeBox validation using Value.Check and Value.Default
      const { Value } = await import("@sinclair/typebox/value");

      // Apply defaults first
      const configWithDefaults = Value.Default(PluginConfigSchema, config);

      // Validate the configuration
      if (!Value.Check(PluginConfigSchema, configWithDefaults)) {
        const errors = [
          ...Value.Errors(PluginConfigSchema, configWithDefaults),
        ];
        const errorMessage = errors
          .map((e) => `${e.path}: ${e.message}`)
          .join(", ");
        throw new Error(`Configuration validation failed: ${errorMessage}`);
      }

      logger.info("✅ Configuration validation successful", "ConfigManager");
      return configWithDefaults as PluginConfig;
    } catch (error: any) {
      logger.error("❌ Configuration validation failed", "ConfigManager", {
        error: error.message,
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
  config: Partial<PluginConfig>;
  getConfig: () => Partial<PluginConfig>;
  getSection: <K extends keyof PluginConfig>(
    section: K,
  ) => PluginConfig[K] | undefined;
  updateSection: <K extends keyof PluginConfig>(
    section: K,
    updates: Partial<PluginConfig[K]>,
  ) => Promise<void>;
  reloadConfig: () => Promise<void>;
}

/**
 * Configuration Plugin - Following Elysia "1 controller = 1 instance" Pattern
 * Provides configuration management as dependency injection across all plugins
 */
export const configPlugin = new Elysia({ name: "config" })
  .onStart(async () => {
    logger.info(
      "🔧 Configuration Plugin initializing with Elysia best practices",
      "ConfigPlugin",
    );
  })
  .derive(async () => {
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
      const safeDefaults: Partial<PluginConfig> = {
        version: "1.0.0",
        environment: "development",
        lastModified: new Date().toISOString(),
        encrypted: false,
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
  })
  .as("scoped"); // Critical fix: Enable context propagation across routes

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
