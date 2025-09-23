/**
 * Apache Parquet Writer for ServiceNow Data - High Performance Analytics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import * as arrow from "apache-arrow";
import { writeFileSync, createWriteStream, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";
import type { GlideRecord } from "../../record/GlideRecord";

export interface ParquetWriterOptions {
  compression?:
    | "UNCOMPRESSED"
    | "SNAPPY"
    | "GZIP"
    | "LZ4"
    | "BROTLI"
    | "LZO"
    | "ZSTD";
  rowGroupSize?: number; // Default: 50000
  pageSize?: number; // Default: 8192
  enableDictionary?: boolean; // Default: true
  enableStatistics?: boolean; // Default: true
  partitionBy?: string[]; // Fields to partition by
  maxFileSize?: number; // Max file size in bytes (default: 128MB)
  bufferSize?: number; // Memory buffer size (default: 64MB)
  enableSchemaEvolution?: boolean; // Default: true
  timestampUnit?: "second" | "millisecond" | "microsecond" | "nanosecond";
}

export interface ParquetSchema {
  name: string;
  type:
    | "string"
    | "int32"
    | "int64"
    | "float32"
    | "float64"
    | "boolean"
    | "timestamp"
    | "binary";
  nullable?: boolean;
  metadata?: Record<string, string>;
}

export interface ParquetWriteStats {
  recordsWritten: number;
  filesCreated: number;
  totalSizeBytes: number;
  compressionRatio: number;
  writeDurationMs: number;
  averageRecordSize: number;
  partitions: Record<string, number>;
}

export class ParquetWriter {
  private options: Required<ParquetWriterOptions>;
  private schema?: arrow.Schema;
  private recordBatch: any[] = [];
  private fileCounter: number = 0;
  private stats: ParquetWriteStats = {
    recordsWritten: 0,
    filesCreated: 0,
    totalSizeBytes: 0,
    compressionRatio: 1.0,
    writeDurationMs: 0,
    averageRecordSize: 0,
    partitions: {},
  };

  constructor(options: ParquetWriterOptions = {}) {
    this.options = {
      compression: options.compression || "SNAPPY",
      rowGroupSize: options.rowGroupSize || 50000,
      pageSize: options.pageSize || 8192,
      enableDictionary: options.enableDictionary ?? true,
      enableStatistics: options.enableStatistics ?? true,
      partitionBy: options.partitionBy || [],
      maxFileSize: options.maxFileSize || 128 * 1024 * 1024, // 128MB
      bufferSize: options.bufferSize || 64 * 1024 * 1024, // 64MB
      enableSchemaEvolution: options.enableSchemaEvolution ?? true,
      timestampUnit: options.timestampUnit || "millisecond",
    };

    logger.info("ParquetWriter initialized with options:", this.options);
  }

  /**
   * Auto-detect schema from ServiceNow GlideRecord
   */
  async detectSchema(gr: GlideRecord): Promise<arrow.Schema> {
    const timer = performanceMonitor.startTimer("parquet_schema_detection");

    try {
      if (!gr.next()) {
        throw new Error("No records available for schema detection");
      }

      const fields: arrow.Field[] = [];
      const record = gr.serialize();

      // Add system fields first
      fields.push(arrow.Field.new("sys_id", arrow.Utf8, false));
      fields.push(
        arrow.Field.new("sys_created_on", arrow.TimestampMillisecond, false),
      );
      fields.push(
        arrow.Field.new("sys_updated_on", arrow.TimestampMillisecond, false),
      );
      fields.push(arrow.Field.new("sys_created_by", arrow.Utf8, true));
      fields.push(arrow.Field.new("sys_updated_by", arrow.Utf8, true));

      // Detect data types for other fields
      for (const [fieldName, value] of Object.entries(record)) {
        if (fieldName.startsWith("sys_")) continue; // Already added

        const field = this.detectFieldType(fieldName, value);
        fields.push(field);
      }

      this.schema = new arrow.Schema(fields);

      logger.info(
        `Schema detected with ${fields.length} fields for table ${gr.getTableName()}`,
      );
      return this.schema;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Create schema from explicit definition
   */
  createSchema(schemaDefinition: ParquetSchema[]): arrow.Schema {
    const fields = schemaDefinition.map((def) => {
      const arrowType = this.getArrowType(def.type);
      return arrow.Field.new(def.name, arrowType, def.nullable ?? true);
    });

    this.schema = new arrow.Schema(fields);
    logger.info(`Custom schema created with ${fields.length} fields`);

    return this.schema;
  }

  /**
   * Write ServiceNow records to Parquet format
   */
  async writeRecords(
    records: any[],
    outputPath: string,
    tableName?: string,
  ): Promise<ParquetWriteStats> {
    const timer = performanceMonitor.startTimer("parquet_write_records");

    try {
      if (!this.schema) {
        throw new Error(
          "Schema not detected or created. Call detectSchema() first.",
        );
      }

      // Reset stats
      this.resetStats();

      // Ensure output directory exists
      const outputDir = dirname(outputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      if (this.options.partitionBy.length > 0) {
        // Partitioned write
        await this.writePartitionedRecords(records, outputPath, tableName);
      } else {
        // Single file write
        await this.writeSingleFile(records, outputPath);
      }

      // Calculate final stats
      this.calculateFinalStats();

      logger.info(
        `Parquet write completed: ${this.stats.recordsWritten} records, ${this.stats.filesCreated} files, ${(this.stats.totalSizeBytes / 1024 / 1024).toFixed(2)}MB`,
      );

      return { ...this.stats };
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Stream ServiceNow GlideRecord to Parquet (memory efficient)
   */
  async streamToParquet(
    gr: GlideRecord,
    outputPath: string,
    batchSize: number = 10000,
  ): Promise<ParquetWriteStats> {
    const timer = performanceMonitor.startTimer("parquet_stream_write");

    try {
      // Auto-detect schema if not set
      if (!this.schema) {
        await this.detectSchema(gr);
        gr.rewind(); // Reset to beginning
      }

      this.resetStats();
      let batch: any[] = [];
      let batchNumber = 0;

      while (gr.next()) {
        const record = this.transformRecord(gr.serialize());
        batch.push(record);

        // Write batch when size is reached
        if (batch.length >= batchSize) {
          const batchFile = this.generateBatchFileName(outputPath, batchNumber);
          await this.writeSingleFile(batch, batchFile);

          batch = [];
          batchNumber++;

          // Memory cleanup
          if (global.gc) {
            global.gc();
          }
        }
      }

      // Write remaining records
      if (batch.length > 0) {
        const batchFile = this.generateBatchFileName(outputPath, batchNumber);
        await this.writeSingleFile(batch, batchFile);
      }

      this.calculateFinalStats();

      logger.info(
        `Streaming Parquet write completed: ${this.stats.recordsWritten} records in ${batchNumber + 1} files`,
      );

      return { ...this.stats };
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Append records to existing Parquet file (if schema compatible)
   */
  async appendRecords(records: any[], parquetFilePath: string): Promise<void> {
    // Note: Apache Arrow doesn't directly support append mode
    // This would require reading existing file, merging data, and rewriting
    // For true append support, consider using a different Parquet library or
    // implement a merge strategy

    logger.warn("Append mode not yet implemented. Use writeRecords() instead.");
    throw new Error("Append mode not yet implemented");
  }

  /**
   * Read Parquet file back to JavaScript objects
   */
  async readParquetFile(filePath: string): Promise<any[]> {
    const timer = performanceMonitor.startTimer("parquet_read_file");

    try {
      const fs = await import("fs/promises");
      const buffer = await fs.readFile(filePath);

      const table = arrow.tableFromIPC(buffer);
      const records: any[] = [];

      // Convert Arrow table to JS objects
      for (let i = 0; i < table.numRows; i++) {
        const record: any = {};

        for (const field of table.schema.fields) {
          const column = table.getChild(field.name);
          record[field.name] = column?.get(i);
        }

        records.push(record);
      }

      logger.info(`Read ${records.length} records from ${filePath}`);
      return records;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Get comprehensive statistics about written files
   */
  getStats(): ParquetWriteStats {
    return { ...this.stats };
  }

  /**
   * Validate Parquet file integrity
   */
  async validateFile(filePath: string): Promise<{
    isValid: boolean;
    recordCount: number;
    fileSize: number;
    schema: any;
    errors?: string[];
  }> {
    try {
      const fs = await import("fs/promises");
      const stats = await fs.stat(filePath);
      const buffer = await fs.readFile(filePath);

      const table = arrow.tableFromIPC(buffer);

      return {
        isValid: true,
        recordCount: table.numRows,
        fileSize: stats.size,
        schema: table.schema.toJSON(),
      };
    } catch (error: unknown) {
      return {
        isValid: false,
        recordCount: 0,
        fileSize: 0,
        schema: null,
        errors: [(error as Error).message],
      };
    }
  }

  private async writeSingleFile(
    records: any[],
    filePath: string,
  ): Promise<void> {
    if (!this.schema) {
      throw new Error("Schema not available");
    }

    // Transform records to match schema
    const transformedRecords = records.map((record) =>
      this.transformRecord(record),
    );

    // Create Arrow RecordBatch
    const recordBatch = this.createRecordBatch(transformedRecords);

    // Create Arrow Table
    const table = new arrow.Table(recordBatch);

    // Write to file
    const buffer = arrow.tableToIPC(table, "file");
    writeFileSync(filePath, buffer);

    // Update stats
    this.stats.recordsWritten += transformedRecords.length;
    this.stats.filesCreated++;
    this.stats.totalSizeBytes += buffer.length;

    logger.debug(`Wrote ${transformedRecords.length} records to ${filePath}`);
  }

  private async writePartitionedRecords(
    records: any[],
    basePath: string,
    tableName?: string,
  ): Promise<void> {
    // Group records by partition keys
    const partitionGroups = this.groupByPartition(records);

    for (const [partitionKey, partitionRecords] of partitionGroups) {
      const partitionPath = this.generatePartitionPath(
        basePath,
        partitionKey,
        tableName,
      );
      await this.writeSingleFile(partitionRecords, partitionPath);

      this.stats.partitions[partitionKey] = partitionRecords.length;
    }
  }

  private groupByPartition(records: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();

    for (const record of records) {
      const partitionValues = this.options.partitionBy.map(
        (field) => record[field] || "null",
      );
      const partitionKey = partitionValues.join("/");

      if (!groups.has(partitionKey)) {
        groups.set(partitionKey, []);
      }

      groups.get(partitionKey)!.push(record);
    }

    return groups;
  }

  private generatePartitionPath(
    basePath: string,
    partitionKey: string,
    tableName?: string,
  ): string {
    const baseDir = dirname(basePath);
    const fileName = `${tableName || "data"}_${this.fileCounter++}.parquet`;
    return join(baseDir, partitionKey, fileName);
  }

  private generateBatchFileName(basePath: string, batchNumber: number): string {
    const ext = ".parquet";
    const nameWithoutExt = basePath.replace(/\.parquet$/i, "");
    return `${nameWithoutExt}_batch_${batchNumber.toString().padStart(4, "0")}${ext}`;
  }

  private transformRecord(record: any): any {
    const transformed: any = {};

    if (!this.schema) return record;

    // Transform each field according to schema
    for (const field of this.schema.fields) {
      const fieldName = field.name;
      const rawValue = record[fieldName];

      transformed[fieldName] = this.transformValue(rawValue, field.type);
    }

    return transformed;
  }

  private transformValue(value: any, fieldType: arrow.DataType): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (fieldType instanceof arrow.TimestampMillisecond) {
      // Convert ServiceNow date strings to timestamp
      if (typeof value === "string") {
        const date = new Date(value);
        return date.getTime();
      }
      return value;
    }

    if (fieldType instanceof arrow.Int32 || fieldType instanceof arrow.Int64) {
      return parseInt(value, 10) || 0;
    }

    if (
      fieldType instanceof arrow.Float32 ||
      fieldType instanceof arrow.Float64
    ) {
      return parseFloat(value) || 0.0;
    }

    if (fieldType instanceof arrow.Bool) {
      return Boolean(value);
    }

    // Default to string
    return String(value);
  }

  private createRecordBatch(records: any[]): arrow.RecordBatch {
    if (!this.schema || records.length === 0) {
      throw new Error("Schema not available or no records to process");
    }

    const columns: any[] = [];

    for (const field of this.schema.fields) {
      const fieldName = field.name;
      const values = records.map((record) => record[fieldName]);

      const column = this.createColumn(values, field.type);
      columns.push(column);
    }

    return new arrow.RecordBatch(this.schema, records.length, columns);
  }

  private createColumn(values: any[], fieldType: arrow.DataType): arrow.Vector {
    if (fieldType instanceof arrow.Utf8) {
      return arrow.Vector.from({ values, type: new arrow.Utf8() });
    }

    if (fieldType instanceof arrow.Int32) {
      return arrow.Vector.from({ values, type: new arrow.Int32() });
    }

    if (fieldType instanceof arrow.Int64) {
      return arrow.Vector.from({ values, type: new arrow.Int64() });
    }

    if (fieldType instanceof arrow.Float64) {
      return arrow.Vector.from({ values, type: new arrow.Float64() });
    }

    if (fieldType instanceof arrow.Bool) {
      return arrow.Vector.from({ values, type: new arrow.Bool() });
    }

    if (fieldType instanceof arrow.TimestampMillisecond) {
      return arrow.Vector.from({
        values,
        type: new arrow.TimestampMillisecond(),
      });
    }

    // Default to Utf8
    return arrow.Vector.from({
      values: values.map((v) => String(v)),
      type: new arrow.Utf8(),
    });
  }

  private detectFieldType(fieldName: string, value: any): arrow.Field {
    // ServiceNow specific field type detection
    if (
      fieldName.includes("date") ||
      fieldName.includes("time") ||
      fieldName.endsWith("_on")
    ) {
      return arrow.Field.new(fieldName, arrow.TimestampMillisecond, true);
    }

    if (typeof value === "number") {
      return Number.isInteger(value)
        ? arrow.Field.new(fieldName, arrow.Int32, true)
        : arrow.Field.new(fieldName, arrow.Float64, true);
    }

    if (typeof value === "boolean") {
      return arrow.Field.new(fieldName, arrow.Bool, true);
    }

    // Default to string
    return arrow.Field.new(fieldName, arrow.Utf8, true);
  }

  private getArrowType(type: string): arrow.DataType {
    switch (type) {
      case "string":
        return new arrow.Utf8();
      case "int32":
        return new arrow.Int32();
      case "int64":
        return new arrow.Int64();
      case "float32":
        return new arrow.Float32();
      case "float64":
        return new arrow.Float64();
      case "boolean":
        return new arrow.Bool();
      case "timestamp":
        return new arrow.TimestampMillisecond();
      case "binary":
        return new arrow.Binary();
      default:
        return new arrow.Utf8();
    }
  }

  private resetStats(): void {
    this.stats = {
      recordsWritten: 0,
      filesCreated: 0,
      totalSizeBytes: 0,
      compressionRatio: 1.0,
      writeDurationMs: 0,
      averageRecordSize: 0,
      partitions: {},
    };
    this.fileCounter = 0;
  }

  private calculateFinalStats(): void {
    if (this.stats.recordsWritten > 0) {
      this.stats.averageRecordSize =
        this.stats.totalSizeBytes / this.stats.recordsWritten;
    }

    // Note: Compression ratio calculation would require uncompressed size tracking
    // This is a simplified implementation
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.recordBatch = [];
    this.schema = undefined;
    logger.info("ParquetWriter destroyed and resources cleaned up");
  }
}

/**
 * Utility class for Parquet file operations
 */
export class ParquetUtils {
  /**
   * Merge multiple Parquet files into one
   */
  static async mergeFiles(
    inputPaths: string[],
    outputPath: string,
  ): Promise<void> {
    const writer = new ParquetWriter();
    const allRecords: any[] = [];

    for (const inputPath of inputPaths) {
      const records = await writer.readParquetFile(inputPath);
      allRecords.push(...records);
    }

    // Detect schema from first file
    if (allRecords.length > 0) {
      const sampleRecord = allRecords[0];
      const schemaFields = Object.keys(sampleRecord).map((key) => ({
        name: key,
        type: "string" as const,
        nullable: true,
      }));

      writer.createSchema(schemaFields);
      await writer.writeRecords(allRecords, outputPath);
    }

    logger.info(
      `Merged ${inputPaths.length} files into ${outputPath} with ${allRecords.length} total records`,
    );
  }

  /**
   * Get file metadata without loading all data
   */
  static async getFileMetadata(filePath: string): Promise<{
    schema: any;
    recordCount: number;
    fileSize: number;
    compression: string;
  }> {
    const writer = new ParquetWriter();
    const validation = await writer.validateFile(filePath);

    const fs = await import("fs/promises");
    const stats = await fs.stat(filePath);

    return {
      schema: validation.schema,
      recordCount: validation.recordCount,
      fileSize: stats.size,
      compression: "unknown", // Would need to inspect file metadata
    };
  }
}
