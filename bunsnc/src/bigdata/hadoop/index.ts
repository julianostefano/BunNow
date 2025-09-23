/**
 * Hadoop Integration Module - Distributed Storage for ServiceNow Data
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export { HDFSClient, ServiceNowHDFSUtils } from "./HDFSClient";
export { DataPartitioner } from "./DataPartitioner";

export type {
  HDFSConfig,
  HDFSFileInfo,
  HDFSOperationOptions,
  HDFSStats,
} from "./HDFSClient";

export type {
  PartitionConfig,
  PartitionMetadata,
  PartitionStatistics,
  PartitionPlan,
} from "./DataPartitioner";

import { HDFSClient, ServiceNowHDFSUtils } from "./HDFSClient";
import { DataPartitioner } from "./DataPartitioner";
import type { HDFSConfig } from "./HDFSClient";
import type { PartitionConfig } from "./DataPartitioner";

/**
 * Factory class for creating integrated Hadoop services for ServiceNow data
 */
export class ServiceNowHadoopFactory {
  private hdfsClient: HDFSClient;
  private partitioner: DataPartitioner;
  private utils: ServiceNowHDFSUtils;

  constructor(config: HDFSConfig, partitionConfig?: PartitionConfig) {
    this.hdfsClient = new HDFSClient(config);
    this.partitioner = new DataPartitioner(this.hdfsClient, partitionConfig);
    this.utils = new ServiceNowHDFSUtils(this.hdfsClient);
  }

  /**
   * Get HDFS client for direct file operations
   */
  getHDFSClient(): HDFSClient {
    return this.hdfsClient;
  }

  /**
   * Get data partitioner for intelligent data organization
   */
  getPartitioner(): DataPartitioner {
    return this.partitioner;
  }

  /**
   * Get ServiceNow-specific utilities
   */
  getUtils(): ServiceNowHDFSUtils {
    return this.utils;
  }

  /**
   * Upload ServiceNow data with optimal partitioning
   */
  async uploadServiceNowData(
    localFiles: string[],
    table: string,
    records: any[],
    options: {
      partitionStrategy?: "date" | "size" | "record_count" | "hybrid";
      compressionEnabled?: boolean;
      replicationFactor?: number;
    } = {},
  ): Promise<{
    success: boolean;
    uploadedFiles: string[];
    partitionsCreated: string[];
    totalSize: number;
  }> {
    const result = {
      success: false,
      uploadedFiles: [] as string[],
      partitionsCreated: [] as string[],
      totalSize: 0,
    };

    try {
      // Create partition plan
      const plan = await this.partitioner.createPartitionPlan(table, records, {
        strategy: options.partitionStrategy || "hybrid",
        compressionEnabled: options.compressionEnabled ?? true,
        replicationFactor: options.replicationFactor || 3,
      });

      // Execute partition plan
      const planExecuted = await this.partitioner.executePartitionPlan(
        plan,
        localFiles,
      );

      if (!planExecuted) {
        throw new Error("Failed to execute partition plan");
      }

      result.partitionsCreated = plan.partitions.map((p) => p.path);

      // Upload files to appropriate partitions
      for (const localFile of localFiles) {
        // Determine optimal partition for this file
        const sampleRecord = records[0] || {}; // Use first record as sample
        const optimalPartition = await this.partitioner.getOptimalPartition(
          table,
          sampleRecord,
          plan.recommendedConfig,
        );

        const fileName = require("path").basename(localFile);
        const hdfsPath = `${optimalPartition}/${fileName}`;

        const uploaded = await this.hdfsClient.uploadFile(localFile, hdfsPath, {
          overwrite: true,
          replication: options.replicationFactor || 3,
        });

        if (uploaded) {
          result.uploadedFiles.push(hdfsPath);

          // Update partition metadata
          const partitionId = `${table}_${Date.now()}`;
          this.partitioner.updatePartitionAccess(partitionId);
        }
      }

      result.totalSize = plan.totalEstimatedSize;
      result.success = result.uploadedFiles.length === localFiles.length;

      return result;
    } catch (error: unknown) {
      console.error("Error uploading ServiceNow data to Hadoop:", error);
      return result;
    }
  }

  /**
   * Perform comprehensive data management operations
   */
  async performDataMaintenance(table: string): Promise<{
    compactedPartitions: number;
    deletedPartitions: number;
    totalSizeAfter: number;
  }> {
    const result = {
      compactedPartitions: 0,
      deletedPartitions: 0,
      totalSizeAfter: 0,
    };

    try {
      // Compact small partitions
      const compacted = await this.partitioner.compactPartitions(table);
      if (compacted) {
        result.compactedPartitions = 1; // Simplified count
      }

      // Clean up expired partitions
      result.deletedPartitions =
        await this.partitioner.cleanupExpiredPartitions(table);

      // Get updated statistics
      const stats = await this.partitioner.getPartitionStatistics(table);
      result.totalSizeAfter = stats.totalSize;

      return result;
    } catch (error: unknown) {
      console.error("Error during data maintenance:", error);
      return result;
    }
  }

  /**
   * Get comprehensive storage analytics for ServiceNow data
   */
  async getStorageAnalytics(): Promise<{
    cluster: any;
    servicenow: any;
    partitions: Record<string, any>;
    recommendations: string[];
  }> {
    try {
      const [clusterSummary, servicenowSummary] = await Promise.all([
        this.hdfsClient.getClusterSummary(),
        this.utils.getStorageSummary(),
      ]);

      // Get partition statistics for each table
      const partitions: Record<string, any> = {};
      for (const table of Object.keys(servicenowSummary.tableBreakdown)) {
        partitions[table] =
          await this.partitioner.getPartitionStatistics(table);
      }

      // Generate recommendations
      const recommendations = this.generateStorageRecommendations(
        servicenowSummary,
        partitions,
      );

      return {
        cluster: clusterSummary,
        servicenow: servicenowSummary,
        partitions,
        recommendations,
      };
    } catch (error: unknown) {
      console.error("Error getting storage analytics:", error);
      return {
        cluster: null,
        servicenow: null,
        partitions: {},
        recommendations: ["Error retrieving analytics"],
      };
    }
  }

  /**
   * Test Hadoop connectivity and performance
   */
  async healthCheck(): Promise<{
    hdfs: {
      connected: boolean;
      latency: number;
      writeable: boolean;
      readable: boolean;
    };
    cluster: {
      healthy: boolean;
      capacity: number;
      used: number;
      available: number;
    };
    partitioning: {
      active: boolean;
      totalPartitions: number;
      healthyPartitions: number;
    };
  }> {
    try {
      // Test HDFS connectivity
      const hdfsHealth = await this.hdfsClient.getHealthStatus();

      // Test cluster health
      const clusterSummary = await this.hdfsClient.getClusterSummary();

      // Test write capability
      const testFile = `/tmp/bunsnc_test_${Date.now()}.txt`;
      const testContent = "BunSNC Hadoop connectivity test";

      // Create temp file
      const fs = await import("fs/promises");
      const tempPath = `/tmp/bunsnc_test_local_${Date.now()}.txt`;
      await fs.writeFile(tempPath, testContent);

      // Test upload
      const canWrite = await this.hdfsClient.uploadFile(tempPath, testFile);

      // Test download
      let canRead = false;
      if (canWrite) {
        const downloadPath = `/tmp/bunsnc_download_${Date.now()}.txt`;
        canRead = await this.hdfsClient.downloadFile(testFile, downloadPath);

        // Cleanup
        await this.hdfsClient.delete(testFile);
        await fs.unlink(downloadPath).catch(() => {});
      }

      // Cleanup temp file
      await fs.unlink(tempPath).catch(() => {});

      // Check partitioning system
      const allPartitions = Array.from(
        this.partitioner["partitionMetadata"].values(),
      );
      const healthyPartitions = allPartitions.filter(
        (p) => Date.now() - p.lastModified < 7 * 24 * 60 * 60 * 1000, // Active within 7 days
      );

      return {
        hdfs: {
          connected: hdfsHealth.healthy,
          latency: hdfsHealth.latency,
          writeable: canWrite,
          readable: canRead,
        },
        cluster: {
          healthy: (clusterSummary?.totalCapacity ?? 0) > 0,
          capacity: clusterSummary?.totalCapacity ?? 0,
          used: clusterSummary?.usedCapacity || 0,
          available: clusterSummary?.availableCapacity || 0,
        },
        partitioning: {
          active: true,
          totalPartitions: allPartitions.length,
          healthyPartitions: healthyPartitions.length,
        },
      };
    } catch (error: unknown) {
      console.error("Error during Hadoop health check:", error);
      return {
        hdfs: {
          connected: false,
          latency: -1,
          writeable: false,
          readable: false,
        },
        cluster: { healthy: false, capacity: 0, used: 0, available: 0 },
        partitioning: {
          active: false,
          totalPartitions: 0,
          healthyPartitions: 0,
        },
      };
    }
  }

  private generateStorageRecommendations(
    servicenowSummary: any,
    partitions: Record<string, any>,
  ): string[] {
    const recommendations: string[] = [];

    // Check overall storage utilization
    const totalSize = servicenowSummary.totalSize;
    if (totalSize > 1024 * 1024 * 1024 * 1024) {
      // > 1TB
      recommendations.push(
        "Consider archiving old data - total storage exceeds 1TB",
      );
    }

    // Check individual table sizes
    for (const [table, breakdown] of Object.entries(
      servicenowSummary.tableBreakdown,
    ) as any) {
      if (breakdown.size > 100 * 1024 * 1024 * 1024) {
        // > 100GB
        recommendations.push(
          `Table ${table} is very large (${(breakdown.size / 1024 / 1024 / 1024).toFixed(2)}GB) - consider partitioning optimization`,
        );
      }
    }

    // Check partition health
    for (const [table, stats] of Object.entries(partitions) as any) {
      if (stats.smallPartitions > stats.totalPartitions * 0.3) {
        recommendations.push(
          `Table ${table} has many small partitions (${stats.smallPartitions}) - consider compaction`,
        );
      }

      if (stats.largePartitions > stats.totalPartitions * 0.1) {
        recommendations.push(
          `Table ${table} has large partitions (${stats.largePartitions}) - consider splitting`,
        );
      }

      if (stats.compressionRatio < 0.3) {
        recommendations.push(
          `Table ${table} has poor compression ratio (${stats.compressionRatio.toFixed(2)}) - review compression settings`,
        );
      }
    }

    // Add general recommendations if none specific
    if (recommendations.length === 0) {
      recommendations.push("Storage is well optimized");
      recommendations.push(
        "Consider enabling automatic compaction for better performance",
      );
    }

    return recommendations;
  }
}

// Constants for ServiceNow-specific Hadoop operations
export const SERVICENOW_HADOOP_DEFAULTS = {
  HDFS_PATHS: {
    DATA_ROOT: "/servicenow",
    PARQUET_DATA: "/servicenow/data/parquet",
    ATTACHMENTS: "/servicenow/attachments",
    LOGS: "/servicenow/logs",
    TEMP: "/servicenow/tmp",
  },
  PARTITION_STRATEGIES: {
    INCIDENT: { strategy: "date" as const, dateFormat: "daily" as const },
    PROBLEM: { strategy: "date" as const, dateFormat: "weekly" as const },
    CHANGE: { strategy: "hybrid" as const, dateFormat: "daily" as const },
    USER: { strategy: "size" as const, maxPartitionSize: 64 * 1024 * 1024 },
  },
  COMPRESSION: {
    PARQUET: "snappy" as const,
    LOGS: "gzip" as const,
    ATTACHMENTS: "none" as const,
  },
  REPLICATION: {
    CRITICAL: 3,
    STANDARD: 2,
    TEMP: 1,
  },
};
