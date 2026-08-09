# Plan — Couverture d'options Kali (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Augmenter le nombre d'outils Kali (sur 88) avec options structurées, via un parser `--help` durci, un nouveau parser de pages man, un fix de capture (strip des file-capabilities) et une régénération du dataset — avec un garde dataset↔image et un rapport de couverture.

**Architecture:** Deux parsers purs (`parse-help` durci + `parse-man` neuf) fusionnés par précédence (help d'abord, man en repli) dans `normalize.ts`, qui enrichit chaque record d'un `optionsSource`. La capture (`tools/kali-catalog/`) strippe les caps pour que `--help` s'exécute et capture aussi le texte man. Régénération via `pnpm kali:catalog`. Fiabilité : test dataset↔image + script de couverture. API/Front exposent la source.

**Tech Stack:** TypeScript (Jest via `pnpm nx test api-gateway`), bash/jq (capture), Docker (image de capture Kali), NestJS GraphQL code-first, React.

**Référence spec:** `docs/superpowers/specs/2026-08-09-kali-option-coverage-design.md`.

---

## Structure des fichiers

| Fichier | Rôle | Action |
| --- | --- | --- |
| `apps/api-gateway/src/app/tools/kali/parse-help.ts` | Parser `--help` durci (flags flush-left + arg collés) | Modify |
| `apps/api-gateway/src/app/tools/kali/parse-man.ts` | Parser section OPTIONS des pages man | Create |
| `apps/api-gateway/src/app/tools/kali/types.ts` | `manTextRaw` (RawCapture) + `optionsSource`/`manTextRaw` (record) | Modify |
| `apps/api-gateway/src/app/tools/kali/normalize.ts` | Fusion help→man + `optionsSource` | Modify |
| `apps/api-gateway/src/app/tools/kali/__tests__/parse-help.spec.ts` | Fixtures john/burpsuite flush-left | Create/Modify |
| `apps/api-gateway/src/app/tools/kali/__tests__/parse-man.spec.ts` | Fixtures man nmap/hydra | Create |
| `apps/api-gateway/src/app/tools/kali/__tests__/normalize.spec.ts` | Précédence help/man | Modify |
| `tools/kali-catalog/Dockerfile.kali-catalog` | Strip caps + libcap2-bin + util-linux | Modify |
| `tools/kali-catalog/capture.sh` | Capturer `manTextRaw` | Modify |
| `tools/kali-catalog/coverage-report.ts` | Rapport de couverture | Create |
| `apps/api-gateway/src/app/tools/kali/__tests__/dataset-image.spec.ts` | Garde dataset↔image (gated) | Create |
| `data/kali-tools.json` | Régénéré | Modify (généré) |
| `apps/api-gateway/src/app/tools/dto/kali-tool.object.ts` | `optionsSource`/`manTextRaw` GraphQL | Modify |
| `apps/api-gateway/src/app/tools/kali-catalog.service.ts` | Peupler les nouveaux champs | Modify |
| `apps/frontend/src/features/scans/kali-tool-doc-panel.tsx` | Badge source + man repliable | Modify |
| `apps/frontend/src/lib/graphql/queries.ts` | `optionsSource`/`manTextRaw` dans `kaliTool` | Modify |

**Noms figés :** `parseManOptions(man): { options, confidence }`, champ `optionsSource: 'help' | 'man' | 'none'`, `manTextRaw?: string`, script `coverage-report.ts`.

**Contrats existants (à réutiliser tels quels) :**
- `KaliToolOption = { flag: string; argHint: string | null; description: string }`
- `ParseConfidence = 'high' | 'low' | 'none'` (`none` si 0 option, `high` si ≥3, `low` sinon)
- `parseHelpOptions(help): { options: KaliToolOption[]; confidence: ParseConfidence }`

---

## Task 1 : durcir `parse-help.ts` (flags collés à la marge + arg-hints collés)

**Files:**
- Modify: `apps/api-gateway/src/app/tools/kali/parse-help.ts`
- Modify/Create: `apps/api-gateway/src/app/tools/kali/__tests__/parse-help.spec.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `apps/api-gateway/src/app/tools/kali/__tests__/parse-help.spec.ts` (créer le fichier s'il n'existe pas ; sinon ajouter ces cas) :

```ts
import { parseHelpOptions } from '../parse-help';

describe('parse-help — flags collés à la marge (indent 0)', () => {
  it('parse un help style john (flush-left, arg collé)', () => {
    const help = [
      'John the Ripper password cracker',
      '',
      '--single[=SECTION[,..]]   "single crack" mode, using default or named rules',
      '--wordlist[=FILE]         wordlist mode, read words from FILE',
      '--rules=NAME              enable word mangling rules named NAME',
    ].join('\n');
    const { options, confidence } = parseHelpOptions(help);
    const flags = options.map((o) => o.flag);
    expect(flags).toEqual(['--single', '--wordlist', '--rules']);
    expect(confidence).toBe('high');
    expect(options[2].argHint).toBe('NAME');
    expect(options[0].description).toContain('single crack');
  });

  it('ne matche pas une ligne de prose commençant par un tiret sans description', () => {
    const help = '-based tooling notes here without option layout\n';
    expect(parseHelpOptions(help).options).toHaveLength(0);
  });

  it('conserve le comportement indenté existant', () => {
    const help = '  -sV                 Probe open ports\n  --rate <number>     Send packets no faster than <number>';
    const o = parseHelpOptions(help).options;
    expect(o.map((x) => x.flag)).toEqual(['-sV', '--rate']);
    expect(o[1].argHint).toBe('<number>');
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `pnpm nx test api-gateway --testFile=parse-help.spec.ts`
Expected: FAIL (les flags flush-left ne sont pas captés).

- [ ] **Step 3: Durcir le parser**

Remplacer le contenu de `apps/api-gateway/src/app/tools/kali/parse-help.ts` par :

```ts
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
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run: `pnpm nx test api-gateway --testFile=parse-help.spec.ts`
Expected: PASS (nouveaux cas + cas préexistants verts). Si un cas préexistant casse à cause du lookahead, ajuster le test seulement s'il testait un comportement erroné et le noter.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/app/tools/kali/parse-help.ts apps/api-gateway/src/app/tools/kali/__tests__/parse-help.spec.ts
git commit -m "feat(kali): harden help parser for flush-left flags and attached args"
```

---

## Task 2 : nouveau `parse-man.ts` (section OPTIONS des pages man)

**Files:**
- Create: `apps/api-gateway/src/app/tools/kali/parse-man.ts`
- Create: `apps/api-gateway/src/app/tools/kali/__tests__/parse-man.spec.ts`

- [ ] **Step 1: Écrire le test qui échoue**

`apps/api-gateway/src/app/tools/kali/__tests__/parse-man.spec.ts` :

```ts
import { parseManOptions } from '../parse-man';

// Rendu `man ... | col -bx` typique (section OPTIONS, .TP : flag peu indenté, desc plus indentée).
const NMAP_MAN = [
  'NAME',
  '       nmap - Network exploration tool',
  '',
  'OPTIONS SUMMARY',
  '       -sS, --syn-scan',
  '              TCP SYN scan.',
  '',
  '       -p <port ranges>, --ports <port ranges>',
  '              Only scan specified ports.',
  '',
  '       -sV',
  '              Probe open ports to determine service/version info.',
  '',
  'EXAMPLES',
  '       nmap -sV target',
].join('\n');

describe('parseManOptions', () => {
  it('extrait les options de la section OPTIONS', () => {
    const { options, confidence } = parseManOptions(NMAP_MAN);
    const flags = options.map((o) => o.flag);
    expect(flags).toEqual(['-sS', '-p', '-sV']);
    expect(confidence).toBe('high');
    expect(options[1].argHint).toBe('<port ranges>');
    expect(options[0].description).toContain('SYN scan');
  });

  it('renvoie none sur texte vide', () => {
    expect(parseManOptions('').confidence).toBe('none');
  });

  it('ne déborde pas hors de la section OPTIONS', () => {
    const { options } = parseManOptions(NMAP_MAN);
    // "nmap -sV target" (EXAMPLES) ne doit pas produire d'option
    expect(options.every((o) => o.flag.startsWith('-'))).toBe(true);
    expect(options).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `pnpm nx test api-gateway --testFile=parse-man.spec.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter le parser man**

`apps/api-gateway/src/app/tools/kali/parse-man.ts` :

```ts
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
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run: `pnpm nx test api-gateway --testFile=parse-man.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/app/tools/kali/parse-man.ts apps/api-gateway/src/app/tools/kali/__tests__/parse-man.spec.ts
git commit -m "feat(kali): add man-page OPTIONS parser"
```

---

## Task 3 : types + fusion help→man dans `normalize.ts`

**Files:**
- Modify: `apps/api-gateway/src/app/tools/kali/types.ts`
- Modify: `apps/api-gateway/src/app/tools/kali/normalize.ts`
- Modify: `apps/api-gateway/src/app/tools/kali/__tests__/normalize.spec.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `apps/api-gateway/src/app/tools/kali/__tests__/normalize.spec.ts` :

```ts
import { normalizeRecord } from '../normalize';
import type { RawCapture } from '../types';

const base = (over: Partial<RawCapture>): RawCapture => ({
  package: 'p', binary: 'b', description: '', homepage: null,
  categories: ['x'], helpTextRaw: null, manAvailable: false, ...over,
});

describe('normalizeRecord — précédence help/man', () => {
  it('utilise le help quand il donne des options', () => {
    const rec = normalizeRecord(base({ helpTextRaw: '  -a   do A\n  -b   do B\n  -c   do C' }), '2026.08', 'T');
    expect(rec.optionsSource).toBe('help');
    expect(rec.parseConfidence).toBe('high');
  });

  it('bascule sur le man quand le help ne donne rien mais le man oui', () => {
    const man = ['OPTIONS', '       -x', '              do X', '       -y', '              do Y', '       -z', '              do Z'].join('\n');
    const rec = normalizeRecord(base({ helpTextRaw: 'usage: b <file>', manTextRaw: man }), '2026.08', 'T');
    expect(rec.optionsSource).toBe('man');
    expect(rec.options.map((o) => o.flag)).toEqual(['-x', '-y', '-z']);
    expect(rec.manTextRaw).toBe(man);
  });

  it('optionsSource none quand aucune source ne donne d’options', () => {
    const rec = normalizeRecord(base({ helpTextRaw: 'usage: b <file>' }), '2026.08', 'T');
    expect(rec.optionsSource).toBe('none');
    expect(rec.options).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `pnpm nx test api-gateway --testFile=normalize.spec.ts`
Expected: FAIL (`optionsSource`/`manTextRaw` inexistants).

- [ ] **Step 3: Étendre les types**

Dans `apps/api-gateway/src/app/tools/kali/types.ts` :

Ajouter à `KaliToolRecord` (après `manAvailable`) :
```ts
  /** Texte man rendu (source secondaire d'options), null si absent. */
  manTextRaw: string | null;
  /** D'où viennent les `options` retenues. */
  optionsSource: 'help' | 'man' | 'none';
```
Ajouter à `RawCapture` (après `manAvailable`) :
```ts
  manTextRaw?: string | null;
```

- [ ] **Step 4: Implémenter la fusion**

Remplacer `apps/api-gateway/src/app/tools/kali/normalize.ts` par :

```ts
// apps/api-gateway/src/app/tools/kali/normalize.ts
import { parseHelpOptions } from './parse-help';
import { parseManOptions } from './parse-man';
import type { KaliToolOption, KaliToolRecord, ParseConfidence, RawCapture } from './types';

export function normalizeRecord(
  raw: RawCapture,
  kaliRelease: string,
  capturedAt: string,
): KaliToolRecord {
  const help = raw.helpTextRaw
    ? parseHelpOptions(raw.helpTextRaw)
    : { options: [] as KaliToolOption[], confidence: 'none' as ParseConfidence };

  let options = help.options;
  let confidence = help.confidence;
  let optionsSource: 'help' | 'man' | 'none' = help.options.length ? 'help' : 'none';

  // Repli sur le man si le help est pauvre et qu'un man plus riche existe.
  if ((confidence === 'none' || confidence === 'low') && raw.manTextRaw) {
    const man = parseManOptions(raw.manTextRaw);
    if (man.options.length > options.length) {
      options = man.options;
      confidence = man.confidence;
      optionsSource = 'man';
    }
  }

  return {
    package: raw.package,
    binary: raw.binary,
    displayName: raw.binary,
    description: raw.description ?? '',
    homepage: raw.homepage ?? null,
    categories: raw.categories ?? [],
    helpTextRaw: raw.helpTextRaw ?? null,
    manTextRaw: raw.manTextRaw ?? null,
    options,
    parseConfidence: confidence,
    optionsSource,
    manAvailable: raw.manAvailable ?? false,
    source: 'kali-docker',
    kaliRelease,
    capturedAt,
  };
}
```

- [ ] **Step 5: Ajuster `mergeByBinary` (préférer les records porteurs d'options)**

Dans `apps/api-gateway/src/app/tools/kali/generate-transform.ts`, le choix du `base` doit préférer un record qui a des options (help ou man), pas seulement `helpTextRaw != null`. Remplacer la ligne :
```ts
    const base = existing.helpTextRaw == null && rec.helpTextRaw != null ? rec : existing;
```
par :
```ts
    // Préférer le record le plus informatif : d'abord celui qui a des options, sinon celui avec du help.
    const recScore = (r: KaliToolRecord) => (r.options.length > 0 ? 2 : r.helpTextRaw ? 1 : 0);
    const base = recScore(rec) > recScore(existing) ? rec : existing;
```
(`KaliToolRecord` est déjà importé dans ce fichier.)

- [ ] **Step 6: Lancer pour vérifier le succès**

Run: `pnpm nx test api-gateway --testFile=normalize.spec.ts` puis `pnpm nx test api-gateway --testFile=generate-transform.spec.ts`
Expected: PASS. Corriger tout fixture préexistant de `generate-transform.spec.ts` qui n'a pas les nouveaux champs (ajouter `manTextRaw`/attendre `optionsSource`) et le noter.

- [ ] **Step 7: Type-check + commit**

Run: `pnpm nx type-check api-gateway`
```bash
git add apps/api-gateway/src/app/tools/kali/types.ts apps/api-gateway/src/app/tools/kali/normalize.ts apps/api-gateway/src/app/tools/kali/generate-transform.ts apps/api-gateway/src/app/tools/kali/__tests__/normalize.spec.ts
git commit -m "feat(kali): merge help+man option sources with optionsSource provenance"
```

---

## Task 4 : pipeline de capture (strip caps + capture man)

**Files:**
- Modify: `tools/kali-catalog/Dockerfile.kali-catalog`
- Modify: `tools/kali-catalog/capture.sh`

- [ ] **Step 1: Dockerfile — outils + strip caps**

Dans `tools/kali-catalog/Dockerfile.kali-catalog`, ajouter `libcap2-bin` (getcap/setcap) et `util-linux` (col) à la liste d'install, et ajouter une étape de strip des caps après l'install :

Remplacer le bloc `RUN apt-get ...` par :
```dockerfile
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ${KALI_META} man-db jq coreutils gawk libcap2-bin util-linux \
 && rm -rf /var/lib/apt/lists/*

# Un binaire setcap (ex. nmap -> cap_net_raw) ne peut pas être exec sous les caps
# docker par défaut (EPERM), ce qui casse la capture de son --help. On strippe les
# file-capabilities dans cette image jetable — `--help` n'en a pas besoin.
RUN set -eux; for f in $(getcap -r /usr/bin /usr/sbin /usr/lib 2>/dev/null | cut -d' ' -f1); do setcap -r "$f" 2>/dev/null || true; done
```

- [ ] **Step 2: capture.sh — capturer manTextRaw**

Dans `tools/kali-catalog/capture.sh`, dans la boucle par binaire, après la ligne `man_ok=...`, ajouter la capture du texte man et l'inclure dans le JSON. Remplacer le bloc `man_ok=... ; jq -cn ...` par :
```sh
      man_ok="false"; timeout "${HELP_TIMEOUT}" man "$bin" >/dev/null 2>&1 && man_ok="true"
      man_text=""
      if [ "$man_ok" = "true" ]; then
        man_text="$(timeout "${HELP_TIMEOUT}" man "$bin" 2>/dev/null | col -bx | head -c "${HELP_MAX_BYTES}")"
      fi
      jq -cn \
        --arg package "$pkg" --arg binary "$bin" --arg description "$desc" \
        --arg homepage "$homepage" --arg category "$category" \
        --arg help "$help" --arg mantext "$man_text" --argjson man "$man_ok" \
        '{package:$package, binary:$binary, description:$description,
          homepage: ($homepage|select(.!="")//null),
          categories: [$category],
          helpTextRaw: ($help|select(.!="")//null),
          manTextRaw: ($mantext|select(.!="")//null),
          manAvailable: $man}'
```

- [ ] **Step 3: Vérification légère du pipeline (build + micro-capture)**

Note : le build complet (`kali-linux-large`) est très lourd ; pour un smoke rapide, builder avec un métapaquet minuscule et vérifier que `manTextRaw` sort et que nmap n'échoue plus.

Run:
```bash
docker build --build-arg KALI_META=kali-tools-information-gathering \
  -f tools/kali-catalog/Dockerfile.kali-catalog -t autoscanner/kali-catalog:smoke tools/kali-catalog
docker run --rm --network none autoscanner/kali-catalog:smoke | grep -m1 '"binary":"nmap"' | jq '{binary, help:(.helpTextRaw|tostring|.[0:40]), hasMan:(.manTextRaw!=null)}'
```
Expected: la ligne nmap ne contient PLUS `Operation not permitted` dans `helpTextRaw`, et `hasMan: true`. (Si `kali-tools-information-gathering` n'inclut pas nmap, choisir un métapaquet qui l'inclut ou tester un autre binaire setcap.)

- [ ] **Step 4: Commit**

```bash
git add tools/kali-catalog/Dockerfile.kali-catalog tools/kali-catalog/capture.sh
git commit -m "feat(kali-catalog): strip file-caps for --help exec and capture man text"
```

---

## Task 5 : script de rapport de couverture

**Files:**
- Create: `tools/kali-catalog/coverage-report.ts`
- Modify: `package.json` (script `kali:coverage`)

- [ ] **Step 1: Écrire le script**

`tools/kali-catalog/coverage-report.ts` :

```ts
/* Rapport de couverture des options du dataset Kali. Usage: pnpm kali:coverage */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Rec {
  binary: string;
  options: unknown[];
  parseConfidence: 'high' | 'low' | 'none';
  optionsSource?: 'help' | 'man' | 'none';
  helpTextRaw: string | null;
  manAvailable: boolean;
}

const path = process.argv[2] ?? join(process.cwd(), 'data', 'kali-tools.json');
const data = JSON.parse(readFileSync(path, 'utf8')) as Rec[];

const conf = { high: 0, low: 0, none: 0 } as Record<string, number>;
const src = { help: 0, man: 0, none: 0 } as Record<string, number>;
for (const r of data) {
  conf[r.parseConfidence] = (conf[r.parseConfidence] ?? 0) + 1;
  const s = r.optionsSource ?? 'none';
  src[s] = (src[s] ?? 0) + 1;
}
const none = data.filter((r) => r.parseConfidence === 'none').map((r) => r.binary).sort();

console.log(`Kali dataset: ${data.length} tools`);
console.log('parseConfidence:', conf);
console.log('optionsSource :', src);
console.log(`still 'none' (${none.length}):`, none.join(', '));
```

- [ ] **Step 2: Ajouter le script npm**

Dans `package.json`, section `scripts`, ajouter :
```json
    "kali:coverage": "tsx tools/kali-catalog/coverage-report.ts",
```

- [ ] **Step 3: Vérifier (sur le dataset actuel)**

Run: `pnpm kali:coverage`
Expected: imprime la distribution (avant régénération : high 41 / low 4 / none 43, optionsSource majoritairement `help`/`none`). Sert de mesure de référence.

- [ ] **Step 4: Commit**

```bash
git add tools/kali-catalog/coverage-report.ts package.json
git commit -m "feat(kali-catalog): coverage report script"
```

---

## Task 6 : garde dataset↔image (test d'intégration gated)

**Files:**
- Create: `apps/api-gateway/src/app/tools/kali/__tests__/dataset-image.spec.ts`

- [ ] **Step 1: Écrire le test gated**

`apps/api-gateway/src/app/tools/kali/__tests__/dataset-image.spec.ts` :

```ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test d'intégration : nécessite Docker + l'image kali-toolbox. Gardé derrière
// KALI_IMAGE_CHECK=1 pour ne pas casser CI/dev sans l'image (25 GB).
const gated = process.env.KALI_IMAGE_CHECK === '1' ? describe : describe.skip;
const IMAGE = process.env.KALI_TOOLBOX_IMAGE ?? 'autoscanner/kali-toolbox:1.0';

gated('dataset ↔ image', () => {
  it('chaque binaire du dataset existe dans l’image', () => {
    const path = join(process.cwd(), 'data', 'kali-tools.json');
    const bins = (JSON.parse(readFileSync(path, 'utf8')) as { binary: string }[]).map((r) => r.binary);
    const script = `for b in ${bins.join(' ')}; do command -v "$b" >/dev/null 2>&1 || echo "MISS $b"; done`;
    const out = execFileSync('docker', ['run', '--rm', IMAGE, 'sh', '-c', script], {
      encoding: 'utf8',
    });
    const missing = out.split('\n').filter((l) => l.startsWith('MISS ')).map((l) => l.slice(5));
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Vérifier (localement, image présente)**

Run: `KALI_IMAGE_CHECK=1 pnpm nx test api-gateway --testFile=dataset-image.spec.ts`
Expected: PASS (0 manquant — confirmé lors de l'audit). Sans la var d'env, le describe est `skip` (0 test exécuté, pas d'échec).

- [ ] **Step 3: Commit**

```bash
git add apps/api-gateway/src/app/tools/kali/__tests__/dataset-image.spec.ts
git commit -m "test(kali): gated dataset<->image binary presence guard"
```

---

## Task 7 : régénérer le dataset (`pnpm kali:catalog`)

**Files:**
- Modify (généré): `data/kali-tools.json`

Note : étape **lourde et dépendante de l'environnement** (build image Kali `kali-linux-large` + capture). C'est le paiement du travail des tâches 1-4. À exécuter par l'opérateur si le build est trop lourd pour l'agent.

- [ ] **Step 1: Régénérer**

Run: `pnpm kali:catalog`
(Ce script : build `autoscanner/kali-catalog:latest`, `docker run --network none`, `generate.ts` → réécrit `data/kali-tools.json`.)

- [ ] **Step 2: Mesurer l'amélioration**

Run: `pnpm kali:coverage`
Expected: `none` en baisse nette vs référence (Task 5) — au minimum les 5 échecs de capture (nmap, gpg2john, hccap2john, racf2john, responder-DHCP_Auto) récupérés, plus les gains man (`optionsSource: 'man'` non nul) et les flush-left (john/burpsuite/wpapcap2john). Consigner les chiffres avant/après dans le message de commit.

- [ ] **Step 3: Sanity-check nmap**

Run: `pnpm kali:coverage 2>/dev/null` puis vérifier nmap :
```bash
node -e "const d=require('./data/kali-tools.json');const n=d.find(x=>x.binary==='nmap');console.log('nmap options=',n.options.length,'source=',n.optionsSource,'conf=',n.parseConfidence)"
```
Expected: nmap a désormais des options (source `help` ou `man`), plus 0.

- [ ] **Step 4: Commit du dataset régénéré**

```bash
git add data/kali-tools.json
git commit -m "chore(kali-catalog): regenerate dataset with man-sourced options (before/after: none N->M)"
```

---

## Task 8 : exposer `optionsSource`/`manTextRaw` dans l'API

**Files:**
- Modify: `apps/api-gateway/src/app/tools/dto/kali-tool.object.ts`
- Modify: `apps/api-gateway/src/app/tools/kali-catalog.service.ts`

- [ ] **Step 1: Étendre le DTO**

Dans `apps/api-gateway/src/app/tools/dto/kali-tool.object.ts`, ajouter à `KaliToolDetailObject` (après `manAvailable`) :
```ts
  @Field() optionsSource!: string;
  @Field(() => String, { nullable: true }) manTextRaw?: string | null;
```

- [ ] **Step 2: Peupler dans le service**

Dans `apps/api-gateway/src/app/tools/kali-catalog.service.ts`, méthode `detail(binary)` : ajouter au mapping du record vers `KaliToolDetailObject` les deux champs `optionsSource: rec.optionsSource` et `manTextRaw: rec.manTextRaw`. (Lire la méthode pour insérer au bon endroit ; le record porte déjà ces champs après Task 3.)

- [ ] **Step 3: Type-check**

Run: `pnpm nx type-check api-gateway`
Expected: PASS (SDL code-first régénérée au boot).

- [ ] **Step 4: Commit**

```bash
git add apps/api-gateway/src/app/tools/dto/kali-tool.object.ts apps/api-gateway/src/app/tools/kali-catalog.service.ts
git commit -m "feat(api): expose optionsSource and manTextRaw on kaliTool"
```

---

## Task 9 : frontend — badge source + man repliable

**Files:**
- Modify: `apps/frontend/src/lib/graphql/queries.ts`
- Modify: `apps/frontend/src/features/scans/kali-tool-doc-panel.tsx`

- [ ] **Step 1: Étendre la query**

Dans `apps/frontend/src/lib/graphql/queries.ts`, dans la query `kaliTool(binary:)` (constante `KALI_TOOL_QUERY`), ajouter `optionsSource` et `manTextRaw` à la sélection (à côté de `helpTextRaw`/`options`).

- [ ] **Step 2: Afficher la source + le man**

Dans `apps/frontend/src/features/scans/kali-tool-doc-panel.tsx` :
- Étendre le type local du résultat (`kaliTool`) avec `optionsSource?: string` et `manTextRaw?: string | null`.
- Près du titre de la liste d'options, afficher un petit badge quand `optionsSource === 'man'` :
```tsx
{tool.optionsSource === 'man' ? (
  <span className="ml-2 rounded border border-slate-600 px-1 text-[10px] text-slate-400">source: man</span>
) : null}
```
- Ajouter, sous la liste d'options, une section repliable du texte man quand présent :
```tsx
{tool.manTextRaw ? (
  <details className="mt-2 text-xs text-slate-500">
    <summary className="cursor-pointer">Page man</summary>
    <pre className="mt-1 whitespace-pre-wrap">{tool.manTextRaw}</pre>
  </details>
) : null}
```
(Adapter `tool` au nom exact de la variable du résultat de la query dans ce composant.)

- [ ] **Step 3: Type-check + tests existants**

Run: `pnpm nx type-check frontend && pnpm nx test frontend --testFile=kali-tool-doc-panel.test.tsx && pnpm nx test frontend --testFile=kali-add-flag.spec.tsx`
Expected: PASS. Si un mock de query casse (champs ajoutés), compléter le mock et le noter.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/lib/graphql/queries.ts apps/frontend/src/features/scans/kali-tool-doc-panel.tsx
git commit -m "feat(frontend): show option source badge and man text in Kali doc panel"
```

---

## Task 10 : vérification finale

**Files:** aucun (validation)

- [ ] **Step 1: Suites ciblées**

Run: `pnpm nx test api-gateway --testFile=parse-help.spec.ts && pnpm nx test api-gateway --testFile=parse-man.spec.ts && pnpm nx test api-gateway --testFile=normalize.spec.ts && pnpm nx type-check api-gateway frontend`
(Utiliser `pnpm nx run-many -t type-check -p api-gateway frontend` — la forme `nx type-check a b` échoue.)
Expected: tout vert.

- [ ] **Step 2: Couverture après régénération**

Run: `pnpm kali:coverage`
Expected: `none` nettement en baisse vs référence ; `optionsSource: 'man'` non nul.

- [ ] **Step 3 (opérateur, live) : doc panel**

Frontend rebuild + ouvrir un scanner mappé Kali → le panneau montre les options (nmap désormais peuplé), le badge « source: man » le cas échéant, et le texte man repliable.

---

## Self-review (fait à l'écriture)

- **Couverture spec** : parser help durci ✔ (T1), parser man ✔ (T2), fusion+optionsSource ✔ (T3), capture caps+man ✔ (T4), rapport couverture ✔ (T5), garde dataset↔image ✔ (T6), régénération ✔ (T7), API ✔ (T8), frontend ✔ (T9).
- **Placeholders** : code fourni à chaque étape ; les points « adapter au fichier » (nom de variable du panel, insertion dans `detail()`) sont des repérages ciblés, pas des blancs.
- **Cohérence des noms** : `parseManOptions`, `optionsSource`, `manTextRaw`, `coverage-report.ts`, `KALI_IMAGE_CHECK` — constants d'une tâche à l'autre. Le contrat `KaliToolOption`/`ParseConfidence` est réutilisé sans changement.
- **Dépendances** : T7 (régénération) dépend de T1-T4 ; T8/T9 dépendent de T3. T6 est indépendant (déjà vrai aujourd'hui). Les parsers (T1-T3) sont testables sans recapture.
- **Réalité** : les utilitaires réellement sans options resteront `none` — attendu, pas un échec du plan.
