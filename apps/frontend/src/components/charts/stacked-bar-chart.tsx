import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_COLOR, GRID_COLOR } from './chart-theme';

export interface StackedRow {
  label: string;
  [key: string]: string | number | undefined;
}

/**
 * Normalise des lignes hétérogènes en séries empilées : conserve l'ordre
 * d'entrée et remplit chaque clé manquante par 0 (Recharts exige une valeur
 * numérique pour chaque clé empilée).
 */
export function toStackedSeries(rows: StackedRow[], keys: string[]) {
  return rows.map((row) => {
    const out: Record<string, string | number> = { label: row.label };
    for (const k of keys) out[k] = typeof row[k] === 'number' ? (row[k] as number) : 0;
    return out;
  });
}

export interface StackedBarChartProps {
  rows: StackedRow[];
  keys: string[];
  colors: Record<string, string>;
  width?: number;
  height?: number;
}

export function StackedBarChart({
  rows,
  keys,
  colors,
  width = 480,
  height = 240,
}: StackedBarChartProps) {
  const data = toStackedSeries(rows, keys);
  return (
    <BarChart width={width} height={height} data={data}>
      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
      <XAxis dataKey="label" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} />
      <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} allowDecimals={false} />
      <Tooltip
        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6 }}
      />
      {keys.map((k) => (
        <Bar key={k} dataKey={k} stackId="a" fill={colors[k] ?? '#475569'} />
      ))}
    </BarChart>
  );
}
