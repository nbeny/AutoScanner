import type { ReactNode } from 'react';

export interface PanelProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  'aria-label'?: string;
}

export function Panel({ children, className = '', glow = false, ...rest }: PanelProps) {
  return (
    <div
      {...rest}
      className={`rounded-xl border border-neon-cyan/25 bg-space-800/40 p-4 ${
        glow ? 'shadow-glow' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
