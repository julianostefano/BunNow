/**
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * Batch service para executar múltiplas operações em lote
 */
import { ServiceNowService } from "./servicenow.service";

export interface BatchOperation {
  op: 'create' | 'read' | 'update' | 'delete';
  table: string;
  data?: any;
  sys_id?: string;
}

export class BatchService {
  static async executeBatch(instanceUrl: string, token: string, operations: BatchOperation[]): Promise<any[]> {
    const results: any[] = [];
    const service = new ServiceNowService(instanceUrl, token);
    
    for (const operation of operations) {
      try {
        let result;
        
        switch (operation.op) {
          case "create":
            result = await service.create(operation.table, operation.data);
            break;
          case "read":
            result = await service.read(operation.table, operation.sys_id!);
            break;
          case "update":
            result = await service.update(operation.table, operation.sys_id!, operation.data);
            break;
          case "delete":
            result = await service.delete(operation.table, operation.sys_id!);
            break;
          default:
            result = { error: `Operação não suportada: ${operation.op}` };
        }
        
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          results.push({ success: true, operation: operation.op, ...result });
        } else {
          results.push({ success: true, operation: operation.op, data: result });
        }
      } catch (err: any) {
        console.error(`Batch operation failed:`, operation, err);
        results.push({ 
          success: false, 
          operation: operation.op, 
          table: operation.table,
          error: err?.message || String(err) 
        });
      }
    }
    
    return results;
  }
}
