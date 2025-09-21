/**
 * MongoDB Configuration and Client
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

interface MongoDBConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  authSource?: string;
}

export interface TicketDocument {
  _id?: string;
  sys_id: string;
  table_name: string;
  number: string;
  short_description: string;
  state: string;
  priority: string;
  assignment_group?: string | { display_value: string; value: string };
  assigned_to?: string | { display_value: string; value: string };
  caller_id?: string | { display_value: string; value: string };
  opened_by?: string | { display_value: string; value: string };
  sys_created_on: string;
  sys_updated_on: string;
  raw_data: Record<string, unknown>;
  cached_at: Date;
  expires_at: Date;
}

export interface ConfigDocument {
  _id?: string;
  key: string;
  value: unknown;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AccessLogDocument {
  _id?: string;
  timestamp: Date;
  ip_address: string;
  user_agent: string;
  endpoint: string;
  method: string;
  response_code: number;
  response_time_ms: number;
  user_id?: string;
  session_id?: string;
}

export interface ErrorLogDocument {
  _id?: string;
  timestamp: Date;
  level: "error" | "warning" | "info";
  message: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
  endpoint?: string;
  user_id?: string;
  session_id?: string;
}

class MongoDBClient {
  private config: MongoDBConfig;
  private client: any = null; // MongoDB client from dynamic import
  private db: any = null; // MongoDB database instance

  constructor(config: MongoDBConfig) {
    this.config = config;
  }

  private getConnectionString(): string {
    const {
      host,
      port,
      username,
      password,
      database,
      authSource = "admin",
    } = this.config;
    return `mongodb://${username}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=${authSource}`;
  }

  async connect(): Promise<void> {
    try {
      // Dynamic import for MongoDB client (will be installed separately)
      const { MongoClient } = await import("mongodb");

      this.client = new MongoClient(this.getConnectionString(), {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        family: 4,
        // MongoDB 7 specific configurations
        retryWrites: true,
        retryReads: true,
        w: "majority",
        readPreference: "primary",
        readConcern: { level: "majority" },
        writeConcern: { w: "majority", j: true },
        monitorCommands: true,
      });

      await this.client.connect();
      this.db = this.client.db(this.config.database);

      console.log(
        `🍃 MongoDB connected to ${this.config.host}:${this.config.port}/${this.config.database}`,
      );

      // Create indexes for better performance
      await this.createIndexes();
    } catch (error) {
      console.error(" MongoDB connection failed:", error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    try {
      // Tickets collection indexes
      await this.db
        .collection("tickets")
        .createIndex({ sys_id: 1 }, { unique: true });
      await this.db
        .collection("tickets")
        .createIndex({ table_name: 1, state: 1 });
      await this.db
        .collection("tickets")
        .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

      // Config collection indexes
      await this.db
        .collection("configs")
        .createIndex({ key: 1 }, { unique: true });

      // Access logs indexes
      await this.db.collection("access_logs").createIndex({ timestamp: -1 });
      await this.db.collection("access_logs").createIndex({ endpoint: 1 });

      // Error logs indexes
      await this.db.collection("error_logs").createIndex({ timestamp: -1 });
      await this.db.collection("error_logs").createIndex({ level: 1 });

      console.log(" MongoDB indexes created successfully");
    } catch (error) {
      console.warn(" MongoDB indexes creation warning:", error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      console.log("🍃 MongoDB disconnected");
    }
  }

  // Get database instance
  getDatabase() {
    if (!this.db) {
      throw new Error("MongoDB not connected. Call connect() first.");
    }
    return this.db;
  }

  // Ticket operations
  async saveTicket(ticket: TicketDocument): Promise<void> {
    const collection = this.db.collection("tickets");
    await collection.replaceOne({ sys_id: ticket.sys_id }, ticket, {
      upsert: true,
    });
  }

  async saveTickets(tickets: TicketDocument[]): Promise<void> {
    if (tickets.length === 0) return;

    const collection = this.db.collection("tickets");
    const operations = tickets.map((ticket) => ({
      replaceOne: {
        filter: { sys_id: ticket.sys_id },
        replacement: ticket,
        upsert: true,
      },
    }));

    await collection.bulkWrite(operations);
  }

  async getTicket(sys_id: string): Promise<TicketDocument | null> {
    const collection = this.db.collection("tickets");
    return await collection.findOne({ sys_id });
  }

  async getTickets(
    filter: Record<string, unknown> = {},
  ): Promise<TicketDocument[]> {
    const collection = this.db.collection("tickets");
    return await collection.find(filter).toArray();
  }

  async getTicketCounts(table_name: string, state?: string): Promise<number> {
    const collection = this.db.collection("tickets");
    const filter: Record<string, unknown> = { table_name };
    if (state) filter.state = state;
    return await collection.countDocuments(filter);
  }

  // Config operations
  async setConfig(
    key: string,
    value: unknown,
    description?: string,
  ): Promise<void> {
    const collection = this.db.collection("configs");
    await collection.replaceOne(
      { key },
      {
        key,
        value,
        description,
        created_at: new Date(),
        updated_at: new Date(),
      },
      { upsert: true },
    );
  }

  async getConfig(key: string): Promise<unknown> {
    const collection = this.db.collection("configs");
    const doc = await collection.findOne({ key });
    return doc?.value;
  }

  async getAllConfigs(): Promise<ConfigDocument[]> {
    const collection = this.db.collection("configs");
    return await collection.find({}).toArray();
  }

  // Access log operations
  async logAccess(log: Omit<AccessLogDocument, "_id">): Promise<void> {
    const collection = this.db.collection("access_logs");
    await collection.insertOne(log);
  }

  async getAccessLogs(
    filter: Record<string, unknown> = {},
    limit: number = 1000,
  ): Promise<AccessLogDocument[]> {
    const collection = this.db.collection("access_logs");
    return await collection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  // Error log operations
  async logError(log: Omit<ErrorLogDocument, "_id">): Promise<void> {
    const collection = this.db.collection("error_logs");
    await collection.insertOne(log);
  }

  async getErrorLogs(
    filter: Record<string, unknown> = {},
    limit: number = 1000,
  ): Promise<ErrorLogDocument[]> {
    const collection = this.db.collection("error_logs");
    return await collection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.db.admin().ping();
      return true;
    } catch {
      return false;
    }
  }
}

// Default configuration
export const mongoConfig: MongoDBConfig = {
  host: "10.219.8.210",
  port: 27018,
  username: "admin",
  password: "Logica2011_",
  database: "bunsnc",
  authSource: "admin",
};

export const mongoClient = new MongoDBClient(mongoConfig);

export default MongoDBClient;
