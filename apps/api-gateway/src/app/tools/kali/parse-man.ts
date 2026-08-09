import type { KaliToolOption, ParseConfidence } from './types';

const OPT_FLAG_RE = /^(\s{1,20})(-{1,2}[A-Za-z0-9][A-Za-z0-9-]*)/;
const ARG_RE = /<[^>]+>|\[[^\]]+\]|\b[A-Z][A-Z0-9_]+\b/;
// En-tête de section man en MAJUSCULES (NAME, OPTIONS, DESCRIPTION, EXAMPLES…).
const SECTION_RE = /^[A-Z][A-Z0-9 ]{2,}$/;

/**
 * Parse la section OPTIONS d'une page man rendue (`man x | col -bx`). Format `.TP` :
 * une ligne de flags peu indentée suivie d'une description plus indentée.
 */
export function parseManOptions(man: string): {
  options: KaliToolOption[];
  confidence: ParseConfidence;
} {
  if (!man || !man.trim()) return { options: [], confidence: 'none' };
  const lines = man.split(/\r?\n/);

  // Restreindre à la section OPTIONS si présente (sinon tout le document).
  let start = 0;
  let end = lines.length;
  const optIdx = lines.findIndex((l) => /OPTIONS/.test(l) && SECTION_RE.test(l.trim()));
  if (optIdx >= 0) {
    start = optIdx + 1;
    const rel = lines.slice(start).findIndex((l) => SECTION_RE.test(l.trim()));
    end = rel >= 0 ? start + rel : lines.length;
  }

  const options: KaliToolOption[] = [];
  for (let i = start; i < end; i++) {
    const m = lines[i].match(OPT_FLAG_RE);
    if (!m) continue;
    const indent = m[1].length;
    const flag = m[2];
    const ah = lines[i].trim().match(ARG_RE);
    const argHint = ah ? ah[0] : null;

    const desc: string[] = [];
    for (let j = i + 1; j < end; j++) {
      if (!lines[j].trim()) {
        if (desc.length) break;
        continue;
      }
      const jIndent = (lines[j].match(/^(\s*)/) as RegExpMatchArray)[1].length;
      if (jIndent > indent) desc.push(lines[j].trim());
      else break;
    }
    options.push({ flag, argHint, description: desc.join(' ') });
  }

  const confidence: ParseConfidence =
    options.length === 0 ? 'none' : options.length >= 3 ? 'high' : 'low';
  return { options, confidence };
}
