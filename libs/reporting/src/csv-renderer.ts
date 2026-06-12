import { stringify } from 'csv-stringify/sync';

export class CsvRenderer {
  render(rows: Record<string, unknown>[], columns: string[]): string {
    const records = rows.map((row) =>
      columns.map((c) => {
        const v = row[c];
        if (v == null) return '';
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      }),
    );
    return stringify([columns, ...records], { quoted_string: false, quoted_empty: false });
  }
}
