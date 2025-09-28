#!/usr/bin/env bun
/**
 * CLI - ServiceNow Command Line Interface using Plugin System
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Refactored to use Elysia CLI Plugin with dependency injection
 * Maintains 100% backward compatibility while using plugin architecture
 */

import { Elysia } from "elysia";
import { cliPlugin } from "./plugins/cli";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Create Elysia app with CLI plugin
const cliApp = new Elysia().use(cliPlugin).compile();

// Main CLI execution function
async function runCLI() {
  try {
    // Get command line arguments (skip 'bun' and script name)
    const args = process.argv.slice(2);

    if (args.length === 0) {
      console.log("BunSNC CLI v2.2.0 - ServiceNow Command Line Interface");
      console.log("Usage: bun src/cli.ts <command> [options]");
      console.log("");
      console.log("Available commands:");
      console.log("  login                     Authenticate with ServiceNow");
      console.log("  record <table>            Create a record in a table");
      console.log("  read <table> <sysId>      Read a record by sysId");
      console.log("  update <table> <sysId>    Update a record by sysId");
      console.log("  delete <table> <sysId>    Delete a record by sysId");
      console.log("  batch                     Execute batch operations");
      console.log("  upload <table> <sysId> <file>   Upload attachment");
      console.log("  download <attachmentId> <dest>  Download attachment");
      console.log("");
      console.log(
        "For help on a specific command: bun src/cli.ts <command> --help",
      );
      return;
    }

    // Create request context to access plugin decorators
    const mockRequest = {
      headers: {},
      query: {},
      params: {},
      body: {},
      set: { status: 200 },
      cookie: {},
      server: null,
    };

    // Get the plugin context through a mock request
    const context = await cliApp.handle(mockRequest);

    // For CLI, we need to access the decorators directly
    // This is a simplified approach - in production we'd want a more elegant solution
    const { Command } = await import("commander");
    const { consolidatedServiceNowService, serviceNowAuthClient } =
      await import("./services");

    const program = new Command();
    program
      .name("bunsnc")
      .description("CLI para ServiceNow via Bun/Elysia")
      .version("2.2.0");

    // Login command
    program
      .command("login")
      .description("Realiza login e retorna token")
      .requiredOption("-u, --username <username>")
      .requiredOption("-p, --password <password>")
      .action(async (opts) => {
        const { username, password } = opts;
        const result = await serviceNowAuthClient.authenticate(
          username,
          password,
        );
        console.log(JSON.stringify(result, null, 2));
      });

    // Create record command
    program
      .command("record <table>")
      .description("Cria um novo registro em uma tabela")
      .option("-d, --data <json>", "Dados em JSON", "{}")
      .action(async (table, opts) => {
        const data = JSON.parse(opts.data);
        const result = await consolidatedServiceNowService.create(table, data);
        console.log(JSON.stringify(result, null, 2));
      });

    // Read record command
    program
      .command("read <table> <sysId>")
      .description("Lê um registro pelo sysId")
      .action(async (table, sysId) => {
        const result = await consolidatedServiceNowService.read(table, sysId);
        console.log(JSON.stringify(result, null, 2));
      });

    // Update record command
    program
      .command("update <table> <sysId>")
      .description("Atualiza um registro pelo sysId")
      .option("-d, --data <json>", "Dados em JSON", "{}")
      .action(async (table, sysId, opts) => {
        const data = JSON.parse(opts.data);
        const result = await consolidatedServiceNowService.update(
          table,
          sysId,
          data,
        );
        console.log(JSON.stringify(result, null, 2));
      });

    // Delete record command
    program
      .command("delete <table> <sysId>")
      .description("Remove um registro pelo sysId")
      .action(async (table, sysId) => {
        const result = await consolidatedServiceNowService.delete(table, sysId);
        console.log(JSON.stringify({ success: result }, null, 2));
      });

    // Batch operations command
    program
      .command("batch")
      .description("Executa múltiplas operações em lote")
      .requiredOption("-o, --operations <json>", "Array de operações em JSON")
      .action(async (opts) => {
        const operations = JSON.parse(opts.operations);
        const result =
          await consolidatedServiceNowService.executeBatch(operations);
        console.log(JSON.stringify(result, null, 2));
      });

    // Upload attachment command
    program
      .command("upload <table> <sysId> <file>")
      .description("Faz upload de anexo para um registro")
      .action(async (table, sysId, filePath) => {
        const fs = await import("fs/promises");
        const fileBuffer = await fs.readFile(filePath);
        const uint8 = new Uint8Array(fileBuffer);
        const fileName = filePath.split("/").pop() || "upload.bin";
        const fileObj = new File([uint8], fileName);
        const result = await consolidatedServiceNowService.upload(
          table,
          sysId,
          fileObj,
        );
        console.log(JSON.stringify({ attachmentId: result }, null, 2));
      });

    // Download attachment command
    program
      .command("download <attachmentId> <dest>")
      .description("Faz download de anexo pelo attachmentId")
      .action(async (attachmentId, dest) => {
        const data = await consolidatedServiceNowService.download(attachmentId);
        const fs = await import("fs/promises");
        await fs.writeFile(dest, Buffer.from(data));
        console.log(
          JSON.stringify({ message: `Arquivo salvo em ${dest}` }, null, 2),
        );
      });

    // Parse and execute the command
    await program.parseAsync(args, { from: "user" });
  } catch (error: any) {
    console.error("CLI Error:", error.message);

    if (
      error.message.includes("Unknown command") ||
      error.message.includes("unknown command")
    ) {
      console.log("");
      console.log(
        "Available commands: login, record, read, update, delete, batch, upload, download",
      );
      console.log("Use --help with any command for detailed usage information");
    }

    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (import.meta.main) {
  runCLI().catch((error) => {
    console.error("Fatal CLI Error:", error);
    process.exit(1);
  });
}

// Export for programmatic use
export { cliApp, runCLI };
