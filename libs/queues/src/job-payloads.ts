import { QueueName } from './queue-names';

export interface ScanJobPayload {
  scanJobId: string;
  scannerName: string;
  target: string;
  input: Record<string, unknown>;
  engagementId: string;
}

export interface ParseJobPayload {
  scanJobId: string;
  rawOutputKey: string;
  parserName: string;
  scannerName: string;
  target: string;
  engagementId: string;
}

export interface QueuePayloadMap {
  [QueueName.SCAN_JOBS]: ScanJobPayload;
  [QueueName.PARSE_JOBS]: ParseJobPayload;
}

export type PayloadFor<Q extends QueueName> = QueuePayloadMap[Q];
