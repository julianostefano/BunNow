/**
 * Bun Native PostgreSQL Configuration with Connection Pooling
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { sql } from "bun";

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  pool: {
    min: number;
    max: number;
    acquireTimeout: number;
    idleTimeout: number;
  };
  ssl?: boolean;
  connectionTimeout?: number;
  queryTimeout?: number;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  fields?: any[];
}

export class BunPostgreSQL {
  private config: DatabaseConfig;
  private connectionPool: Database[] = [];
  private availableConnections: Database[] = [];
  private busyConnections: Set<Database> = new Set();
  private isInitialized = false;

  constructor(config?: Partial<DatabaseConfig>) {
    this.config = {
      host: process.env.DATABASE_HOST || '10.219.8.210',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'vector',
      username: process.env.DATABASE_USER || 'nexcdc',
      password: process.env.DATABASE_PASSWORD || 'nexcdc_2025',
      pool: {
        min: parseInt(process.env.DATABASE_POOL_MIN || '5'),
        max: parseInt(process.env.DATABASE_POOL_MAX || '20'),
        acquireTimeout: parseInt(process.env.DATABASE_ACQUIRE_TIMEOUT || '30000'),
        idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '300000'),
      },
      ssl: process.env.DATABASE_SSL === 'true',
      connectionTimeout: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT || '30000'),
      queryTimeout: parseInt(process.env.DATABASE_QUERY_TIMEOUT || '60000'),
      ...config,
    };
  }

  /**
   * Initialize connection pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('🔗 Initializing Bun PostgreSQL connection pool...');
    
    try {
      // Create minimum number of connections
      for (let i = 0; i < this.config.pool.min; i++) {
        const connection = await this.createConnection();
        this.connectionPool.push(connection);
        this.availableConnections.push(connection);
      }

      this.isInitialized = true;
      
      console.log(` PostgreSQL pool initialized: ${this.config.pool.min} connections`);
      console.log(` Database: ${this.config.database}@${this.config.host}:${this.config.port}`);

    } catch (error) {
      console.error(' Failed to initialize PostgreSQL pool:', error);
      throw error;
    }
  }

  /**
   * Create a new database connection using Bun's native support
   */
  private async createConnection(): Promise<Database> {
    const connectionString = this.buildConnectionString();
    
    try {
      // Note: Bun SQLite interface is used as reference, but actual PostgreSQL connection
      // would use Bun's built-in PostgreSQL support when available
      // For now, we'll use a connection string approach
      
      const connection = new Database(connectionString);
      
      // Test the connection
      await this.testConnection(connection);
      
      return connection;
      
    } catch (error) {
      console.error('Failed to create database connection:', error);
      throw error;
    }
  }

  /**
   * Build PostgreSQL connection string
   */
  private buildConnectionString(): string {
    const { host, port, database, username, password, ssl } = this.config;
    
    let connectionString = `postgresql://${username}:${password}@${host}:${port}/${database}`;
    
    const params = new URLSearchParams();
    
    if (ssl) {
      params.append('sslmode', 'require');
    } else {
      params.append('sslmode', 'disable');
    }
    
    params.append('connect_timeout', (this.config.connectionTimeout! / 1000).toString());
    params.append('application_name', 'bunsnc-api');
    params.append('client_encoding', 'utf8');
    
    if (params.size > 0) {
      connectionString += `?${params.toString()}`;
    }
    
    return connectionString;
  }

  /**
   * Test database connection
   */
  private async testConnection(connection: Database): Promise<void> {
    try {
      // Test query - in a real implementation, this would be a PostgreSQL-specific test
      const result = connection.query("SELECT 1 as test").get();
      if (!result || result.test !== 1) {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      throw new Error(`Connection test failed: ${error}`);
    }
  }

  /**
   * Acquire a connection from the pool
   */
  private async acquireConnection(): Promise<Database> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    
    while (Date.now() - startTime < this.config.pool.acquireTimeout) {
      // Check for available connections
      if (this.availableConnections.length > 0) {
        const connection = this.availableConnections.shift()!;
        this.busyConnections.add(connection);
        return connection;
      }

      // Try to create new connection if under max limit
      if (this.connectionPool.length < this.config.pool.max) {
        try {
          const connection = await this.createConnection();
          this.connectionPool.push(connection);
          this.busyConnections.add(connection);
          return connection;
        } catch (error) {
          console.error('Failed to create new connection:', error);
        }
      }

      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Failed to acquire database connection: timeout');
  }

  /**
   * Release a connection back to the pool
   */
  private releaseConnection(connection: Database): void {
    this.busyConnections.delete(connection);
    this.availableConnections.push(connection);
  }

  /**
   * Execute a query with automatic connection management
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    const connection = await this.acquireConnection();
    
    try {
      const startTime = Date.now();
      
      // Execute query with timeout
      const queryPromise = new Promise<QueryResult<T>>((resolve, reject) => {
        try {
          // In a real Bun PostgreSQL implementation, this would use the appropriate method
          const statement = connection.query(sql);
          const result = params.length > 0 ? statement.all(...params) : statement.all();
          
          resolve({
            rows: result as T[],
            rowCount: Array.isArray(result) ? result.length : 1,
            command: sql.trim().split(' ')[0].toUpperCase(),
            fields: [] // Would include field metadata in real implementation
          });
          
        } catch (error) {
          reject(error);
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), this.config.queryTimeout);
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      console.log(` Query executed in ${duration}ms: ${sql.substring(0, 100)}...`);

      return result;

    } catch (error) {
      console.error('Query execution failed:', error);
      console.error('SQL:', sql);
      console.error('Params:', params);
      throw error;
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (query: (sql: string, params?: any[]) => Promise<QueryResult>) => Promise<T>): Promise<T> {
    const connection = await this.acquireConnection();
    
    try {
      // Begin transaction
      connection.query("BEGIN").run();
      
      const transactionQuery = async (sql: string, params: any[] = []): Promise<QueryResult> => {
        const statement = connection.query(sql);
        const result = params.length > 0 ? statement.all(...params) : statement.all();
        
        return {
          rows: result as any[],
          rowCount: Array.isArray(result) ? result.length : 1,
          command: sql.trim().split(' ')[0].toUpperCase(),
        };
      };

      const result = await callback(transactionQuery);
      
      // Commit transaction
      connection.query("COMMIT").run();
      
      return result;

    } catch (error) {
      try {
        // Rollback transaction
        connection.query("ROLLBACK").run();
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      throw error;
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): any {
    return {
      total: this.connectionPool.length,
      available: this.availableConnections.length,
      busy: this.busyConnections.size,
      config: {
        min: this.config.pool.min,
        max: this.config.pool.max,
      },
      initialized: this.isInitialized,
    };
  }

  /**
   * Close all connections and clean up
   */
  async close(): Promise<void> {
    console.log(' Closing PostgreSQL connection pool...');
    
    try {
      // Close all connections
      for (const connection of this.connectionPool) {
        connection.close();
      }

      this.connectionPool = [];
      this.availableConnections = [];
      this.busyConnections.clear();
      this.isInitialized = false;

      console.log(' PostgreSQL pool closed successfully');

    } catch (error) {
      console.error(' Error closing PostgreSQL pool:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const startTime = Date.now();
      const result = await this.query('SELECT 1 as health_check, NOW() as server_time');
      const duration = Date.now() - startTime;

      const stats = this.getPoolStats();

      return {
        status: 'healthy',
        details: {
          queryDuration: duration,
          poolStats: stats,
          serverTime: result.rows[0]?.server_time,
          connectionString: `postgresql://${this.config.username}@${this.config.host}:${this.config.port}/${this.config.database}`,
        },
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : String(error),
          poolStats: this.getPoolStats(),
        },
      };
    }
  }
}

// Export singleton instance
export const db = new BunPostgreSQL();

// Export helper functions
export const query = (sql: string, params?: any[]) => db.query(sql, params);
export const transaction = <T>(callback: (query: (sql: string, params?: any[]) => Promise<QueryResult>) => Promise<T>) => 
  db.transaction(callback);

// Initialize on import
db.initialize().catch(error => {
  console.error('Failed to initialize database on import:', error);
});