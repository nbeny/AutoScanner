/** Clé conventionnelle des arguments bruts, hors schéma Zod par-scanner. */
export const EXTRA_ARGS_KEY = 'extraArgs';

const MAX_EXTRA_ARGS = 50;
const MAX_ARG_LEN = 1024;

/**
 * Normalise une valeur `extraArgs` non fiable en liste de chaînes sûres :
 * uniquement des chaînes non vides (après trim), bornées en nombre et en taille.
 * Pas de découpage shell ni d'interprétation — chaque élément = un argument argv.
 */
export function sanitizeExtraArgs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, MAX_ARG_LEN));
    if (out.length >= MAX_EXTRA_ARGS) break;
  }
  return out;
}

/**
 * Injecte les arguments bruts juste après le binaire (index 0) — plus sûr pour
 * l'ordre des flags que de les mettre après la cible positionnelle en fin de commande.
 */
export function injectExtraArgs(cmd: string[], extraArgs: string[]): string[] {
  if (extraArgs.length === 0) return cmd;
  if (cmd.length === 0) return [...extraArgs];
  return [cmd[0], ...extraArgs, ...cmd.slice(1)];
}
