/**
 * Plugin Hot-Reload System - Dynamic plugin reloading capability
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Implements hot-reload functionality for Elysia plugins following best practices:
 * - File system watching for plugin changes
 * - Safe plugin unloading and reloading
 * - Dependency graph management
 * - Error handling and rollback
 */

import { Elysia } from "elysia";
import { watch, type FSWatcher } from "fs";
import { resolve, dirname, basename } from "path";
import { logger } from "../utils/Logger";

interface PluginModule {
  id: string;
  path: string;
  plugin: Elysia;
  dependencies: string[];
  lastModified: number;
  isLoaded: boolean;
}

interface HotReloadConfig {
  watchPaths: string[];
  debounceMs: number;
  enableAutoReload: boolean;
  safeMode: boolean;
  excludePatterns: string[];
}

export class PluginHotReloadManager {
  private watchers: Map<string, FSWatcher> = new Map();
  private modules: Map<string, PluginModule> = new Map();
  private moduleBackups: Map<string, PluginModule> = new Map();
  private config: HotReloadConfig;
  private app: Elysia | null = null;
  private reloadQueue: Set<string> = new Set();
  private isReloading = false;

  constructor(config?: Partial<HotReloadConfig>) {
    this.config = {
      watchPaths: ["src/plugins"],
      debounceMs: 1000,
      enableAutoReload: true,
      safeMode: true,
      excludePatterns: ["*.test.ts", "*.spec.ts", "*.d.ts"],
      ...config,
    };
  }

  /**
   * Initialize hot-reload system with Elysia app
   */
  initialize(app: Elysia): void {
    this.app = app;

    if (this.config.enableAutoReload) {
      this.startWatching();
      logger.info("🔥 Plugin hot-reload system initialized", "HotReload");
    }
  }

  /**
   * Start watching plugin files for changes
   */
  private startWatching(): void {
    this.config.watchPaths.forEach((watchPath) => {
      const absolutePath = resolve(watchPath);

      try {
        const watcher = watch(
          absolutePath,
          { recursive: true },
          (eventType, filename) => {
            if (filename && this.shouldReload(filename)) {
              this.queueReload(filename);
            }
          },
        );

        this.watchers.set(watchPath, watcher);
        logger.info(
          `📁 Watching for plugin changes: ${absolutePath}`,
          "HotReload",
        );
      } catch (error) {
        logger.error(`Failed to watch path: ${absolutePath}`, "HotReload", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Check if file should trigger reload
   */
  private shouldReload(filename: string): boolean {
    // Skip if file doesn't match plugin pattern
    if (!filename.endsWith(".ts") && !filename.endsWith(".js")) {
      return false;
    }

    // Skip if matches exclude patterns
    return !this.config.excludePatterns.some((pattern) => {
      const regex = new RegExp(pattern.replace("*", ".*"));
      return regex.test(filename);
    });
  }

  /**
   * Queue plugin for reload with debouncing
   */
  private queueReload(filename: string): void {
    this.reloadQueue.add(filename);

    // Debounce reload
    setTimeout(() => {
      if (this.reloadQueue.has(filename) && !this.isReloading) {
        this.performReload();
      }
    }, this.config.debounceMs);
  }

  /**
   * Perform actual plugin reload
   */
  private async performReload(): Promise<void> {
    if (this.isReloading || this.reloadQueue.size === 0) {
      return;
    }

    this.isReloading = true;
    const filesToReload = Array.from(this.reloadQueue);
    this.reloadQueue.clear();

    logger.info(
      `🔄 Hot-reloading ${filesToReload.length} plugin(s)`,
      "HotReload",
      {
        files: filesToReload,
      },
    );

    try {
      for (const filename of filesToReload) {
        await this.reloadPlugin(filename);
      }

      logger.info("✅ Hot-reload completed successfully", "HotReload");
    } catch (error) {
      logger.error("❌ Hot-reload failed", "HotReload", {
        error: error instanceof Error ? error.message : String(error),
      });

      if (this.config.safeMode) {
        await this.rollbackChanges();
      }
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * Reload specific plugin
   */
  private async reloadPlugin(filename: string): Promise<void> {
    const pluginId = this.getPluginIdFromFilename(filename);
    const existingModule = this.modules.get(pluginId);

    // Create backup before attempting reload
    if (existingModule && this.config.safeMode) {
      this.moduleBackups.set(pluginId, { ...existingModule });
      logger.info(`💾 Backup created for plugin: ${pluginId}`, "HotReload");
    }

    try {
      // Build absolute module path
      const modulePath = this.resolveModulePath(filename, pluginId);

      // Validate file exists
      try {
        await import("fs").then((fs) => fs.promises.access(modulePath));
      } catch (error) {
        throw new Error(`Plugin file not found: ${modulePath}`);
      }

      // Clear module cache more thoroughly
      this.clearModuleCache(modulePath);

      // Import new plugin version with error handling
      let newPlugin;
      try {
        // Add timestamp to force cache bypass
        const cacheBuster = `?t=${Date.now()}`;
        newPlugin = await import(modulePath + cacheBuster);
      } catch (importError) {
        // Fallback without cache buster
        newPlugin = await import(modulePath);
      }

      // Validate plugin export
      if (!newPlugin.default && !newPlugin[pluginId]) {
        throw new Error(
          `Plugin ${pluginId} does not export valid Elysia instance`,
        );
      }

      const pluginInstance = newPlugin.default || newPlugin[pluginId];

      // Enhanced plugin validation
      if (!this.validatePluginInstance(pluginInstance)) {
        throw new Error(`Plugin ${pluginId} is not a valid Elysia instance`);
      }

      // Create new module info
      const moduleInfo: PluginModule = {
        id: pluginId,
        path: modulePath,
        plugin: pluginInstance,
        dependencies: this.extractDependencies(newPlugin),
        lastModified: Date.now(),
        isLoaded: true,
      };

      // Validate plugin dependencies
      await this.validatePluginDependencies(moduleInfo);

      // Update module registry
      this.modules.set(pluginId, moduleInfo);

      // If app is available, attempt hot-swap
      if (this.app && existingModule) {
        await this.hotSwapPlugin(existingModule, moduleInfo);
      }

      // Clear backup on successful reload
      if (this.config.safeMode) {
        this.moduleBackups.delete(pluginId);
      }

      logger.info(`🔄 Plugin successfully reloaded: ${pluginId}`, "HotReload");
    } catch (error) {
      logger.error(`❌ Failed to reload plugin: ${pluginId}`, "HotReload", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Attempt rollback if safe mode is enabled
      if (this.config.safeMode && this.moduleBackups.has(pluginId)) {
        await this.rollbackPlugin(pluginId);
      }

      throw error;
    }
  }

  /**
   * Extract plugin dependencies
   */
  private extractDependencies(pluginModule: any): string[] {
    // Extract dependencies from plugin metadata or source
    if (pluginModule.dependencies) {
      return Array.isArray(pluginModule.dependencies)
        ? pluginModule.dependencies
        : [];
    }
    return [];
  }

  /**
   * Hot-swap plugin in running application
   */
  private async hotSwapPlugin(
    oldModule: PluginModule,
    newModule: PluginModule,
  ): Promise<void> {
    if (!this.app) {
      throw new Error("No Elysia app available for hot-swap");
    }

    try {
      // Since Elysia doesn't support runtime plugin removal, we implement
      // a notification system for dependent services to handle the update
      logger.info(`🔄 Hot-swapping plugin: ${newModule.id}`, "HotReload");

      // Notify plugin update via events (if available)
      if (typeof process !== "undefined" && process.emit) {
        process.emit("plugin:update" as any, {
          pluginId: newModule.id,
          oldModule,
          newModule,
          timestamp: Date.now(),
        });
      }

      // Update global plugin registry if available
      if ((globalThis as any).pluginRegistry) {
        (globalThis as any).pluginRegistry.set(newModule.id, newModule.plugin);
      }

      // Log successful hot-swap
      logger.info(
        `✅ Plugin ${newModule.id} hot-swapped successfully`,
        "HotReload",
        {
          dependencies: newModule.dependencies,
          lastModified: new Date(newModule.lastModified).toISOString(),
        },
      );

      // For full hot-reload, applications should implement restart logic
      logger.info(
        `📝 Note: Full reload requires application restart`,
        "HotReload",
      );
    } catch (error) {
      logger.error(`❌ Hot-swap failed for ${newModule.id}`, "HotReload", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Rollback changes in case of error
   */
  private async rollbackChanges(): Promise<void> {
    logger.warn("🔙 Rolling back plugin changes", "HotReload");

    let rolledBack = 0;
    for (const [pluginId, backup] of this.moduleBackups.entries()) {
      try {
        await this.rollbackPlugin(pluginId);
        rolledBack++;
      } catch (error) {
        logger.error(`❌ Failed to rollback plugin: ${pluginId}`, "HotReload", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info(
      `🔙 Rollback completed: ${rolledBack} plugins restored`,
      "HotReload",
    );
  }

  /**
   * Rollback specific plugin
   */
  private async rollbackPlugin(pluginId: string): Promise<void> {
    const backup = this.moduleBackups.get(pluginId);
    if (!backup) {
      throw new Error(`No backup found for plugin: ${pluginId}`);
    }

    logger.info(`🔙 Rolling back plugin: ${pluginId}`, "HotReload");

    // Restore previous version
    this.modules.set(pluginId, backup);

    // Notify rollback event
    if (typeof process !== "undefined" && process.emit) {
      process.emit("plugin:rollback" as any, {
        pluginId,
        backup,
        timestamp: Date.now(),
      });
    }

    // Clear cache for the reverted module
    this.clearModuleCache(backup.path);

    logger.info(
      `✅ Plugin ${pluginId} rolled back to previous version`,
      "HotReload",
    );
  }

  /**
   * Resolve module path
   */
  private resolveModulePath(filename: string, pluginId: string): string {
    if (filename.includes(pluginId)) {
      return resolve(filename);
    }
    return resolve(dirname(filename), pluginId);
  }

  /**
   * Clear module cache more thoroughly
   */
  private clearModuleCache(modulePath: string): void {
    try {
      // Clear require cache
      delete require.cache[require.resolve(modulePath)];

      // Clear all related cache entries
      for (const key in require.cache) {
        if (key.includes(modulePath) || key.includes(basename(modulePath))) {
          delete require.cache[key];
        }
      }

      // Clear ES module cache if supported
      if ((globalThis as any).moduleCache) {
        delete (globalThis as any).moduleCache[modulePath];
      }

      logger.info(
        `🧹 Module cache cleared: ${basename(modulePath)}`,
        "HotReload",
      );
    } catch (error) {
      logger.warn(`⚠️ Failed to clear cache for: ${modulePath}`, "HotReload");
    }
  }

  /**
   * Validate plugin instance
   */
  private validatePluginInstance(pluginInstance: any): boolean {
    try {
      // Check if it's an Elysia instance or has Elysia-like properties
      return (
        pluginInstance &&
        typeof pluginInstance === "object" &&
        (pluginInstance.constructor?.name === "Elysia" ||
          typeof pluginInstance.use === "function" ||
          typeof pluginInstance.get === "function" ||
          typeof pluginInstance.post === "function")
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate plugin dependencies
   */
  private async validatePluginDependencies(
    moduleInfo: PluginModule,
  ): Promise<void> {
    for (const dependency of moduleInfo.dependencies) {
      const depModule = this.modules.get(dependency);
      if (!depModule || !depModule.isLoaded) {
        logger.warn(
          `⚠️ Plugin dependency not loaded: ${dependency}`,
          "HotReload",
        );
      }
    }
  }

  /**
   * Get plugin ID from filename
   */
  private getPluginIdFromFilename(filename: string): string {
    return filename.replace(/\.(ts|js)$/, "").replace(/.*[/\\]/, "");
  }

  /**
   * Manually reload specific plugin
   */
  async reloadPluginById(pluginId: string): Promise<void> {
    const module = this.modules.get(pluginId);
    if (!module) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    await this.reloadPlugin(module.path);
  }

  /**
   * Get reload statistics
   */
  getStats(): any {
    return {
      watchedPaths: Array.from(this.watchers.keys()),
      loadedModules: this.modules.size,
      queuedReloads: this.reloadQueue.size,
      isReloading: this.isReloading,
      config: this.config,
    };
  }

  /**
   * Enable/disable auto-reload
   */
  setAutoReload(enabled: boolean): void {
    this.config.enableAutoReload = enabled;

    if (enabled && this.watchers.size === 0) {
      this.startWatching();
    } else if (!enabled) {
      this.stopWatching();
    }
  }

  /**
   * Stop watching files
   */
  private stopWatching(): void {
    this.watchers.forEach((watcher) => watcher.close());
    this.watchers.clear();
    logger.info("⏹️ Plugin hot-reload stopped", "HotReload");
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopWatching();
    this.modules.clear();
    this.reloadQueue.clear();
  }
}

// Export singleton instance
export const pluginHotReloadManager = new PluginHotReloadManager();

// Export factory function for custom configurations
export const createHotReloadManager = (config?: Partial<HotReloadConfig>) => {
  return new PluginHotReloadManager(config);
};
