import { useMemo } from 'react';
import type { OsintGraph, OsintGraphNodeKind } from './build-osint-graph';

const COL_WIDTH = 240;
const ROW_HEIGHT = 56;
const NODE_WIDTH = 190;
const NODE_HEIGHT = 40;
const MARGIN = 28;

const KIND_STYLE: Record<OsintGraphNodeKind, { fill: string; stroke: string }> = {
  identity: { fill: '#3b1140', stroke: '#e879f9' },
  email: { fill: '#0e2a33', stroke: '#22d3ee' },
  asset: { fill: '#0c2a22', stroke: '#10b981' },
};

const COLUMN_LABEL = ['Identités', 'Emails', 'Assets'];

function truncate(label: string, max = 24): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

interface Positioned {
  id: string;
  kind: OsintGraphNodeKind;
  label: string;
  sub?: string;
  x: number;
  y: number;
}

/**
 * Pure-SVG OSINT relationship graph: identities → emails → assets laid out in
 * three fixed columns, stacked vertically within each column. Edges connect a
 * node's right edge to the target's left edge. No graph library is used.
 */
export function OsintGraph({ graph }: { graph: OsintGraph }) {
  const { positioned, byId, width, height } = useMemo(() => {
    const rowByColumn = new Map<number, number>();
    const pos: Positioned[] = graph.nodes.map((node) => {
      const row = rowByColumn.get(node.column) ?? 0;
      rowByColumn.set(node.column, row + 1);
      return {
        id: node.id,
        kind: node.kind,
        label: node.label,
        sub: node.sub,
        x: node.column * COL_WIDTH + MARGIN,
        y: row * ROW_HEIGHT + MARGIN + 24,
      };
    });
    const map = new Map<string, Positioned>();
    pos.forEach((p) => map.set(p.id, p));
    const maxX = pos.reduce((m, p) => Math.max(m, p.x + NODE_WIDTH), 0) + MARGIN;
    const maxY = pos.reduce((m, p) => Math.max(m, p.y + NODE_HEIGHT), 0) + MARGIN;
    return {
      positioned: pos,
      byId: map,
      width: Math.max(maxX, 3 * COL_WIDTH),
      height: Math.max(maxY, 160),
    };
  }, [graph]);

  if (graph.nodes.length === 0) {
    return (
      <div className="rounded bg-space-900/60 p-8 text-center text-sm text-slate-500">
        Aucune entité OSINT à relier pour l’instant.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded bg-space-900/60" aria-label="osint-graph">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
        {COLUMN_LABEL.map((label, col) => (
          <text
            key={label}
            x={col * COL_WIDTH + MARGIN}
            y={18}
            fontSize={11}
            fill="#64748b"
            className="uppercase"
          >
            {label}
          </text>
        ))}

        {graph.edges.map((e, idx) => {
          const from = byId.get(e.from);
          const to = byId.get(e.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_WIDTH;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_HEIGHT / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={`edge-${idx}`}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              stroke="#475569"
              strokeWidth={1.5}
              fill="none"
            />
          );
        })}

        {positioned.map((p) => {
          const style = KIND_STYLE[p.kind];
          return (
            <g key={p.id} transform={`translate(${p.x} ${p.y})`} aria-label={`node-${p.kind}`}>
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                ry={8}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={1.5}
              />
              <text x={10} y={17} fontSize={12} fill="#e2e8f0">
                {truncate(p.label)}
              </text>
              {p.sub ? (
                <text x={10} y={31} fontSize={9} fill="#94a3b8">
                  {truncate(p.sub, 28)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
