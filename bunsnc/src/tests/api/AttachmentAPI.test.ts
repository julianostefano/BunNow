/**
 * AttachmentAPI Tests - Comprehensive test suite for attachment operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { AttachmentAPI, AttachmentConfig } from '../../api/AttachmentAPI';
import type { ServiceNowRecord, AttachmentRecord } from '../../types/servicenow';
import { Logger } from '../../utils/Logger';
import { performanceMonitor } from '../../utils/PerformanceMonitor';

// Mock ServiceNowClient
class MockServiceNowClient {
  private attachments: Map<string, AttachmentRecord> = new Map();
  private records: Map<string, ServiceNowRecord> = new Map();

  constructor() {
    // Mock incident record
    this.records.set('incident123', {
      sys_id: 'incident123',
      short_description: 'Test incident',
      state: '1'
    });

    // Mock attachments
    this.attachments.set('attachment1', {
      sys_id: 'attachment1',
      file_name: 'test.txt',
      content_type: 'text/plain',
      size_bytes: 1024,
      table_name: 'incident',
      table_sys_id: 'incident123'
    });

    this.attachments.set('attachment2', {
      sys_id: 'attachment2',
      file_name: 'image.jpg',
      content_type: 'image/jpeg',
      size_bytes: 2048,
      table_name: 'incident',
      table_sys_id: 'incident123'
    });
  }

  async query(options: any): Promise<ServiceNowRecord[]> {
    if (options.table === 'sys_attachment') {
      return Array.from(this.attachments.values()).filter(att => {
        if (options.query?.includes('table_sys_id=')) {
          const tableId = options.query.split('table_sys_id=')[1]?.split('^')[0];
          return att.table_sys_id === tableId;
        }
        return true;
      });
    }
    return [];
  }

  async create(table: string, data: any): Promise<ServiceNowRecord> {
    if (table === 'sys_attachment') {
      const newAttachment: AttachmentRecord = {
        sys_id: `new_${Date.now()}`,
        file_name: data.file_name,
        content_type: data.content_type,
        size_bytes: data.size_bytes || 0,
        table_name: data.table_name,
        table_sys_id: data.table_sys_id
      };
      this.attachments.set(newAttachment.sys_id, newAttachment);
      return newAttachment;
    }
    throw new Error('Invalid table');
  }

  async delete(table: string, sysId: string): Promise<boolean> {
    if (table === 'sys_attachment') {
      return this.attachments.delete(sysId);
    }
    return false;
  }

  async getById(table: string, sysId: string): Promise<ServiceNowRecord | null> {
    if (table === 'sys_attachment') {
      return this.attachments.get(sysId) || null;
    }
    return this.records.get(sysId) || null;
  }

  async downloadAttachment(sysId: string): Promise<Buffer> {
    return Buffer.from(`Mock content for ${sysId}`);
  }
}

describe('AttachmentAPI', () => {
  let attachmentAPI: AttachmentAPI;
  let mockClient: MockServiceNowClient;
  let consoleSpy: any;

  beforeEach(() => {
    mockClient = new MockServiceNowClient();
    attachmentAPI = new AttachmentAPI(mockClient as any);
    
    // Mock console methods
    consoleSpy = mock(() => {});
    console.log = consoleSpy;
    console.error = consoleSpy;
    console.warn = consoleSpy;
    
    // Clear metrics
    performanceMonitor.clearMetrics();
  });

  afterEach(() => {
    attachmentAPI.destroy();
  });

  describe('Attachment Configuration', () => {
    test('should create AttachmentAPI with default configuration', () => {
      const defaultAttachment = new AttachmentAPI(mockClient as any);
      
      expect(defaultAttachment).toBeTruthy();
      
      defaultAttachment.destroy();
    });

    test('should create AttachmentAPI with custom configuration', () => {
      const config: AttachmentConfig = {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'text/plain'],
        chunkSize: 1024 * 1024, // 1MB chunks
        enableStreaming: true,
        enableCompression: true,
        enableCaching: true,
        enableProgressTracking: true,
        maxConcurrentUploads: 3
      };

      const customAttachment = new AttachmentAPI(mockClient as any, config);
      
      expect(customAttachment).toBeTruthy();
      
      customAttachment.destroy();
    });
  });

  describe('File Upload Operations', () => {
    test('should upload file successfully', async () => {
      const fileContent = Buffer.from('Hello, World!');
      const fileName = 'test.txt';
      const contentType = 'text/plain';

      const attachment = await attachmentAPI.uploadFile(
        'incident',
        'incident123',
        fileContent,
        fileName,
        contentType
      );

      expect(attachment).toBeTruthy();
      expect(attachment.sys_id).toBeTruthy();
      expect(attachment.file_name).toBe(fileName);
      expect(attachment.content_type).toBe(contentType);
      expect(attachment.table_name).toBe('incident');
      expect(attachment.table_sys_id).toBe('incident123');
    });

    test('should handle large file upload with chunking', async () => {
      const largeContent = Buffer.alloc(5 * 1024 * 1024, 'A'); // 5MB file
      const fileName = 'large-file.txt';
      
      const config: AttachmentConfig = {
        chunkSize: 1024 * 1024, // 1MB chunks
        enableStreaming: true
      };
      const streamingAttachment = new AttachmentAPI(mockClient as any, config);

      const attachment = await streamingAttachment.uploadFile(
        'incident',
        'incident123',
        largeContent,
        fileName,
        'text/plain'
      );

      expect(attachment).toBeTruthy();
      expect(attachment.file_name).toBe(fileName);
      expect(attachment.size_bytes).toBe(largeContent.length);
      
      streamingAttachment.destroy();
    });

    test('should validate file size limits', async () => {
      const config: AttachmentConfig = {
        maxFileSize: 1024 // 1KB limit
      };
      const limitedAttachment = new AttachmentAPI(mockClient as any, config);

      const largeContent = Buffer.alloc(2048, 'A'); // 2KB file (exceeds limit)
      
      await expect(
        limitedAttachment.uploadFile(
          'incident',
          'incident123',
          largeContent,
          'large.txt',
          'text/plain'
        )
      ).rejects.toThrow();
      
      limitedAttachment.destroy();
    });

    test('should validate MIME types', async () => {
      const config: AttachmentConfig = {
        allowedMimeTypes: ['text/plain'] // Only allow text files
      };
      const restrictedAttachment = new AttachmentAPI(mockClient as any, config);

      const content = Buffer.from('image data');
      
      await expect(
        restrictedAttachment.uploadFile(
          'incident',
          'incident123',
          content,
          'image.jpg',
          'image/jpeg' // Not allowed
        )
      ).rejects.toThrow();
      
      restrictedAttachment.destroy();
    });
  });

  describe('File Download Operations', () => {
    test('should download file successfully', async () => {
      const content = await attachmentAPI.downloadFile('attachment1');

      expect(content).toBeTruthy();
      expect(Buffer.isBuffer(content)).toBe(true);
    });

    test('should handle download errors gracefully', async () => {
      const downloadSpy = mock(() => Promise.reject(new Error('File not found')));
      (mockClient as any).downloadAttachment = downloadSpy;

      await expect(
        attachmentAPI.downloadFile('nonexistent')
      ).rejects.toThrow('File not found');
    });

    test('should cache downloaded files when enabled', async () => {
      const config: AttachmentConfig = {
        enableCaching: true
      };
      const cachingAttachment = new AttachmentAPI(mockClient as any, config);

      // First download - should call service
      const content1 = await cachingAttachment.downloadFile('attachment1');
      
      // Second download - should use cache
      const content2 = await cachingAttachment.downloadFile('attachment1');

      expect(content1).toEqual(content2);
      
      cachingAttachment.destroy();
    });
  });

  describe('Attachment Metadata Operations', () => {
    test('should list attachments for record', async () => {
      const attachments = await attachmentAPI.listAttachments('incident', 'incident123');

      expect(attachments).toHaveLength(2);
      expect(attachments[0].file_name).toBe('test.txt');
      expect(attachments[1].file_name).toBe('image.jpg');
    });

    test('should get attachment metadata', async () => {
      const metadata = await attachmentAPI.getAttachmentMetadata('attachment1');

      expect(metadata).toBeTruthy();
      expect(metadata.file_name).toBe('test.txt');
      expect(metadata.content_type).toBe('text/plain');
      expect(metadata.size_bytes).toBe(1024);
    });

    test('should filter attachments by content type', async () => {
      const textAttachments = await attachmentAPI.listAttachments(
        'incident', 
        'incident123',
        { contentType: 'text/plain' }
      );

      expect(textAttachments).toHaveLength(1);
      expect(textAttachments[0].file_name).toBe('test.txt');
    });

    test('should filter attachments by size', async () => {
      const smallAttachments = await attachmentAPI.listAttachments(
        'incident', 
        'incident123',
        { maxSize: 1500 }
      );

      expect(smallAttachments).toHaveLength(1);
      expect(smallAttachments[0].file_name).toBe('test.txt');
    });
  });

  describe('Attachment Delete Operations', () => {
    test('should delete attachment successfully', async () => {
      const result = await attachmentAPI.deleteAttachment('attachment1');

      expect(result).toBe(true);
    });

    test('should handle deletion of non-existent attachment', async () => {
      const result = await attachmentAPI.deleteAttachment('nonexistent');

      expect(result).toBe(false);
    });

    test('should delete multiple attachments', async () => {
      const results = await attachmentAPI.deleteMultipleAttachments([
        'attachment1',
        'attachment2',
        'nonexistent'
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(false);
    });
  });

  describe('Bulk Operations', () => {
    test('should handle bulk upload', async () => {
      const files = [
        {
          content: Buffer.from('File 1'),
          fileName: 'bulk1.txt',
          contentType: 'text/plain'
        },
        {
          content: Buffer.from('File 2'),
          fileName: 'bulk2.txt',
          contentType: 'text/plain'
        },
        {
          content: Buffer.from('File 3'),
          fileName: 'bulk3.txt',
          contentType: 'text/plain'
        }
      ];

      const results = await attachmentAPI.bulkUpload('incident', 'incident123', files);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.attachment?.file_name).toBe(files[index].fileName);
      });
    });

    test('should handle concurrent upload limits', async () => {
      const config: AttachmentConfig = {
        maxConcurrentUploads: 2
      };
      const concurrentAttachment = new AttachmentAPI(mockClient as any, config);

      const files = Array.from({ length: 5 }, (_, i) => ({
        content: Buffer.from(`File ${i + 1}`),
        fileName: `concurrent${i + 1}.txt`,
        contentType: 'text/plain'
      }));

      const results = await concurrentAttachment.bulkUpload('incident', 'incident123', files);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);
      
      concurrentAttachment.destroy();
    });
  });

  describe('Performance Monitoring', () => {
    test('should track upload performance metrics', async () => {
      const monitoringAttachment = new AttachmentAPI(mockClient as any, {
        enablePerformanceMonitoring: true
      });

      const content = Buffer.from('Performance test content');
      
      await monitoringAttachment.uploadFile(
        'incident',
        'incident123',
        content,
        'perf-test.txt',
        'text/plain'
      );

      const metrics = performanceMonitor.getRealTimeMetrics();
      expect(metrics.length).toBeGreaterThan(0);
      
      monitoringAttachment.destroy();
    });

    test('should generate performance reports', async () => {
      const reportingAttachment = new AttachmentAPI(mockClient as any, {
        enablePerformanceMonitoring: true
      });

      const files = Array.from({ length: 3 }, (_, i) => 
        Buffer.from(`Performance test ${i + 1}`)
      );

      for (let i = 0; i < files.length; i++) {
        await reportingAttachment.uploadFile(
          'incident',
          'incident123',
          files[i],
          `perf${i + 1}.txt`,
          'text/plain'
        );
      }

      const report = reportingAttachment.getPerformanceReport();
      
      expect(report).toBeTruthy();
      expect(report.totalUploads).toBe(3);
      expect(report.totalBytesTransferred).toBeGreaterThan(0);
      expect(report.averageUploadSpeed).toBeGreaterThan(0);
      
      reportingAttachment.destroy();
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors during upload', async () => {
      const failingMockClient = {
        ...mockClient,
        create: mock(() => Promise.reject(new Error('Network error')))
      };

      const errorAttachment = new AttachmentAPI(failingMockClient as any);

      const content = Buffer.from('Test content');
      
      await expect(
        errorAttachment.uploadFile(
          'incident',
          'incident123',
          content,
          'error-test.txt',
          'text/plain'
        )
      ).rejects.toThrow('Network error');
      
      errorAttachment.destroy();
    });

    test('should validate file names', async () => {
      const content = Buffer.from('Valid content');
      
      await expect(
        attachmentAPI.uploadFile(
          'incident',
          'incident123',
          content,
          '', // Empty filename
          'text/plain'
        )
      ).rejects.toThrow();
    });
  });

  describe('Memory Management', () => {
    test('should manage memory efficiently during large uploads', async () => {
      const memoryAttachment = new AttachmentAPI(mockClient as any, {
        chunkSize: 1024, // Small chunks for memory efficiency
        enableStreaming: true
      });

      const largeContent = Buffer.alloc(10 * 1024, 'M'); // 10KB
      const initialMemory = process.memoryUsage().heapUsed;
      
      await memoryAttachment.uploadFile(
        'incident',
        'incident123',
        largeContent,
        'memory-test.txt',
        'text/plain'
      );
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024); // Less than 20MB
      
      memoryAttachment.destroy();
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should cleanup resources properly', () => {
      const resourceAttachment = new AttachmentAPI(mockClient as any);
      
      expect(() => {
        resourceAttachment.destroy();
      }).not.toThrow();
    });

    test('should handle multiple destroy calls gracefully', () => {
      const multipleAttachment = new AttachmentAPI(mockClient as any);
      
      expect(() => {
        multipleAttachment.destroy();
        multipleAttachment.destroy();
        multipleAttachment.destroy();
      }).not.toThrow();
    });
  });
});