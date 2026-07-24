import { z } from 'zod';
import type { ScannerRegistry, ScannerDefinition } from '@autoscanner/scanner-sdk';

/**
 * A flattened, prompt-friendly view of a single scanner. This is the shape the
 * decision LLM sees — it must contain everything Claude needs to pick a scanner
 * by exact name and construct valid inputs, and nothing else.
 */
export interface CatalogEntry {
  name: string;
  displayName: string;
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
 * follows registry insertion order (`registry.list()`).
 */
export function buildScannerCatalog(registry: ScannerRegistry): CatalogEntry[] {
  return registry.list().map((def) => {
    const entry: CatalogEntry = {
      name: def.name,
      displayName: def.displayName,
      categories: [...def.category],
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
 * Render the catalog as a compact, one-line-per-scanner listing suitable for
 * embedding directly in a prompt, e.g.:
 *   `nmap [port-scan,service-detection] produces:{Asset,Port} inputs:{ports}`
 */
export function catalogToPromptText(entries: CatalogEntry[]): string {
  return entries
    .map((e) => {
      const cred = e.requiresCredential ? ` requiresCredential:${e.requiresCredential}` : '';
      return `${e.name} [${e.categories.join(',')}] produces:{${e.produces.join(
        ',',
      )}} inputs:{${e.inputs.join(',')}}${cred}`;
    })
    .join('\n');
}
