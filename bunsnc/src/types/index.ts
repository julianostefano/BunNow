export interface SyncRequest {
  source: string;
  destination: string;
  options?: Record<string, any>;
}

export interface SyncResponse {
  success: boolean;
  message: string;
  data?: any;
}
