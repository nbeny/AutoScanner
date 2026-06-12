export interface ReportContext {
  engagement: Record<string, unknown>;
  scans?: unknown[];
  assets?: unknown[];
  findings?: unknown[];
  observations?: unknown[];
  cveCache?: unknown[];
  generatedAt: string;
  [key: string]: unknown;
}

export class JsonExporter {
  serialize(ctx: ReportContext): string {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(ctx).sort()) {
      sorted[key] = ctx[key];
    }
    return JSON.stringify(sorted, null, 2);
  }
}
