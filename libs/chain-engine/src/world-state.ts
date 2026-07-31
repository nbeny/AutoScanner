import type { Severity } from '@autoscanner/chains';

/** Image distillée, par hôte, de tout ce qui est découvert (fournie par le worker). */
export interface WorldState {
  target: string;
  openPorts: { port: number; protocol: string }[];
  services: { port: number; name?: string; version?: string }[];
  technologies: { name: string; version?: string }[];
  urls: string[];
  endpoints: string[];
  findings: { title: string; severity: string }[];
  scannersRun: string[];
}

/** Entités chargées depuis la DB par le worker, avec les champs lus par les filtres. */
export interface ResolvableEntities {
  subdomains: { canonicalValue: string; httpStatus?: number | null }[];
  ipAddresses: { value: string; cdn?: { behind: boolean; provider?: string } }[];
  urls: { canonicalUrl: string; statusCode?: number | null }[];
  endpoints: { canonicalUrl: string; statusCode?: number | null }[];
  emails: { address: string }[];
}

/** Cible candidate normalisée sur laquelle les filtres opèrent. */
export interface Candidate {
  value: string;
  httpStatus?: number | null;
  statusCode?: number | null;
  cdn?: { behind: boolean; provider?: string };
}

export type { Severity };
