export type ToolOutputFormat = 'json' | 'table' | 'keyvalue' | 'text';

export interface ParsedToolOutput {
  format: ToolOutputFormat;
  view: unknown;
}

// Full CSI escape sequences (ESC + '[' + params + final byte): SGR colours (…m),
// cursor moves, clears (…J/…K/…H), etc. Requires the ESC byte so literal text like
// "arr[3m]" is never mistaken for a colour code.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

export function parseToolOutput(raw: string): ParsedToolOutput {
  const clean = (raw ?? '').replace(ANSI_RE, '');
  const trimmed = clean.trim();
  if (!trimmed) return { format: 'text', view: { lines: [] } };

  // JSON first (object or array).
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    try {
      return { format: 'json', view: JSON.parse(trimmed) };
    } catch {
      /* not JSON — fall through */
    }
  }

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // Table: >=2 lines that split into the same column count on runs of 2+ spaces.
  if (lines.length >= 2) {
    const split = (l: string) => l.trim().split(/\s{2,}/);
    const cols = split(lines[0]);
    if (cols.length >= 2 && lines.every((l) => split(l).length === cols.length)) {
      return {
        format: 'table',
        view: { headers: cols, rows: lines.slice(1).map(split) },
      };
    }
  }

  // Key: value: majority of lines match "Key: value".
  const kvRe = /^([A-Za-z][\w .-]*?):\s+(.+)$/;
  const kv = lines.map((l) => l.match(kvRe)).filter(Boolean) as RegExpMatchArray[];
  if (lines.length > 0 && kv.length >= Math.ceil(lines.length / 2) && kv.length >= 2) {
    return {
      format: 'keyvalue',
      view: { pairs: kv.map((m) => ({ key: m[1].trim(), value: m[2].trim() })) },
    };
  }

  return { format: 'text', view: { lines: lines.map((l) => l.trim()) } };
}
