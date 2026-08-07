import type { KaliToolOption, ParseConfidence } from './types';

const FLAG_RE = /^\s{1,10}(-{1,2}[A-Za-z0-9][A-Za-z0-9-]*)/;
// Arg placeholder inside the pre-description segment: <...>, [...], or an ALLCAPS token (>=2 chars).
const ARG_RE = /<[^>]+>|\[[^\]]+\]|\b[A-Z][A-Z0-9_]+\b/;

export function parseHelpOptions(help: string): {
  options: KaliToolOption[];
  confidence: ParseConfidence;
} {
  if (!help || !help.trim()) return { options: [], confidence: 'none' };

  const lines = help.split(/\r?\n/);
  const options: KaliToolOption[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fm = line.match(FLAG_RE);
    if (!fm) continue;

    const flag = fm[1];
    const afterFlag = line.slice(fm[0].length);
    // Description starts after the first run of 2+ spaces; everything before is aliases/arg.
    const gap = afterFlag.search(/\s{2,}/);
    const preGap = gap === -1 ? afterFlag : afterFlag.slice(0, gap);
    let description = gap === -1 ? '' : afterFlag.slice(gap).trim();

    const ah = preGap.match(ARG_RE);
    const argHint = ah ? ah[0] : null;

    if (!description && i + 1 < lines.length && /^\s{6,}\S/.test(lines[i + 1])) {
      description = lines[i + 1].trim();
      i++;
    }

    options.push({ flag, argHint, description });
  }

  const confidence: ParseConfidence =
    options.length === 0 ? 'none' : options.length >= 3 ? 'high' : 'low';
  return { options, confidence };
}
