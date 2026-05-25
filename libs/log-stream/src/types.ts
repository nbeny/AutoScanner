export type LogStream = 'stdout' | 'stderr';

export interface LogChunk {
  scanJobId: string;
  stream: LogStream;
  ts: number;
  chunk: string;
}

export interface LogStreamPublisher {
  publish(chunk: LogChunk): Promise<void>;
}

export interface LogStreamSubscriber {
  subscribe(scanJobId: string): AsyncIterable<LogChunk>;
  close(): Promise<void>;
}

export const LOG_STREAM_PUBLISHER = Symbol('LOG_STREAM_PUBLISHER');
export const LOG_STREAM_SUBSCRIBER = Symbol('LOG_STREAM_SUBSCRIBER');

export function channelName(scanJobId: string): string {
  return `scanjob:logs:${scanJobId}`;
}
