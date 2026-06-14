import type { NormalizedFinding, Severity } from '@autoscanner/parsers';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NormalizedWebhookFinding extends NormalizedFinding {
  assetValue: string;
}

export interface NormalizedWebhookBatch {
  engagementId: string;
  source: string;
  findings: NormalizedWebhookFinding[];
}

export class WebhookNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookNormalizationError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract hostname from a URL; fall back to the raw value on parse failure. */
export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const VALID_SEVERITIES = new Set<string>(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

function coerceSeverity(raw: unknown, context: string): Severity {
  if (typeof raw !== 'string') {
    throw new WebhookNormalizationError(`${context}: severity must be a string, got ${typeof raw}`);
  }
  const upper = raw.toUpperCase();
  if (!VALID_SEVERITIES.has(upper)) {
    throw new WebhookNormalizationError(`${context}: unknown severity "${raw}"`);
  }
  return upper as Severity;
}

function requireEngagementId(payload: Record<string, unknown>): string {
  const id = payload['engagementId'];
  if (typeof id !== 'string' || id.trim() === '') {
    throw new WebhookNormalizationError('Missing or empty engagementId in webhook payload');
  }
  return id;
}

// ---------------------------------------------------------------------------
// Source adapters
// ---------------------------------------------------------------------------

function normalizeGeneric(payload: Record<string, unknown>): NormalizedWebhookBatch {
  const engagementId = requireEngagementId(payload);
  const raw = payload['findings'];
  if (!Array.isArray(raw)) {
    throw new WebhookNormalizationError('generic: findings must be an array');
  }

  const findings: NormalizedWebhookFinding[] = (raw as Record<string, unknown>[]).map((item, i) => {
    const severity = coerceSeverity(item['severity'], `generic finding[${i}]`);
    return {
      scannerName: 'webhook:generic',
      title: String(item['title'] ?? ''),
      severity,
      assetValue: String(item['assetValue'] ?? ''),
      location: item['location'] !== undefined ? String(item['location']) : undefined,
      cveId: item['cveId'] !== undefined ? String(item['cveId']) : undefined,
      evidence: item['evidence'] !== undefined ? item['evidence'] : undefined,
    };
  });

  return { engagementId, source: 'generic', findings };
}

const ZAP_RISK_MAP: Record<string, Severity> = {
  High: 'HIGH',
  Medium: 'MEDIUM',
  Low: 'LOW',
  Informational: 'INFO',
};

function normalizeZap(payload: Record<string, unknown>): NormalizedWebhookBatch {
  const engagementId = requireEngagementId(payload);
  const raw = payload['alerts'];
  if (!Array.isArray(raw)) {
    throw new WebhookNormalizationError('zap: alerts must be an array');
  }

  const findings: NormalizedWebhookFinding[] = (raw as Record<string, unknown>[]).map((item, i) => {
    const risk = String(item['risk'] ?? '');
    const severity = ZAP_RISK_MAP[risk];
    if (!severity) {
      throw new WebhookNormalizationError(`zap alert[${i}]: unknown risk "${risk}"`);
    }
    const url = String(item['url'] ?? '');
    return {
      scannerName: 'webhook:zap',
      title: String(item['name'] ?? ''),
      severity,
      assetValue: hostFromUrl(url),
      location: url || undefined,
    };
  });

  return { engagementId, source: 'zap', findings };
}

const BURP_SEVERITY_MAP: Record<string, Severity> = {
  High: 'HIGH',
  Medium: 'MEDIUM',
  Low: 'LOW',
  Information: 'INFO',
};

function normalizeBurp(payload: Record<string, unknown>): NormalizedWebhookBatch {
  const engagementId = requireEngagementId(payload);
  const raw = payload['issues'];
  if (!Array.isArray(raw)) {
    throw new WebhookNormalizationError('burp: issues must be an array');
  }

  const findings: NormalizedWebhookFinding[] = (raw as Record<string, unknown>[]).map((item, i) => {
    const sev = String(item['severity'] ?? '');
    const severity = BURP_SEVERITY_MAP[sev];
    if (!severity) {
      throw new WebhookNormalizationError(`burp issue[${i}]: unknown severity "${sev}"`);
    }
    const host = String(item['host'] ?? '');
    const path = item['path'] !== undefined ? String(item['path']) : '';
    return {
      scannerName: 'webhook:burp',
      title: String(item['name'] ?? ''),
      severity,
      assetValue: host,
      location: host || path ? `${host}${path ?? ''}` : undefined,
    };
  });

  return { engagementId, source: 'burp', findings };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// Use Object.create(null) so the object has no prototype chain — prevents a
// source value of "__proto__" or "constructor" from resolving to inherited members.
const ADAPTERS: Record<string, (payload: Record<string, unknown>) => NormalizedWebhookBatch> =
  Object.create(null) as Record<
    string,
    (payload: Record<string, unknown>) => NormalizedWebhookBatch
  >;
ADAPTERS['generic'] = normalizeGeneric;
ADAPTERS['zap'] = normalizeZap;
ADAPTERS['burp'] = normalizeBurp;

/**
 * Normalise a raw webhook payload for a given source into a
 * `NormalizedWebhookBatch` ready for persistence by the WebhookProcessor.
 *
 * Throws `WebhookNormalizationError` on any validation failure.
 */
export function normalizeWebhook(source: string, payload: unknown): NormalizedWebhookBatch {
  // hasOwnProperty guard is redundant when ADAPTERS has no prototype, but is
  // kept as defence-in-depth should the declaration ever change.
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, source)) {
    throw new WebhookNormalizationError(`Unknown webhook source: "${source}"`);
  }
  const adapter = ADAPTERS[source];
  return adapter(payload as Record<string, unknown>);
}
