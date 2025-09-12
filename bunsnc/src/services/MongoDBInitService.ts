/**
 * MongoDB Initialization Service - Complete Setup and Integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient, Db } from 'mongodb';
import { TicketRepository } from '../repositories/TicketRepository';
import { HybridDataService } from './HybridDataService';
import { ServiceNowAuthClient } from './ServiceNowAuthClient';

export interface MongoDBConfig {
  connectionString: string;
  databaseName?: string;
  options?: {
    maxPoolSize?: number;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
  };
}

export class MongoDBInitService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private ticketRepository: TicketRepository | null = null;
  private hybridDataService: HybridDataService | null = null;

  constructor(private config: MongoDBConfig) {}

  /**
   * Initialize complete MongoDB integration
   */
  async initialize(serviceNowClient: ServiceNowAuthClient): Promise<{
    client: MongoClient;
    db: Db;
    ticketRepository: TicketRepository;
    ticketSyncService: TicketSyncService;
  }> {
    console.log('🔧 Initializing MongoDB integration...');

    // Connect to MongoDB
    await this.connect();
    
    if (!this.client || !this.db) {
      throw new Error('Failed to initialize MongoDB connection');
    }

    // Initialize TicketRepository
    this.ticketRepository = new TicketRepository(this.client, this.config.databaseName);
    await this.ticketRepository.initialize();
    
    // Initialize TicketSyncService
    this.ticketSyncService = new TicketSyncService(this.ticketRepository, serviceNowClient);
    
    console.log('✅ MongoDB integration initialized successfully');
    
    return {
      client: this.client,
      db: this.db,
      ticketRepository: this.ticketRepository,
      ticketSyncService: this.ticketSyncService
    };
  }

  /**
   * Connect to MongoDB
   */
  private async connect(): Promise<void> {
    const defaultOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    const options = { ...defaultOptions, ...this.config.options };

    console.log(`🔗 Connecting to MongoDB: ${this.maskConnectionString(this.config.connectionString)}`);

    this.client = new MongoClient(this.config.connectionString, options);
    await this.client.connect();
    
    this.db = this.client.db(this.config.databaseName || 'bunsnc_tickets');
    
    // Test connection
    await this.db.admin().ping();
    console.log('✅ MongoDB connection established');
  }

  /**
   * Get TicketRepository instance
   */
  getTicketRepository(): TicketRepository {
    if (!this.ticketRepository) {
      throw new Error('MongoDB not initialized. Call initialize() first.');
    }
    return this.ticketRepository;
  }

  /**
   * Get TicketSyncService instance
   */
  getTicketSyncService(): TicketSyncService {
    if (!this.ticketSyncService) {
      throw new Error('MongoDB not initialized. Call initialize() first.');
    }
    return this.ticketSyncService;
  }

  /**
   * Get MongoDB client
   */
  getClient(): MongoClient {
    if (!this.client) {
      throw new Error('MongoDB not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Get database instance
   */
  getDatabase(): Db {
    if (!this.db) {
      throw new Error('MongoDB not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Check if MongoDB is initialized
   */
  isInitialized(): boolean {
    return this.client !== null && this.ticketRepository !== null && this.ticketSyncService !== null;
  }

  /**
   * Get connection status
   */
  async getStatus(): Promise<{
    connected: boolean;
    collections: Record<string, number>;
    syncStats?: any;
  }> {
    if (!this.client || !this.db || !this.ticketRepository) {
      return { connected: false, collections: {} };
    }

    try {
      await this.db.admin().ping();
      const collections = await this.ticketRepository.getStats();
      const syncStats = this.ticketSyncService ? await this.ticketSyncService.getSyncStats() : undefined;
      
      return {
        connected: true,
        collections,
        syncStats
      };
    } catch (error) {
      console.error('❌ MongoDB status check failed:', error);
      return { connected: false, collections: {} };
    }
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(options?: { syncInterval?: number; tables?: string[] }): void {
    if (!this.ticketSyncService) {
      throw new Error('TicketSyncService not initialized');
    }

    console.log('🔄 Starting automatic ticket synchronization...');
    this.ticketSyncService.startAutoSync(options);
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.ticketSyncService) {
      this.ticketSyncService.stopAutoSync();
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('🔴 Shutting down MongoDB integration...');

    // Stop sync service
    this.stopAutoSync();

    // Close MongoDB connection
    if (this.client) {
      await this.client.close();
      console.log('✅ MongoDB connection closed');
    }

    this.client = null;
    this.db = null;
    this.ticketRepository = null;
    this.ticketSyncService = null;
  }

  /**
   * Mask sensitive information in connection string
   */
  private maskConnectionString(connectionString: string): string {
    return connectionString.replace(/:([^@:]+)@/, ':****@');
  }

  /**
   * Create default configuration
   */
  static createDefaultConfig(): MongoDBConfig {
    const connectionString = process.env.MONGODB_URL || 
                           process.env.MONGO_URL || 
                           `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}?authSource=${process.env.MONGODB_AUTH_SOURCE}`;

    return {
      connectionString,
      databaseName: 'bunsnc_tickets',
      options: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      }
    };
  }

  /**
   * Validate configuration
   */
  static validateConfig(config: MongoDBConfig): void {
    if (!config.connectionString) {
      throw new Error('MongoDB connection string is required');
    }

    if (!config.connectionString.startsWith('mongodb://') && 
        !config.connectionString.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB connection string format');
    }
  }
}