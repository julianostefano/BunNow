/**
 * Parquet Integration Module - Apache Arrow for High-Performance Analytics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export { ParquetWriter, ParquetUtils } from "./ParquetWriter";
export { ParquetReader } from "./ParquetReader";

export type {
  ParquetWriterOptions,
  ParquetSchema,
  ParquetWriteStats,
  ParquetReaderOptions,
  ParquetQueryOptions,
  ParquetReadStats,
} from "./ParquetWriter";

// Re-export commonly used types for convenience
export type { ParquetQueryOptions as QueryOptions } from "./ParquetReader";

/**
 * Factory function to create a ParquetWriter with optimized settings for ServiceNow data
 */
export function createServiceNowParquetWriter(
  options: Partial<import("./ParquetWriter").ParquetWriterOptions> = {},
) {
  return new (require("./ParquetWriter").ParquetWriter)({
    compression: "SNAPPY",
    rowGroupSize: 50000,
    enableDictionary: true,
    enableStatistics: true,
    enableSchemaEvolution: true,
    timestampUnit: "millisecond",
    ...options,
  });
}

/**
 * Factory function to create a ParquetReader with optimized settings for ServiceNow data
 */
export function createServiceNowParquetReader(
  options: Partial<import("./ParquetReader").ParquetReaderOptions> = {},
) {
  return new (require("./ParquetReader").ParquetReader)({
    batchSize: 10000,
    enableParallelRead: true,
    memoryLimit: 512 * 1024 * 1024, // 512MB
    ...options,
  });
}

/**
 * ServiceNow Parquet Integration - Main service class
 */
export class ServiceNowParquetIntegration {
  private writer: any;
  private reader: any;

  constructor(options: any = {}) {
    this.writer = createServiceNowParquetWriter(options.writer || {});
    this.reader = createServiceNowParquetReader(options.reader || {});
  }

  getWriter() {
    return this.writer;
  }

  getReader() {
    return this.reader;
  }

  async writeServiceNowData(data: any[], outputPath: string): Promise<void> {
    return this.writer.writeToFile(data, outputPath);
  }

  async readServiceNowData(inputPath: string): Promise<any[]> {
    return this.reader.readFromFile(inputPath);
  }

  async exportTableToParquet(
    table: string,
    records: any[],
    options: any = {},
  ): Promise<{ success: boolean; filePath: string; recordCount: number }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath =
      options.outputPath || `/tmp/servicenow_${table}_${timestamp}.parquet`;

    try {
      await this.writeServiceNowData(records, filePath);
      return {
        success: true,
        filePath,
        recordCount: records.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to export ${table} to Parquet: ${(error as Error).message}`,
      );
    }
  }

  async queryTableData(
    table: string,
    query: any = {},
    options: any = {},
  ): Promise<{ data: any[]; metadata: any }> {
    const filePath =
      options.filePath || `/tmp/servicenow_${table}_latest.parquet`;

    try {
      const data = await this.readServiceNowData(filePath);

      // Simple filtering based on query parameters
      let filteredData = data;
      if (query.filter) {
        filteredData = data.filter((record: any) => {
          return Object.entries(query.filter).every(
            ([key, value]) => record[key] === value,
          );
        });
      }

      // Apply limit if specified
      if (query.limit) {
        filteredData = filteredData.slice(0, query.limit);
      }

      return {
        data: filteredData,
        metadata: {
          totalRecords: data.length,
          filteredRecords: filteredData.length,
          table,
          queryTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to query ${table} data: ${(error as Error).message}`,
      );
    }
  }

  async queryIncidentAnalytics(
    options: any = {},
  ): Promise<{ analytics: any; summary: any }> {
    try {
      const incidentData = await this.queryTableData("incident", {
        filter: options.filter,
        limit: options.limit || 10000,
      });

      // Generate basic analytics for incidents
      const analytics = {
        totalIncidents: incidentData.data.length,
        byState: this.groupBy(incidentData.data, "state"),
        byPriority: this.groupBy(incidentData.data, "priority"),
        byCategory: this.groupBy(incidentData.data, "category"),
        bySeverity: this.groupBy(incidentData.data, "severity"),
        recentTrends: this.calculateTrends(incidentData.data, "sys_created_on"),
      };

      const summary = {
        dataSource: "parquet",
        analysisTime: new Date().toISOString(),
        recordsAnalyzed: incidentData.data.length,
        categories: Object.keys(analytics.byCategory || {}).length,
        priorities: Object.keys(analytics.byPriority || {}).length,
      };

      return { analytics, summary };
    } catch (error) {
      throw new Error(
        `Failed to query incident analytics: ${(error as Error).message}`,
      );
    }
  }

  private groupBy(array: any[], key: string): Record<string, number> {
    return array.reduce((acc: Record<string, number>, item: any) => {
      const groupKey = item[key] || "unknown";
      acc[groupKey] = (acc[groupKey] || 0) + 1;
      return acc;
    }, {});
  }

  private calculateTrends(array: any[], dateField: string): any {
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentRecords = array.filter((item: any) => {
      const recordDate = new Date(item[dateField]);
      return recordDate >= last30Days;
    });

    return {
      last30Days: recentRecords.length,
      dailyAverage: Math.round(recentRecords.length / 30),
      trend:
        recentRecords.length > array.length * 0.5 ? "increasing" : "stable",
    };
  }
}

// Constants for ServiceNow-specific Parquet operations
export const SERVICENOW_PARQUET_DEFAULTS = {
  BATCH_SIZE: 10000,
  ROW_GROUP_SIZE: 50000,
  COMPRESSION: "SNAPPY" as const,
  TIMESTAMP_UNIT: "millisecond" as const,
  MEMORY_LIMIT: 512 * 1024 * 1024, // 512MB
};
