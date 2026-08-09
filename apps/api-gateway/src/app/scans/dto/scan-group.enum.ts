import { registerEnumType } from '@nestjs/graphql';

/** Groupe de scanners : OSINT (passif/identité/breach) vs RECON (tout le reste). */
export enum ScanGroup {
  OSINT = 'OSINT',
  RECON = 'RECON',
}

registerEnumType(ScanGroup, { name: 'ScanGroup' });
