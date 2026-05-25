import type { Readable } from 'node:stream';

export type StorageBucket =
  | 'raw-outputs'
  | 'reports'
  | 'uploads'
  | 'pcap'
  | 'screenshots'
  | 'backups'
  | 'cve-mirror';

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
  format: 'XML' | 'JSON' | 'CSV' | 'TEXT' | 'HTML' | 'SARIF' | 'PCAP' | 'BINARY';
}): string {
  const ext = args.format.toLowerCase();
  return `${args.engagementId}/${args.scanId}/${args.scanJobId}/${args.scannerName}-${args.format.toLowerCase()}.${ext}`;
}
