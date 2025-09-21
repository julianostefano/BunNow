/**
 * AttachmentAPI - Dedicated API for ServiceNow Attachment operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import {
  handleServiceNowError,
  createExceptionFromResponse,
} from "../exceptions";
import { logger } from "../utils/Logger";
import { cache } from "../utils/Cache";
import type { ServiceNowRecord } from "../types/servicenow";

export interface IAttachmentAPI {
  get(sysId: string): Promise<ServiceNowRecord | null>;
  list(table: string, tableSysId: string): Promise<ServiceNowRecord[]>;
  upload(
    fileName: string,
    table: string,
    tableSysId: string,
    file: File | Buffer | Blob,
    contentType?: string,
  ): Promise<string>;
  download(sysId: string): Promise<Response>;
  delete(sysId: string): Promise<boolean>;
  getFile(sysId: string, stream?: boolean): Promise<Response>;
  getFileContent(sysId: string): Promise<ArrayBuffer>;
  getFileAsBlob(sysId: string): Promise<Blob>;
  getFileAsText(sysId: string, encoding?: string): Promise<string>;
  getFileAsLines(
    sysId: string,
    encoding?: string,
    delimiter?: string,
  ): Promise<string[]>;
  saveToFile(sysId: string, filePath: string): Promise<string>;
  asTempFile(sysId: string, chunkSize?: number): Promise<Blob>;
  getWithStats(
    sysId: string,
  ): Promise<ServiceNowRecord & { fileExists: boolean; accessible: boolean }>;
  bulkDelete(sysIds: string[]): Promise<{
    deleted: number;
    errors: Array<{ sysId: string; error: string }>;
  }>;
  streamDownload(sysId: string): Promise<ReadableStream>;
  uploadWithProgress(
    fileName: string,
    table: string,
    tableSysId: string,
    file: File | Buffer | Blob,
    onProgress?: (progress: number) => void,
  ): Promise<string>;
  enableCaching(enabled: boolean): void;
  getCacheStats(): any;
}

export class AttachmentAPI implements IAttachmentAPI {
  private baseUrl: string;
  private attachmentUrl: string;
  private headers: Record<string, string>;
  private apiId: string;
  private cachingEnabled: boolean = true;
  private stats = {
    uploads: 0,
    downloads: 0,
    deletes: 0,
    cacheHits: 0,
    totalSize: 0,
    averageResponseTime: 0,
    operationCount: 0,
  };

  constructor(
    private instanceUrl: string,
    private authToken: string,
    options: {
      enableCaching?: boolean;
    } = {},
  ) {
    this.baseUrl = `${instanceUrl}/api/now/table/sys_attachment`;
    this.attachmentUrl = `${instanceUrl}/api/now/attachment`;
    this.headers = {
      Accept: "application/json",
      Authorization: authToken.startsWith("Bearer ")
        ? authToken
        : `Bearer ${authToken}`,
    };
    this.apiId = `attachment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.cachingEnabled = options.enableCaching ?? true;

    logger.debug("AttachmentAPI initialized", "AttachmentAPI", {
      apiId: this.apiId,
      instanceUrl,
      cachingEnabled: this.cachingEnabled,
    });
  }

  /**
   * Get attachment metadata by sys_id
   */
  async get(sysId: string): Promise<ServiceNowRecord | null> {
    const operation = logger.operation(
      "get_attachment_metadata",
      undefined,
      sysId,
      {
        apiId: this.apiId,
      },
    );

    try {
      // Check cache first
      if (this.cachingEnabled) {
        const cached = cache.get(`attachment_meta:${sysId}`);
        if (cached) {
          this.stats.cacheHits++;
          operation.success("Attachment metadata retrieved from cache");
          return cached;
        }
      }

      const response = await fetch(`${this.baseUrl}/${sysId}`, {
        method: "GET",
        headers: this.headers,
      });

      if (response.status === 404) {
        operation.success("Attachment not found", { found: false });
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      const result = (await response.json()) as
        | { result?: ServiceNowRecord }
        | ServiceNowRecord;
      const attachmentData =
        ("result" in result ? result.result : result) || result;

      // Cache the metadata
      if (this.cachingEnabled && attachmentData) {
        cache.set(`attachment_meta:${sysId}`, attachmentData, 300000); // 5 minutes
      }

      operation.success("Attachment metadata retrieved", {
        fileName: attachmentData.file_name,
        contentType: attachmentData.content_type,
        size: attachmentData.size_bytes,
      });

      return attachmentData;
    } catch (error) {
      operation.error("Get attachment metadata failed", error as Error);
      handleServiceNowError(error as Error, "get attachment");
    }
  }

  /**
   * List attachments for a table record
   */
  async list(table: string, tableSysId: string): Promise<ServiceNowRecord[]> {
    const operation = logger.operation("list_attachments", table, tableSysId, {
      apiId: this.apiId,
    });

    try {
      // Check cache first
      const cacheKey = `attachments_list:${table}:${tableSysId}`;
      if (this.cachingEnabled) {
        const cached = cache.get(cacheKey) as ServiceNowRecord[];
        if (cached) {
          this.stats.cacheHits++;
          operation.success("Attachment list retrieved from cache", {
            count: cached.length,
          });
          return cached;
        }
      }

      const params = new URLSearchParams({
        sysparm_query: `table_name=${table}^table_sys_id=${tableSysId}`,
        sysparm_fields:
          "sys_id,file_name,content_type,size_bytes,size_compressed,state,table_name,table_sys_id,sys_created_on,sys_created_by",
        sysparm_display_value: "all",
      });

      const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
        method: "GET",
        headers: this.headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      const result = (await response.json()) as
        | { result?: ServiceNowRecord[] }
        | ServiceNowRecord[];
      const attachments = ("result" in result ? result.result : result) || [];

      // Cache the list
      if (this.cachingEnabled) {
        cache.set(cacheKey, attachments, 180000); // 3 minutes
      }

      // Handle both array and ServiceNow response format
      const attachmentArray = Array.isArray(attachments)
        ? attachments
        : (attachments as { result?: ServiceNowRecord[] }).result || [];

      operation.success("Attachment list retrieved", {
        count: attachmentArray.length,
        totalSize: attachmentArray.reduce(
          (sum: number, att: any) => sum + (parseInt(att.size_bytes) || 0),
          0,
        ),
      });

      return attachmentArray;
    } catch (error) {
      operation.error("List attachments failed", error as Error);
      handleServiceNowError(error as Error, "list attachments");
    }
  }

  /**
   * Upload a file as attachment
   */
  async upload(
    fileName: string,
    table: string,
    tableSysId: string,
    file: File | Buffer | Blob,
    contentType?: string,
  ): Promise<string> {
    return this.uploadWithProgress(
      fileName,
      table,
      tableSysId,
      file,
      undefined,
      contentType,
    );
  }

  /**
   * Upload a file as attachment with progress tracking
   */
  async uploadWithProgress(
    fileName: string,
    table: string,
    tableSysId: string,
    file: File | Buffer | Blob,
    onProgress?: (progress: number) => void,
    contentType?: string,
  ): Promise<string> {
    const fileSize =
      file instanceof Buffer
        ? file.length
        : file instanceof Blob
          ? file.size
          : "unknown";
    const operation = logger.operation("upload_attachment", table, tableSysId, {
      apiId: this.apiId,
      fileName,
      fileSize,
      contentType,
    });

    try {
      const formData = new FormData();

      // Determine content type
      let finalContentType = contentType;
      if (!finalContentType) {
        if (file instanceof File) {
          finalContentType = file.type;
        } else if (fileName) {
          // Try to infer from extension
          const ext = fileName.split(".").pop()?.toLowerCase();
          const mimeTypes: Record<string, string> = {
            txt: "text/plain",
            json: "application/json",
            xml: "application/xml",
            pdf: "application/pdf",
            doc: "application/msword",
            docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            xls: "application/vnd.ms-excel",
            xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            zip: "application/zip",
          };
          finalContentType = mimeTypes[ext || ""] || "application/octet-stream";
        } else {
          finalContentType = "application/octet-stream";
        }
      }

      // Add file to form data
      if (file instanceof File) {
        formData.append("uploadFile", file, fileName);
      } else if (file instanceof Blob) {
        formData.append("uploadFile", file, fileName);
      } else {
        // Convert Buffer to Blob
        const blob = new Blob([file], { type: finalContentType });
        formData.append("uploadFile", blob, fileName);
      }

      formData.append("table_name", table);
      formData.append("table_sys_id", tableSysId);
      formData.append("file_name", fileName);

      // Upload headers (don't set Content-Type, let browser set it with boundary)
      const uploadHeaders = { ...this.headers };
      delete (uploadHeaders as any)["Content-Type"];

      // Report initial progress
      if (onProgress) {
        onProgress(0);
      }

      const response = await fetch(`${this.attachmentUrl}/file`, {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });

      // Report completion progress
      if (onProgress) {
        onProgress(100);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      // ServiceNow returns the attachment sys_id in Location header
      const location = response.headers.get("Location");
      let attachmentId: string | null = null;

      if (location) {
        // Extract sys_id from location URL
        const sysIdMatch = location.match(/([a-f0-9]{32})/i);
        if (sysIdMatch) {
          attachmentId = sysIdMatch[1];
        }
      }

      // Fallback: try to get sys_id from response body
      if (!attachmentId) {
        try {
          const result = (await response.json()) as {
            result?: { sys_id?: string };
          };
          if (result.result && result.result.sys_id) {
            attachmentId = result.result.sys_id;
          }
        } catch {
          // If response is not JSON, continue
        }
      }

      if (!attachmentId) {
        throw new Error("Failed to get attachment sys_id from upload response");
      }

      // Update statistics
      this.stats.uploads++;
      if (typeof fileSize === "number") {
        this.stats.totalSize += fileSize;
      }

      // Invalidate related cache entries
      if (this.cachingEnabled) {
        cache.delete(`attachments_list:${table}:${tableSysId}`);
      }

      operation.success("Attachment uploaded successfully", {
        attachmentId,
        fileName,
        fileSize,
      });

      return attachmentId;
    } catch (error) {
      operation.error("Attachment upload failed", error as Error);
      handleServiceNowError(error as Error, "upload attachment");
    }
  }

  /**
   * Download attachment file
   */
  async download(sysId: string): Promise<Response> {
    this.stats.downloads++;
    return this.getFile(sysId, true);
  }

  /**
   * Get attachment file as response
   */
  async getFile(sysId: string, stream: boolean = false): Promise<Response> {
    const operation = logger.operation(
      "get_attachment_file",
      undefined,
      sysId,
      {
        apiId: this.apiId,
        streaming: stream,
      },
    );

    try {
      // Check cache for file content if not streaming
      if (this.cachingEnabled && !stream) {
        const cached = cache.getCachedAttachment(sysId);
        if (cached) {
          this.stats.cacheHits++;
          operation.success("Attachment file retrieved from cache");
          return new Response(cached instanceof Buffer ? cached : cached);
        }
      }

      const response = await fetch(`${this.attachmentUrl}/${sysId}/file`, {
        method: "GET",
        headers: this.headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      // Cache file content if not streaming and caching is enabled
      if (this.cachingEnabled && !stream) {
        const clonedResponse = response.clone();
        clonedResponse
          .blob()
          .then((blob) => {
            cache.cacheAttachment(sysId, blob as any, 600000); // 10 minutes
          })
          .catch((err) => {
            logger.warn("Failed to cache attachment file", "AttachmentAPI", {
              apiId: this.apiId,
              sysId,
              error: err.message,
            });
          });
      }

      operation.success("Attachment file retrieved", {
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        streaming: stream,
      });

      return response;
    } catch (error) {
      operation.error("Get attachment file failed", error as Error);
      handleServiceNowError(error as Error, "get attachment file");
    }
  }

  /**
   * Get attachment file content as ArrayBuffer
   */
  async getFileContent(sysId: string): Promise<ArrayBuffer> {
    try {
      const response = await this.getFile(sysId);
      return await response.arrayBuffer();
    } catch (error) {
      handleServiceNowError(error as Error, "get attachment content");
    }
  }

  /**
   * Get attachment file as Blob
   */
  async getFileAsBlob(sysId: string): Promise<any> {
    try {
      const response = await this.getFile(sysId);
      return (await response.blob()) as any;
    } catch (error) {
      handleServiceNowError(error as Error, "get attachment as blob");
    }
  }

  /**
   * Delete attachment
   */
  async delete(sysId: string): Promise<boolean> {
    const operation = logger.operation("delete_attachment", undefined, sysId, {
      apiId: this.apiId,
    });

    try {
      const response = await fetch(`${this.baseUrl}/${sysId}`, {
        method: "DELETE",
        headers: this.headers,
      });

      if (response.status === 404) {
        operation.success("Attachment not found for deletion", {
          found: false,
        });
        return false; // Attachment doesn't exist
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw createExceptionFromResponse(response.status, errorText, response);
      }

      const success = response.status === 204;

      if (success) {
        this.stats.deletes++;

        // Remove from cache
        if (this.cachingEnabled) {
          cache.delete(`attachment_meta:${sysId}`);
          cache.delete(`attachment:${sysId}`);
        }
      }

      operation.success("Attachment deletion completed", {
        deleted: success,
      });

      return success;
    } catch (error) {
      operation.error("Delete attachment failed", error as Error);
      handleServiceNowError(error as Error, "delete attachment");
    }
  }

  /**
   * Get attachment file content as text
   */
  async getFileAsText(
    sysId: string,
    encoding: string = "utf-8",
  ): Promise<string> {
    try {
      const response = await this.getFile(sysId);
      return await response.text();
    } catch (error) {
      handleServiceNowError(error as Error, "get attachment as text");
    }
  }

  /**
   * Get attachment file content as lines
   */
  async getFileAsLines(
    sysId: string,
    encoding: string = "utf-8",
    delimiter: string = "\n",
  ): Promise<string[]> {
    try {
      const text = await this.getFileAsText(sysId, encoding);
      return text.split(delimiter);
    } catch (error) {
      handleServiceNowError(error, "get attachment as lines");
    }
  }

  /**
   * Save attachment file to path (Node.js environment)
   */
  async saveToFile(sysId: string, filePath: string): Promise<string> {
    try {
      const response = await this.getFile(sysId);
      const buffer = Buffer.from(await response.arrayBuffer());

      // This would require fs module in Node.js
      // For now, return the buffer as base64
      return buffer.toString("base64");
    } catch (error) {
      handleServiceNowError(error, "save attachment to file");
    }
  }

  /**
   * Create temporary file from attachment
   */
  async asTempFile(sysId: string, chunkSize: number = 512): Promise<Blob> {
    try {
      return await this.getFileAsBlob(sysId);
    } catch (error) {
      handleServiceNowError(error, "create temp file from attachment");
    }
  }

  /**
   * Get attachment metadata with file stats
   */
  async getWithStats(
    sysId: string,
  ): Promise<ServiceNowRecord & { fileExists: boolean; accessible: boolean }> {
    try {
      const metadata = await this.get(sysId);
      if (!metadata) {
        return { fileExists: false, accessible: false } as any;
      }

      // Try to access the file to check if it's accessible
      try {
        const response = await fetch(`${this.attachmentUrl}/${sysId}/file`, {
          method: "HEAD",
          headers: this.headers,
        });

        return {
          ...metadata,
          fileExists: true,
          accessible: response.ok,
        };
      } catch {
        return {
          ...metadata,
          fileExists: true,
          accessible: false,
        };
      }
    } catch (error) {
      handleServiceNowError(error, "get attachment with stats");
    }
  }

  /**
   * Stream download for large files
   */
  async streamDownload(sysId: string): Promise<ReadableStream> {
    const operation = logger.operation(
      "stream_download_attachment",
      undefined,
      sysId,
      {
        apiId: this.apiId,
      },
    );

    try {
      const response = await this.getFile(sysId, true);

      if (!response.body) {
        throw new Error("Response body is not available for streaming");
      }

      operation.success("Attachment streaming started");
      return response.body;
    } catch (error) {
      operation.error("Stream download failed", error as Error);
      throw error;
    }
  }

  /**
   * Enable or disable caching
   */
  enableCaching(enabled: boolean): void {
    this.cachingEnabled = enabled;
    logger.info(
      `AttachmentAPI caching ${enabled ? "enabled" : "disabled"}`,
      "AttachmentAPI",
      {
        apiId: this.apiId,
      },
    );
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    return {
      ...this.stats,
      apiId: this.apiId,
      cachingEnabled: this.cachingEnabled,
      cacheSize: this.cachingEnabled ? cache.size() : 0,
    };
  }

  /**
   * Bulk delete attachments with parallel processing
   */
  async bulkDelete(sysIds: string[]): Promise<{
    deleted: number;
    errors: Array<{ sysId: string; error: string }>;
  }> {
    const operation = logger.operation(
      "bulk_delete_attachments",
      undefined,
      undefined,
      {
        apiId: this.apiId,
        attachmentCount: sysIds.length,
      },
    );

    const results = {
      deleted: 0,
      errors: [] as Array<{ sysId: string; error: string }>,
    };
    const concurrencyLimit = 5; // Limit concurrent deletes

    // Process in chunks to avoid overwhelming the server
    const chunks: string[][] = [];
    for (let i = 0; i < sysIds.length; i += concurrencyLimit) {
      chunks.push(sysIds.slice(i, i + concurrencyLimit));
    }

    try {
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (sysId) => {
          try {
            const success = await this.delete(sysId);
            if (success) {
              results.deleted++;
            }
            return { sysId, success };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            results.errors.push({ sysId, error: errorMessage });
            return { sysId, success: false, error: errorMessage };
          }
        });

        await Promise.all(chunkPromises);

        // Small delay between chunks to be respectful to the server
        if (chunks.indexOf(chunk) < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      operation.success("Bulk delete completed", {
        totalRequested: sysIds.length,
        deleted: results.deleted,
        errors: results.errors.length,
      });

      return results;
    } catch (error) {
      operation.error("Bulk delete failed", error as Error);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): any {
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
        cachingEnabled: this.cachingEnabled,
        apiId: this.apiId,
      },
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      uploads: 0,
      downloads: 0,
      deletes: 0,
      cacheHits: 0,
      totalSize: 0,
      averageResponseTime: 0,
      operationCount: 0,
    };

    logger.info("AttachmentAPI statistics reset", "AttachmentAPI", {
      apiId: this.apiId,
    });
  }
}
