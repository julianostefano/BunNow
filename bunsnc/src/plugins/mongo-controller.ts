/**
 * MongoDB Controller - Specialized Elysia Controller
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.6.1: Singleton Lazy Loading Pattern (ElysiaJS Key Concepts #5 + #7)
 * Root cause: MongoDBService instanciado a cada request via .derive()
 * Solution: Singleton instance com lazy initialization na primeira request
 * Reference: docs/ELYSIA_BEST_PRACTICES.md - "Plugin Deduplication Mechanism"
 *
 * Implements "1 controller = 1 instância" Elysia best practice
 * Handles MongoDB connection, CRUD operations, and data persistence
 *
 * Features:
 * - MongoDB connection management with retry logic
 * - CRUD operations for ServiceNow tables
 * - Connection pooling and health monitoring
 * - Graceful degradation with fallback data
 * - Proper lifecycle management with .onStart()/.onStop()
 * - Singleton Lazy Loading (v5.6.1)
 */

import { Elysia } from "elysia";
import { MongoClient, Db, Collection, MongoClientOptions } from "mongodb";
import { logger } from "../utils/Logger";

// MongoDB Configuration Interface
export interface MongoConfig {
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  options?: MongoClientOptions;
}

// MongoDB Service Interface
export interface MongoService {
  isConnected: boolean;
  database: Db | null;
  client: MongoClient | null;

  // Core CRUD operations
  findOne<T = any>(table: string, query: any): Promise<T | null>;
  find<T = any>(table: string, query?: any, options?: any): Promise<T[]>;
  insertOne<T = any>(
    table: string,
    document: T,
  ): Promise<{ insertedId: string }>;
  updateOne<T = any>(
    table: string,
    filter: any,
    update: any,
  ): Promise<{ modifiedCount: number }>;
  deleteOne(table: string, filter: any): Promise<{ deletedCount: number }>;
  upsert<T = any>(
    table: string,
    filter: any,
    document: T,
  ): Promise<{ upsertedId?: string; modifiedCount: number }>;

  // Batch operations
  insertMany<T = any>(
    table: string,
    documents: T[],
  ): Promise<{ insertedCount: number }>;
  updateMany(
    table: string,
    filter: any,
    update: any,
  ): Promise<{ modifiedCount: number }>;
  deleteMany(table: string, filter: any): Promise<{ deletedCount: number }>;

  // Utility operations
  count(table: string, query?: any): Promise<number>;
  distinct(table: string, field: string, query?: any): Promise<any[]>;
  aggregate<T = any>(table: string, pipeline: any[]): Promise<T[]>;

  // Health and monitoring
  healthCheck(): Promise<boolean>;
  getStats(): Promise<any>;
}

/**
 * MongoDB Service Implementation
 */
class MongoDBService implements MongoService {
  public isConnected = false;
  public database: Db | null = null;
  public client: MongoClient | null = null;

  private config: MongoConfig;
  private connectionRetries = 0;
  private maxRetries = 3;
  private retryDelay = 2000;

  constructor(config: MongoConfig) {
    this.config = {
      host: config.host || process.env.MONGODB_HOST || "10.219.8.210",
      port: config.port || parseInt(process.env.MONGODB_PORT || "27018"),
      database: config.database || process.env.MONGODB_DB || "bunsnc",
      username: config.username || process.env.MONGODB_USERNAME,
      password: config.password || process.env.MONGODB_PASSWORD,
      url: config.url || process.env.MONGODB_URL,
      options: {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        heartbeatFrequencyMS: 10000,
        maxPoolSize: 10,
        minPoolSize: 2,
        ...config.options,
      },
    };
  }

  /**
   * Initialize MongoDB connection
   */
  async initialize(): Promise<void> {
    try {
      const connectionString = this.buildConnectionString();

      logger.info("🔌 Connecting to MongoDB...", "MongoController", {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
      });

      this.client = new MongoClient(connectionString, this.config.options);
      await this.client.connect();

      this.database = this.client.db(this.config.database);

      // Test connection
      await this.database.admin().ping();
      this.isConnected = true;
      this.connectionRetries = 0;

      logger.info("✅ MongoDB connected successfully", "MongoController", {
        database: this.config.database,
        collections: await this.getCollectionNames(),
      });
    } catch (error: any) {
      await this.handleConnectionError(error);
    }
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      this.database = null;
      this.client = null;
      logger.info("🔌 MongoDB connection closed", "MongoController");
    }
  }

  // CRUD Operations Implementation

  async findOne<T = any>(table: string, query: any): Promise<T | null> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.findOne(query);
      return result as T;
    } catch (error: any) {
      logger.error(
        `❌ MongoDB findOne failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      return null;
    }
  }

  async find<T = any>(
    table: string,
    query: any = {},
    options: any = {},
  ): Promise<T[]> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const cursor = collection.find(query, options);
      const results = await cursor.toArray();
      return results as T[];
    } catch (error: any) {
      logger.error(
        `❌ MongoDB find failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      return [];
    }
  }

  async insertOne<T = any>(
    table: string,
    document: T,
  ): Promise<{ insertedId: string }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.insertOne(document as any);
      return { insertedId: result.insertedId.toString() };
    } catch (error: any) {
      logger.error(
        `❌ MongoDB insertOne failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      throw error;
    }
  }

  async updateOne<T = any>(
    table: string,
    filter: any,
    update: any,
  ): Promise<{ modifiedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.updateOne(filter, { $set: update });
      return { modifiedCount: result.modifiedCount };
    } catch (error: any) {
      logger.error(
        `❌ MongoDB updateOne failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      throw error;
    }
  }

  async deleteOne(
    table: string,
    filter: any,
  ): Promise<{ deletedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.deleteOne(filter);
      return { deletedCount: result.deletedCount };
    } catch (error: any) {
      logger.error(
        `❌ MongoDB deleteOne failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      throw error;
    }
  }

  async upsert<T = any>(
    table: string,
    filter: any,
    document: T,
  ): Promise<{ upsertedId?: string; modifiedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.replaceOne(filter, document as any, {
        upsert: true,
      });
      return {
        upsertedId: result.upsertedId?.toString(),
        modifiedCount: result.modifiedCount,
      };
    } catch (error: any) {
      logger.error(
        `❌ MongoDB upsert failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      throw error;
    }
  }

  // Batch Operations

  async insertMany<T = any>(
    table: string,
    documents: T[],
  ): Promise<{ insertedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.insertMany(documents as any[]);
      return { insertedCount: result.insertedCount };
    } catch (error: any) {
      logger.error(
        `❌ MongoDB insertMany failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      throw error;
    }
  }

  async updateMany(
    table: string,
    filter: any,
    update: any,
  ): Promise<{ modifiedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.updateMany(filter, { $set: update });
      return { modifiedCount: result.modifiedCount };
    } catch (error: any) {
      logger.error(
        `❌ MongoDB updateMany failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      throw error;
    }
  }

  async deleteMany(
    table: string,
    filter: any,
  ): Promise<{ deletedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.deleteMany(filter);
      return { deletedCount: result.deletedCount };
    } catch (error: any) {
      logger.error(
        `❌ MongoDB deleteMany failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      throw error;
    }
  }

  // Utility Operations

  async count(table: string, query: any = {}): Promise<number> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      return await collection.countDocuments(query);
    } catch (error: any) {
      logger.error(
        `❌ MongoDB count failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      return 0;
    }
  }

  async distinct(
    table: string,
    field: string,
    query: any = {},
  ): Promise<any[]> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      return await collection.distinct(field, query);
    } catch (error: any) {
      logger.error(
        `❌ MongoDB distinct failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      return [];
    }
  }

  async aggregate<T = any>(table: string, pipeline: any[]): Promise<T[]> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const cursor = collection.aggregate(pipeline);
      return (await cursor.toArray()) as T[];
    } catch (error: any) {
      logger.error(
        `❌ MongoDB aggregate failed for table ${table}`,
        "MongoController",
        { error: error.message },
      );
      return [];
    }
  }

  // Health and Monitoring

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected || !this.database) {
        return false;
      }
      await this.database.admin().ping();
      return true;
    } catch (error: any) {
      logger.warn("⚠️ MongoDB health check failed", "MongoController", {
        error: error.message,
      });
      return false;
    }
  }

  async getStats(): Promise<any> {
    try {
      this.ensureConnection();
      const stats = await this.database!.stats();
      const collections = await this.getCollectionNames();

      return {
        connected: this.isConnected,
        database: this.config.database,
        collections: collections.length,
        collectionNames: collections,
        stats: {
          dataSize: stats.dataSize,
          storageSize: stats.storageSize,
          indexes: stats.indexes,
          objects: stats.objects,
        },
      };
    } catch (error: any) {
      logger.error("❌ MongoDB stats failed", "MongoController", {
        error: error.message,
      });
      return {
        connected: this.isConnected,
        database: this.config.database,
        error: error.message,
      };
    }
  }

  // Private Helper Methods

  private buildConnectionString(): string {
    if (this.config.url) {
      return this.config.url;
    }

    const { host, port, database, username, password } = this.config;
    const auth = username && password ? `${username}:${password}@` : "";
    return `mongodb://${auth}${host}:${port}/${database}`;
  }

  private ensureConnection(): void {
    if (!this.isConnected || !this.database) {
      throw new Error("MongoDB not connected. Call initialize() first.");
    }
  }

  private getCollection(name: string): Collection {
    if (!this.database) {
      throw new Error("Database not available");
    }
    return this.database.collection(name);
  }

  private async getCollectionNames(): Promise<string[]> {
    try {
      if (!this.database) return [];
      const collections = await this.database.listCollections().toArray();
      return collections.map((c) => c.name);
    } catch (error: any) {
      return [];
    }
  }

  private async handleConnectionError(error: any): Promise<void> {
    logger.error("❌ MongoDB connection failed", "MongoController", {
      error: error.message,
      retries: this.connectionRetries,
      maxRetries: this.maxRetries,
    });

    if (this.connectionRetries < this.maxRetries) {
      this.connectionRetries++;
      logger.info(
        `🔄 Retrying MongoDB connection in ${this.retryDelay}ms... (${this.connectionRetries}/${this.maxRetries})`,
        "MongoController",
      );

      await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      await this.initialize();
    } else {
      logger.warn(
        "⚠️ MongoDB connection failed after max retries - running in fallback mode",
        "MongoController",
      );
      this.isConnected = false;
    }
  }
}

// FIX v5.6.1: Singleton Lazy Loading Pattern
// MongoDBService criado UMA VEZ e reusado
let _mongoServiceSingleton: MongoDBService | null = null;
let _initializationPromise: Promise<any> | null = null;

const getMongoService = async (config?: any) => {
  // Already initialized - return existing
  if (_mongoServiceSingleton) {
    return {
      mongo: _mongoServiceSingleton,
      mongoService: _mongoServiceSingleton,
      findOne: _mongoServiceSingleton.findOne.bind(_mongoServiceSingleton),
      find: _mongoServiceSingleton.find.bind(_mongoServiceSingleton),
      insertOne: _mongoServiceSingleton.insertOne.bind(_mongoServiceSingleton),
      updateOne: _mongoServiceSingleton.updateOne.bind(_mongoServiceSingleton),
      deleteOne: _mongoServiceSingleton.deleteOne.bind(_mongoServiceSingleton),
      upsert: _mongoServiceSingleton.upsert.bind(_mongoServiceSingleton),
      insertMany: _mongoServiceSingleton.insertMany.bind(
        _mongoServiceSingleton,
      ),
      updateMany: _mongoServiceSingleton.updateMany.bind(
        _mongoServiceSingleton,
      ),
      deleteMany: _mongoServiceSingleton.deleteMany.bind(
        _mongoServiceSingleton,
      ),
      count: _mongoServiceSingleton.count.bind(_mongoServiceSingleton),
      distinct: _mongoServiceSingleton.distinct.bind(_mongoServiceSingleton),
      aggregate: _mongoServiceSingleton.aggregate.bind(_mongoServiceSingleton),
      mongoHealthCheck: _mongoServiceSingleton.healthCheck.bind(
        _mongoServiceSingleton,
      ),
      mongoStats: _mongoServiceSingleton.getStats.bind(_mongoServiceSingleton),
    };
  }

  // Currently initializing - wait for completion
  if (_initializationPromise) {
    await _initializationPromise;
    return getMongoService(config);
  }

  // First request - initialize
  _initializationPromise = (async () => {
    console.log(
      "📦 Creating MongoDBService (SINGLETON - first initialization)",
    );

    const mongoConfig: MongoConfig = {
      host: config?.mongodb?.host || process.env.MONGODB_HOST || "10.219.8.210",
      port:
        config?.mongodb?.port || parseInt(process.env.MONGODB_PORT || "27018"),
      database: config?.mongodb?.database || process.env.MONGODB_DB || "bunsnc",
      username: config?.mongodb?.username || process.env.MONGODB_USERNAME,
      password: config?.mongodb?.password || process.env.MONGODB_PASSWORD,
      url: config?.mongodb?.url || process.env.MONGODB_URL,
    };

    _mongoServiceSingleton = new MongoDBService(mongoConfig);

    try {
      await _mongoServiceSingleton.initialize();
      console.log(
        "✅ MongoDBService created (SINGLETON - reused across all requests)",
      );
    } catch (error: any) {
      logger.warn(
        "⚠️ MongoDBService init warning - using fallback:",
        error.message,
      );
    }
  })();

  await _initializationPromise;
  _initializationPromise = null;
  return getMongoService(config);
};

/**
 * MongoDB Controller Plugin
 * Follows Elysia "1 controller = 1 instância" best practice
 */
export const mongoController = new Elysia({ name: "mongo" })
  .onStart(async () => {
    logger.info(
      "🔧 MongoDB Controller starting - Singleton Lazy Loading pattern",
      "MongoController",
    );
  })
  .derive(async ({ config }) => await getMongoService(config))
  .onStop(async ({ mongoService }) => {
    if (mongoService && mongoService.isConnected) {
      await mongoService.close();
      logger.info("🛑 MongoDB Controller stopped", "MongoController");
    }
  })
  .as("global"); // Global scope for database access across all routes

// MongoDB Controller Context Type
export interface MongoControllerContext {
  mongo: MongoService;
  mongoService: MongoService;
  findOne: MongoService["findOne"];
  find: MongoService["find"];
  insertOne: MongoService["insertOne"];
  updateOne: MongoService["updateOne"];
  deleteOne: MongoService["deleteOne"];
  upsert: MongoService["upsert"];
  insertMany: MongoService["insertMany"];
  updateMany: MongoService["updateMany"];
  deleteMany: MongoService["deleteMany"];
  count: MongoService["count"];
  distinct: MongoService["distinct"];
  aggregate: MongoService["aggregate"];
  mongoHealthCheck: MongoService["healthCheck"];
  mongoStats: MongoService["getStats"];
}

export default mongoController;
