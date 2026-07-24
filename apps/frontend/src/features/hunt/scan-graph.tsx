import { useMemo } from 'react';
import type { AiRunNode } from './types';

const COL_WIDTH = 200;
const ROW_HEIGHT = 70;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 44;
const MARGIN = 40;

interface Positioned {
  node: AiRunNode;
  x: number;
  y: number;
}

function nodeFill(status: string): string {
  switch (status) {
    case 'RUNNING':
      return '#4f46e5'; // indigo-600
    case 'COMPLETED':
      return '#065f46'; // emerald-800
    case 'FAILED':
    case 'TIMEOUT':
    case 'CANCELLED':
      return '#7f1d1d'; // red-900
    default:
      return '#1e293b'; // slate-800
  }
}

function nodeStroke(status: string): string {
  switch (status) {
    case 'RUNNING':
      return '#818cf8';
    case 'COMPLETED':
      return '#10b981';
    case 'FAILED':
    case 'TIMEOUT':
    case 'CANCELLED':
      return '#f87171';
    default:
      return '#475569';
  }
}

function truncate(label: string, max = 18): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Pure-SVG scan graph: nodes laid out in columns by depth, stacked
 * vertically within each depth bucket. Edges connect each node to its
 * parent (right-center → left-center). No graph library is used.
 */
export function ScanGraph({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: AiRunNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { positioned, byId, width, height } = useMemo(() => {
    // rowIndex counter per depth bucket.
    const rowByDepth = new Map<number, number>();
    const pos: Positioned[] = nodes.map((node) => {
      const depth = node.depth ?? 0;
      const rowIndex = rowByDepth.get(depth) ?? 0;
      rowByDepth.set(depth, rowIndex + 1);
      return {
        node,
        x: depth * COL_WIDTH + MARGIN,
        y: rowIndex * ROW_HEIGHT + MARGIN,
      };
    });
    const map = new Map<string, Positioned>();
    pos.forEach((p) => map.set(p.node.id, p));
    const maxX = pos.reduce((m, p) => Math.max(m, p.x + NODE_WIDTH), 0) + MARGIN;
    const maxY = pos.reduce((m, p) => Math.max(m, p.y + NODE_HEIGHT), 0) + MARGIN;
    return {
      positioned: pos,
      byId: map,
      width: Math.max(maxX, 240),
      height: Math.max(maxY, 120),
    };
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="bg-slate-900 rounded p-8 text-center text-sm text-slate-500">
        No scanners launched yet.
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded overflow-auto" aria-label="scan-graph">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
        {/* edges first, so nodes paint on top */}
        {positioned.map((p) => {
          const parentId = p.node.parentNodeId;
          if (!parentId) return null;
          const parent = byId.get(parentId);
          if (!parent) return null; // missing parent → skip edge
          const x1 = parent.x + NODE_WIDTH;
          const y1 = parent.y + NODE_HEIGHT / 2;
          const x2 = p.x;
          const y2 = p.y + NODE_HEIGHT / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={`edge-${p.node.id}`}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              stroke="#475569"
              strokeWidth={1.5}
              fill="none"
            />
          );
        })}

        {positioned.map((p) => {
          const selected = p.node.id === selectedId;
          return (
            <g
              key={p.node.id}
              transform={`translate(${p.x} ${p.y})`}
              className="cursor-pointer"
              onClick={() => onSelect(p.node.id)}
              aria-label={`node-${p.node.scannerName}`}
            >
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                ry={8}
                fill={nodeFill(p.node.status)}
                stroke={selected ? '#e2e8f0' : nodeStroke(p.node.status)}
                strokeWidth={selected ? 2.5 : 1.5}
                className={p.node.status === 'RUNNING' ? 'hunt-node-pulse' : undefined}
              />
              <text
                x={NODE_WIDTH / 2}
                y={NODE_HEIGHT / 2 + 4}
                textAnchor="middle"
                fontSize={13}
                fill="#e2e8f0"
              >
                {truncate(p.node.scannerName)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
