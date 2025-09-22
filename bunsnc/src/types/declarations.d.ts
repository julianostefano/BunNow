/**
 * Type Declarations for External Modules
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Redis module declaration (for TaskQueue and TaskScheduler)
declare module "redis" {
  export interface RedisClientType {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<string | "OK">;
    del(key: string | string[]): Promise<number>;
    exists(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
    lpush(key: string, ...values: string[]): Promise<number>;
    rpop(key: string): Promise<string | null>;
    llen(key: string): Promise<number>;
    zadd(key: string, score: number, member: string): Promise<number>;
    zrange(key: string, start: number, stop: number): Promise<string[]>;
    zrem(key: string, member: string): Promise<number>;
    publish(channel: string, message: string): Promise<number>;
    subscribe(
      channel: string,
      callback?: (message: string) => void,
    ): Promise<void>;
    hGetAll(key: string): Promise<Record<string, string>>;
    hSet(key: string, field: string, value: string): Promise<number>;
    hDel(key: string, field: string): Promise<number>;
    on(event: string, callback: (...args: any[]) => void): void;
    quit(): Promise<void>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    duplicate(): Promise<RedisClientType>;
    isOpen: boolean;
    isReady: boolean;
  }

  export namespace Redis {
    export type RedisClientType = import("redis").RedisClientType;
  }

  export function createClient(options?: {
    socket?: {
      host?: string;
      port?: number;
    };
    password?: string;
    database?: number;
    url?: string;
  }): RedisClientType;

  export default createClient;
}

// IORedis enhanced types (for Redis integration)
declare module "ioredis" {
  export interface Redis {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: any[]): Promise<string>;
    del(key: string): Promise<number>;
    exists(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ping(): Promise<string>;
    info(section?: string): Promise<string>;
    duplicate(): Redis;
    disconnect(): void;

    // Stream commands
    xadd(key: string, id: string, ...fields: any[]): Promise<string>;
    xread(...args: any[]): Promise<any>;
    xgroup(...args: any[]): Promise<any>;
    xreadgroup(...args: any[]): Promise<any>;
    xack(key: string, group: string, ...ids: string[]): Promise<number>;
    xpending(key: string, group: string): Promise<any>;

    // Pub/Sub
    publish(channel: string, message: string): Promise<number>;
    subscribe(channel: string): Promise<void>;
    on(event: string, callback: (...args: any[]) => void): void;
  }

  export interface Cluster extends Redis {
    nodes(): Redis[];
  }

  export interface RedisOptions {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    maxRetriesPerRequest?: number;
    connectTimeout?: number;
    commandTimeout?: number;
    enableOfflineQueue?: boolean;
    lazyConnect?: boolean;
    enableReadyCheck?: boolean;
    retryDelayOnFailover?: number;
  }

  export interface ClusterOptions {
    enableReadyCheck?: boolean;
    maxRetriesPerRequest?: number;
    retryDelayOnFailover?: number;
  }

  export default class IORedis {
    constructor(options?: RedisOptions);
    constructor(port?: number, host?: string, options?: RedisOptions);
    constructor(path?: string, options?: RedisOptions);

    static Cluster: new (
      nodes: Array<{ host: string; port: number }>,
      options?: ClusterOptions,
    ) => Cluster;
  }
}

// OpenSearch client type fixes
declare module "@opensearch-project/opensearch" {
  export interface Client {
    ping(): Promise<any>;
    indices: {
      refresh(params: { index: string }): Promise<any>;
      create(params: any): Promise<any>;
      exists(params: any): Promise<boolean>;
      putMapping(params: any): Promise<any>;
      putSettings(params: any): Promise<any>;
    };
    index(params: any): Promise<any>;
    get(params: any): Promise<any>;
    delete(params: any): Promise<any>;
    search(params: any): Promise<any>;
    deleteByQuery(params: any): Promise<any>;
    bulk(params: any): Promise<any>;
  }

  export interface DeleteByQuery_ResponseBody {
    deleted?: number;
    version_conflicts?: number;
    batches?: number;
    failures?: any[];
    took?: number;
    timed_out?: boolean;
  }
}

// Parquet file handling
declare module "parquetjs" {
  export class ParquetReader {
    static openFile(path: string): Promise<ParquetReader>;
    getRowCount(): number;
    close(): Promise<void>;
  }

  export class ParquetWriter {
    static openFile(schema: any, path: string): Promise<ParquetWriter>;
    appendRow(row: any): Promise<void>;
    close(): Promise<void>;
  }
}

// Express-like middleware types for compatibility
declare module "express-session" {
  export interface SessionOptions {
    secret: string;
    resave?: boolean;
    saveUninitialized?: boolean;
    cookie?: {
      secure?: boolean;
      maxAge?: number;
    };
  }

  export default function session(options: SessionOptions): any;
}

// Additional utility modules
declare module "uuid/v4" {
  export default function uuidv4(): string;
}

declare module "crypto-js" {
  export const AES: any;
  export const enc: any;
}
