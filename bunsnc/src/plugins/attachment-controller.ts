/**
 * Attachment Controller Plugin - ServiceNow attachment operations as Elysia Plugin
 * Migrated from AttachmentController + AttachmentAPI to unified plugin architecture
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { Context } from "elysia";
import { logger } from "../utils/Logger";
import { cache } from "../utils/Cache";

// Types for ServiceNow attachment operations
export interface AttachmentRecord {
  sys_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  table_name: string;
  table_sys_id: string;
  download_link: string;
  created_on: string;
  created_by?: string;
}

export interface AttachmentUploadOptions {
  table_name: string;
  table_sys_id: string;
  file: File;
  content_type?: string;
  file_name?: string;
}

export interface AttachmentOperationResult {
  success: boolean;
  data?: AttachmentRecord | AttachmentRecord[];
  message?: string;
  error?: string;
  code?: string;
  count?: number;
  attachment_id?: string;
}

export interface StorageStats {
  total_files: number;
  total_size_bytes: number;
  total_size_mb: number;
  upload_directory: string;
  max_file_size_mb: number;
  allowed_extensions: string[];
}

// Plugin Attachment Controller class with unified AttachmentAPI capabilities
class PluginAttachmentController {
  private readonly uploadDir: string;
  private readonly maxFileSize: number = 50 * 1024 * 1024; // 50MB
  private readonly allowedExtensions: string[] = [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".csv",
    ".json",
    ".xml",
    ".log",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".svg",
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
  ];
  private stats = {
    uploads: 0,
    downloads: 0,
    deletes: 0,
    cacheHits: 0,
    totalSize: 0,
    operationCount: 0,
  };

  constructor(
    private serviceLocator: any,
    private config: any,
  ) {
    this.uploadDir =
      this.config?.uploadDir ||
      process.env.ATTACHMENT_UPLOAD_DIR ||
      "./uploads/attachments";
    this.ensureUploadDirectory();
    logger.info("PluginAttachmentController initialized", "AttachmentPlugin", {
      uploadDir: this.uploadDir,
      maxFileSize: this.maxFileSize,
      allowedExtensions: this.allowedExtensions.length,
    });
  }

  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
      console.log(`✓ Attachment upload directory created: ${this.uploadDir}`);
    }
  }

  /**
   * Upload attachment to ServiceNow record
   */
  async uploadAttachment(
    table: string,
    tableSysId: string,
    file: File,
  ): Promise<AttachmentOperationResult> {
    const operation = logger.operation("upload_attachment", table, tableSysId, {
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
    });

    try {
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          code: "INVALID_FILE",
        };
      }

      // Generate unique filename and save temporarily
      const tempFileName = `${crypto.randomUUID()}_${file.name}`;
      const tempFilePath = path.join(this.uploadDir, tempFileName);

      const arrayBuffer = await file.arrayBuffer();
      await fs.writeFile(tempFilePath, Buffer.from(arrayBuffer));

      try {
        // Create attachment record in ServiceNow using consolidated service
        const serviceNowService = this.serviceLocator.services?.serviceNow;
        if (!serviceNowService) {
          throw new Error("ServiceNow service not available");
        }

        const attachmentData = {
          file_name: file.name,
          content_type: file.type || "application/octet-stream",
          table_name: table,
          table_sys_id: tableSysId,
          size_bytes: file.size.toString(),
          size_compressed: file.size.toString(),
        };

        const attachmentRecord = await serviceNowService.createRecord(
          "sys_attachment",
          attachmentData,
        );

        // Keep local copy with attachment sys_id for download
        const permanentPath = path.join(
          this.uploadDir,
          `${attachmentRecord.sys_id}_${file.name}`,
        );
        await fs.rename(tempFilePath, permanentPath);

        const response: AttachmentRecord = {
          sys_id: attachmentRecord.sys_id,
          file_name: file.name,
          content_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          table_name: table,
          table_sys_id: tableSysId,
          download_link: `/api/attachments/${attachmentRecord.sys_id}/download`,
          created_on: new Date().toISOString(),
        };

        // Update stats and invalidate cache
        this.stats.uploads++;
        this.stats.totalSize += file.size;
        this.stats.operationCount++;

        if (cache) {
          cache.delete(`attachments_list:${table}:${tableSysId}`);
        }

        operation.success("Attachment uploaded successfully", {
          attachmentId: attachmentRecord.sys_id,
          fileName: file.name,
          fileSize: file.size,
        });

        return {
          success: true,
          data: response,
          message: "Attachment uploaded successfully",
        };
      } catch (serviceNowError) {
        // Clean up temp file on ServiceNow error
        await fs.unlink(tempFilePath).catch(() => {});
        throw serviceNowError;
      }
    } catch (error: any) {
      operation.error("Attachment upload failed", error);
      return {
        success: false,
        error: error.message || "Upload failed",
        code: "UPLOAD_ERROR",
      };
    }
  }

  /**
   * Download attachment file
   */
  async downloadAttachment(attachmentId: string): Promise<Response> {
    const operation = logger.operation(
      "download_attachment",
      undefined,
      attachmentId,
    );

    try {
      // Get attachment metadata from ServiceNow
      const serviceNowService = this.serviceLocator.services?.serviceNow;
      if (!serviceNowService) {
        return new Response("ServiceNow service not available", {
          status: 503,
        });
      }

      const attachmentRecord = await serviceNowService.getRecord(
        "sys_attachment",
        attachmentId,
      );
      if (!attachmentRecord) {
        return new Response("Attachment not found", { status: 404 });
      }

      // Try local file first
      const localFilePath = path.join(
        this.uploadDir,
        `${attachmentId}_${attachmentRecord.file_name}`,
      );

      try {
        await fs.access(localFilePath);
        const fileBuffer = await fs.readFile(localFilePath);

        this.stats.downloads++;
        this.stats.operationCount++;

        operation.success("Attachment downloaded from local storage", {
          fileName: attachmentRecord.file_name,
          size: fileBuffer.length,
        });

        return new Response(fileBuffer, {
          headers: {
            "Content-Type":
              attachmentRecord.content_type || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${attachmentRecord.file_name}"`,
            "Content-Length": attachmentRecord.size_bytes || "0",
            "X-Attachment-ID": attachmentId,
          },
        });
      } catch (localFileError) {
        // If local file not found, would typically fetch from ServiceNow
        console.warn(
          `Local file not found for ${attachmentId}, would fetch from ServiceNow in production`,
        );

        operation.warn("Local file not available", { attachmentId });

        return new Response(
          JSON.stringify({
            success: false,
            error: "Attachment content not available locally",
            code: "CONTENT_NOT_AVAILABLE",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } catch (error: any) {
      operation.error("Attachment download failed", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Download failed",
          code: "DOWNLOAD_ERROR",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * List attachments for a ServiceNow record
   */
  async listAttachments(
    table: string,
    tableSysId: string,
  ): Promise<AttachmentOperationResult> {
    const operation = logger.operation("list_attachments", table, tableSysId);

    try {
      // Check cache first
      const cacheKey = `attachments_list:${table}:${tableSysId}`;
      if (cache) {
        const cached = cache.get(cacheKey);
        if (cached) {
          this.stats.cacheHits++;
          this.stats.operationCount++;
          operation.success("Attachment list retrieved from cache", {
            count: cached.length,
          });
          return {
            success: true,
            data: cached,
            count: cached.length,
            table_name: table,
            table_sys_id: tableSysId,
          };
        }
      }

      const serviceNowService = this.serviceLocator.services?.serviceNow;
      if (!serviceNowService) {
        throw new Error("ServiceNow service not available");
      }

      const attachments = await serviceNowService.queryRecords(
        "sys_attachment",
        `table_name=${table}^table_sys_id=${tableSysId}`,
        { order: "sys_created_on DESC" },
      );

      const response = attachments.map((attachment: any) => ({
        sys_id: attachment.sys_id,
        file_name: attachment.file_name,
        content_type: attachment.content_type,
        size_bytes: parseInt(attachment.size_bytes) || 0,
        table_name: attachment.table_name,
        table_sys_id: attachment.table_sys_id,
        download_link: `/api/attachments/${attachment.sys_id}/download`,
        created_on: attachment.sys_created_on,
        created_by: attachment.sys_created_by,
      }));

      // Cache the list
      if (cache) {
        cache.set(cacheKey, response, 180000); // 3 minutes
      }

      this.stats.operationCount++;
      operation.success("Attachment list retrieved", {
        count: response.length,
      });

      return {
        success: true,
        data: response,
        count: response.length,
        table_name: table,
        table_sys_id: tableSysId,
      };
    } catch (error: any) {
      operation.error("List attachments failed", error);
      return {
        success: false,
        error: error.message || "Failed to list attachments",
        code: "LIST_ERROR",
      };
    }
  }

  /**
   * Delete attachment from ServiceNow
   */
  async deleteAttachment(
    attachmentId: string,
  ): Promise<AttachmentOperationResult> {
    const operation = logger.operation(
      "delete_attachment",
      undefined,
      attachmentId,
    );

    try {
      const serviceNowService = this.serviceLocator.services?.serviceNow;
      if (!serviceNowService) {
        throw new Error("ServiceNow service not available");
      }

      // Get attachment metadata before deletion
      const attachmentRecord = await serviceNowService.getRecord(
        "sys_attachment",
        attachmentId,
      );
      if (!attachmentRecord) {
        return {
          success: false,
          error: "Attachment not found",
          code: "NOT_FOUND",
        };
      }

      // Delete from ServiceNow
      await serviceNowService.deleteRecord("sys_attachment", attachmentId);

      // Clean up local file
      const localFilePath = path.join(
        this.uploadDir,
        `${attachmentId}_${attachmentRecord.file_name}`,
      );
      try {
        await fs.unlink(localFilePath);
        console.log(`✓ Deleted local file: ${localFilePath}`);
      } catch (fsError) {
        console.warn(`Could not delete local file: ${localFilePath}`);
      }

      // Update stats and clear cache
      this.stats.deletes++;
      this.stats.operationCount++;

      if (cache) {
        cache.delete(`attachment_meta:${attachmentId}`);
        cache.delete(`attachment:${attachmentId}`);
      }

      operation.success("Attachment deleted successfully", {
        attachmentId,
        fileName: attachmentRecord.file_name,
      });

      return {
        success: true,
        message: "Attachment deleted successfully",
        attachment_id: attachmentId,
        file_name: attachmentRecord.file_name,
      };
    } catch (error: any) {
      operation.error("Attachment deletion failed", error);
      return {
        success: false,
        error: error.message || "Delete failed",
        code: "DELETE_ERROR",
      };
    }
  }

  /**
   * Get attachment metadata
   */
  async getAttachmentInfo(
    attachmentId: string,
  ): Promise<AttachmentOperationResult> {
    const operation = logger.operation(
      "get_attachment_info",
      undefined,
      attachmentId,
    );

    try {
      // Check cache first
      if (cache) {
        const cached = cache.get(`attachment_meta:${attachmentId}`);
        if (cached) {
          this.stats.cacheHits++;
          this.stats.operationCount++;
          operation.success("Attachment info retrieved from cache");
          return { success: true, data: cached };
        }
      }

      const serviceNowService = this.serviceLocator.services?.serviceNow;
      if (!serviceNowService) {
        throw new Error("ServiceNow service not available");
      }

      const attachmentRecord = await serviceNowService.getRecord(
        "sys_attachment",
        attachmentId,
      );
      if (!attachmentRecord) {
        return {
          success: false,
          error: "Attachment not found",
          code: "NOT_FOUND",
        };
      }

      const response: AttachmentRecord = {
        sys_id: attachmentRecord.sys_id,
        file_name: attachmentRecord.file_name,
        content_type: attachmentRecord.content_type,
        size_bytes: parseInt(attachmentRecord.size_bytes) || 0,
        table_name: attachmentRecord.table_name,
        table_sys_id: attachmentRecord.table_sys_id,
        download_link: `/api/attachments/${attachmentRecord.sys_id}/download`,
        created_on: attachmentRecord.sys_created_on,
      };

      // Cache the metadata
      if (cache) {
        cache.set(`attachment_meta:${attachmentId}`, response, 300000); // 5 minutes
      }

      this.stats.operationCount++;
      operation.success("Attachment info retrieved");

      return {
        success: true,
        data: response,
      };
    } catch (error: any) {
      operation.error("Get attachment info failed", error);
      return {
        success: false,
        error: error.message || "Failed to get attachment info",
        code: "INFO_ERROR",
      };
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    success: boolean;
    data?: StorageStats;
    error?: string;
  }> {
    try {
      const files = await fs.readdir(this.uploadDir);
      let totalSize = 0;
      let fileCount = 0;

      for (const file of files) {
        try {
          const filePath = path.join(this.uploadDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          fileCount++;
        } catch {
          continue;
        }
      }

      return {
        success: true,
        data: {
          total_files: fileCount,
          total_size_bytes: totalSize,
          total_size_mb: Math.round((totalSize / 1024 / 1024) * 100) / 100,
          upload_directory: this.uploadDir,
          max_file_size_mb: Math.round(this.maxFileSize / 1024 / 1024),
          allowed_extensions: this.allowedExtensions,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to get storage stats",
      };
    }
  }

  /**
   * Get operational statistics
   */
  getOperationalStats() {
    return {
      ...this.stats,
      efficiency: {
        cacheHitRatio:
          this.stats.operationCount > 0
            ? this.stats.cacheHits / this.stats.operationCount
            : 0,
        averageFileSize:
          this.stats.uploads > 0
            ? this.stats.totalSize / this.stats.uploads
            : 0,
      },
      configuration: {
        uploadDir: this.uploadDir,
        maxFileSize: this.maxFileSize,
        allowedExtensions: this.allowedExtensions.length,
      },
    };
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${Math.round(this.maxFileSize / 1024 / 1024)}MB`,
      };
    }

    // Check file extension
    const fileExtension = path.extname(file.name).toLowerCase();
    if (!this.allowedExtensions.includes(fileExtension)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed extensions: ${this.allowedExtensions.join(", ")}`,
      };
    }

    // Check for empty file
    if (file.size === 0) {
      return {
        valid: false,
        error: "Empty files are not allowed",
      };
    }

    return { valid: true };
  }
}

// TypeBox validation schemas for attachment operations
const AttachmentUploadSchema = t.Object({
  table_name: t.String({ minLength: 1, description: "ServiceNow table name" }),
  table_sys_id: t.String({
    minLength: 32,
    maxLength: 32,
    description: "Table record sys_id",
  }),
  file: t.File({ description: "File to upload" }),
});

const AttachmentParamsSchema = t.Object({
  table: t.String({ minLength: 1, description: "ServiceNow table name" }),
  tableSysId: t.String({
    minLength: 32,
    maxLength: 32,
    description: "Table record sys_id",
  }),
});

const AttachmentIdSchema = t.Object({
  attachmentId: t.String({
    minLength: 32,
    maxLength: 32,
    description: "Attachment sys_id",
  }),
});

// Plugin context interface
export interface AttachmentControllerPluginContext {
  attachmentController: PluginAttachmentController;
  uploadAttachment: (
    table: string,
    tableSysId: string,
    file: File,
  ) => Promise<AttachmentOperationResult>;
  downloadAttachment: (attachmentId: string) => Promise<Response>;
  listAttachments: (
    table: string,
    tableSysId: string,
  ) => Promise<AttachmentOperationResult>;
  deleteAttachment: (
    attachmentId: string,
  ) => Promise<AttachmentOperationResult>;
  getAttachmentInfo: (
    attachmentId: string,
  ) => Promise<AttachmentOperationResult>;
  getStorageStats: () => Promise<{
    success: boolean;
    data?: StorageStats;
    error?: string;
  }>;
  getOperationalStats: () => any;
}

// Elysia Plugin Definition
export const attachmentControllerPlugin = new Elysia({
  name: "attachment-controller",
})
  .derive(async ({ config, services, ...serviceLocator }) => {
    const attachmentController = new PluginAttachmentController(
      { services, ...serviceLocator },
      config,
    );

    return {
      attachmentController,
      uploadAttachment:
        attachmentController.uploadAttachment.bind(attachmentController),
      downloadAttachment:
        attachmentController.downloadAttachment.bind(attachmentController),
      listAttachments:
        attachmentController.listAttachments.bind(attachmentController),
      deleteAttachment:
        attachmentController.deleteAttachment.bind(attachmentController),
      getAttachmentInfo:
        attachmentController.getAttachmentInfo.bind(attachmentController),
      getStorageStats:
        attachmentController.getStorageStats.bind(attachmentController),
      getOperationalStats:
        attachmentController.getOperationalStats.bind(attachmentController),
    };
  })
  // Upload attachment to ServiceNow record
  .post(
    "/api/attachments/upload/:table/:tableSysId",
    async ({ params: { table, tableSysId }, body, uploadAttachment }) => {
      const { file } = body as { file: File };
      return await uploadAttachment(table, tableSysId, file);
    },
    {
      body: t.Object({
        file: t.File({ description: "File to upload as attachment" }),
      }),
      params: AttachmentParamsSchema,
      detail: {
        tags: ["Attachments"],
        summary: "Upload attachment to ServiceNow record",
        description:
          "Upload a file as attachment to a specific ServiceNow table record",
      },
    },
  )
  // List attachments for a record
  .get(
    "/api/attachments/list/:table/:tableSysId",
    async ({ params: { table, tableSysId }, listAttachments }) => {
      return await listAttachments(table, tableSysId);
    },
    {
      params: AttachmentParamsSchema,
      detail: {
        tags: ["Attachments"],
        summary: "List attachments for record",
        description:
          "Get all attachments for a specific ServiceNow table record",
      },
    },
  )
  // Download attachment file
  .get(
    "/api/attachments/:attachmentId/download",
    async ({ params: { attachmentId }, downloadAttachment }) => {
      return await downloadAttachment(attachmentId);
    },
    {
      params: AttachmentIdSchema,
      detail: {
        tags: ["Attachments"],
        summary: "Download attachment file",
        description: "Download the file content of a ServiceNow attachment",
      },
    },
  )
  // Get attachment metadata
  .get(
    "/api/attachments/:attachmentId/info",
    async ({ params: { attachmentId }, getAttachmentInfo }) => {
      return await getAttachmentInfo(attachmentId);
    },
    {
      params: AttachmentIdSchema,
      detail: {
        tags: ["Attachments"],
        summary: "Get attachment metadata",
        description: "Get metadata and information about a specific attachment",
      },
    },
  )
  // Delete attachment
  .delete(
    "/api/attachments/:attachmentId",
    async ({ params: { attachmentId }, deleteAttachment }) => {
      return await deleteAttachment(attachmentId);
    },
    {
      params: AttachmentIdSchema,
      detail: {
        tags: ["Attachments"],
        summary: "Delete attachment",
        description: "Delete a ServiceNow attachment and its local file",
      },
    },
  )
  // Get storage statistics
  .get(
    "/api/attachments/storage/stats",
    async ({ getStorageStats }) => {
      return await getStorageStats();
    },
    {
      detail: {
        tags: ["Attachments"],
        summary: "Get storage statistics",
        description:
          "Get statistics about attachment storage usage and configuration",
      },
    },
  )
  // Get operational statistics
  .get(
    "/api/attachments/operational/stats",
    async ({ getOperationalStats }) => {
      return {
        success: true,
        data: getOperationalStats(),
      };
    },
    {
      detail: {
        tags: ["Attachments"],
        summary: "Get operational statistics",
        description:
          "Get operational statistics including cache hits, upload/download counts",
      },
    },
  )
  .as("scoped");
