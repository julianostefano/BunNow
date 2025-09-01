// Record controller stub
import { ServiceNowService } from "../services/servicenow.service";
import type { QueryOptions, ServiceNowRecord } from "../types/servicenow";

export class RecordController {
  private service: ServiceNowService;

  constructor(instanceUrl: string, authToken: string) {
    this.service = new ServiceNowService(instanceUrl, authToken);
  }

  async create(table: string, data: ServiceNowRecord) {
    return this.service.create(table, data);
  }

  async read(table: string, sysId: string) {
    return this.service.read(table, sysId);
  }

  async update(table: string, sysId: string, data: Partial<ServiceNowRecord>) {
    return this.service.update(table, sysId, data);
  }

  async delete(table: string, sysId: string) {
    return this.service.delete(table, sysId);
  }

  async query(options: QueryOptions) {
    return this.service.query(options);
  }
}
