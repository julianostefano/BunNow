/**
 * Environment Variables Preloader
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * CRITICAL: This file MUST be loaded BEFORE any other imports via bunfig.toml preload
 *
 * Why needed:
 * - Bun's bunfig.toml env-file loads .env in [run] section
 * - Preload executes BEFORE [run], so process.env is empty
 * - Some services (proxy, auth) need env vars during import
 *
 * Solution:
 * - Manually parse .env and set process.env BEFORE any imports
 * - This ensures ALL modules have access to environment variables
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Determine .env file path relative to this file
const envPath = join(import.meta.dir, "../.env");

if (existsSync(envPath)) {
  try {
    const envContent = readFileSync(envPath, "utf-8");

    // Parse .env file line by line
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) return;

      // Parse KEY=VALUE format
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) return;

      const key = trimmed.substring(0, equalsIndex).trim();
      let value = trimmed.substring(equalsIndex + 1).trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Set environment variable (don't override existing ones)
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    });

    console.log("✅ [env-preload] Environment variables loaded from .env");
    console.log(
      `   Loaded vars: CORPORATE_PROXY_USER=${process.env.CORPORATE_PROXY_USER ? "***" : "NOT_SET"}`,
    );
    console.log(
      `   Loaded vars: CORPORATE_PROXY_PASSWORD=${process.env.CORPORATE_PROXY_PASSWORD ? "***" : "NOT_SET"}`,
    );
  } catch (error) {
    console.error("❌ [env-preload] Failed to load .env:", error);
  }
} else {
  console.warn(`⚠️ [env-preload] .env file not found at: ${envPath}`);
  console.warn("   Application will use system environment variables only");
}
