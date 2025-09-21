import { RecordController } from "../controllers/recordController";
import { consolidatedServiceNowService } from "../services/ConsolidatedServiceNowService";
import * as fs from "fs";

// Mocks para ambiente de teste
const isMock = process.env.SNC_MOCK === "1";

const mockRecordController = {
  create: async () => ({ short_description: "CLI Teste", sys_id: "mocked123" }),
  read: async () => ({ incident: true, sys_id: "mocked123" }),
  update: async () => ({ state: "2", sys_id: "mocked123" }),
  delete: async () => "deleted",
  query: async () => [{ incident: true, sys_id: "mocked123" }],
};
const mockBatchService = {
  executeBatch: async () => ({
    result: "Batch executado com sucesso",
    sys_id: "mockedBatch",
  }),
};
const mockAttachmentService = {
  upload: async () => ({
    result: "Upload realizado com sucesso",
    sys_id: "mockedAttach",
  }),
  download: async () => Buffer.from("conteudo-mock"),
};

const [, , command, ...args] = process.argv;

// Exemplo de obtenção de config/env
const instanceUrl = process.env.SNC_INSTANCE_URL || args[0];
const authToken = process.env.SNC_AUTH_TOKEN || args[1];
const controller = isMock
  ? mockRecordController
  : new RecordController(instanceUrl, authToken);
const attachmentService = isMock
  ? mockAttachmentService
  : consolidatedServiceNowService;
const batchService = isMock ? mockBatchService : consolidatedServiceNowService;

export async function main() {
  switch (command) {
    case "create": {
      if (!args[0] || !args[1]) {
        console.error("Uso: create <table> <json>");
        break;
      }
      try {
        const result = await controller.create(args[0], JSON.parse(args[1]));
        console.log(result);
      } catch (e) {
        console.error("JSON inválido para create");
      }
      break;
    }
    case "read": {
      if (!args[0] || !args[1]) {
        console.error("Uso: read <table> <sys_id>");
        break;
      }
      const result = await controller.read(args[0], args[1]);
      console.log(result);
      break;
    }
    case "update": {
      if (!args[0] || !args[1] || !args[2]) {
        console.error("Uso: update <table> <sys_id> <json>");
        break;
      }
      try {
        const result = await controller.update(
          args[0],
          args[1],
          JSON.parse(args[2]),
        );
        console.log(result);
      } catch (e) {
        console.error("JSON inválido para update");
      }
      break;
    }
    case "delete": {
      if (!args[0] || !args[1]) {
        console.error("Uso: delete <table> <sys_id>");
        break;
      }
      const result = await controller.delete(args[0], args[1]);
      console.log(result);
      break;
    }
    case "query": {
      if (!args[0]) {
        console.error("Uso: query <table> <json>");
        break;
      }
      try {
        const query = args[1] ? JSON.parse(args[1]) : {};
        const result = await controller.query({ table: args[0], ...query });
        console.log(result);
      } catch (e) {
        console.error("JSON inválido para query");
      }
      break;
    }
    case "batch": {
      // Exemplo: ./bunsnc batch '[{"action":"create","table":"incident","data":{"short_description":"Teste"}}]'
      const batchArg = args[0];
      try {
        const operations = batchArg ? JSON.parse(batchArg) : [];
        const result = await batchService.executeBatch(operations);
        console.log(result);
      } catch (e) {
        console.log("Erro ao processar batch. Verifique o JSON de entrada.");
      }
      break;
    }
    case "upload": {
      // Exemplo: ./bunsnc upload incident <sys_id> ./arquivo.txt
      const table = args[0];
      const sysId = args[1];
      const filePath = args[2];
      try {
        let fileObj;
        if (isMock) {
          fileObj = Buffer.from("conteudo-mock");
        } else {
          const fileBuffer = fs.readFileSync(filePath);
          fileObj = new File(
            [fileBuffer],
            filePath.split("/").pop() || "upload.bin",
          );
        }
        const result = await attachmentService.uploadAttachment({
          table,
          sysId,
          file: fileObj,
          fileName: filePath
            ? filePath.split("/").pop() || "upload.bin"
            : "mock.bin",
        });
        console.log("Upload realizado com sucesso:", result);
      } catch (e) {
        if (e instanceof Error) {
          console.log("Erro no upload:", e.message);
        } else {
          console.log("Erro no upload:", e);
        }
      }
      break;
    }
    case "download": {
      // Exemplo: ./bunsnc download <attachmentId> ./destino.txt
      const attachmentId = args[0];
      const dest = args[1];
      try {
        const data = await attachmentService.downloadAttachment(attachmentId);
        fs.writeFileSync(dest, data);
        console.log(`Download salvo em ${dest}`);
      } catch (e) {
        if (e instanceof Error) {
          console.log("Erro no download:", e.message);
        } else {
          console.log("Erro no download:", e);
        }
      }
      break;
    }
    case "--help":
    case "-h":
    default:
      console.log(`\nComandos disponíveis:\n
   create <table> <json>         Cria um registro\n    Ex: ./bunsnc create incident '{"short_description":"Teste"}'\n
   read <table> <sys_id>         Lê um registro\n    Ex: ./bunsnc read incident 1234abcd5678\n
   update <table> <sys_id> <json> Atualiza um registro\n    Ex: ./bunsnc update incident 1234abcd5678 '{"state":"2"}'\n
   delete <table> <sys_id>       Remove um registro\n    Ex: ./bunsnc delete incident 1234abcd5678\n
   query <table> <json>          Consulta registros\n    Ex: ./bunsnc query incident '{"active":true}'\n
   batch <json>                  Executa operações em lote\n    Ex: ./bunsnc batch '[{"action":"create","table":"incident","data":{"short_description":"Teste"}}]'\n
   upload <table> <sys_id> <file> Upload de anexo (use bunsnc/src/cli.ts para funcionalidade completa)\n    Ex: ./bunsnc upload incident 1234abcd5678 ./arquivo.txt\n
   download <attachmentId> <dest> Download de anexo (use bunsnc/src/cli.ts para funcionalidade completa)\n    Ex: ./bunsnc download 4321dcba8765 ./destino.txt\n`);
  }
}

// main() só deve ser chamada via import dinâmico do entrypoint
