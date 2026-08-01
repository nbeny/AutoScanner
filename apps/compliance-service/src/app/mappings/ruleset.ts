export type ComplianceFrameworkName =
  | 'OWASP_TOP10'
  | 'MITRE_ATTACK'
  | 'CWE'
  | 'CIS'
  | 'ISO27001'
  | 'PCI_DSS'
  | 'GDPR'
  | 'NIS2';

export interface ComplianceControl {
  framework: ComplianceFrameworkName;
  controlId: string;
  controlTitle: string;
  confidence: number;
}

export interface ComplianceRuleset {
  version: number;
  /** Keyed on the finding's structural category (lower-cased). */
  byCategory: Record<string, ComplianceControl[]>;
}

/**
 * Versioned mapping table (SP2d). v1 keys on the structural-hash category the correlator already
 * assigns. It is deliberately a single isolated data module so it can grow (more categories,
 * more frameworks) without touching the mapper or the service. Extending it is a data edit +
 * rebuild; hot-reload from disk is a future enhancement.
 */
export const RULESET: ComplianceRuleset = {
  version: 1,
  byCategory: {
    'sql-injection': [
      {
        framework: 'OWASP_TOP10',
        controlId: 'A03:2021',
        controlTitle: 'Injection',
        confidence: 0.9,
      },
      { framework: 'CWE', controlId: 'CWE-89', controlTitle: 'SQL Injection', confidence: 0.9 },
      {
        framework: 'MITRE_ATTACK',
        controlId: 'T1190',
        controlTitle: 'Exploit Public-Facing Application',
        confidence: 0.7,
      },
    ],
    xss: [
      {
        framework: 'OWASP_TOP10',
        controlId: 'A03:2021',
        controlTitle: 'Injection',
        confidence: 0.8,
      },
      {
        framework: 'CWE',
        controlId: 'CWE-79',
        controlTitle: 'Cross-site Scripting',
        confidence: 0.9,
      },
    ],
    'command-injection': [
      {
        framework: 'OWASP_TOP10',
        controlId: 'A03:2021',
        controlTitle: 'Injection',
        confidence: 0.9,
      },
      {
        framework: 'CWE',
        controlId: 'CWE-78',
        controlTitle: 'OS Command Injection',
        confidence: 0.9,
      },
      {
        framework: 'MITRE_ATTACK',
        controlId: 'T1059',
        controlTitle: 'Command and Scripting Interpreter',
        confidence: 0.7,
      },
    ],
    exposure: [
      {
        framework: 'OWASP_TOP10',
        controlId: 'A01:2021',
        controlTitle: 'Broken Access Control',
        confidence: 0.7,
      },
      {
        framework: 'CWE',
        controlId: 'CWE-200',
        controlTitle: 'Exposure of Sensitive Information',
        confidence: 0.8,
      },
    ],
    'default-credentials': [
      {
        framework: 'OWASP_TOP10',
        controlId: 'A07:2021',
        controlTitle: 'Identification and Authentication Failures',
        confidence: 0.9,
      },
      {
        framework: 'CWE',
        controlId: 'CWE-1392',
        controlTitle: 'Use of Default Credentials',
        confidence: 0.9,
      },
    ],
    tls: [
      {
        framework: 'OWASP_TOP10',
        controlId: 'A02:2021',
        controlTitle: 'Cryptographic Failures',
        confidence: 0.8,
      },
      {
        framework: 'CWE',
        controlId: 'CWE-326',
        controlTitle: 'Inadequate Encryption Strength',
        confidence: 0.7,
      },
    ],
    misconfiguration: [
      {
        framework: 'OWASP_TOP10',
        controlId: 'A05:2021',
        controlTitle: 'Security Misconfiguration',
        confidence: 0.8,
      },
    ],
  },
};
