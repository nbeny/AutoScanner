import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_COLOR, GRID_COLOR } from './chart-theme';

export interface TrendBucket {
  bucketDate: string;
  counts: Record<string, number | undefined>;
}

export function toTrendSeries(buckets: TrendBucket[], keys: string[]) {
  return buckets.map((b) => {
    const out: Record<string, string | number> = { label: b.bucketDate };
    for (const k of keys) out[k] = typeof b.counts?.[k] === 'number' ? (b.counts[k] as number) : 0;
    return out;
  });
}

export interface TrendChartProps {
  rows: TrendBucket[];
  keys: string[];
  colors: Record<string, string>;
  width?: number;
  height?: number;
}

export function TrendChart({ rows, keys, colors, width = 600, height = 260 }: TrendChartProps) {
  const data = toTrendSeries(rows, keys);
  return (
    <LineChart width={width} height={height} data={data}>
      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
      <XAxis dataKey="label" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} />
      <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} allowDecimals={false} />
      <Tooltip
        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6 }}
      />
      {keys.map((k) => (
        <Line
          key={k}
          type="monotone"
          dataKey={k}
          stroke={colors[k] ?? '#475569'}
          dot={false}
          strokeWidth={2}
        />
      ))}
    </LineChart>
  );
}
