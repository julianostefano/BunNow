// ServiceNow types stub
export interface ServiceNowRecord {
  [key: string]: any;
}

export interface QueryOptions {
  table: string;
  query?: string;
  fields?: string[];
  limit?: number;
  offset?: number;
}
