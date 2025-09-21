/**
 * Apache Parquet Reader for ServiceNow Data Analytics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import * as arrow from "apache-arrow";
import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";

export interface ParquetReaderOptions {
  batchSize?: number; // Default: 10000
  columns?: string[]; // Specific columns to read
  filterPredicate?: (record: any) => boolean;
  enableParallelRead?: boolean; // Default: false
  memoryLimit?: number; // Memory limit in bytes
}

export interface ParquetQueryOptions {
  select?: string[]; // Columns to select
  where?: Record<string, any>; // Simple filters
  orderBy?: string[]; // Sort columns
  limit?: number; // Limit results
  offset?: number; // Skip results
  groupBy?: string[]; // Group by columns
  aggregations?: Record<string, "count" | "sum" | "avg" | "min" | "max">;
}

export interface ParquetReadStats {
  recordsRead: number;
  filesProcessed: number;
  totalSizeBytes: number;
  readDurationMs: number;
  averageReadSpeed: number; // records/second
  memoryUsage: number;
}

export class ParquetReader {
  private options: Required<ParquetReaderOptions>;
  private stats: ParquetReadStats = {
    recordsRead: 0,
    filesProcessed: 0,
    totalSizeBytes: 0,
    readDurationMs: 0,
    averageReadSpeed: 0,
    memoryUsage: 0,
  };

  constructor(options: ParquetReaderOptions = {}) {
    this.options = {
      batchSize: options.batchSize || 10000,
      columns: options.columns || [],
      filterPredicate: options.filterPredicate || (() => true),
      enableParallelRead: options.enableParallelRead || false,
      memoryLimit: options.memoryLimit || 512 * 1024 * 1024, // 512MB
    };

    logger.info("ParquetReader initialized with options:", this.options);
  }

  /**
   * Read entire Parquet file into memory
   */
  async readFile(filePath: string): Promise<any[]> {
    const timer = performanceMonitor.startTimer("parquet_read_file");

    try {
      if (!existsSync(filePath)) {
        throw new Error(`Parquet file not found: ${filePath}`);
      }

      this.resetStats();

      const buffer = readFileSync(filePath);
      this.stats.totalSizeBytes = buffer.length;
      this.stats.filesProcessed = 1;

      const table = arrow.tableFromIPC(buffer);
      const records = this.tableToRecords(table);

      // Apply column filtering
      const filteredRecords = this.applyColumnFilter(records);

      // Apply predicate filtering
      const finalRecords = filteredRecords.filter(this.options.filterPredicate);

      this.stats.recordsRead = finalRecords.length;
      this.calculateReadSpeed();

      logger.info(
        `Read ${finalRecords.length} records from ${basename(filePath)}`,
      );

      return finalRecords;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Read multiple Parquet files (e.g., partitioned data)
   */
  async readFiles(filePaths: string[]): Promise<any[]> {
    const timer = performanceMonitor.startTimer("parquet_read_multiple");

    try {
      this.resetStats();

      if (this.options.enableParallelRead) {
        return await this.readFilesParallel(filePaths);
      } else {
        return await this.readFilesSequential(filePaths);
      }
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Stream read large Parquet file with memory efficiency
   */
  async *streamRecords(filePath: string): AsyncGenerator<any[], void, unknown> {
    const timer = performanceMonitor.startTimer("parquet_stream_read");

    try {
      if (!existsSync(filePath)) {
        throw new Error(`Parquet file not found: ${filePath}`);
      }

      this.resetStats();

      const buffer = readFileSync(filePath);
      this.stats.totalSizeBytes = buffer.length;
      this.stats.filesProcessed = 1;

      const table = arrow.tableFromIPC(buffer);
      const totalRows = table.numRows;

      logger.info(
        `Streaming ${totalRows} records from ${basename(filePath)} in batches of ${this.options.batchSize}`,
      );

      // Process in batches
      for (
        let offset = 0;
        offset < totalRows;
        offset += this.options.batchSize
      ) {
        const batchEnd = Math.min(offset + this.options.batchSize, totalRows);
        const batchRecords = this.extractBatch(table, offset, batchEnd);

        // Apply filters
        const filteredRecords = this.applyColumnFilter(batchRecords);
        const finalRecords = filteredRecords.filter(
          this.options.filterPredicate,
        );

        this.stats.recordsRead += finalRecords.length;

        if (finalRecords.length > 0) {
          yield finalRecords;
        }

        // Memory management
        this.checkMemoryUsage();
      }

      this.calculateReadSpeed();
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Execute SQL-like queries on Parquet data
   */
  async query(
    filePath: string,
    queryOptions: ParquetQueryOptions,
  ): Promise<any[]> {
    const timer = performanceMonitor.startTimer("parquet_query");

    try {
      logger.info("Executing Parquet query:", queryOptions);

      // Read the data
      const records = await this.readFile(filePath);

      // Apply SELECT
      let result = queryOptions.select
        ? records.map((record) =>
            this.selectColumns(record, queryOptions.select!),
          )
        : records;

      // Apply WHERE
      if (queryOptions.where) {
        result = result.filter((record) =>
          this.matchesWhere(record, queryOptions.where!),
        );
      }

      // Apply GROUP BY and AGGREGATIONS
      if (queryOptions.groupBy || queryOptions.aggregations) {
        result = this.applyGroupByAndAggregations(
          result,
          queryOptions.groupBy,
          queryOptions.aggregations,
        );
      }

      // Apply ORDER BY
      if (queryOptions.orderBy) {
        result = this.applySorting(result, queryOptions.orderBy);
      }

      // Apply OFFSET
      if (queryOptions.offset) {
        result = result.slice(queryOptions.offset);
      }

      // Apply LIMIT
      if (queryOptions.limit) {
        result = result.slice(0, queryOptions.limit);
      }

      logger.info(`Query returned ${result.length} records`);

      return result;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Get schema information from Parquet file
   */
  async getSchema(filePath: string): Promise<{
    fields: Array<{
      name: string;
      type: string;
      nullable: boolean;
    }>;
    totalRecords: number;
    fileSize: number;
  }> {
    if (!existsSync(filePath)) {
      throw new Error(`Parquet file not found: ${filePath}`);
    }

    const buffer = readFileSync(filePath);
    const table = arrow.tableFromIPC(buffer);

    const fields = table.schema.fields.map((field) => ({
      name: field.name,
      type: field.type.toString(),
      nullable: field.nullable,
    }));

    return {
      fields,
      totalRecords: table.numRows,
      fileSize: buffer.length,
    };
  }

  /**
   * Count records in Parquet file without loading all data
   */
  async countRecords(
    filePath: string,
    whereClause?: Record<string, any>,
  ): Promise<number> {
    if (!whereClause) {
      // Fast path - just get metadata
      const schema = await this.getSchema(filePath);
      return schema.totalRecords;
    }

    // Need to filter - use streaming approach
    let count = 0;

    for await (const batch of this.streamRecords(filePath)) {
      count += batch.filter((record) =>
        this.matchesWhere(record, whereClause),
      ).length;
    }

    return count;
  }

  /**
   * Get distinct values for a column
   */
  async getDistinctValues(
    filePath: string,
    columnName: string,
    limit?: number,
  ): Promise<any[]> {
    const distinctValues = new Set<any>();

    for await (const batch of this.streamRecords(filePath)) {
      for (const record of batch) {
        if (record[columnName] !== null && record[columnName] !== undefined) {
          distinctValues.add(record[columnName]);

          if (limit && distinctValues.size >= limit) {
            break;
          }
        }
      }

      if (limit && distinctValues.size >= limit) {
        break;
      }
    }

    return Array.from(distinctValues);
  }

  /**
   * Calculate basic statistics for numeric columns
   */
  async getColumnStats(
    filePath: string,
    columnName: string,
  ): Promise<{
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    distinctValues: number;
  }> {
    let count = 0;
    let sum = 0;
    let min = Number.MAX_VALUE;
    let max = Number.MIN_VALUE;
    const distinctValues = new Set<any>();

    for await (const batch of this.streamRecords(filePath)) {
      for (const record of batch) {
        const value = record[columnName];

        if (value !== null && value !== undefined && !isNaN(value)) {
          count++;
          sum += Number(value);
          min = Math.min(min, Number(value));
          max = Math.max(max, Number(value));
          distinctValues.add(value);
        }
      }
    }

    return {
      count,
      sum,
      min: min === Number.MAX_VALUE ? 0 : min,
      max: max === Number.MIN_VALUE ? 0 : max,
      avg: count > 0 ? sum / count : 0,
      distinctValues: distinctValues.size,
    };
  }

  /**
   * Get read statistics
   */
  getStats(): ParquetReadStats {
    return { ...this.stats };
  }

  private async readFilesSequential(filePaths: string[]): Promise<any[]> {
    const allRecords: any[] = [];

    for (const filePath of filePaths) {
      const records = await this.readFile(filePath);
      allRecords.push(...records);
    }

    return allRecords;
  }

  private async readFilesParallel(filePaths: string[]): Promise<any[]> {
    const promises = filePaths.map((filePath) => this.readFile(filePath));
    const results = await Promise.all(promises);

    return results.flat();
  }

  private tableToRecords(table: arrow.Table): any[] {
    const records: any[] = [];

    for (let i = 0; i < table.numRows; i++) {
      const record: any = {};

      for (const field of table.schema.fields) {
        const column = table.getChild(field.name);
        record[field.name] = column?.get(i);
      }

      records.push(record);
    }

    return records;
  }

  private extractBatch(table: arrow.Table, start: number, end: number): any[] {
    const records: any[] = [];

    for (let i = start; i < end; i++) {
      const record: any = {};

      for (const field of table.schema.fields) {
        const column = table.getChild(field.name);
        record[field.name] = column?.get(i);
      }

      records.push(record);
    }

    return records;
  }

  private applyColumnFilter(records: any[]): any[] {
    if (this.options.columns.length === 0) {
      return records;
    }

    return records.map((record) => {
      const filtered: any = {};
      for (const column of this.options.columns) {
        filtered[column] = record[column];
      }
      return filtered;
    });
  }

  private selectColumns(record: any, columns: string[]): any {
    const selected: any = {};
    for (const column of columns) {
      selected[column] = record[column];
    }
    return selected;
  }

  private matchesWhere(record: any, whereClause: Record<string, any>): boolean {
    for (const [field, expectedValue] of Object.entries(whereClause)) {
      if (record[field] !== expectedValue) {
        return false;
      }
    }
    return true;
  }

  private applyGroupByAndAggregations(
    records: any[],
    groupBy?: string[],
    aggregations?: Record<string, "count" | "sum" | "avg" | "min" | "max">,
  ): any[] {
    if (!groupBy && !aggregations) {
      return records;
    }

    // Simple grouping implementation
    const groups = new Map<string, any[]>();

    for (const record of records) {
      const groupKey = groupBy
        ? groupBy.map((field) => record[field]).join("|")
        : "all";

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }

      groups.get(groupKey)!.push(record);
    }

    // Apply aggregations
    const result: any[] = [];

    for (const [groupKey, groupRecords] of groups) {
      const aggregatedRecord: any = {};

      // Add group by fields
      if (groupBy) {
        const groupValues = groupKey.split("|");
        groupBy.forEach((field, index) => {
          aggregatedRecord[field] = groupValues[index];
        });
      }

      // Apply aggregations
      if (aggregations) {
        for (const [field, aggType] of Object.entries(aggregations)) {
          const values = groupRecords
            .map((r) => r[field])
            .filter((v) => v != null);

          switch (aggType) {
            case "count":
              aggregatedRecord[`${field}_count`] = values.length;
              break;
            case "sum":
              aggregatedRecord[`${field}_sum`] = values.reduce(
                (a, b) => a + Number(b),
                0,
              );
              break;
            case "avg":
              aggregatedRecord[`${field}_avg`] =
                values.length > 0
                  ? values.reduce((a, b) => a + Number(b), 0) / values.length
                  : 0;
              break;
            case "min":
              aggregatedRecord[`${field}_min`] =
                values.length > 0 ? Math.min(...values.map(Number)) : null;
              break;
            case "max":
              aggregatedRecord[`${field}_max`] =
                values.length > 0 ? Math.max(...values.map(Number)) : null;
              break;
          }
        }
      }

      result.push(aggregatedRecord);
    }

    return result;
  }

  private applySorting(records: any[], orderBy: string[]): any[] {
    return records.sort((a, b) => {
      for (const field of orderBy) {
        const desc = field.startsWith("-");
        const fieldName = desc ? field.substring(1) : field;

        const valueA = a[fieldName];
        const valueB = b[fieldName];

        if (valueA < valueB) return desc ? 1 : -1;
        if (valueA > valueB) return desc ? -1 : 1;
      }
      return 0;
    });
  }

  private checkMemoryUsage(): void {
    if (global.gc) {
      global.gc();
    }

    const memUsage = process.memoryUsage();
    this.stats.memoryUsage = memUsage.heapUsed;

    if (memUsage.heapUsed > this.options.memoryLimit) {
      logger.warn(
        `Memory usage ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB exceeds limit ${(this.options.memoryLimit / 1024 / 1024).toFixed(2)}MB`,
      );
    }
  }

  private resetStats(): void {
    this.stats = {
      recordsRead: 0,
      filesProcessed: 0,
      totalSizeBytes: 0,
      readDurationMs: 0,
      averageReadSpeed: 0,
      memoryUsage: 0,
    };
  }

  private calculateReadSpeed(): void {
    const durationSeconds = this.stats.readDurationMs / 1000;
    this.stats.averageReadSpeed =
      durationSeconds > 0 ? this.stats.recordsRead / durationSeconds : 0;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    logger.info("ParquetReader destroyed and resources cleaned up");
  }
}
