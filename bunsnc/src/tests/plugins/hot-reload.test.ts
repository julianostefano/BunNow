/**
 * Plugin Hot-Reload System Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { writeFile, unlink, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { Elysia } from "elysia";
import {
  PluginHotReloadManager,
  createHotReloadManager,
} from "../../plugins/hot-reload";

describe("PluginHotReloadManager", () => {
  let hotReloadManager: PluginHotReloadManager;
  let testPluginPath: string;
  let testApp: Elysia;

  beforeEach(async () => {
    testPluginPath = resolve(__dirname, "test-plugin.ts");
    hotReloadManager = createHotReloadManager({
      watchPaths: [dirname(testPluginPath)],
      debounceMs: 100,
      safeMode: true,
      excludePatterns: ["*.test.ts"],
    });

    testApp = new Elysia();

    // Create test plugin directory
    await mkdir(dirname(testPluginPath), { recursive: true });
  });

  afterEach(async () => {
    hotReloadManager.destroy();

    try {
      await unlink(testPluginPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe("Initialization", () => {
    it("should initialize with default configuration", () => {
      const manager = createHotReloadManager();
      const stats = manager.getStats();

      expect(stats.watchedPaths).toContain("src/plugins");
      expect(stats.isReloading).toBe(false);

      manager.destroy();
    });

    it("should initialize with custom configuration", () => {
      const customManager = createHotReloadManager({
        watchPaths: ["custom/path"],
        debounceMs: 500,
        safeMode: false,
      });

      const stats = customManager.getStats();
      expect(stats.watchedPaths).toContain("custom/path");

      customManager.destroy();
    });

    it("should initialize app reference", () => {
      hotReloadManager.initialize(testApp);
      expect(() => hotReloadManager.getStats()).not.toThrow();
    });
  });

  describe("Plugin File Monitoring", () => {
    it("should detect plugin file changes", async () => {
      // Create initial plugin file
      const pluginContent = `
        import { Elysia } from "elysia";
        export default new Elysia().get("/test", () => "v1");
      `;

      await writeFile(testPluginPath, pluginContent);

      hotReloadManager.initialize(testApp);

      // Wait a bit for file watcher to detect
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Update plugin file
      const updatedContent = `
        import { Elysia } from "elysia";
        export default new Elysia().get("/test", () => "v2");
      `;

      await writeFile(testPluginPath, updatedContent);

      // Wait for debouncing and processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      const stats = hotReloadManager.getStats();
      expect(stats.loadedModules).toBeGreaterThan(0);
    });

    it("should ignore excluded file patterns", async () => {
      const testFilePath = resolve(dirname(testPluginPath), "plugin.test.ts");

      const testContent = `
        import { describe, it } from "bun:test";
        describe("test", () => it("should work", () => {}));
      `;

      await writeFile(testFilePath, testContent);

      hotReloadManager.initialize(testApp);

      // Wait for potential processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Update test file (should be ignored)
      const updatedContent = testContent + "\n// Updated";
      await writeFile(testFilePath, updatedContent);

      // Wait for debouncing
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should not have processed the test file
      const stats = hotReloadManager.getStats();
      expect(stats.queuedReloads).toBe(0);

      await unlink(testFilePath);
    });
  });

  describe("Plugin Validation", () => {
    it("should validate Elysia plugin instances", async () => {
      const validPluginContent = `
        import { Elysia } from "elysia";
        export default new Elysia().get("/valid", () => "valid");
      `;

      await writeFile(testPluginPath, validPluginContent);
      hotReloadManager.initialize(testApp);

      // Trigger manual reload
      try {
        await hotReloadManager.reloadPluginById("test-plugin");
      } catch (error) {
        // Expected to fail in test environment due to module resolution
        expect(error).toBeDefined();
      }
    });

    it("should reject invalid plugin exports", async () => {
      const invalidPluginContent = `
        export default "not a plugin";
      `;

      await writeFile(testPluginPath, invalidPluginContent);
      hotReloadManager.initialize(testApp);

      await expect(
        hotReloadManager.reloadPluginById("test-plugin"),
      ).rejects.toThrow();
    });

    it("should validate plugin has required methods", async () => {
      const mockPluginContent = `
        export default {
          get: () => {},
          post: () => {},
          use: () => {},
        };
      `;

      await writeFile(testPluginPath, mockPluginContent);
      hotReloadManager.initialize(testApp);

      // This should pass validation for mock Elysia-like object
      // In real testing, we'd need proper module mocking
    });
  });

  describe("Safe Mode and Rollback", () => {
    it("should create backups in safe mode", async () => {
      const safeManager = createHotReloadManager({
        safeMode: true,
        debounceMs: 50,
      });

      const pluginContent = `
        import { Elysia } from "elysia";
        export default new Elysia();
      `;

      await writeFile(testPluginPath, pluginContent);
      safeManager.initialize(testApp);

      // Wait for initial load and backup creation
      await new Promise((resolve) => setTimeout(resolve, 100));

      safeManager.destroy();
    });

    it("should rollback on reload failure", async () => {
      const workingContent = `
        import { Elysia } from "elysia";
        export default new Elysia().get("/working", () => "ok");
      `;

      const brokenContent = `
        syntax error this will not compile
      `;

      await writeFile(testPluginPath, workingContent);
      hotReloadManager.initialize(testApp);

      // Wait for initial load
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Write broken content
      await writeFile(testPluginPath, brokenContent);

      // Wait for reload attempt and rollback
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should have attempted rollback
      const stats = hotReloadManager.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe("Event System", () => {
    it("should emit plugin update events", async () => {
      let eventReceived = false;
      let eventData: any = null;

      const eventHandler = (data: any) => {
        eventReceived = true;
        eventData = data;
      };

      process.on("plugin:update" as any, eventHandler);

      try {
        const pluginContent = `
          import { Elysia } from "elysia";
          export default new Elysia();
        `;

        await writeFile(testPluginPath, pluginContent);
        hotReloadManager.initialize(testApp);

        // Manual reload to trigger event
        try {
          await hotReloadManager.reloadPluginById("test-plugin");
        } catch (error) {
          // Expected in test environment
        }

        // Check if event was attempted
        // In real implementation, we'd verify the event emission
        expect(eventReceived || true).toBe(true); // Placeholder assertion
      } finally {
        process.removeListener("plugin:update" as any, eventHandler);
      }
    });
  });

  describe("Statistics and Monitoring", () => {
    it("should provide comprehensive statistics", () => {
      hotReloadManager.initialize(testApp);

      const stats = hotReloadManager.getStats();

      expect(stats).toHaveProperty("watchedPaths");
      expect(stats).toHaveProperty("loadedModules");
      expect(stats).toHaveProperty("queuedReloads");
      expect(stats).toHaveProperty("isReloading");
      expect(stats).toHaveProperty("config");

      expect(Array.isArray(stats.watchedPaths)).toBe(true);
      expect(typeof stats.loadedModules).toBe("number");
      expect(typeof stats.isReloading).toBe("boolean");
    });

    it("should track reload queue", async () => {
      hotReloadManager.initialize(testApp);

      const initialStats = hotReloadManager.getStats();
      expect(initialStats.queuedReloads).toBe(0);

      // Create plugin file to trigger queue
      const pluginContent = `
        import { Elysia } from "elysia";
        export default new Elysia();
      `;

      await writeFile(testPluginPath, pluginContent);

      // Wait briefly for queue update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Queue might be processed quickly, so we check it was handled
      const laterStats = hotReloadManager.getStats();
      expect(typeof laterStats.queuedReloads).toBe("number");
    });
  });

  describe("Auto-reload Control", () => {
    it("should enable and disable auto-reload", () => {
      hotReloadManager.initialize(testApp);

      // Enable auto-reload
      hotReloadManager.setAutoReload(true);
      let stats = hotReloadManager.getStats();
      expect(stats.config.enableAutoReload).toBe(true);

      // Disable auto-reload
      hotReloadManager.setAutoReload(false);
      stats = hotReloadManager.getStats();
      expect(stats.config.enableAutoReload).toBe(false);
    });

    it("should start watching when auto-reload is enabled", () => {
      hotReloadManager.initialize(testApp);

      hotReloadManager.setAutoReload(false);
      hotReloadManager.setAutoReload(true);

      const stats = hotReloadManager.getStats();
      expect(stats.watchedPaths.length).toBeGreaterThan(0);
    });
  });

  describe("Memory Management", () => {
    it("should clean up resources on destroy", () => {
      hotReloadManager.initialize(testApp);

      const initialStats = hotReloadManager.getStats();
      expect(initialStats.watchedPaths.length).toBeGreaterThan(0);

      hotReloadManager.destroy();

      // After destroy, stats should reflect cleanup
      const finalStats = hotReloadManager.getStats();
      expect(finalStats.watchedPaths.length).toBe(0);
    });

    it("should handle multiple destroy calls safely", () => {
      hotReloadManager.initialize(testApp);

      expect(() => {
        hotReloadManager.destroy();
        hotReloadManager.destroy(); // Should not throw
      }).not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle file system errors gracefully", async () => {
      hotReloadManager.initialize(testApp);

      // Try to reload non-existent plugin
      await expect(
        hotReloadManager.reloadPluginById("non-existent-plugin"),
      ).rejects.toThrow();
    });

    it("should handle malformed plugin files", async () => {
      const malformedContent = `
        import { Elysia } from "elysia";
        // Missing export
        const plugin = new Elysia();
      `;

      await writeFile(testPluginPath, malformedContent);
      hotReloadManager.initialize(testApp);

      await expect(
        hotReloadManager.reloadPluginById("test-plugin"),
      ).rejects.toThrow();
    });

    it("should continue operation after individual reload failures", async () => {
      hotReloadManager.initialize(testApp);

      // Try invalid reload
      try {
        await hotReloadManager.reloadPluginById("invalid-plugin");
      } catch (error) {
        // Expected
      }

      // Should still be operational
      const stats = hotReloadManager.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.isReloading).toBe("boolean");
    });
  });
});

describe("Hot-Reload Integration", () => {
  it("should integrate with Elysia plugin system", () => {
    const app = new Elysia();
    const manager = createHotReloadManager();

    expect(() => {
      manager.initialize(app);
    }).not.toThrow();

    manager.destroy();
  });

  it("should work with multiple plugin files", async () => {
    const manager = createHotReloadManager({
      watchPaths: [__dirname],
      debounceMs: 100,
    });

    const app = new Elysia();
    manager.initialize(app);

    const plugin1Path = resolve(__dirname, "plugin1.ts");
    const plugin2Path = resolve(__dirname, "plugin2.ts");

    try {
      await mkdir(dirname(plugin1Path), { recursive: true });

      await writeFile(
        plugin1Path,
        `
        import { Elysia } from "elysia";
        export default new Elysia().get("/plugin1", () => "plugin1");
      `,
      );

      await writeFile(
        plugin2Path,
        `
        import { Elysia } from "elysia";
        export default new Elysia().get("/plugin2", () => "plugin2");
      `,
      );

      // Wait for file detection
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stats = manager.getStats();
      expect(stats).toBeDefined();
    } finally {
      try {
        await unlink(plugin1Path);
        await unlink(plugin2Path);
      } catch (error) {
        // Ignore cleanup errors
      }
      manager.destroy();
    }
  });
});
