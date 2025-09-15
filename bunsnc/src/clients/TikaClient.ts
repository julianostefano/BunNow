/**
 * Apache Tika Client - Integração com Tika Server
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from '../utils/Logger';

export interface TikaResponse {
  content: string;
  metadata: TikaMetadata;
  language?: string;
  title?: string;
}

export interface TikaMetadata {
  'Content-Type'?: string;
  'Content-Length'?: string;
  'Creation-Date'?: string;
  'Last-Modified'?: string;
  'Last-Save-Date'?: string;
  'Application-Name'?: string;
  'Application-Version'?: string;
  'Author'?: string;
  'Company'?: string;
  'Page-Count'?: string;
  'Word-Count'?: string;
  'Character Count'?: string;
  [key: string]: string | undefined;
}

export class TikaClient {
  private tikaUrl: string;
  private timeout: number;

  constructor(tikaUrl?: string, timeout: number = 30000) {
    this.tikaUrl = tikaUrl || process.env.TIKA_SERVER_URL || 'http://localhost:9999';
    this.timeout = timeout;
    logger.info(`📄 [TikaClient] Initialized with URL: ${this.tikaUrl}`);
  }

  async extractText(fileBuffer: Buffer, mimeType?: string): Promise<string> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'text/plain'
      };

      if (mimeType) {
        headers['Content-Type'] = mimeType;
      }

      const response = await fetch(`${this.tikaUrl}/tika`, {
        method: 'PUT',
        body: fileBuffer,
        headers,
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Tika extraction failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      logger.debug(` [TikaClient] Extracted ${text.length} characters`);
      return text;

    } catch (error) {
      logger.error(' [TikaClient] Text extraction failed:', error);
      throw error;
    }
  }

  async extractMetadata(fileBuffer: Buffer, mimeType?: string): Promise<TikaMetadata> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };

      if (mimeType) {
        headers['Content-Type'] = mimeType;
      }

      const response = await fetch(`${this.tikaUrl}/meta`, {
        method: 'PUT',
        body: fileBuffer,
        headers,
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Tika metadata extraction failed: ${response.status} ${response.statusText}`);
      }

      const metadata = await response.json();
      logger.debug(` [TikaClient] Extracted metadata with ${Object.keys(metadata).length} fields`);
      return metadata;

    } catch (error) {
      logger.error(' [TikaClient] Metadata extraction failed:', error);
      throw error;
    }
  }

  async extractFull(fileBuffer: Buffer, mimeType?: string): Promise<TikaResponse> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };

      if (mimeType) {
        headers['Content-Type'] = mimeType;
      }

      const response = await fetch(`${this.tikaUrl}/rmeta/text`, {
        method: 'PUT',
        body: fileBuffer,
        headers,
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Tika full extraction failed: ${response.status} ${response.statusText}`);
      }

      const results = await response.json();

      if (Array.isArray(results) && results.length > 0) {
        const result = results[0];
        return {
          content: result['X-TIKA:content'] || '',
          metadata: result,
          language: result['language'],
          title: result['title'] || result['dc:title']
        };
      }

      throw new Error('No results returned from Tika');

    } catch (error) {
      logger.error(' [TikaClient] Full extraction failed:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.tikaUrl}/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      const isHealthy = response.ok;
      if (isHealthy) {
        const version = await response.text();
        logger.debug(` [TikaClient] Health check passed - Version: ${version.trim()}`);
      }

      return isHealthy;

    } catch (error) {
      logger.error(' [TikaClient] Health check failed:', error);
      return false;
    }
  }

  detectMimeType(fileName: string, fileBuffer: Buffer): string {
    const extension = fileName.split('.').pop()?.toLowerCase();

    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'rtf': 'application/rtf',
      'html': 'text/html',
      'xml': 'application/xml',
      'csv': 'text/csv',
      'json': 'application/json',
      'msg': 'application/vnd.ms-outlook',
      'eml': 'message/rfc822',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'tiff': 'image/tiff',
      'bmp': 'image/bmp'
    };

    return extension && mimeTypes[extension]
      ? mimeTypes[extension]
      : 'application/octet-stream';
  }

  getServerInfo(): { url: string; timeout: number } {
    return {
      url: this.tikaUrl,
      timeout: this.timeout
    };
  }
}

export default TikaClient;