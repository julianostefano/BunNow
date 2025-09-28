/**
 * MongoDB Controller - Specialized Elysia Controller
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
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
  insertOne<T = any>(table: string, document: T): Promise<{ insertedId: string }>;
  updateOne<T = any>(table: string, filter: any, update: any): Promise<{ modifiedCount: number }>;
  deleteOne(table: string, filter: any): Promise<{ deletedCount: number }>;
  upsert<T = any>(table: string, filter: any, document: T): Promise<{ upsertedId?: string; modifiedCount: number }>;

  // Batch operations
  insertMany<T = any>(table: string, documents: T[]): Promise<{ insertedCount: number }>;
  updateMany(table: string, filter: any, update: any): Promise<{ modifiedCount: number }>;
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
        ...config.options
      }
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
        database: this.config.database
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
        collections: await this.getCollectionNames()
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
      logger.error(`❌ MongoDB findOne failed for table ${table}`, "MongoController", { error: error.message });
      return null;
    }
  }

  async find<T = any>(table: string, query: any = {}, options: any = {}): Promise<T[]> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const cursor = collection.find(query, options);
      const results = await cursor.toArray();
      return results as T[];
    } catch (error: any) {
      logger.error(`❌ MongoDB find failed for table ${table}`, "MongoController", { error: error.message });
      return [];
    }
  }

  async insertOne<T = any>(table: string, document: T): Promise<{ insertedId: string }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.insertOne(document as any);
      return { insertedId: result.insertedId.toString() };
    } catch (error: any) {
      logger.error(`❌ MongoDB insertOne failed for table ${table}`, "MongoController", { error: error.message });
      throw error;
    }
  }

  async updateOne<T = any>(table: string, filter: any, update: any): Promise<{ modifiedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.updateOne(filter, { $set: update });
      return { modifiedCount: result.modifiedCount };
    } catch (error: any) {
      logger.error(`❌ MongoDB updateOne failed for table ${table}`, "MongoController", { error: error.message });
      throw error;
    }
  }

  async deleteOne(table: string, filter: any): Promise<{ deletedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.deleteOne(filter);
      return { deletedCount: result.deletedCount };
    } catch (error: any) {
      logger.error(`❌ MongoDB deleteOne failed for table ${table}`, "MongoController", { error: error.message });
      throw error;
    }
  }

  async upsert<T = any>(table: string, filter: any, document: T): Promise<{ upsertedId?: string; modifiedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.replaceOne(filter, document as any, { upsert: true });
      return {
        upsertedId: result.upsertedId?.toString(),
        modifiedCount: result.modifiedCount
      };
    } catch (error: any) {
      logger.error(`❌ MongoDB upsert failed for table ${table}`, "MongoController", { error: error.message });
      throw error;
    }
  }

  // Batch Operations

  async insertMany<T = any>(table: string, documents: T[]): Promise<{ insertedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.insertMany(documents as any[]);
      return { insertedCount: result.insertedCount };
    } catch (error: any) {
      logger.error(`❌ MongoDB insertMany failed for table ${table}`, "MongoController", { error: error.message });
      throw error;
    }
  }

  async updateMany(table: string, filter: any, update: any): Promise<{ modifiedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.updateMany(filter, { $set: update });
      return { modifiedCount: result.modifiedCount };
    } catch (error: any) {
      logger.error(`❌ MongoDB updateMany failed for table ${table}`, "MongoController", { error: error.message });
      throw error;
    }
  }

  async deleteMany(table: string, filter: any): Promise<{ deletedCount: number }> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const result = await collection.deleteMany(filter);
      return { deletedCount: result.deletedCount };
    } catch (error: any) {
      logger.error(`❌ MongoDB deleteMany failed for table ${table}`, "MongoController", { error: error.message });
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
      logger.error(`❌ MongoDB count failed for table ${table}`, "MongoController", { error: error.message });
      return 0;
    }
  }

  async distinct(table: string, field: string, query: any = {}): Promise<any[]> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      return await collection.distinct(field, query);
    } catch (error: any) {
      logger.error(`❌ MongoDB distinct failed for table ${table}`, "MongoController", { error: error.message });
      return [];
    }
  }

  async aggregate<T = any>(table: string, pipeline: any[]): Promise<T[]> {
    try {
      this.ensureConnection();
      const collection = this.getCollection(table);
      const cursor = collection.aggregate(pipeline);
      return await cursor.toArray() as T[];
    } catch (error: any) {
      logger.error(`❌ MongoDB aggregate failed for table ${table}`, "MongoController", { error: error.message });
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
      logger.warn("⚠️ MongoDB health check failed", "MongoController", { error: error.message });
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
          objects: stats.objects
        }
      };
    } catch (error: any) {
      logger.error("❌ MongoDB stats failed", "MongoController", { error: error.message });
      return {
        connected: this.isConnected,
        database: this.config.database,
        error: error.message
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
      return collections.map(c => c.name);
    } catch (error: any) {
      return [];
    }
  }

  private async handleConnectionError(error: any): Promise<void> {
    logger.error("❌ MongoDB connection failed", "MongoController", {
      error: error.message,
      retries: this.connectionRetries,
      maxRetries: this.maxRetries
    });

    if (this.connectionRetries < this.maxRetries) {
      this.connectionRetries++;
      logger.info(`🔄 Retrying MongoDB connection in ${this.retryDelay}ms... (${this.connectionRetries}/${this.maxRetries})`, "MongoController");

      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      await this.initialize();
    } else {
      logger.warn("⚠️ MongoDB connection failed after max retries - running in fallback mode", "MongoController");
      this.isConnected = false;
    }
  }
}

/**
 * MongoDB Controller Plugin
 * Follows Elysia "1 controller = 1 instância" best practice
 */
export const mongoController = new Elysia({ name: "mongo" })
  .onStart(async () => {
    logger.info("🔌 MongoDB Controller initializing...", "MongoController");
  })
  .derive(async ({ config }) => {
    // Get MongoDB configuration
    const mongoConfig: MongoConfig = {
      host: config?.mongodb?.host,
      port: config?.mongodb?.port,
      database: config?.mongodb?.database,
      username: config?.mongodb?.username,
      password: config?.mongodb?.password,
      url: config?.mongodb?.url,
    };

    // Create MongoDB service instance
    const mongoService = new MongoDBService(mongoConfig);

    try {
      // Initialize connection
      await mongoService.initialize();

      logger.info("✅ MongoDB Controller ready", "MongoController", {
        connected: mongoService.isConnected,
        database: mongoConfig.database
      });

      return {
        mongo: mongoService,
        mongoService,
        // Expose individual methods for convenience
        findOne: mongoService.findOne.bind(mongoService),
        find: mongoService.find.bind(mongoService),
        insertOne: mongoService.insertOne.bind(mongoService),
        updateOne: mongoService.updateOne.bind(mongoService),
        deleteOne: mongoService.deleteOne.bind(mongoService),
        upsert: mongoService.upsert.bind(mongoService),
        insertMany: mongoService.insertMany.bind(mongoService),
        updateMany: mongoService.updateMany.bind(mongoService),
        deleteMany: mongoService.deleteMany.bind(mongoService),
        count: mongoService.count.bind(mongoService),
        distinct: mongoService.distinct.bind(mongoService),
        aggregate: mongoService.aggregate.bind(mongoService),
        mongoHealthCheck: mongoService.healthCheck.bind(mongoService),
        mongoStats: mongoService.getStats.bind(mongoService)
      };

    } catch (error: any) {
      logger.error("❌ MongoDB Controller initialization failed", "MongoController", {
        error: error.message
      });

      // Return fallback service that doesn't crash the application
      const fallbackService: MongoService = {
        isConnected: false,
        database: null,
        client: null,
        findOne: async () => null,
        find: async () => [],
        insertOne: async () => ({ insertedId: "fallback-id" }),
        updateOne: async () => ({ modifiedCount: 0 }),
        deleteOne: async () => ({ deletedCount: 0 }),
        upsert: async () => ({ modifiedCount: 0 }),
        insertMany: async () => ({ insertedCount: 0 }),
        updateMany: async () => ({ modifiedCount: 0 }),
        deleteMany: async () => ({ deletedCount: 0 }),
        count: async () => 0,
        distinct: async () => [],
        aggregate: async () => [],
        healthCheck: async () => false,
        getStats: async () => ({ connected: false, error: "Connection failed" })
      };

      return {
        mongo: fallbackService,
        mongoService: fallbackService,
        findOne: fallbackService.findOne,
        find: fallbackService.find,
        insertOne: fallbackService.insertOne,
        updateOne: fallbackService.updateOne,
        deleteOne: fallbackService.deleteOne,
        upsert: fallbackService.upsert,
        insertMany: fallbackService.insertMany,
        updateMany: fallbackService.updateMany,
        deleteMany: fallbackService.deleteMany,
        count: fallbackService.count,
        distinct: fallbackService.distinct,
        aggregate: fallbackService.aggregate,
        mongoHealthCheck: fallbackService.healthCheck,
        mongoStats: fallbackService.getStats
      };
    }
  })
  .onStop(async ({ mongoService }) => {
    if (mongoService && mongoService.isConnected) {
      await mongoService.close();
      logger.info("🛑 MongoDB Controller stopped", "MongoController");
    }
  })
  .as('global'); // Global scope for database access across all routes

// MongoDB Controller Context Type
export interface MongoControllerContext {
  mongo: MongoService;
  mongoService: MongoService;
  findOne: MongoService['findOne'];
  find: MongoService['find'];
  insertOne: MongoService['insertOne'];
  updateOne: MongoService['updateOne'];
  deleteOne: MongoService['deleteOne'];
  upsert: MongoService['upsert'];
  insertMany: MongoService['insertMany'];
  updateMany: MongoService['updateMany'];
  deleteMany: MongoService['deleteMany'];
  count: MongoService['count'];
  distinct: MongoService['distinct'];
  aggregate: MongoService['aggregate'];
  mongoHealthCheck: MongoService['healthCheck'];
  mongoStats: MongoService['getStats'];
}

export default mongoController;