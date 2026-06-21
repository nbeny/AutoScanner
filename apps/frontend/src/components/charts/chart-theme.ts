// Palette alignée sur le donut sévérité existant (severity-donut-chart.tsx).
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

export type SeverityKey = (typeof SEVERITY_ORDER)[number];

export const SEVERITY_COLORS: Record<SeverityKey, string> = {
  critical: '#b91c1c',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#475569',
};

// Couleur d'axe/grille pour le thème sombre Tailwind (slate).
export const AXIS_COLOR = '#94a3b8';
export const GRID_COLOR = '#1e293b';
