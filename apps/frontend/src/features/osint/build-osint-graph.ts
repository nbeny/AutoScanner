export type OsintGraphNodeKind = 'identity' | 'email' | 'asset';

export interface OsintGraphNode {
  id: string;
  kind: OsintGraphNodeKind;
  label: string;
  sub?: string;
  /** Layout column: identity = 0, email = 1, asset = 2. */
  column: number;
}

export interface OsintGraphEdge {
  from: string;
  to: string;
}

export interface OsintGraph {
  nodes: OsintGraphNode[];
  edges: OsintGraphEdge[];
}

export interface IdentityInput {
  id: string;
  service: string;
  seed: string;
}
export interface EmailInput {
  id: string;
  address: string;
}
export interface AssetInput {
  id: string;
  value: string;
  type: string;
}

const ASSET_TYPES = new Set(['DOMAIN', 'SUBDOMAIN', 'IP_ADDRESS']);
const lc = (s: string) => s.trim().toLowerCase();
const localPart = (address: string) => lc(address.split('@')[0] ?? '');
const domainOf = (address: string) => lc(address.split('@')[1] ?? '');

/**
 * Build a layered OSINT relationship graph linking discovered identities
 * (accounts) → emails → technical assets (domains/subdomains/IPs).
 *
 * - identity → email: the identity seed is the email address or its local-part
 *   (holehe seeds the full address, maigret the local-part).
 * - email → asset: the email domain matches a domain/subdomain asset value.
 *
 * Nodes with no edges are still returned (an isolated identity is informative).
 */
export function buildOsintGraph(
  identities: IdentityInput[],
  emails: EmailInput[],
  assets: AssetInput[],
): OsintGraph {
  const nodes: OsintGraphNode[] = [];
  const edges: OsintGraphEdge[] = [];

  const emailNodeByAddress = new Map<string, string>();
  for (const e of emails) {
    const key = lc(e.address);
    if (emailNodeByAddress.has(key)) continue;
    const id = `email:${key}`;
    emailNodeByAddress.set(key, id);
    nodes.push({ id, kind: 'email', label: e.address, sub: domainOf(e.address), column: 1 });
  }

  const assetNodeByValue = new Map<string, string>();
  for (const a of assets) {
    if (!ASSET_TYPES.has(a.type)) continue;
    const key = lc(a.value);
    if (assetNodeByValue.has(key)) continue;
    const id = `asset:${a.id}`;
    assetNodeByValue.set(key, id);
    nodes.push({ id, kind: 'asset', label: a.value, sub: a.type, column: 2 });
  }

  for (const i of identities) {
    const id = `identity:${i.id}`;
    nodes.push({ id, kind: 'identity', label: i.service, sub: i.seed, column: 0 });
    const seed = lc(i.seed);
    for (const [addrKey, emailId] of emailNodeByAddress) {
      if (addrKey === seed || localPart(addrKey) === seed) edges.push({ from: id, to: emailId });
    }
  }

  for (const [addrKey, emailId] of emailNodeByAddress) {
    const assetId = assetNodeByValue.get(domainOf(addrKey));
    if (assetId) edges.push({ from: emailId, to: assetId });
  }

  return { nodes, edges };
}
