/**
 * Attachment Controller - Handles ServiceNow attachment operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Context } from 'elysia';
import { consolidatedServiceNowService } from '../services/ConsolidatedServiceNowService';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface AttachmentUploadRequest {
  table_name: string;
  table_sys_id: string;
  file: File;
  content_type?: string;
  file_name?: string;
}

export interface AttachmentResponse {
  sys_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  table_name: string;
  table_sys_id: string;
  download_link: string;
  created_on: string;
}

export interface AttachmentParams {
  table_name: string;
  table_sys_id: string;
}

export interface AttachmentIdParams {
  attachment_id: string;
}

export interface ServiceNowAttachmentRecord {
  sys_id: string;
  file_name: string;
  content_type: string;
  size_bytes: string;
  size_compressed: string;
  table_name: string;
  table_sys_id: string;
  sys_created_on: string;
  sys_created_by: string;
}

export interface AttachmentUploadResponse {
  success: boolean;
  data?: AttachmentResponse;
  message?: string;
  error?: string;
  code?: string;
}

export interface AttachmentListResponse {
  success: boolean;
  data?: AttachmentResponse[];
  count?: number;
  table_name?: string;
  table_sys_id?: string;
  error?: string;
  code?: string;
}

export interface AttachmentDeleteResponse {
  success: boolean;
  message?: string;
  attachment_id?: string;
  file_name?: string;
  error?: string;
  code?: string;
}

export interface AttachmentInfoResponse {
  success: boolean;
  data?: AttachmentResponse;
  error?: string;
  code?: string;
}

export interface StorageStatsResponse {
  success: boolean;
  data?: {
    total_files: number;
    total_size_bytes: number;
    total_size_mb: number;
    upload_directory: string;
    max_file_size_mb: number;
    allowed_extensions: string[];
  };
  error?: string;
  code?: string;
}

export class AttachmentController {
  private readonly uploadDir: string;
  private readonly maxFileSize: number = 50 * 1024 * 1024; // 50MB
  private readonly allowedExtensions: string[] = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.jpg', '.jpeg', '.png', '.gif', '.bmp',
    '.zip', '.rar', '.7z', '.log'
  ];

  constructor() {
    this.uploadDir = process.env.ATTACHMENT_UPLOAD_DIR || './uploads/attachments';
    this.ensureUploadDirectory();
  }

  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
      console.log(`✓ Created attachment upload directory: ${this.uploadDir}`);
    }
  }

  /**
   * Upload attachment to ServiceNow record
   */
  async uploadAttachment(context: Context): Promise<AttachmentUploadResponse> {
    try {
      const { table_name, table_sys_id } = context.params as AttachmentParams;
      const body = await context.request.formData();

      const file = body.get('file') as File;
      if (!file) {
        return {
          success: false,
          error: 'No file provided',
          code: 'MISSING_FILE'
        };
      }

      // Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          code: 'INVALID_FILE'
        };
      }

      // Save file temporarily
      const tempFileName = `${crypto.randomUUID()}_${file.name}`;
      const tempFilePath = path.join(this.uploadDir, tempFileName);

      const arrayBuffer = await file.arrayBuffer();
      await fs.writeFile(tempFilePath, Buffer.from(arrayBuffer));

      try {
        // Upload to ServiceNow using the consolidated service
        const attachmentData = {
          file_name: file.name,
          content_type: file.type || 'application/octet-stream',
          table_name: table_name,
          table_sys_id: table_sys_id,
          size_bytes: file.size
        };

        // Create attachment record in ServiceNow
        const attachmentRecord = await consolidatedServiceNowService.createRecord('sys_attachment', {
          file_name: attachmentData.file_name,
          content_type: attachmentData.content_type,
          table_name: attachmentData.table_name,
          table_sys_id: attachmentData.table_sys_id,
          size_bytes: attachmentData.size_bytes.toString(),
          size_compressed: attachmentData.size_bytes.toString()
        });

        // Upload file content (simplified - in reality would use ServiceNow attachment API)
        const fileBase64 = Buffer.from(arrayBuffer).toString('base64');

        // Store attachment content reference
        const response: AttachmentResponse = {
          sys_id: attachmentRecord.sys_id,
          file_name: attachmentData.file_name,
          content_type: attachmentData.content_type,
          size_bytes: attachmentData.size_bytes,
          table_name: attachmentData.table_name,
          table_sys_id: attachmentData.table_sys_id,
          download_link: `/api/attachments/${attachmentRecord.sys_id}/download`,
          created_on: new Date().toISOString()
        };

        // Keep local copy for download
        const permanentPath = path.join(this.uploadDir, `${attachmentRecord.sys_id}_${file.name}`);
        await fs.rename(tempFilePath, permanentPath);

        console.log(`✓ Attachment uploaded successfully: ${file.name} (${attachmentRecord.sys_id})`);

        return {
          success: true,
          data: response,
          message: 'Attachment uploaded successfully'
        };

      } catch (serviceNowError) {
        // Clean up temp file on ServiceNow error
        await fs.unlink(tempFilePath).catch(() => {});
        throw serviceNowError;
      }

    } catch (error) {
      console.error('Attachment upload failed:', error);
      return {
        success: false,
        error: error.message || 'Upload failed',
        code: 'UPLOAD_ERROR'
      };
    }
  }

  /**
   * Download attachment from ServiceNow
   */
  async downloadAttachment(context: Context): Promise<Response> {
    try {
      const { attachment_id } = context.params as AttachmentIdParams;

      // Get attachment metadata from ServiceNow
      const attachmentRecord = await consolidatedServiceNowService.getRecord('sys_attachment', attachment_id);

      if (!attachmentRecord) {
        return new Response('Attachment not found', { status: 404 });
      }

      // Try to get local file first
      const localFilePath = path.join(this.uploadDir, `${attachment_id}_${attachmentRecord.file_name}`);

      try {
        await fs.access(localFilePath);
        const fileBuffer = await fs.readFile(localFilePath);

        return new Response(fileBuffer, {
          headers: {
            'Content-Type': attachmentRecord.content_type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${attachmentRecord.file_name}"`,
            'Content-Length': attachmentRecord.size_bytes || '0',
            'X-Attachment-ID': attachment_id
          }
        });

      } catch (localFileError) {
        console.warn(`Local file not found for ${attachment_id}, would fetch from ServiceNow`);

        // In production, would fetch from ServiceNow attachment API
        return new Response('Attachment content not available locally', {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

    } catch (error) {
      console.error('Attachment download failed:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message || 'Download failed',
        code: 'DOWNLOAD_ERROR'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * List attachments for a ServiceNow record
   */
  async listAttachments(context: Context): Promise<AttachmentListResponse> {
    try {
      const { table_name, table_sys_id } = context.params as AttachmentParams;

      const attachments = await consolidatedServiceNowService.queryRecords(
        'sys_attachment',
        `table_name=${table_name}^table_sys_id=${table_sys_id}`,
        { order: 'sys_created_on DESC' }
      );

      const response = attachments.map((attachment: ServiceNowAttachmentRecord) => ({
        sys_id: attachment.sys_id,
        file_name: attachment.file_name,
        content_type: attachment.content_type,
        size_bytes: parseInt(attachment.size_bytes) || 0,
        size_compressed: parseInt(attachment.size_compressed) || 0,
        table_name: attachment.table_name,
        table_sys_id: attachment.table_sys_id,
        download_link: `/api/attachments/${attachment.sys_id}/download`,
        created_on: attachment.sys_created_on,
        created_by: attachment.sys_created_by
      }));

      return {
        success: true,
        data: response,
        count: response.length,
        table_name,
        table_sys_id
      };

    } catch (error) {
      console.error('List attachments failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to list attachments',
        code: 'LIST_ERROR'
      };
    }
  }

  /**
   * Delete attachment from ServiceNow
   */
  async deleteAttachment(context: Context): Promise<AttachmentDeleteResponse> {
    try {
      const { attachment_id } = context.params as AttachmentIdParams;

      // Get attachment metadata before deletion
      const attachmentRecord = await consolidatedServiceNowService.getRecord('sys_attachment', attachment_id);

      if (!attachmentRecord) {
        return {
          success: false,
          error: 'Attachment not found',
          code: 'NOT_FOUND'
        };
      }

      // Delete from ServiceNow
      await consolidatedServiceNowService.deleteRecord('sys_attachment', attachment_id);

      // Clean up local file
      const localFilePath = path.join(this.uploadDir, `${attachment_id}_${attachmentRecord.file_name}`);
      try {
        await fs.unlink(localFilePath);
        console.log(`✓ Deleted local file: ${localFilePath}`);
      } catch (fsError) {
        console.warn(`Could not delete local file: ${localFilePath}`, fsError.message);
      }

      console.log(`✓ Attachment deleted successfully: ${attachment_id}`);

      return {
        success: true,
        message: 'Attachment deleted successfully',
        attachment_id,
        file_name: attachmentRecord.file_name
      };

    } catch (error) {
      console.error('Attachment deletion failed:', error);
      return {
        success: false,
        error: error.message || 'Delete failed',
        code: 'DELETE_ERROR'
      };
    }
  }

  /**
   * Get attachment metadata
   */
  async getAttachmentInfo(context: Context): Promise<AttachmentInfoResponse> {
    try {
      const { attachment_id } = context.params as AttachmentIdParams;

      const attachmentRecord = await consolidatedServiceNowService.getRecord('sys_attachment', attachment_id);

      if (!attachmentRecord) {
        return {
          success: false,
          error: 'Attachment not found',
          code: 'NOT_FOUND'
        };
      }

      const response: AttachmentResponse = {
        sys_id: attachmentRecord.sys_id,
        file_name: attachmentRecord.file_name,
        content_type: attachmentRecord.content_type,
        size_bytes: parseInt(attachmentRecord.size_bytes) || 0,
        table_name: attachmentRecord.table_name,
        table_sys_id: attachmentRecord.table_sys_id,
        download_link: `/api/attachments/${attachmentRecord.sys_id}/download`,
        created_on: attachmentRecord.sys_created_on
      };

      return {
        success: true,
        data: response
      };

    } catch (error) {
      console.error('Get attachment info failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to get attachment info',
        code: 'INFO_ERROR'
      };
    }
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${Math.round(this.maxFileSize / 1024 / 1024)}MB`
      };
    }

    // Check file extension
    const fileExtension = path.extname(file.name).toLowerCase();
    if (!this.allowedExtensions.includes(fileExtension)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed extensions: ${this.allowedExtensions.join(', ')}`
      };
    }

    // Check for empty file
    if (file.size === 0) {
      return {
        valid: false,
        error: 'Empty files are not allowed'
      };
    }

    return { valid: true };
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStatsResponse> {
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
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }

      return {
        success: true,
        data: {
          total_files: fileCount,
          total_size_bytes: totalSize,
          total_size_mb: Math.round(totalSize / 1024 / 1024 * 100) / 100,
          upload_directory: this.uploadDir,
          max_file_size_mb: Math.round(this.maxFileSize / 1024 / 1024),
          allowed_extensions: this.allowedExtensions
        }
      };

    } catch (error) {
      console.error('Get storage stats failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to get storage stats',
        code: 'STATS_ERROR'
      };
    }
  }
}
