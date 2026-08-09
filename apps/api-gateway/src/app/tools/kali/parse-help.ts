import type { KaliToolOption, ParseConfidence } from './types';

// Indent 0–10 autorisé (flags collés à la marge type john). Lookahead : le token
// flag doit être suivi d'un espace, '=', ',', '[' ou fin de ligne — pour éviter de
// matcher un mot de prose commençant par un tiret.
const FLAG_RE = /^(\s{0,10})(-{1,2}[A-Za-z0-9][A-Za-z0-9-]*)(?=[\s=,[]|$)/;
// Placeholder d'argument : <...>, [...], =VALUE collé, ou token ALLCAPS (>=2).
const ARG_RE = /<[^>]+>|\[[^\]]+\]|=\s*[A-Za-z0-9_<[]+|\b[A-Z][A-Z0-9_]+\b/;

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

    const indent = fm[1].length;
    const flag = fm[2];
    const afterFlag = line.slice(fm[0].length);
    const gap = afterFlag.search(/\s{2,}/);
    const preGap = gap === -1 ? afterFlag : afterFlag.slice(0, gap);
    let description = gap === -1 ? '' : afterFlag.slice(gap).trim();

    const hasFollowingDesc = i + 1 < lines.length && /^\s{6,}\S/.test(lines[i + 1]);
    // Flush-left : exiger un signal de description (gap 2+ espaces OU desc indentée
    // à la ligne suivante) pour ne pas confondre avec de la prose.
    if (indent === 0 && gap === -1 && !hasFollowingDesc) continue;

    const ah = preGap.match(ARG_RE);
    const argHint = ah ? ah[0].replace(/^=\s*/, '') : null;

    if (!description && hasFollowingDesc) {
      description = lines[i + 1].trim();
      i++;
    }

    options.push({ flag, argHint, description });
  }

  const confidence: ParseConfidence =
    options.length === 0 ? 'none' : options.length >= 3 ? 'high' : 'low';
  return { options, confidence };
}
