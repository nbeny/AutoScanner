export interface KaliToolOption {
  /** Primary flag, e.g. "-sV" or "--rate". */
  flag: string;
  /** Argument placeholder if any, e.g. "<port ranges>", "URL"; null when the flag takes no value. */
  argHint: string | null;
  description: string;
}

export type ParseConfidence = 'high' | 'low' | 'none';

/** One introspected Kali binary (post-normalization) — the committed dataset shape. */
export interface KaliToolRecord {
  package: string;
  binary: string;
  displayName: string;
  description: string;
  homepage: string | null;
  categories: string[];
  helpTextRaw: string | null;
  options: KaliToolOption[];
  parseConfidence: ParseConfidence;
  manAvailable: boolean;
  source: 'kali-docker';
  kaliRelease: string;
  capturedAt: string;
}

/** Raw per-binary capture emitted by capture.sh (pre-normalization). */
export interface RawCapture {
  package: string;
  binary: string;
  description: string;
  homepage: string | null;
  categories: string[];
  helpTextRaw: string | null;
  manAvailable: boolean;
}
