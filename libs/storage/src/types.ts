import type { Readable } from 'node:stream';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';

export type StorageBucket =
  | 'raw-outputs'
  | 'reports'
  | 'uploads'
  | 'pcap'
  | 'screenshots'
  | 'backups'
  | 'cve-mirror'
  | 'logs';

export interface PutObjectInput {
  bucket: StorageBucket;
  key: string;
  body: Buffer | string | Readable;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

export interface GetObjectResult {
  body: Readable;
  contentLength?: number;
  contentType?: string;
  etag?: string;
}

export interface PresignedUrlInput {
  bucket: StorageBucket;
  key: string;
  expiresInSeconds?: number;
}

export interface ObjectStorage {
  ensureBucket(bucket: StorageBucket): Promise<void>;
  putObject(input: PutObjectInput): Promise<{ etag?: string }>;
  getObject(bucket: StorageBucket, key: string): Promise<GetObjectResult>;
  headObject(bucket: StorageBucket, key: string): Promise<{ exists: boolean; size?: number }>;
  deleteObject(bucket: StorageBucket, key: string): Promise<void>;
  presignGetUrl(input: PresignedUrlInput): Promise<string>;
  presignPutUrl(input: PresignedUrlInput): Promise<string>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export function rawOutputKey(args: {
  engagementId: string;
  scanId: string;
  scanJobId: string;
  scannerName: string;
  format: RawOutputFormat;
}): string {
  const ext = args.format.toLowerCase();
  return `${args.engagementId}/${args.scanId}/${args.scanJobId}/${args.scannerName}-${args.format.toLowerCase()}.${ext}`;
}

/** Clé MinIO déterministe des logs combinés d'un scan job (bucket `logs`). */
export function scanLogKey(scanJobId: string): string {
  return `${scanJobId}.log`;
}
