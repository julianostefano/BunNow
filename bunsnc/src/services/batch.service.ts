// src/services/batch.service.ts
// Service para executar múltiplas operações em lote (batch)
import { ServiceNowService } from "./servicenow.service";

export class BatchService {
  static async executeBatch(instanceUrl: string, token: string, operations: Array<any>) {
    // Cada operação deve ter: { method, table, data, sysId }
    const results = [];
    const service = new ServiceNowService(instanceUrl, token);
    for (const op of operations) {
      try {
        let result;
        switch (op.method) {
          case "create":
            result = await service.create(op.table, op.data);
            break;
          case "update":
            result = await service.update(op.table, op.sysId, op.data);
            break;
          case "delete":
            result = await service.delete(op.table, op.sysId);
            break;
          case "read":
            result = await service.read(op.table, op.sysId);
            break;
          default:
            result = { error: `Método não suportado: ${op.method}` };
        }
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          results.push({ success: true, ...result });
        } else {
          results.push({ success: true, data: result });
        }
      } catch (err: any) {
        results.push({ success: false, error: err?.message || String(err) });
      }
    }
    return results;
  }
}
