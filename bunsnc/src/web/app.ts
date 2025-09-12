/**
 * Web Application Entry Point
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowWebServer, WebServerConfig } from './server';
import { enhancedTicketStorageService } from '../services/EnhancedTicketStorageService';

const config: WebServerConfig = {
  port: 3008,
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  
  serviceNow: {
    instanceUrl: process.env.SERVICENOW_INSTANCE_URL || 'https://dev12345.service-now.com',
    username: process.env.SERVICENOW_USERNAME || 'admin',
    password: process.env.SERVICENOW_PASSWORD || 'admin',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  
  hadoop: {
    namenode: process.env.HADOOP_NAMENODE || 'localhost',
    port: parseInt(process.env.HADOOP_PORT || '8020'),
    username: process.env.HADOOP_USERNAME || 'hadoop',
  },
  
  opensearch: {
    host: process.env.OPENSEARCH_HOST || 'localhost',
    port: parseInt(process.env.OPENSEARCH_PORT || '9200'),
    username: process.env.OPENSEARCH_USERNAME,
    password: process.env.OPENSEARCH_PASSWORD,
    ssl: process.env.OPENSEARCH_SSL === 'true',
  },
  
  parquet: {
    outputPath: process.env.PARQUET_OUTPUT_PATH || '/tmp/parquet',
    compressionType: (process.env.PARQUET_COMPRESSION as any) || 'snappy',
  },
  
  mongodb: {
    host: process.env.MONGODB_HOST || '10.219.8.210',
    port: parseInt(process.env.MONGODB_PORT || '27018'),
    username: process.env.MONGODB_USERNAME || 'admin',
    password: process.env.MONGODB_PASSWORD || 'Logica2011_',
    database: process.env.MONGODB_DATABASE || 'bunsnc',
  },
};

async function startWebInterface() {
  try {
    console.log('🚀 Starting ServiceNow Web Interface...');
    console.log(`📊 Configuration:`);
    console.log(`   - Port: ${config.port}`);
    console.log(`   - ServiceNow: ${config.serviceNow.instanceUrl}`);
    console.log(`   - Redis: ${config.redis.host}:${config.redis.port}`);
    console.log(`   - Hadoop: ${config.hadoop.namenode}:${config.hadoop.port}`);
    console.log(`   - OpenSearch: ${config.opensearch.host}:${config.opensearch.port}`);
    console.log(`   - MongoDB: ${config.mongodb.host}:${config.mongodb.port}/${config.mongodb.database}`);
    console.log(`   - Parquet Output: ${config.parquet.outputPath}`);
    
    // Initialize MongoDB persistence
    console.log('🍃 Initializing MongoDB persistence...');
    await enhancedTicketStorageService.initialize();
    
    const server = new ServiceNowWebServer(config);
    await server.start();
    
    console.log('');
    console.log('✅ ServiceNow Web Interface started successfully!');
    console.log('');
    console.log('📊 Available endpoints:');
    console.log(`   Dashboard: http://localhost:${config.port}`);
    console.log(`   Incidents: http://localhost:${config.port}/dashboard/incidents`);
    console.log(`   API Docs:  http://localhost:${config.port}/swagger`);
    console.log(`   Health:    http://localhost:${config.port}/health`);
    console.log('');
    console.log('🔌 Real-time features:');
    console.log(`   SSE Stream: http://localhost:${config.port}/events/stream`);
    console.log(`   WebSocket:  ws://localhost:${config.port}/ws/control`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Failed to start ServiceNow Web Interface:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`🛑 Received ${signal}, shutting down ServiceNow Web Interface gracefully...`);
  
  try {
    // Shutdown persistence service
    await enhancedTicketStorageService.shutdown();
    console.log('🍃 MongoDB persistence shut down gracefully');
  } catch (error) {
    console.error('❌ Error during MongoDB shutdown:', error);
  }
  
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the application
startWebInterface();