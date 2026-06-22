import { SEVERITY_ORDER } from '../../components/charts/chart-theme';

export interface VulnRow {
  id: string;
  engagementId: string;
  title: string;
  severity: string;
  cveId: string | null;
  status: string;
  sources: string[];
  riskScore: number;
  assetId: string;
  assetValue?: string | null;
  lastSeenAt: string;
}

export type GroupAxis = 'severity' | 'cve' | 'tool' | 'asset' | 'status';

export interface VulnGroup {
  key: string;
  label: string;
  rows: VulnRow[];
}

export function groupVulns(rows: VulnRow[], axis: GroupAxis): VulnGroup[] {
  switch (axis) {
    case 'severity': {
      const map = new Map<string, VulnRow[]>();
      for (const row of rows) {
        const key = row.severity;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(row);
      }
      // Order by SEVERITY_ORDER (which is lowercase), comparing uppercase severity keys
      return SEVERITY_ORDER.flatMap((sev) => {
        const key = sev.toUpperCase();
        const bucket = map.get(key);
        if (!bucket) return [];
        return [{ key, label: key, rows: bucket }];
      });
    }

    case 'cve': {
      const map = new Map<string, VulnRow[]>();
      for (const row of rows) {
        const key = row.cveId ?? '__none__';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(row);
      }
      const named: VulnGroup[] = [];
      let noBucket: VulnGroup | null = null;
      for (const [key, bucket] of map.entries()) {
        if (key === '__none__') {
          noBucket = { key: '__none__', label: '(sans CVE)', rows: bucket };
        } else {
          named.push({ key, label: key, rows: bucket });
        }
      }
      named.sort((a, b) => b.rows.length - a.rows.length);
      return noBucket ? [...named, noBucket] : named;
    }

    case 'tool': {
      const map = new Map<string, VulnRow[]>();
      for (const row of rows) {
        for (const tool of row.sources) {
          if (!map.has(tool)) map.set(tool, []);
          map.get(tool)!.push(row);
        }
      }
      const groups: VulnGroup[] = Array.from(map.entries()).map(([key, bucket]) => ({
        key,
        label: key,
        rows: bucket,
      }));
      groups.sort((a, b) => b.rows.length - a.rows.length);
      return groups;
    }

    case 'asset': {
      const map = new Map<string, VulnRow[]>();
      for (const row of rows) {
        const key = row.assetId;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(row);
      }
      const groups: VulnGroup[] = Array.from(map.entries()).map(([key, bucket]) => ({
        key,
        label: bucket[0]?.assetValue ?? key,
        rows: bucket,
      }));
      groups.sort((a, b) => b.rows.length - a.rows.length);
      return groups;
    }

    case 'status': {
      const map = new Map<string, VulnRow[]>();
      for (const row of rows) {
        const key = row.status;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(row);
      }
      const groups: VulnGroup[] = Array.from(map.entries()).map(([key, bucket]) => ({
        key,
        label: key,
        rows: bucket,
      }));
      groups.sort((a, b) => b.rows.length - a.rows.length);
      return groups;
    }
  }
}

export function severityBreakdown(rows: VulnRow[]): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const row of rows) {
    const key = row.severity.toLowerCase();
    if (key in result) {
      result[key]++;
    }
  }
  return result;
}
