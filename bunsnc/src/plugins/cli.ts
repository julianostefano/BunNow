/**
 * CLI Plugin - Elysia plugin for command-line interface integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Dependency injection via .decorate()
 * - Shared service instances para evitar duplicação
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 * - CLI command processing via dependency injection
 *
 * Integra CLI commands com ServiceNow operations usando plugin system
 */

import { Elysia } from "elysia";
import { Command } from "commander";
import {
  consolidatedServiceNowService,
  serviceNowAuthClient,
  ConsolidatedServiceNowService
} from "../services";
import { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import { ServiceNowClient } from "../client/ServiceNowClient";
import type { ServiceNowRecord } from "../types/servicenow";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Types para Eden Treaty
export interface CLIPluginContext {
  cliCommander: Command;
  serviceNowClient: ServiceNowClient;
  consolidatedService: ConsolidatedServiceNowService;
  authClient: ServiceNowAuthClient;
  executeCommand: (command: string, args: string[]) => Promise<any>;
  createRecord: (table: string, data: any) => Promise<ServiceNowRecord>;
  readRecord: (table: string, sysId: string) => Promise<ServiceNowRecord | null>;
  updateRecord: (table: string, sysId: string, data: any) => Promise<ServiceNowRecord>;
  deleteRecord: (table: string, sysId: string) => Promise<boolean>;
  executeBatch: (operations: any[]) => Promise<any>;
  uploadAttachment: (table: string, sysId: string, file: File) => Promise<string>;
  downloadAttachment: (attachmentId: string) => Promise<ArrayBuffer>;
  authenticateUser: (username: string, password: string) => Promise<any>;
  getEnvVar: (key: string, fallback?: string) => string;
}

export interface CLICommandOptions {
  table?: string;
  sysId?: string;
  data?: string;
  operations?: string;
  file?: string;
  destination?: string;
  username?: string;
  password?: string;
  output?: 'json' | 'table' | 'csv';
  verbose?: boolean;
}

/**
 * CLI Plugin - Separate Instance Method pattern
 * Provides command-line interface functionality through dependency injection
 */
export const cliPlugin = new Elysia({
  name: "servicenow-cli-plugin",
  seed: {
    cliCommander: {} as Command,
    serviceNowClient: {} as ServiceNowClient,
    consolidatedService: {} as ConsolidatedServiceNowService,
    authClient: {} as ServiceNowAuthClient,
    executeCommand: {} as CLIPluginContext["executeCommand"],
    createRecord: {} as CLIPluginContext["createRecord"],
    readRecord: {} as CLIPluginContext["readRecord"],
    updateRecord: {} as CLIPluginContext["updateRecord"],
    deleteRecord: {} as CLIPluginContext["deleteRecord"],
    executeBatch: {} as CLIPluginContext["executeBatch"],
    uploadAttachment: {} as CLIPluginContext["uploadAttachment"],
    downloadAttachment: {} as CLIPluginContext["downloadAttachment"],
    authenticateUser: {} as CLIPluginContext["authenticateUser"],
    getEnvVar: {} as CLIPluginContext["getEnvVar"],
  },
})
  // Lifecycle Hook: onStart - Initialize CLI Services
  .onStart(async () => {
    console.log("CLI Plugin starting - initializing command-line interface services");
  })

  // Dependency Injection: Create service instances
  .derive(async () => {
    // Initialize services via dependency injection
    const consolidatedService = consolidatedServiceNowService;
    const authClient = serviceNowAuthClient;

    // Initialize ServiceNow client
    const instanceUrl = process.env.SNC_INSTANCE_URL || "";
    const authToken = process.env.SNC_AUTH_TOKEN || "";

    const serviceNowClient = new ServiceNowClient({
      instance: instanceUrl,
      auth: authToken,
    });

    // Initialize commander instance
    const cliCommander = new Command();
    cliCommander
      .name("bunsnc")
      .description("CLI para ServiceNow via Bun/Elysia")
      .version("2.2.0");

    return {
      consolidatedService,
      authClient,
      serviceNowClient,
      cliCommander
    };
  })

  // Environment variable access method
  .decorate(
    "getEnvVar",
    function (key: string, fallback: string = ""): string {
      return process.env[key] || fallback;
    }
  )

  // Authentication command method
  .decorate(
    "authenticateUser",
    async function (
      this: { authClient: ServiceNowAuthClient },
      username: string,
      password: string
    ): Promise<any> {
      try {
        return await this.authClient.authenticate(username, password);
      } catch (error: any) {
        console.error("CLI Plugin: Authentication failed:", error.message);
        return { success: false, error: error.message };
      }
    }
  )

  // Create record command method
  .decorate(
    "createRecord",
    async function (
      this: { consolidatedService: ConsolidatedServiceNowService },
      table: string,
      data: any
    ): Promise<ServiceNowRecord> {
      try {
        const result = await this.consolidatedService.create(table, data);
        return result;
      } catch (error: any) {
        console.error("CLI Plugin: Create record failed:", error.message);
        throw error;
      }
    }
  )

  // Read record command method
  .decorate(
    "readRecord",
    async function (
      this: { consolidatedService: ConsolidatedServiceNowService },
      table: string,
      sysId: string
    ): Promise<ServiceNowRecord | null> {
      try {
        const result = await this.consolidatedService.read(table, sysId);
        return result;
      } catch (error: any) {
        console.error("CLI Plugin: Read record failed:", error.message);
        return null;
      }
    }
  )

  // Update record command method
  .decorate(
    "updateRecord",
    async function (
      this: { consolidatedService: ConsolidatedServiceNowService },
      table: string,
      sysId: string,
      data: any
    ): Promise<ServiceNowRecord> {
      try {
        const result = await this.consolidatedService.update(table, sysId, data);
        return result;
      } catch (error: any) {
        console.error("CLI Plugin: Update record failed:", error.message);
        throw error;
      }
    }
  )

  // Delete record command method
  .decorate(
    "deleteRecord",
    async function (
      this: { consolidatedService: ConsolidatedServiceNowService },
      table: string,
      sysId: string
    ): Promise<boolean> {
      try {
        const result = await this.consolidatedService.delete(table, sysId);
        return result;
      } catch (error: any) {
        console.error("CLI Plugin: Delete record failed:", error.message);
        return false;
      }
    }
  )

  // Batch operations command method
  .decorate(
    "executeBatch",
    async function (
      this: { consolidatedService: ConsolidatedServiceNowService },
      operations: any[]
    ): Promise<any> {
      try {
        const result = await this.consolidatedService.executeBatch(operations);
        return result;
      } catch (error: any) {
        console.error("CLI Plugin: Batch execution failed:", error.message);
        throw error;
      }
    }
  )

  // Upload attachment command method
  .decorate(
    "uploadAttachment",
    async function (
      this: { consolidatedService: ConsolidatedServiceNowService },
      table: string,
      sysId: string,
      file: File
    ): Promise<string> {
      try {
        const result = await this.consolidatedService.upload(table, sysId, file);
        return result;
      } catch (error: any) {
        console.error("CLI Plugin: Upload attachment failed:", error.message);
        throw error;
      }
    }
  )

  // Download attachment command method
  .decorate(
    "downloadAttachment",
    async function (
      this: { consolidatedService: ConsolidatedServiceNowService },
      attachmentId: string
    ): Promise<ArrayBuffer> {
      try {
        const result = await this.consolidatedService.download(attachmentId);
        return result;
      } catch (error: any) {
        console.error("CLI Plugin: Download attachment failed:", error.message);
        throw error;
      }
    }
  )

  // Main command execution method
  .decorate(
    "executeCommand",
    async function (
      this: {
        cliCommander: Command;
        authenticateUser: CLIPluginContext["authenticateUser"];
        createRecord: CLIPluginContext["createRecord"];
        readRecord: CLIPluginContext["readRecord"];
        updateRecord: CLIPluginContext["updateRecord"];
        deleteRecord: CLIPluginContext["deleteRecord"];
        executeBatch: CLIPluginContext["executeBatch"];
        uploadAttachment: CLIPluginContext["uploadAttachment"];
        downloadAttachment: CLIPluginContext["downloadAttachment"];
        getEnvVar: CLIPluginContext["getEnvVar"];
      },
      command: string,
      args: string[]
    ): Promise<any> {
      try {
        // Setup CLI commands with dependency injection if not already done
        if (this.cliCommander.commands.length === 0) {
          this.setupCommands();
        }

        // Execute the command
        return await this.cliCommander.parseAsync([command, ...args]);
      } catch (error: any) {
        console.error("CLI Plugin: Command execution failed:", error.message);
        throw error;
      }
    }
  )

  // Setup CLI commands with dependency injection
  .decorate(
    "setupCommands",
    function (
      this: {
        cliCommander: Command;
        authenticateUser: CLIPluginContext["authenticateUser"];
        createRecord: CLIPluginContext["createRecord"];
        readRecord: CLIPluginContext["readRecord"];
        updateRecord: CLIPluginContext["updateRecord"];
        deleteRecord: CLIPluginContext["deleteRecord"];
        executeBatch: CLIPluginContext["executeBatch"];
        uploadAttachment: CLIPluginContext["uploadAttachment"];
        downloadAttachment: CLIPluginContext["downloadAttachment"];
        getEnvVar: CLIPluginContext["getEnvVar"];
      }
    ): void {
      // Login command
      this.cliCommander
        .command("login")
        .description("Realiza login e retorna token")
        .requiredOption("-u, --username <username>")
        .requiredOption("-p, --password <password>")
        .action(async (opts) => {
          const { username, password } = opts;
          const result = await this.authenticateUser(username, password);
          console.log(JSON.stringify(result, null, 2));
        });

      // Create record command
      this.cliCommander
        .command("record <table>")
        .description("Cria um novo registro em uma tabela")
        .option("-d, --data <json>", "Dados em JSON", "{}")
        .action(async (table, opts) => {
          const data = JSON.parse(opts.data);
          const result = await this.createRecord(table, data);
          console.log(JSON.stringify(result, null, 2));
        });

      // Read record command
      this.cliCommander
        .command("read <table> <sysId>")
        .description("Lê um registro pelo sysId")
        .action(async (table, sysId) => {
          const result = await this.readRecord(table, sysId);
          console.log(JSON.stringify(result, null, 2));
        });

      // Update record command
      this.cliCommander
        .command("update <table> <sysId>")
        .description("Atualiza um registro pelo sysId")
        .option("-d, --data <json>", "Dados em JSON", "{}")
        .action(async (table, sysId, opts) => {
          const data = JSON.parse(opts.data);
          const result = await this.updateRecord(table, sysId, data);
          console.log(JSON.stringify(result, null, 2));
        });

      // Delete record command
      this.cliCommander
        .command("delete <table> <sysId>")
        .description("Remove um registro pelo sysId")
        .action(async (table, sysId) => {
          const result = await this.deleteRecord(table, sysId);
          console.log(JSON.stringify({ success: result }, null, 2));
        });

      // Batch operations command
      this.cliCommander
        .command("batch")
        .description("Executa múltiplas operações em lote")
        .requiredOption("-o, --operations <json>", "Array de operações em JSON")
        .action(async (opts) => {
          const operations = JSON.parse(opts.operations);
          const result = await this.executeBatch(operations);
          console.log(JSON.stringify(result, null, 2));
        });

      // Upload attachment command
      this.cliCommander
        .command("upload <table> <sysId> <file>")
        .description("Faz upload de anexo para um registro")
        .action(async (table, sysId, filePath) => {
          const fs = await import("fs/promises");
          const fileBuffer = await fs.readFile(filePath);
          const uint8 = new Uint8Array(fileBuffer);
          const fileName = filePath.split("/").pop() || "upload.bin";
          const fileObj = new File([uint8], fileName);
          const result = await this.uploadAttachment(table, sysId, fileObj);
          console.log(JSON.stringify({ attachmentId: result }, null, 2));
        });

      // Download attachment command
      this.cliCommander
        .command("download <attachmentId> <dest>")
        .description("Faz download de anexo pelo attachmentId")
        .action(async (attachmentId, dest) => {
          const data = await this.downloadAttachment(attachmentId);
          const fs = await import("fs/promises");
          await fs.writeFile(dest, Buffer.from(data));
          console.log(JSON.stringify({ message: `Arquivo salvo em ${dest}` }, null, 2));
        });
    }
  )

  // Lifecycle Hook: onStop - Cleanup CLI resources
  .onStop(async () => {
    console.log("CLI Plugin stopping - cleanup completed");
  })

  // CLI health check endpoint
  .get(
    "/cli/health",
    async ({ consolidatedService, authClient, serviceNowClient }) => {
      try {
        // Check service availability
        const servicesHealth = {
          consolidatedService: !!consolidatedService,
          authClient: !!authClient,
          serviceNowClient: !!serviceNowClient,
          environment: {
            instanceUrl: !!process.env.SNC_INSTANCE_URL,
            authToken: !!process.env.SNC_AUTH_TOKEN,
          }
        };

        return {
          success: true,
          result: {
            status: "healthy",
            plugin: "servicenow-cli-plugin",
            services: servicesHealth,
            version: "2.2.0",
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          plugin: "servicenow-cli-plugin",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "CLI Plugin Health Check",
        description: "Check health of CLI plugin and associated services",
        tags: ["Health", "Plugin", "CLI"],
      },
    }
  )

  // CLI commands list endpoint
  .get(
    "/cli/commands",
    ({ cliCommander }) => {
      try {
        const commands = cliCommander.commands.map(cmd => ({
          name: cmd.name(),
          description: cmd.description(),
          options: cmd.options.map(opt => ({
            flags: opt.flags,
            description: opt.description,
            required: opt.required,
          })),
        }));

        return {
          success: true,
          result: {
            commands,
            totalCommands: commands.length,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "CLI Commands List",
        description: "Get list of available CLI commands",
        tags: ["CLI", "Commands", "Documentation"],
      },
    }
  )

  // Execute CLI command via HTTP endpoint
  .post(
    "/cli/execute",
    async ({ executeCommand, body }) => {
      try {
        const { command, args = [] } = body as { command: string; args?: string[] };

        if (!command) {
          return {
            success: false,
            error: "Command is required",
            timestamp: new Date().toISOString(),
          };
        }

        const result = await executeCommand(command, args);

        return {
          success: true,
          result: {
            command,
            args,
            output: result,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Execute CLI Command",
        description: "Execute CLI command via HTTP interface",
        tags: ["CLI", "Execute", "Command"],
      },
    }
  );

// Export plugin context type for Eden Treaty
export type CLIPluginApp = typeof cliPlugin;

// Functional Callback Method pattern - for conditional use
export const createCLIPlugin = (config?: {
  enableHttpInterface?: boolean;
  enableCommandRegistration?: boolean;
  defaultOutput?: 'json' | 'table' | 'csv';
}) => {
  return (app: Elysia) =>
    app.use(cliPlugin).onStart(() => {
      console.log("CLI Plugin applied - command-line interface available via dependency injection");
      console.log("ServiceNow CLI commands integrated with plugin system");
    });
};

// Export types for other modules
export type {
  CLICommandOptions,
  ServiceNowRecord,
};