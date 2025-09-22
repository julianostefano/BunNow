/**
 * Hadoop HDFS Client for Distributed Storage of ServiceNow Data
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { createReadStream, createWriteStream, existsSync, statSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { pipeline } from "stream/promises";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";

export interface HDFSConfig {
  namenode: string; // NameNode URL (e.g., 'http://namenode:9870')
  datanode?: string; // DataNode URL (optional, auto-discovered)
  user: string; // HDFS user
  timeout?: number; // Request timeout (default: 30000)
  replicationFactor?: number; // Replication factor (default: 3)
  blockSize?: number; // Block size in bytes (default: 128MB)
  bufferSize?: number; // Buffer size for streams (default: 4KB)
  enableCompression?: boolean; // Enable compression (default: true)
  compressionCodec?: "gzip" | "snappy" | "lz4" | "bzip2"; // Compression codec
}

export interface HDFSFileInfo {
  path: string;
  type: "FILE" | "DIRECTORY";
  size: number;
  modificationTime: number;
  accessTime: number;
  replication: number;
  blockSize: number;
  owner: string;
  group: string;
  permission: string;
  childrenNum?: number;
}

export interface HDFSOperationOptions {
  overwrite?: boolean;
  bufferSize?: number;
  replication?: number;
  blockSize?: number;
  permission?: string;
  createParent?: boolean;
  recursive?: boolean;
}

export interface HDFSStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  bytesRead: number;
  bytesWritten: number;
  averageLatency: number;
  activeConnections: number;
  lastOperation: number;
}

export class HDFSClient extends EventEmitter {
  private config: Required<HDFSConfig>;
  private stats: HDFSStats = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    bytesRead: 0,
    bytesWritten: 0,
    averageLatency: 0,
    activeConnections: 0,
    lastOperation: 0,
  };
  private baseUrl: string;

  constructor(config: HDFSConfig) {
    super();

    this.config = {
      namenode: config.namenode,
      datanode: config.datanode || "",
      user: config.user,
      timeout: config.timeout || 30000,
      replicationFactor: config.replicationFactor || 3,
      blockSize: config.blockSize || 128 * 1024 * 1024, // 128MB
      bufferSize: config.bufferSize || 4096,
      enableCompression: config.enableCompression ?? true,
      compressionCodec: config.compressionCodec || "snappy",
    };

    this.baseUrl = `${this.config.namenode}/webhdfs/v1`;

    logger.info("HDFSClient initialized with config:", "HDFSClient", {
      namenode: this.config.namenode,
      user: this.config.user,
      replicationFactor: this.config.replicationFactor,
      blockSize: this.config.blockSize,
    });
  }

  /**
   * Upload local file to HDFS
   */
  async uploadFile(
    localPath: string,
    hdfsPath: string,
    options: HDFSOperationOptions = {},
  ): Promise<boolean> {
    const timer = "hdfs_upload";
    performanceMonitor.startTimer(timer);

    try {
      if (!existsSync(localPath)) {
        throw new Error(`Local file not found: ${localPath}`);
      }

      this.stats.totalOperations++;
      const fileSize = statSync(localPath).size;

      // Step 1: Create file and get redirect URL
      const createUrl = this.buildUrl(hdfsPath, "CREATE", {
        overwrite: options.overwrite?.toString() || "false",
        replication: (
          options.replication || this.config.replicationFactor
        ).toString(),
        blocksize: (options.blockSize || this.config.blockSize).toString(),
        buffersize: (options.bufferSize || this.config.bufferSize).toString(),
        permission: options.permission || "644",
      });

      const createResponse = await this.makeRequest(createUrl, "PUT");

      if (!createResponse.ok) {
        throw new Error(`Failed to create file: ${createResponse.statusText}`);
      }

      // Step 2: Upload file data to redirect URL
      const redirectUrl = createResponse.headers.get("location");
      if (!redirectUrl) {
        throw new Error("No redirect URL received for file upload");
      }

      // Stream file to HDFS
      const fileStream = createReadStream(localPath);
      const uploadResponse = await fetch(redirectUrl, {
        method: "PUT",
        body: fileStream as any,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": fileSize.toString(),
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `Failed to upload file data: ${uploadResponse.statusText}`,
        );
      }

      this.stats.successfulOperations++;
      this.stats.bytesWritten += fileSize;
      this.stats.lastOperation = Date.now();

      logger.info(
        `Successfully uploaded ${localPath} to HDFS ${hdfsPath} (${fileSize} bytes)`,
      );
      this.emit("file:uploaded", { localPath, hdfsPath, size: fileSize });

      return true;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(
        `Error uploading file ${localPath} to HDFS:`,
        error as Error,
      );
      this.emit("operation:error", {
        operation: "upload",
        localPath,
        hdfsPath,
        error,
      });
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Download file from HDFS to local filesystem
   */
  async downloadFile(
    hdfsPath: string,
    localPath: string,
    options: HDFSOperationOptions = {},
  ): Promise<boolean> {
    const timer = "hdfs_download";
    performanceMonitor.startTimer(timer);

    try {
      this.stats.totalOperations++;

      // Ensure local directory exists
      const localDir = dirname(localPath);
      if (!existsSync(localDir)) {
        const fs = await import("fs/promises");
        await fs.mkdir(localDir, { recursive: true });
      }

      // Get file info first
      const fileInfo = await this.getFileStatus(hdfsPath);
      if (!fileInfo) {
        throw new Error(`File not found in HDFS: ${hdfsPath}`);
      }

      // Open file for reading
      const openUrl = this.buildUrl(hdfsPath, "OPEN", {
        buffersize: (options.bufferSize || this.config.bufferSize).toString(),
      });

      const response = await this.makeRequest(openUrl, "GET");

      if (!response.ok) {
        throw new Error(`Failed to open HDFS file: ${response.statusText}`);
      }

      // Stream data to local file
      if (response.body) {
        const writeStream = createWriteStream(localPath);
        await pipeline(response.body as any, writeStream);
      }

      this.stats.successfulOperations++;
      this.stats.bytesRead += fileInfo.size;
      this.stats.lastOperation = Date.now();

      logger.info(
        `Successfully downloaded ${hdfsPath} from HDFS to ${localPath} (${fileInfo.size} bytes)`,
      );
      this.emit("file:downloaded", {
        hdfsPath,
        localPath,
        size: fileInfo.size,
      });

      return true;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(
        `Error downloading file ${hdfsPath} from HDFS:`,
        error as Error,
      );
      this.emit("operation:error", {
        operation: "download",
        hdfsPath,
        localPath,
        error,
      });
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Create directory in HDFS
   */
  async createDirectory(
    hdfsPath: string,
    options: HDFSOperationOptions = {},
  ): Promise<boolean> {
    const timer = "hdfs_mkdir";
    performanceMonitor.startTimer(timer);

    try {
      this.stats.totalOperations++;

      const mkdirUrl = this.buildUrl(hdfsPath, "MKDIRS", {
        permission: options.permission || "755",
      });

      const response = await this.makeRequest(mkdirUrl, "PUT");

      if (!response.ok) {
        throw new Error(`Failed to create directory: ${response.statusText}`);
      }

      const result = (await response.json()) as any;
      const success = result.boolean === true;

      if (success) {
        this.stats.successfulOperations++;
        logger.info(`Successfully created directory: ${hdfsPath}`);
        this.emit("directory:created", { hdfsPath });
      } else {
        this.stats.failedOperations++;
      }

      return success;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error creating directory ${hdfsPath}:`, error as Error);
      this.emit("operation:error", { operation: "mkdir", hdfsPath, error });
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Delete file or directory from HDFS
   */
  async delete(hdfsPath: string, recursive: boolean = false): Promise<boolean> {
    const timer = "hdfs_delete";
    performanceMonitor.startTimer(timer);

    try {
      this.stats.totalOperations++;

      const deleteUrl = this.buildUrl(hdfsPath, "DELETE", {
        recursive: recursive.toString(),
      });

      const response = await this.makeRequest(deleteUrl, "DELETE");

      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.statusText}`);
      }

      const result = (await response.json()) as any;
      const success = result.boolean === true;

      if (success) {
        this.stats.successfulOperations++;
        logger.info(
          `Successfully deleted: ${hdfsPath} (recursive: ${recursive})`,
        );
        this.emit("item:deleted", { hdfsPath, recursive });
      } else {
        this.stats.failedOperations++;
      }

      return success;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error deleting ${hdfsPath}:`, error as Error);
      this.emit("operation:error", { operation: "delete", hdfsPath, error });
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Get file or directory status
   */
  async getFileStatus(hdfsPath: string): Promise<HDFSFileInfo | null> {
    const timer = "hdfs_status";
    performanceMonitor.startTimer(timer);

    try {
      this.stats.totalOperations++;

      const statusUrl = this.buildUrl(hdfsPath, "GETFILESTATUS");
      const response = await this.makeRequest(statusUrl, "GET");

      if (!response.ok) {
        if (response.status === 404) {
          return null; // File not found
        }
        throw new Error(`Failed to get file status: ${response.statusText}`);
      }

      const result = (await response.json()) as any;
      const status = result.FileStatus;

      this.stats.successfulOperations++;

      return {
        path: hdfsPath,
        type: status.type,
        size: status.length,
        modificationTime: status.modificationTime,
        accessTime: status.accessTime,
        replication: status.replication,
        blockSize: status.blockSize,
        owner: status.owner,
        group: status.group,
        permission: status.permission,
        childrenNum: status.childrenNum,
      };
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error getting status for ${hdfsPath}:`, error as Error);
      return null;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(hdfsPath: string): Promise<HDFSFileInfo[]> {
    const timer = "hdfs_list";
    performanceMonitor.startTimer(timer);

    try {
      this.stats.totalOperations++;

      const listUrl = this.buildUrl(hdfsPath, "LISTSTATUS");
      const response = await this.makeRequest(listUrl, "GET");

      if (!response.ok) {
        throw new Error(`Failed to list directory: ${response.statusText}`);
      }

      const result = (await response.json()) as any;
      const fileStatuses = result.FileStatuses.FileStatus;

      this.stats.successfulOperations++;

      return fileStatuses.map((status: any) => ({
        path: join(hdfsPath, status.pathSuffix),
        type: status.type,
        size: status.length,
        modificationTime: status.modificationTime,
        accessTime: status.accessTime,
        replication: status.replication,
        blockSize: status.blockSize,
        owner: status.owner,
        group: status.group,
        permission: status.permission,
        childrenNum: status.childrenNum,
      }));
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error listing directory ${hdfsPath}:`, error as Error);
      return [];
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Rename file or directory
   */
  async rename(oldPath: string, newPath: string): Promise<boolean> {
    const timer = "hdfs_rename";
    performanceMonitor.startTimer(timer);

    try {
      this.stats.totalOperations++;

      const renameUrl = this.buildUrl(oldPath, "RENAME", {
        destination: newPath,
      });

      const response = await this.makeRequest(renameUrl, "PUT");

      if (!response.ok) {
        throw new Error(`Failed to rename: ${response.statusText}`);
      }

      const result = (await response.json()) as any;
      const success = result.boolean === true;

      if (success) {
        this.stats.successfulOperations++;
        logger.info(`Successfully renamed ${oldPath} to ${newPath}`);
        this.emit("item:renamed", { oldPath, newPath });
      } else {
        this.stats.failedOperations++;
      }

      return success;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(`Error renaming ${oldPath} to ${newPath}:`, error as Error);
      this.emit("operation:error", {
        operation: "rename",
        oldPath,
        newPath,
        error,
      });
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Set file replication factor
   */
  async setReplication(
    hdfsPath: string,
    replication: number,
  ): Promise<boolean> {
    const timer = "hdfs_set_replication";
    performanceMonitor.startTimer(timer);

    try {
      this.stats.totalOperations++;

      const replicationUrl = this.buildUrl(hdfsPath, "SETREPLICATION", {
        replication: replication.toString(),
      });

      const response = await this.makeRequest(replicationUrl, "PUT");

      if (!response.ok) {
        throw new Error(`Failed to set replication: ${response.statusText}`);
      }

      const result = (await response.json()) as any;
      const success = result.boolean === true;

      if (success) {
        this.stats.successfulOperations++;
        logger.info(
          `Successfully set replication for ${hdfsPath} to ${replication}`,
        );
        this.emit("replication:set", { hdfsPath, replication });
      } else {
        this.stats.failedOperations++;
      }

      return success;
    } catch (error) {
      this.stats.failedOperations++;
      logger.error(
        `Error setting replication for ${hdfsPath}:`,
        error as Error,
      );
      return false;
    } finally {
      performanceMonitor.endTimer(timer);
    }
  }

  /**
   * Get HDFS cluster summary
   */
  async getClusterSummary(): Promise<{
    totalCapacity: number;
    usedCapacity: number;
    availableCapacity: number;
    totalFiles: number;
    totalDirectories: number;
    totalBlocks: number;
    missingBlocks: number;
  } | null> {
    try {
      // This would require additional HDFS REST API calls
      // Implementation depends on specific Hadoop version and available APIs

      const summaryUrl = `${this.config.namenode}/jmx?qry=Hadoop:service=NameNode,name=FSNamesystemState`;
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout,
      );

      const response = await fetch(summaryUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Failed to get cluster summary: ${response.statusText}`,
        );
      }

      const result = (await response.json()) as any;
      const beans = result.beans[0];

      return {
        totalCapacity: beans.CapacityTotal || 0,
        usedCapacity: beans.CapacityUsed || 0,
        availableCapacity: beans.CapacityRemaining || 0,
        totalFiles: beans.FilesTotal || 0,
        totalDirectories: beans.TotalLoad || 0,
        totalBlocks: beans.BlocksTotal || 0,
        missingBlocks: beans.MissingBlocks || 0,
      };
    } catch (error) {
      logger.error("Error getting cluster summary:", error as Error);
      return null;
    }
  }

  /**
   * Check HDFS health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    namenode: boolean;
    datanode: boolean;
    latency: number;
    lastSuccessfulOperation: number;
  }> {
    try {
      const startTime = Date.now();

      // Test connection with a simple status call
      const testPath = "/tmp";
      const status = await this.getFileStatus(testPath);
      const latency = Date.now() - startTime;

      return {
        healthy: status !== null,
        namenode: true,
        datanode: true, // Simplified - would need additional checks
        latency,
        lastSuccessfulOperation: this.stats.lastOperation,
      };
    } catch (error) {
      return {
        healthy: false,
        namenode: false,
        datanode: false,
        latency: -1,
        lastSuccessfulOperation: this.stats.lastOperation,
      };
    }
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): HDFSStats {
    // Update average latency
    if (this.stats.totalOperations > 0) {
      this.stats.averageLatency =
        (this.stats.successfulOperations + this.stats.failedOperations) /
        this.stats.totalOperations;
    }

    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      bytesRead: 0,
      bytesWritten: 0,
      averageLatency: 0,
      activeConnections: 0,
      lastOperation: 0,
    };

    this.emit("stats:reset");
  }

  private buildUrl(
    path: string,
    operation: string,
    params: Record<string, string> = {},
  ): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);

    url.searchParams.set("op", operation);
    url.searchParams.set("user.name", this.config.user);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }

  private async makeRequest(
    url: string,
    method: string,
    body?: any,
  ): Promise<Response> {
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(url, options);
    return response;
  }
}

/**
 * HDFS utilities for ServiceNow-specific operations
 */
export class ServiceNowHDFSUtils {
  private hdfs: HDFSClient;

  constructor(hdfs: HDFSClient) {
    this.hdfs = hdfs;
  }

  /**
   * Upload Parquet file with ServiceNow-specific path structure
   */
  async uploadParquetFile(
    localFile: string,
    table: string,
    date: Date,
    options: HDFSOperationOptions = {},
  ): Promise<boolean> {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    const hdfsPath = `/servicenow/data/parquet/${table}/year=${year}/month=${month}/day=${day}/${basename(localFile)}`;

    // Ensure parent directories exist
    const parentDir = dirname(hdfsPath);
    await this.hdfs.createDirectory(parentDir, {
      ...options,
      permission: "755",
    });

    return await this.hdfs.uploadFile(localFile, hdfsPath, options);
  }

  /**
   * Upload ServiceNow attachment with metadata
   */
  async uploadAttachment(
    localFile: string,
    sysId: string,
    fileName: string,
    contentType: string,
    table: string,
  ): Promise<boolean> {
    const hdfsPath = `/servicenow/attachments/${table}/${sysId}/${fileName}`;

    // Create directory for attachment
    const attachmentDir = dirname(hdfsPath);
    await this.hdfs.createDirectory(attachmentDir, { permission: "755" });

    // Upload the file
    const success = await this.hdfs.uploadFile(localFile, hdfsPath);

    if (success) {
      // Upload metadata
      const metadataPath = `${hdfsPath}.metadata`;
      const metadata = {
        sys_id: sysId,
        file_name: fileName,
        content_type: contentType,
        table_name: table,
        upload_date: new Date().toISOString(),
        file_size: existsSync(localFile) ? statSync(localFile).size : 0,
      };

      // Write metadata as JSON
      const fs = await import("fs/promises");
      const tempMetadataFile = `/tmp/metadata_${sysId}.json`;
      await fs.writeFile(tempMetadataFile, JSON.stringify(metadata, null, 2));

      await this.hdfs.uploadFile(tempMetadataFile, metadataPath);

      // Cleanup temp file
      await fs.unlink(tempMetadataFile);
    }

    return success;
  }

  /**
   * List Parquet files for a table within date range
   */
  async listParquetFiles(
    table: string,
    startDate: Date,
    endDate: Date,
  ): Promise<HDFSFileInfo[]> {
    const files: HDFSFileInfo[] = [];

    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, "0");
      const day = String(currentDate.getDate()).padStart(2, "0");

      const dayPath = `/servicenow/data/parquet/${table}/year=${year}/month=${month}/day=${day}`;

      try {
        const dayFiles = await this.hdfs.listDirectory(dayPath);
        const parquetFiles = dayFiles.filter(
          (file) => file.type === "FILE" && file.path.endsWith(".parquet"),
        );
        files.push(...parquetFiles);
      } catch (error) {
        // Directory might not exist for this date - skip
        logger.debug(
          `No data found for ${table} on ${currentDate.toISOString().split("T")[0]}`,
        );
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return files;
  }

  /**
   * Get storage summary for ServiceNow data
   */
  async getStorageSummary(): Promise<{
    totalSize: number;
    tableBreakdown: Record<string, { files: number; size: number }>;
    attachmentSize: number;
    parquetSize: number;
  }> {
    const summary = {
      totalSize: 0,
      tableBreakdown: {} as Record<string, { files: number; size: number }>,
      attachmentSize: 0,
      parquetSize: 0,
    };

    try {
      // Check parquet data
      const parquetDir = "/servicenow/data/parquet";
      const tables = await this.hdfs.listDirectory(parquetDir);

      for (const table of tables) {
        if (table.type === "DIRECTORY") {
          const tableName = basename(table.path);
          const tableStats = await this.calculateDirectorySize(table.path);

          summary.tableBreakdown[tableName] = tableStats;
          summary.parquetSize += tableStats.size;
          summary.totalSize += tableStats.size;
        }
      }

      // Check attachment data
      const attachmentDir = "/servicenow/attachments";
      const attachmentStats = await this.calculateDirectorySize(attachmentDir);
      summary.attachmentSize = attachmentStats.size;
      summary.totalSize += attachmentStats.size;
    } catch (error) {
      logger.error("Error calculating storage summary:", error as Error);
    }

    return summary;
  }

  private async calculateDirectorySize(
    path: string,
  ): Promise<{ files: number; size: number }> {
    let totalSize = 0;
    let totalFiles = 0;

    try {
      const items = await this.hdfs.listDirectory(path);

      for (const item of items) {
        if (item.type === "FILE") {
          totalSize += item.size;
          totalFiles++;
        } else if (item.type === "DIRECTORY") {
          const subDirStats = await this.calculateDirectorySize(item.path);
          totalSize += subDirStats.size;
          totalFiles += subDirStats.files;
        }
      }
    } catch (error) {
      // Directory might not be accessible
      logger.debug(`Could not access directory ${path}:`, error);
    }

    return { files: totalFiles, size: totalSize };
  }
}
