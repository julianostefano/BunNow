/**
 * Security utilities for encryption and credential management
 * TypeScript implementation compatible with Python Fernet encryption
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";

interface EncryptedData {
  [key: string]: any;
}

export class SecurityService {
  private readonly algorithm = "aes-256-cbc";
  private readonly keyDerivationSalt = "servicenow_auth_salt";
  private readonly iterations = 100000;
  private key: Buffer;

  constructor() {
    this.key = this.createKey();
  }

  private createKey(): Buffer {
    try {
      const encryptionKey =
        process.env.ENCRYPTION_KEY ||
        "default-encryption-key-change-in-production";

      // If key is already 32 bytes (256 bits), use it directly
      if (encryptionKey.length === 32) {
        return Buffer.from(encryptionKey);
      }

      // Derive key using PBKDF2 (compatible with Python implementation)
      return pbkdf2Sync(
        encryptionKey,
        this.keyDerivationSalt,
        this.iterations,
        32, // 256 bits
        "sha256",
      );
    } catch (error: unknown) {
      console.error("Failed to create encryption key:", error);
      throw error;
    }
  }

  /**
   * Encrypt string data using AES-256-CBC
   */
  encrypt(data: string): string {
    try {
      const iv = randomBytes(16);
      const cipher = createCipheriv(this.algorithm, this.key, iv);
      let encrypted = cipher.update(data, "utf8", "base64");
      encrypted += cipher.final("base64");

      // Combine IV and encrypted data
      const combined = Buffer.concat([iv, Buffer.from(encrypted, "base64")]);
      return combined.toString("base64");
    } catch (error: unknown) {
      console.error("Encryption failed:", error);
      throw error;
    }
  }

  /**
   * Decrypt string data
   */
  decrypt(encryptedData: string): string {
    try {
      const combined = Buffer.from(encryptedData, "base64");
      const iv = combined.slice(0, 16);
      const encrypted = combined.slice(16);

      const decipher = createDecipheriv(this.algorithm, this.key, iv);
      let decrypted = decipher.update(encrypted, undefined, "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error: unknown) {
      console.error("Decryption failed:", error);
      throw error;
    }
  }

  /**
   * Encrypt sensitive fields in a dictionary
   */
  encryptDict(data: EncryptedData): EncryptedData {
    const sensitiveFields = new Set([
      "password",
      "secret",
      "token",
      "key",
      "credentials",
    ]);
    const encryptedData: EncryptedData = {};

    for (const [key, value] of Object.entries(data)) {
      const isSecretField = Array.from(sensitiveFields).some((field) =>
        key.toLowerCase().includes(field),
      );

      if (isSecretField && typeof value === "string") {
        encryptedData[key] = this.encrypt(value);
        encryptedData[`${key}_encrypted`] = true;
      } else {
        encryptedData[key] = value;
      }
    }

    return encryptedData;
  }

  /**
   * Decrypt sensitive fields in a dictionary
   */
  decryptDict(data: EncryptedData): EncryptedData {
    const decryptedData: EncryptedData = {};

    for (const [key, value] of Object.entries(data)) {
      if (key.endsWith("_encrypted")) {
        continue;
      }

      const encryptedKey = `${key}_encrypted`;
      if (
        encryptedKey in data &&
        data[encryptedKey] &&
        typeof value === "string"
      ) {
        try {
          decryptedData[key] = this.decrypt(value);
        } catch (error: unknown) {
          console.warn(`Failed to decrypt field: ${key}`, error);
          decryptedData[key] = value;
        }
      } else {
        decryptedData[key] = value;
      }
    }

    return decryptedData;
  }

  /**
   * Generate a new encryption key
   */
  static generateKey(): string {
    return randomBytes(32).toString("base64");
  }

  /**
   * Generate a random secret
   */
  static generateSecret(length: number = 32): string {
    return randomBytes(length).toString("base64url");
  }

  /**
   * Mask sensitive data for logging
   */
  maskSensitiveData(data: EncryptedData): EncryptedData {
    const sensitiveFields = new Set([
      "password",
      "secret",
      "token",
      "key",
      "credentials",
    ]);
    const maskedData: EncryptedData = {};

    for (const [key, value] of Object.entries(data)) {
      const isSecretField = Array.from(sensitiveFields).some((field) =>
        key.toLowerCase().includes(field),
      );

      if (isSecretField && typeof value === "string") {
        maskedData[key] = value ? "*".repeat(Math.min(value.length, 8)) : null;
      } else {
        maskedData[key] = value;
      }
    }

    return maskedData;
  }

  /**
   * Test encryption/decryption functionality
   */
  test(): boolean {
    try {
      const testData = "test-encryption-data";
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);

      return testData === decrypted;
    } catch (error: unknown) {
      console.error("Encryption test failed:", error);
      return false;
    }
  }
}

// Export singleton instance
export const securityService = new SecurityService();

// Verify encryption is working on initialization
if (!securityService.test()) {
  console.error(
    "❌ Security service initialization failed - encryption test failed",
  );
} else {
  console.log("🔐 Security service initialized successfully");
}
