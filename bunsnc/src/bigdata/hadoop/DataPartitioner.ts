/**
 * Intelligent Data Partitioner for ServiceNow Data in Hadoop
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";
import type { HDFSClient, HDFSFileInfo } from "./HDFSClient";

export interface PartitionConfig {
  strategy: "date" | "size" | "record_count" | "hybrid";
  dateFormat?: "daily" | "weekly" | "monthly" | "yearly";
  maxPartitionSize?: number; // Max size in bytes
  maxRecordsPerPartition?: number;
  compressionEnabled?: boolean;
  retentionDays?: number;
  autoCompaction?: boolean;
  replicationFactor?: number;
}

export interface PartitionMetadata {
  partitionId: string;
  path: string;
  strategy: string;
  createdAt: number;
  lastModified: number;
  recordCount: number;
  sizeBytes: number;
  compressionRatio?: number;
  files: string[];
  schema?: any;
  statistics?: PartitionStatistics;
}

export interface PartitionStatistics {
  minTimestamp?: number;
  maxTimestamp?: number;
  distinctValues?: Record<string, number>;
  nullCounts?: Record<string, number>;
  avgRecordSize: number;
  hotness: number; // Access frequency score
}

export interface PartitionPlan {
  table: string;
  partitions: Array<{
    id: string;
    path: string;
    estimatedSize: number;
    estimatedRecords: number;
    dateRange?: {
      start: Date;
      end: Date;
    };
  }>;
  totalEstimatedSize: number;
  totalEstimatedRecords: number;
  recommendedConfig: PartitionConfig;
}

export class DataPartitioner extends EventEmitter {
  private hdfs: HDFSClient;
  private partitionMetadata: Map<string, PartitionMetadata> = new Map();
  private defaultConfig: Required<PartitionConfig>;

  constructor(
    hdfs: HDFSClient,
    defaultConfig: PartitionConfig = { strategy: "hybrid" },
  ) {
    super();

    this.hdfs = hdfs;
    this.defaultConfig = {
      strategy: defaultConfig.strategy || "hybrid",
      dateFormat: defaultConfig.dateFormat || "daily",
      maxPartitionSize: defaultConfig.maxPartitionSize || 256 * 1024 * 1024, // 256MB
      maxRecordsPerPartition: defaultConfig.maxRecordsPerPartition || 1000000, // 1M records
      compressionEnabled: defaultConfig.compressionEnabled ?? true,
      retentionDays: defaultConfig.retentionDays || 365, // 1 year
      autoCompaction: defaultConfig.autoCompaction ?? true,
      replicationFactor: defaultConfig.replicationFactor || 3,
    };

    logger.info(
      "DataPartitioner initialized with strategy:",
      this.defaultConfig.strategy,
    );
  }

  /**
   * Create partition plan for ServiceNow data
   */
  async createPartitionPlan(
    table: string,
    records: any[],
    config?: Partial<PartitionConfig>,
  ): Promise<PartitionPlan> {
    const timer = "partition_planning";
    performanceMonitor.startTimer(timer);
    const effectiveConfig = { ...this.defaultConfig, ...config };

    try {
      logger.info(
        `Creating partition plan for table ${table} with ${records.length} records`,
      );

      const partitions: PartitionPlan["partitions"] = [];
      let totalSize = 0;
      let totalRecords = 0;

      switch (effectiveConfig.strategy) {
        case "date":
          partitions.push(
            ...(await this.createDateBasedPartitions(
              table,
              records,
              effectiveConfig,
            )),
          );
          break;

        case "size":
          partitions.push(
            ...(await this.createSizeBasedPartitions(
              table,
              records,
              effectiveConfig,
            )),
          );
          break;

        case "record_count":
          partitions.push(
            ...(await this.createRecordCountBasedPartitions(
              table,
              records,
              effectiveConfig,
            )),
          );
          break;

        case "hybrid":
          partitions.push(
            ...(await this.createHybridPartitions(
              table,
              records,
              effectiveConfig,
            )),
          );
          break;
      }

      // Calculate totals
      totalSize = partitions.reduce((sum, p) => sum + p.estimatedSize, 0);
      totalRecords = partitions.reduce((sum, p) => sum + p.estimatedRecords, 0);

      const plan: PartitionPlan = {
        table,
        partitions,
        totalEstimatedSize: totalSize,
        totalEstimatedRecords: totalRecords,
        recommendedConfig: effectiveConfig,
      };

      logger.info(
        `Created partition plan: ${partitions.length} partitions, ${totalSize} bytes, ${totalRecords} records`,
      );
      this.emit("partition:plan:created", { table, plan });

      return plan;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Execute partition plan - create actual partitions in HDFS
   */
  async executePartitionPlan(
    plan: PartitionPlan,
    dataFiles: string[],
  ): Promise<boolean> {
    const timer = "partition_execution";
    performanceMonitor.startTimer(timer);

    try {
      logger.info(`Executing partition plan for table ${plan.table}`);

      let successCount = 0;

      for (const partition of plan.partitions) {
        try {
          // Create partition directory
          const success = await this.hdfs.createDirectory(partition.path, {
            permission: "755",
            createParent: true,
          });

          if (success) {
            // Create partition metadata
            const metadata: PartitionMetadata = {
              partitionId: partition.id,
              path: partition.path,
              strategy: plan.recommendedConfig.strategy,
              createdAt: Date.now(),
              lastModified: Date.now(),
              recordCount: partition.estimatedRecords,
              sizeBytes: partition.estimatedSize,
              files: [],
              statistics: {
                avgRecordSize:
                  partition.estimatedRecords > 0
                    ? partition.estimatedSize / partition.estimatedRecords
                    : 0,
                hotness: 0,
              },
            };

            this.partitionMetadata.set(partition.id, metadata);
            successCount++;

            this.emit("partition:created", {
              table: plan.table,
              partitionId: partition.id,
              path: partition.path,
            });
          }
        } catch (error) {
          logger.error(
            `Failed to create partition ${partition.id}:`,
            error as Error,
          );
          this.emit("partition:error", {
            table: plan.table,
            partitionId: partition.id,
            error,
          });
        }
      }

      const success = successCount === plan.partitions.length;

      if (success) {
        logger.info(
          `Successfully executed partition plan: ${successCount}/${plan.partitions.length} partitions created`,
        );
      } else {
        logger.warn(
          `Partial success: ${successCount}/${plan.partitions.length} partitions created`,
        );
      }

      return success;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Get optimal partition for new data based on strategy
   */
  async getOptimalPartition(
    table: string,
    record: any,
    config?: Partial<PartitionConfig>,
  ): Promise<string> {
    const effectiveConfig = { ...this.defaultConfig, ...config };

    switch (effectiveConfig.strategy) {
      case "date":
        return this.getDateBasedPartitionPath(table, record, effectiveConfig);

      case "size":
        return await this.getSizeBasedPartitionPath(
          table,
          record,
          effectiveConfig,
        );

      case "record_count":
        return await this.getRecordCountBasedPartitionPath(
          table,
          record,
          effectiveConfig,
        );

      case "hybrid":
        return await this.getHybridPartitionPath(
          table,
          record,
          effectiveConfig,
        );

      default:
        return `/servicenow/data/${table}/default`;
    }
  }

  /**
   * Perform automatic compaction of small partitions
   */
  async compactPartitions(
    table: string,
    minPartitionSize: number = 64 * 1024 * 1024, // 64MB
  ): Promise<boolean> {
    const timer = "partition_compaction";
    performanceMonitor.startTimer(timer);

    try {
      logger.info(`Starting partition compaction for table ${table}`);

      // Find small partitions
      const smallPartitions = Array.from(this.partitionMetadata.values())
        .filter(
          (p) =>
            p.path.includes(`/${table}/`) && p.sizeBytes < minPartitionSize,
        )
        .sort((a, b) => a.createdAt - b.createdAt);

      if (smallPartitions.length < 2) {
        logger.info("No partitions to compact");
        return true;
      }

      logger.info(
        `Found ${smallPartitions.length} small partitions to compact`,
      );

      // Group partitions for compaction (by date proximity or size)
      const compactionGroups =
        this.groupPartitionsForCompaction(smallPartitions);

      let compactedCount = 0;

      for (const group of compactionGroups) {
        try {
          const compactedPartition = await this.compactPartitionGroup(
            table,
            group,
          );
          if (compactedPartition) {
            compactedCount++;

            // Remove old partition metadata
            group.forEach((p) => this.partitionMetadata.delete(p.partitionId));

            this.emit("partition:compacted", {
              table,
              oldPartitions: group.map((p) => p.partitionId),
              newPartition: compactedPartition.partitionId,
            });
          }
        } catch (error) {
          logger.error(`Failed to compact partition group:`, error as Error);
        }
      }

      logger.info(`Compaction completed: ${compactedCount} groups compacted`);
      return compactedCount > 0;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Clean up expired partitions based on retention policy
   */
  async cleanupExpiredPartitions(
    table: string,
    retentionDays?: number,
  ): Promise<number> {
    const timer = "partition_cleanup";
    performanceMonitor.startTimer(timer);
    const retention = retentionDays || this.defaultConfig.retentionDays;
    const cutoffTime = Date.now() - retention * 24 * 60 * 60 * 1000;

    try {
      logger.info(
        `Cleaning up partitions older than ${retention} days for table ${table}`,
      );

      const expiredPartitions = Array.from(
        this.partitionMetadata.values(),
      ).filter(
        (p) =>
          p.path.includes(`/${table}/`) &&
          p.createdAt < cutoffTime &&
          (p.statistics?.hotness || 0) < 0.1, // Low access frequency
      );

      if (expiredPartitions.length === 0) {
        logger.info("No expired partitions found");
        return 0;
      }

      logger.info(
        `Found ${expiredPartitions.length} expired partitions to clean up`,
      );

      let deletedCount = 0;

      for (const partition of expiredPartitions) {
        try {
          const deleted = await this.hdfs.delete(partition.path, true);
          if (deleted) {
            this.partitionMetadata.delete(partition.partitionId);
            deletedCount++;

            this.emit("partition:deleted", {
              table,
              partitionId: partition.partitionId,
              path: partition.path,
              reason: "expired",
            });
          }
        } catch (error) {
          logger.error(
            `Failed to delete partition ${partition.partitionId}:`,
            error as Error,
          );
        }
      }

      logger.info(`Cleanup completed: ${deletedCount} partitions deleted`);
      return deletedCount;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Get partition statistics and health metrics
   */
  async getPartitionStatistics(table: string): Promise<{
    totalPartitions: number;
    totalSize: number;
    avgPartitionSize: number;
    smallPartitions: number;
    largePartitions: number;
    hotPartitions: number;
    oldestPartition: Date | null;
    newestPartition: Date | null;
    compressionRatio: number;
  }> {
    const tablePartitions = Array.from(this.partitionMetadata.values()).filter(
      (p) => p.path.includes(`/${table}/`),
    );

    if (tablePartitions.length === 0) {
      return {
        totalPartitions: 0,
        totalSize: 0,
        avgPartitionSize: 0,
        smallPartitions: 0,
        largePartitions: 0,
        hotPartitions: 0,
        oldestPartition: null,
        newestPartition: null,
        compressionRatio: 1.0,
      };
    }

    const totalSize = tablePartitions.reduce((sum, p) => sum + p.sizeBytes, 0);
    const avgSize = totalSize / tablePartitions.length;
    const smallThreshold = avgSize * 0.5;
    const largeThreshold = avgSize * 2.0;

    const smallPartitions = tablePartitions.filter(
      (p) => p.sizeBytes < smallThreshold,
    ).length;
    const largePartitions = tablePartitions.filter(
      (p) => p.sizeBytes > largeThreshold,
    ).length;
    const hotPartitions = tablePartitions.filter(
      (p) => (p.statistics?.hotness || 0) > 0.7,
    ).length;

    const timestamps = tablePartitions.map((p) => p.createdAt);
    const oldestPartition =
      timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
    const newestPartition =
      timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

    const compressionRatios = tablePartitions
      .map((p) => p.compressionRatio)
      .filter((r) => r !== undefined) as number[];
    const compressionRatio =
      compressionRatios.length > 0
        ? compressionRatios.reduce((sum, r) => sum + r, 0) /
          compressionRatios.length
        : 1.0;

    return {
      totalPartitions: tablePartitions.length,
      totalSize,
      avgPartitionSize: avgSize,
      smallPartitions,
      largePartitions,
      hotPartitions,
      oldestPartition,
      newestPartition,
      compressionRatio,
    };
  }

  /**
   * Update partition access statistics
   */
  updatePartitionAccess(partitionId: string): void {
    const partition = this.partitionMetadata.get(partitionId);
    if (partition && partition.statistics) {
      partition.statistics.hotness = Math.min(
        1.0,
        partition.statistics.hotness + 0.1,
      );
      partition.lastModified = Date.now();

      this.emit("partition:accessed", { partitionId });
    }
  }

  /**
   * Get partition metadata
   */
  getPartitionMetadata(partitionId: string): PartitionMetadata | null {
    return this.partitionMetadata.get(partitionId) || null;
  }

  /**
   * List all partitions for a table
   */
  getTablePartitions(table: string): PartitionMetadata[] {
    return Array.from(this.partitionMetadata.values())
      .filter((p) => p.path.includes(`/${table}/`))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private async createDateBasedPartitions(
    table: string,
    records: any[],
    config: Required<PartitionConfig>,
  ): Promise<PartitionPlan["partitions"]> {
    const partitionMap = new Map<string, any[]>();

    // Group records by date
    for (const record of records) {
      const date = this.extractRecordDate(record);
      const dateKey = this.formatDateForPartition(date, config.dateFormat);

      if (!partitionMap.has(dateKey)) {
        partitionMap.set(dateKey, []);
      }
      partitionMap.get(dateKey)!.push(record);
    }

    const partitions: PartitionPlan["partitions"] = [];

    for (const [dateKey, partitionRecords] of partitionMap) {
      const estimatedSize = this.estimateRecordsSize(partitionRecords);
      const partitionId = `${table}_${dateKey}`;
      const partitionPath = `/servicenow/data/parquet/${table}/${dateKey}`;

      partitions.push({
        id: partitionId,
        path: partitionPath,
        estimatedSize,
        estimatedRecords: partitionRecords.length,
        dateRange: this.getDateRangeForKey(dateKey, config.dateFormat),
      });
    }

    return partitions;
  }

  private async createSizeBasedPartitions(
    table: string,
    records: any[],
    config: Required<PartitionConfig>,
  ): Promise<PartitionPlan["partitions"]> {
    const partitions: PartitionPlan["partitions"] = [];
    const maxSize = config.maxPartitionSize;

    let currentBatch: any[] = [];
    let currentSize = 0;
    let partitionIndex = 0;

    for (const record of records) {
      const recordSize = this.estimateRecordSize(record);

      if (currentSize + recordSize > maxSize && currentBatch.length > 0) {
        // Create partition for current batch
        const partitionId = `${table}_size_${partitionIndex.toString().padStart(4, "0")}`;
        const partitionPath = `/servicenow/data/parquet/${table}/size_based/partition_${partitionIndex}`;

        partitions.push({
          id: partitionId,
          path: partitionPath,
          estimatedSize: currentSize,
          estimatedRecords: currentBatch.length,
        });

        currentBatch = [];
        currentSize = 0;
        partitionIndex++;
      }

      currentBatch.push(record);
      currentSize += recordSize;
    }

    // Handle remaining records
    if (currentBatch.length > 0) {
      const partitionId = `${table}_size_${partitionIndex.toString().padStart(4, "0")}`;
      const partitionPath = `/servicenow/data/parquet/${table}/size_based/partition_${partitionIndex}`;

      partitions.push({
        id: partitionId,
        path: partitionPath,
        estimatedSize: currentSize,
        estimatedRecords: currentBatch.length,
      });
    }

    return partitions;
  }

  private async createRecordCountBasedPartitions(
    table: string,
    records: any[],
    config: Required<PartitionConfig>,
  ): Promise<PartitionPlan["partitions"]> {
    const partitions: PartitionPlan["partitions"] = [];
    const maxRecords = config.maxRecordsPerPartition;

    for (let i = 0; i < records.length; i += maxRecords) {
      const batch = records.slice(i, i + maxRecords);
      const partitionIndex = Math.floor(i / maxRecords);

      const partitionId = `${table}_count_${partitionIndex.toString().padStart(4, "0")}`;
      const partitionPath = `/servicenow/data/parquet/${table}/count_based/partition_${partitionIndex}`;
      const estimatedSize = this.estimateRecordsSize(batch);

      partitions.push({
        id: partitionId,
        path: partitionPath,
        estimatedSize,
        estimatedRecords: batch.length,
      });
    }

    return partitions;
  }

  private async createHybridPartitions(
    table: string,
    records: any[],
    config: Required<PartitionConfig>,
  ): Promise<PartitionPlan["partitions"]> {
    // Start with date-based partitioning
    const datePartitions = await this.createDateBasedPartitions(
      table,
      records,
      config,
    );
    const refinedPartitions: PartitionPlan["partitions"] = [];

    // Refine partitions based on size and record count constraints
    for (const partition of datePartitions) {
      if (
        partition.estimatedSize > config.maxPartitionSize ||
        partition.estimatedRecords > config.maxRecordsPerPartition
      ) {
        // Split large partition
        const subPartitions = await this.splitPartition(
          table,
          partition,
          config,
        );
        refinedPartitions.push(...subPartitions);
      } else if (partition.estimatedSize < config.maxPartitionSize * 0.1) {
        // Mark small partition for potential merging
        refinedPartitions.push({
          ...partition,
          id: `${partition.id}_small`,
        });
      } else {
        refinedPartitions.push(partition);
      }
    }

    return refinedPartitions;
  }

  private async splitPartition(
    table: string,
    partition: PartitionPlan["partitions"][0],
    config: Required<PartitionConfig>,
  ): Promise<PartitionPlan["partitions"]> {
    const subPartitions: PartitionPlan["partitions"] = [];

    // Split based on size primarily
    const targetSubPartitions = Math.ceil(
      partition.estimatedSize / config.maxPartitionSize,
    );
    const recordsPerSubPartition = Math.floor(
      partition.estimatedRecords / targetSubPartitions,
    );
    const sizePerSubPartition = Math.floor(
      partition.estimatedSize / targetSubPartitions,
    );

    for (let i = 0; i < targetSubPartitions; i++) {
      const subPartitionId = `${partition.id}_sub_${i.toString().padStart(2, "0")}`;
      const subPartitionPath = `${partition.path}/sub_${i}`;

      subPartitions.push({
        id: subPartitionId,
        path: subPartitionPath,
        estimatedSize: sizePerSubPartition,
        estimatedRecords: recordsPerSubPartition,
        dateRange: partition.dateRange,
      });
    }

    return subPartitions;
  }

  private groupPartitionsForCompaction(
    partitions: PartitionMetadata[],
  ): PartitionMetadata[][] {
    const groups: PartitionMetadata[][] = [];
    const maxGroupSize = 5; // Max partitions per compaction group

    // Group by creation time proximity (within 24 hours)
    const timeGroups = new Map<string, PartitionMetadata[]>();

    for (const partition of partitions) {
      const dayKey = new Date(partition.createdAt).toISOString().split("T")[0];

      if (!timeGroups.has(dayKey)) {
        timeGroups.set(dayKey, []);
      }
      timeGroups.get(dayKey)!.push(partition);
    }

    // Split large groups
    for (const group of timeGroups.values()) {
      if (group.length <= maxGroupSize) {
        groups.push(group);
      } else {
        for (let i = 0; i < group.length; i += maxGroupSize) {
          groups.push(group.slice(i, i + maxGroupSize));
        }
      }
    }

    return groups;
  }

  private async compactPartitionGroup(
    table: string,
    group: PartitionMetadata[],
  ): Promise<PartitionMetadata | null> {
    try {
      // Create new compacted partition
      const compactedId = `${table}_compacted_${Date.now()}`;
      const compactedPath = `/servicenow/data/parquet/${table}/compacted/${compactedId}`;

      const totalSize = group.reduce((sum, p) => sum + p.sizeBytes, 0);
      const totalRecords = group.reduce((sum, p) => sum + p.recordCount, 0);

      const success = await this.hdfs.createDirectory(compactedPath, {
        permission: "755",
        createParent: true,
      });

      if (!success) {
        return null;
      }

      // Create new partition metadata
      const compactedMetadata: PartitionMetadata = {
        partitionId: compactedId,
        path: compactedPath,
        strategy: "compacted",
        createdAt: Date.now(),
        lastModified: Date.now(),
        recordCount: totalRecords,
        sizeBytes: totalSize,
        files: group.flatMap((p) => p.files),
        statistics: {
          avgRecordSize: totalRecords > 0 ? totalSize / totalRecords : 0,
          hotness: Math.max(...group.map((p) => p.statistics?.hotness || 0)),
        },
      };

      this.partitionMetadata.set(compactedId, compactedMetadata);

      return compactedMetadata;
    } catch (error) {
      logger.error("Error during partition compaction:", error as Error);
      return null;
    }
  }

  private getDateBasedPartitionPath(
    table: string,
    record: any,
    config: Required<PartitionConfig>,
  ): string {
    const date = this.extractRecordDate(record);
    const dateKey = this.formatDateForPartition(date, config.dateFormat);
    return `/servicenow/data/parquet/${table}/${dateKey}`;
  }

  private async getSizeBasedPartitionPath(
    table: string,
    record: any,
    config: Required<PartitionConfig>,
  ): Promise<string> {
    // Find partition with available space
    const tablePartitions = this.getTablePartitions(table).filter(
      (p) => p.sizeBytes < config.maxPartitionSize,
    );

    if (tablePartitions.length > 0) {
      // Use existing partition with space
      return tablePartitions[0].path;
    } else {
      // Create new partition
      const partitionIndex = this.getTablePartitions(table).length;
      return `/servicenow/data/parquet/${table}/size_based/partition_${partitionIndex}`;
    }
  }

  private async getRecordCountBasedPartitionPath(
    table: string,
    record: any,
    config: Required<PartitionConfig>,
  ): Promise<string> {
    // Find partition with available record capacity
    const tablePartitions = this.getTablePartitions(table).filter(
      (p) => p.recordCount < config.maxRecordsPerPartition,
    );

    if (tablePartitions.length > 0) {
      return tablePartitions[0].path;
    } else {
      const partitionIndex = this.getTablePartitions(table).length;
      return `/servicenow/data/parquet/${table}/count_based/partition_${partitionIndex}`;
    }
  }

  private async getHybridPartitionPath(
    table: string,
    record: any,
    config: Required<PartitionConfig>,
  ): Promise<string> {
    // Primary strategy: date-based
    const datePath = this.getDateBasedPartitionPath(table, record, config);

    // Check if date partition has capacity
    const datePartitions = Array.from(this.partitionMetadata.values()).filter(
      (p) => p.path.startsWith(datePath),
    );

    const availablePartition = datePartitions.find(
      (p) =>
        p.sizeBytes < config.maxPartitionSize &&
        p.recordCount < config.maxRecordsPerPartition,
    );

    if (availablePartition) {
      return availablePartition.path;
    } else {
      // Create new sub-partition
      const subPartitionIndex = datePartitions.length;
      return `${datePath}/part_${subPartitionIndex.toString().padStart(4, "0")}`;
    }
  }

  private extractRecordDate(record: any): Date {
    // Try common ServiceNow timestamp fields
    const dateFields = [
      "sys_updated_on",
      "sys_created_on",
      "opened_at",
      "closed_at",
    ];

    for (const field of dateFields) {
      if (record[field]) {
        const date = new Date(record[field]);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Fallback to current date
    return new Date();
  }

  private formatDateForPartition(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    switch (format) {
      case "daily":
        return `year=${year}/month=${month}/day=${day}`;
      case "weekly":
        const weekNum = this.getWeekNumber(date);
        return `year=${year}/week=${weekNum.toString().padStart(2, "0")}`;
      case "monthly":
        return `year=${year}/month=${month}`;
      case "yearly":
        return `year=${year}`;
      default:
        return `year=${year}/month=${month}/day=${day}`;
    }
  }

  private getDateRangeForKey(
    dateKey: string,
    format: string,
  ): { start: Date; end: Date } | undefined {
    try {
      if (format === "daily") {
        const match = dateKey.match(/year=(\d+)\/month=(\d+)\/day=(\d+)/);
        if (match) {
          const [, year, month, day] = match;
          const date = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
          );
          return {
            start: new Date(date),
            end: new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1),
          };
        }
      }
      // Add other format handling as needed
    } catch (error) {
      logger.debug(
        "Error parsing date range:",
        (error as Error).message || "Unknown error",
      );
    }

    return undefined;
  }

  private getWeekNumber(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const daysSinceStartOfYear = Math.floor(
      (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
    );
    return Math.ceil(daysSinceStartOfYear / 7);
  }

  private estimateRecordSize(record: any): number {
    return JSON.stringify(record).length * 1.2; // Add 20% overhead
  }

  private estimateRecordsSize(records: any[]): number {
    return records.reduce(
      (sum, record) => sum + this.estimateRecordSize(record),
      0,
    );
  }
}
