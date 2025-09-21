#!/usr/bin/env bun
// bunsnc/src/cli.ts
import { Command } from "commander";
import { serviceNowService, authService } from "./services";
import * as dotenv from "dotenv";

dotenv.config();

const program = new Command();
program
  .name("bunsnc")
  .description("CLI para ServiceNow via Bun/Elysia")
  .version("1.0.0");

const getEnv = (key: string, fallback = "") => process.env[key] || fallback;

program
  .command("login")
  .description("Realiza login e retorna token mock")
  .requiredOption("-u, --username <username>")
  .requiredOption("-p, --password <password>")
  .action(async (opts) => {
    const { username, password } = opts;
    const result = await authService.authenticate(username, password);
    console.log(result);
  });

program
  .command("record <table>")
  .description("Cria um novo registro em uma tabela")
  .option("-d, --data <json>", "Dados em JSON", "{}")
  .action(async (table, opts) => {
    const instanceUrl = getEnv("SNC_INSTANCE_URL");
    const token = getEnv("SNC_AUTH_TOKEN");
    const data = JSON.parse(opts.data);
    const service = serviceNowService;
    const result = await service.create(table, data);
    console.log(result);
  });

program
  .command("batch")
  .description("Executa múltiplas operações em lote")
  .requiredOption("-o, --operations <json>", "Array de operações em JSON")
  .action(async (opts) => {
    const instanceUrl = getEnv("SNC_INSTANCE_URL");
    const token = getEnv("SNC_AUTH_TOKEN");
    const operations = JSON.parse(opts.operations);
    const result = await serviceNowService.executeBatch(operations);
    console.log(result);
  });

program
  .command("read <table> <sysId>")
  .description("Lê um registro pelo sysId")
  .action(async (table, sysId) => {
    const instanceUrl = getEnv("SNC_INSTANCE_URL");
    const token = getEnv("SNC_AUTH_TOKEN");
    const service = consolidatedServiceNowService;
    const result = await service.read(table, sysId);
    console.log(result);
  });

program
  .command("update <table> <sysId>")
  .description("Atualiza um registro pelo sysId")
  .option("-d, --data <json>", "Dados em JSON", "{}")
  .action(async (table, sysId, opts) => {
    const instanceUrl = getEnv("SNC_INSTANCE_URL");
    const token = getEnv("SNC_AUTH_TOKEN");
    const data = JSON.parse(opts.data);
    const service = consolidatedServiceNowService;
    const result = await service.update(table, sysId, data);
    console.log(result);
  });

program
  .command("delete <table> <sysId>")
  .description("Remove um registro pelo sysId")
  .action(async (table, sysId) => {
    const instanceUrl = getEnv("SNC_INSTANCE_URL");
    const token = getEnv("SNC_AUTH_TOKEN");
    const service = consolidatedServiceNowService;
    const result = await service.delete(table, sysId);
    console.log(result);
  });

program;

program
  .command("upload <table> <sysId> <file>")
  .description("Faz upload de anexo para um registro")
  .action(async (table, sysId, file) => {
    const instanceUrl = getEnv("SNC_INSTANCE_URL");
    const token = getEnv("SNC_AUTH_TOKEN");
    const attachmentService = consolidatedServiceNowService;
    const fs = await import("fs/promises");
    const fileBuffer = await fs.readFile(file);
    // Converter Buffer para Uint8Array para o construtor File
    const uint8 = new Uint8Array(fileBuffer);
    const fileName = file.split("/").pop() || "upload.bin";
    const fileObj = new File([uint8], fileName);
    const result = await attachmentService.upload(table, sysId, fileObj);
    console.log(result);
  });

program;

program
  .command("download <attachmentId> <dest>")
  .description("Faz download de anexo pelo attachmentId")
  .action(async (attachmentId, dest) => {
    const instanceUrl = getEnv("SNC_INSTANCE_URL");
    const token = getEnv("SNC_AUTH_TOKEN");
    const attachmentService = consolidatedServiceNowService;
    const data = await attachmentService.download(attachmentId);
    const fs = await import("fs/promises");
    await fs.writeFile(dest, data);
    console.log(`Arquivo salvo em ${dest}`);
  });

program.parseAsync(process.argv);
