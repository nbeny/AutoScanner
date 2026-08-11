import { z } from 'zod';
import {
  ScannerCategory,
  type ScannerRegistry,
  type ScannerDefinition,
} from '@autoscanner/scanner-sdk';

/**
 * A flattened, prompt-friendly view of a single scanner. This is the shape the
 * decision LLM sees — it must contain everything Claude needs to pick a scanner
 * by exact name and reason about what it does, and nothing else.
 */
export interface CatalogEntry {
  name: string;
  displayName: string;
  description: string;
  primaryCategory: string;
  categories: string[];
  produces: string[];
  inputs: string[];
  requiresCredential?: string;
}

/**
 * Best-effort extraction of the top-level input keys from a scanner's Zod
 * schema. Only `ZodObject` schemas expose named keys; anything else (unions,
 * effects, primitives) yields `[]` rather than throwing.
 */
function inputKeys(def: ScannerDefinition): string[] {
  const schema = def.inputSchema;
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape);
  }
  return [];
}

/**
 * Map the live scanner registry into an array of {@link CatalogEntry}. Order
 * follows registry insertion order (`registry.list()`). Returns the FULL list —
 * capping for the prompt happens in {@link catalogToPromptText}.
 */
export function buildScannerCatalog(registry: ScannerRegistry): CatalogEntry[] {
  return registry.list().map((def) => {
    const categories = [...def.category];
    const entry: CatalogEntry = {
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      primaryCategory: String(def.primaryCategory ?? categories[0] ?? ScannerCategory.MISC),
      categories,
      produces: [...def.produces],
      inputs: inputKeys(def),
    };
    if (def.requiresCredential) {
      entry.requiresCredential = def.requiresCredential;
    }
    return entry;
  });
}

/**
 * Categories worth surfacing first in the capped prompt shortlist — a pentest
 * leans recon → web → service → vuln. Entries in these categories sort ahead of
 * everything else; the rest keep registry order behind them.
 */
const PREFERRED_CATEGORIES: string[] = [
  ScannerCategory.PASSIVE_RECON,
  ScannerCategory.NETWORK_DISCOVERY,
  ScannerCategory.SUBDOMAIN_ENUM,
  ScannerCategory.DNS,
  ScannerCategory.PORT_SCAN,
  ScannerCategory.SERVICE_DETECTION,
  ScannerCategory.WEB_FINGERPRINT,
  ScannerCategory.WEB_ENUM,
  ScannerCategory.VULN_SCAN,
  ScannerCategory.SSL_TLS,
  ScannerCategory.SMB_WINDOWS,
  ScannerCategory.SNMP,
  ScannerCategory.SMTP,
];

/**
 * Render a **capped, priority-sorted shortlist** of the catalog as compact
 * `name — description` lines for the prompt. The full registry now holds 850+
 * generic Kali binaries — far too many to dump — so this trims to `limit`
 * entries (recon/web/vuln/service-leaning) and appends a note that more exist;
 * Claude may still name any registered binary by exact name.
 */
export function catalogToPromptText(entries: CatalogEntry[], limit = 60): string {
  const rank = (e: CatalogEntry): number => {
    const idx = PREFERRED_CATEGORIES.indexOf(e.primaryCategory);
    return idx === -1 ? PREFERRED_CATEGORIES.length : idx;
  };

  const sorted = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
    .map(({ e }) => e);

  const shown = sorted.slice(0, limit);
  const lines = shown.map((e) => {
    const cred = e.requiresCredential ? ` (requires credential: ${e.requiresCredential})` : '';
    const desc = e.description?.trim() || e.displayName;
    return `${e.name} — ${desc}${cred}`;
  });

  const remaining = entries.length - shown.length;
  if (remaining > 0) {
    lines.push(
      `(+${remaining} more tools available — you may name any registered binary by its exact name.)`,
    );
  }
  return lines.join('\n');
}
