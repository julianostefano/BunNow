/**
 * SAML Configuration Manager - Reuses Existing MongoDB Infrastructure
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { mongoClient } from "../../config/mongodb";
import { securityService } from "../SecurityService";
import { SAMLConfig, SAMLAuthenticationData } from "../../types/saml";

export interface SAMLStorageConfig {
  instance: string;
  username: string;
  encryptedPassword: string;
  baseUrl: string;
  proxy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SAMLStorageAuthData {
  instance: string;
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
  }>;
  headers: Record<string, string>;
  userToken?: string;
  userAgent?: string;
  sessionId?: string;
  createdAt: Date;
  expiresAt?: Date;
  lastValidated?: Date;
  validationStatus: string;
}

export class SAMLConfigManager {
  private readonly configKeyPrefix = "saml_config_";
  private readonly authDataKeyPrefix = "saml_auth_";

  constructor() {
    console.log(
      "🔐 SAMLConfigManager initialized with existing MongoDB infrastructure",
    );
  }

  /**
   * Save SAML configuration using existing MongoDB client
   */
  async saveConfig(
    config: SAMLConfig,
  ): Promise<{ status: string; message: string; instance: string }> {
    try {
      await mongoClient.connect();

      const storageConfig: SAMLStorageConfig = {
        instance: config.instance,
        username: config.username,
        encryptedPassword: securityService.encrypt(config.password),
        baseUrl: config.baseUrl,
        proxy: config.proxy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const configKey = `${this.configKeyPrefix}${config.instance}`;

      await mongoClient.setConfig(
        configKey,
        storageConfig,
        `SAML configuration for ${config.instance}`,
      );

      console.log("💾 SAML configuration saved using existing MongoDB", {
        instance: config.instance,
        username: config.username,
        configKey,
      });

      return {
        status: "success",
        message: "Configuration saved successfully",
        instance: config.instance,
      };
    } catch (error) {
      console.error("❌ Failed to save SAML configuration:", error);
      throw error;
    }
  }

  /**
   * Get SAML configuration using existing MongoDB client
   */
  async getConfig(instance?: string): Promise<SAMLConfig | null> {
    try {
      await mongoClient.connect();

      let configKey: string;
      if (instance) {
        configKey = `${this.configKeyPrefix}${instance}`;
      } else {
        // Get the first available config if no instance specified
        const allConfigs = await mongoClient.getAllConfigs();
        const samlConfig = allConfigs.find((config) =>
          config.key.startsWith(this.configKeyPrefix),
        );

        if (!samlConfig) {
          return null;
        }

        configKey = samlConfig.key;
      }

      const storageConfig = (await mongoClient.getConfig(
        configKey,
      )) as SAMLStorageConfig;

      if (!storageConfig) {
        return null;
      }

      return {
        username: storageConfig.username,
        password: securityService.decrypt(storageConfig.encryptedPassword),
        baseUrl: storageConfig.baseUrl,
        instance: storageConfig.instance,
        proxy: storageConfig.proxy,
      };
    } catch (error) {
      console.error("❌ Failed to get SAML configuration:", error);
      return null;
    }
  }

  /**
   * Save SAML authentication data using existing MongoDB client
   */
  async saveAuthData(
    instance: string,
    authData: SAMLAuthenticationData,
  ): Promise<void> {
    try {
      await mongoClient.connect();

      const storageAuthData: SAMLStorageAuthData = {
        instance,
        cookies: authData.cookies,
        headers: authData.headers,
        userToken: authData.userToken,
        userAgent: authData.userAgent,
        sessionId: authData.sessionId,
        createdAt: authData.createdAt,
        expiresAt: authData.expiresAt,
        lastValidated: authData.lastValidated,
        validationStatus: authData.validationStatus,
      };

      const authKey = `${this.authDataKeyPrefix}${instance}`;

      await mongoClient.setConfig(
        authKey,
        storageAuthData,
        `SAML authentication data for ${instance}`,
      );

      console.log("✅ SAML authentication data saved using existing MongoDB", {
        instance,
        cookiesCount: authData.cookies.length,
        hasUserToken: !!authData.userToken,
        authKey,
      });
    } catch (error) {
      console.error("❌ Failed to save SAML authentication data:", error);
      throw error;
    }
  }

  /**
   * Get SAML authentication data using existing MongoDB client
   */
  async getAuthData(instance?: string): Promise<SAMLAuthenticationData | null> {
    try {
      await mongoClient.connect();

      let authKey: string;
      if (instance) {
        authKey = `${this.authDataKeyPrefix}${instance}`;
      } else {
        // Get the first available auth data if no instance specified
        const allConfigs = await mongoClient.getAllConfigs();
        const authConfig = allConfigs.find((config) =>
          config.key.startsWith(this.authDataKeyPrefix),
        );

        if (!authConfig) {
          return null;
        }

        authKey = authConfig.key;
      }

      const storageAuthData = (await mongoClient.getConfig(
        authKey,
      )) as SAMLStorageAuthData;

      if (!storageAuthData) {
        return null;
      }

      return {
        cookies: storageAuthData.cookies,
        headers: storageAuthData.headers,
        userToken: storageAuthData.userToken,
        userAgent: storageAuthData.userAgent,
        sessionId: storageAuthData.sessionId,
        createdAt: storageAuthData.createdAt,
        expiresAt: storageAuthData.expiresAt,
        lastValidated: storageAuthData.lastValidated,
        validationStatus: storageAuthData.validationStatus,
      };
    } catch (error) {
      console.error("❌ Failed to get SAML authentication data:", error);
      return null;
    }
  }

  /**
   * Mark authentication error using existing MongoDB client
   */
  async markError(instance: string, errorMessage: string): Promise<void> {
    try {
      await mongoClient.connect();

      const errorKey = `saml_error_${instance}`;
      const errorData = {
        instance,
        errorMessage,
        timestamp: new Date(),
        count: 1,
      };

      // Try to get existing error data to increment count
      const existingError = (await mongoClient.getConfig(errorKey)) as any;
      if (existingError) {
        errorData.count = (existingError.count || 0) + 1;
      }

      await mongoClient.setConfig(
        errorKey,
        errorData,
        `SAML error tracking for ${instance}`,
      );

      console.log(
        "⚠️ SAML authentication error marked using existing MongoDB",
        {
          instance,
          error: errorMessage,
          count: errorData.count,
        },
      );
    } catch (error) {
      console.error("❌ Failed to mark SAML authentication error:", error);
      throw error;
    }
  }

  /**
   * Check if MongoDB connection is healthy
   */
  async ping(): Promise<boolean> {
    try {
      return await mongoClient.healthCheck();
    } catch {
      return false;
    }
  }

  /**
   * List all SAML configurations
   */
  async listConfigs(): Promise<string[]> {
    try {
      await mongoClient.connect();
      const allConfigs = await mongoClient.getAllConfigs();

      return allConfigs
        .filter((config) => config.key.startsWith(this.configKeyPrefix))
        .map((config) => config.key.replace(this.configKeyPrefix, ""));
    } catch (error) {
      console.error("❌ Failed to list SAML configurations:", error);
      return [];
    }
  }

  /**
   * Remove SAML configuration and auth data for instance
   */
  async removeInstance(instance: string): Promise<void> {
    try {
      await mongoClient.connect();

      const configKey = `${this.configKeyPrefix}${instance}`;
      const authKey = `${this.authDataKeyPrefix}${instance}`;
      const errorKey = `saml_error_${instance}`;

      // MongoDB client doesn't have delete method, so we'll set to null
      // This is a limitation we can address if needed
      await mongoClient.setConfig(configKey, null, "Deleted SAML config");
      await mongoClient.setConfig(authKey, null, "Deleted SAML auth data");
      await mongoClient.setConfig(errorKey, null, "Deleted SAML error data");

      console.log("🗑️ SAML instance data removed:", { instance });
    } catch (error) {
      console.error("❌ Failed to remove SAML instance data:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const samlConfigManager = new SAMLConfigManager();
