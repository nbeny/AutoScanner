import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface ShareEntry {
  comment?: string;
  access?: { read?: boolean; write?: boolean };
}

interface RawDoc {
  target?: string;
  users?: Record<string, { username?: string }>;
  groups?: Record<string, { members?: string[] }>;
  shares?: Record<string, ShareEntry>;
  sessions?: { null_session?: boolean };
  policy?: { domain_password_information?: { min_password_length?: number } };
}

@Injectable()
export class Enum4LinuxJsonParser implements Parser {
  readonly name = 'enum4linux-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let doc: RawDoc;
    try {
      doc = JSON.parse(text) as RawDoc;
    } catch {
      return out;
    }

    const host = doc.target ?? ctx.target;

    for (const u of Object.values(doc.users ?? {})) {
      if (u.username) {
        out.identities.push({
          kind: 'USERNAME',
          seed: host,
          service: u.username,
          source: 'enum4linux-ng',
        });
      }
    }

    for (const members of Object.values(doc.groups ?? {})) {
      for (const m of members.members ?? []) {
        out.identities.push({
          kind: 'USERNAME',
          seed: host,
          service: m,
          source: 'enum4linux-ng',
        });
      }
    }

    for (const [shareName, share] of Object.entries(doc.shares ?? {})) {
      const value = `${host}\\${shareName}`;
      out.assets.push({ type: 'DOMAIN', value });
      if (share.access?.read === true) {
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `Anonymous share readable: ${shareName}`,
          severity: 'MEDIUM',
          location: value,
          description: share.comment,
        });
      }
    }

    if (doc.sessions?.null_session === true) {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: 'SMB null session allowed',
        severity: 'HIGH',
        location: host,
      });
    }

    const minLen = doc.policy?.domain_password_information?.min_password_length;
    if (typeof minLen === 'number' && minLen < 8) {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: `Weak password policy: min length ${minLen}`,
        severity: 'MEDIUM',
        location: host,
      });
    }

    return out;
  }
}
