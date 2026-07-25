export interface SparklineProps {
  values: number[];
  className?: string;
  'aria-label'?: string;
}

export function Sparkline({ values, className = '', ...rest }: SparklineProps) {
  const max = values.length ? Math.max(...values, 1) : 1;
  return (
    <div {...rest} className={`flex h-8 items-end gap-0.5 ${className}`}>
      {values.map((v, i) => (
        <span
          key={i}
          data-bar
          className="w-1.5 rounded-sm bg-gradient-to-t from-neon-violet to-neon-cyan"
          style={{ height: `${Math.max(6, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}
