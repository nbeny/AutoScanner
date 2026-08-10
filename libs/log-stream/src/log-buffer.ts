import type { LogStream } from './types';

/** Cap par défaut aligné sur MAX_RAW_OUTPUT_BYTES du scan-worker (256 MiB). */
export const DEFAULT_LOG_BUFFER_BYTES = 256 * 1024 * 1024;

/**
 * Accumulateur pur de logs combinés stdout+stderr, borné en octets UTF-8.
 * Une fois le cap franchi, on cesse d’accumuler et on ajoute un unique marqueur
 * de troncature. Aucune I/O — le flush vers MinIO est la responsabilité de l’appelant.
 */
export class LogBuffer {
  private readonly chunks: string[] = [];
  private bytes = 0;
  private truncated = false;

  constructor(private readonly capBytes = DEFAULT_LOG_BUFFER_BYTES) {}

  get byteLength(): number {
    return this.bytes;
  }

  append(_stream: LogStream, chunk: string): void {
    if (this.truncated) return;
    const size = Buffer.byteLength(chunk, 'utf8');
    if (this.bytes + size > this.capBytes) {
      this.truncated = true;
      this.chunks.push(`\n[…log truncated at ${this.capBytes} bytes]`);
      return;
    }
    this.chunks.push(chunk);
    this.bytes += size;
  }

  snapshot(): string {
    return this.chunks.join('');
  }

  /** Drop everything accumulated so far (e.g. to discard a failed first attempt). */
  reset(): void {
    this.chunks.length = 0;
    this.bytes = 0;
    this.truncated = false;
  }
}
