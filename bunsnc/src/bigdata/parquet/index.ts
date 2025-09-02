/**
 * Parquet Integration Module - Apache Arrow for High-Performance Analytics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export { ParquetWriter, ParquetUtils } from './ParquetWriter';
export { ParquetReader } from './ParquetReader';

export type {
  ParquetWriterOptions,
  ParquetSchema,
  ParquetWriteStats,
  ParquetReaderOptions,
  ParquetQueryOptions,
  ParquetReadStats
} from './ParquetWriter';

// Re-export commonly used types for convenience
export type { ParquetQueryOptions as QueryOptions } from './ParquetReader';

/**
 * Factory function to create a ParquetWriter with optimized settings for ServiceNow data
 */
export function createServiceNowParquetWriter(options: Partial<import('./ParquetWriter').ParquetWriterOptions> = {}) {
  return new (require('./ParquetWriter').ParquetWriter)({
    compression: 'SNAPPY',
    rowGroupSize: 50000,
    enableDictionary: true,
    enableStatistics: true,
    enableSchemaEvolution: true,
    timestampUnit: 'millisecond',
    ...options
  });
}

/**
 * Factory function to create a ParquetReader with optimized settings for ServiceNow data
 */
export function createServiceNowParquetReader(options: Partial<import('./ParquetReader').ParquetReaderOptions> = {}) {
  return new (require('./ParquetReader').ParquetReader)({
    batchSize: 10000,
    enableParallelRead: true,
    memoryLimit: 512 * 1024 * 1024, // 512MB
    ...options
  });
}

// Constants for ServiceNow-specific Parquet operations
export const SERVICENOW_PARQUET_DEFAULTS = {
  BATCH_SIZE: 10000,
  ROW_GROUP_SIZE: 50000,
  COMPRESSION: 'SNAPPY' as const,
  TIMESTAMP_UNIT: 'millisecond' as const,
  MEMORY_LIMIT: 512 * 1024 * 1024 // 512MB
};