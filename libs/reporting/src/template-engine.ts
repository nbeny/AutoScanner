import Handlebars from 'handlebars';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  CRITICAL: '#7f1d1d',
  HIGH: '#b45309',
  MEDIUM: '#a16207',
  LOW: '#1d4ed8',
  INFO: '#6b7280',
};

function cvssBucket(score: number): SeverityLevel {
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  if (score > 0) return 'LOW';
  return 'INFO';
}

// Risk-score bucket per Phase 3 §2.3 (riskScore 0..100):
// 80+ critical, 60+ high, 40+ medium, 20+ low, else info.
function riskScoreBucket(score: number): SeverityLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 20) return 'LOW';
  return 'INFO';
}

export class TemplateEngine {
  private readonly handlebars: typeof Handlebars;

  constructor() {
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  render(templateSource: string, ctx: unknown): string {
    const template = this.handlebars.compile(templateSource, { noEscape: false });
    return template(ctx);
  }

  private registerHelpers(): void {
    this.handlebars.registerHelper('severityBadge', (severity: unknown) => {
      const s = String(severity ?? '').toUpperCase() as SeverityLevel;
      const color = SEVERITY_COLORS[s] ?? SEVERITY_COLORS.INFO;
      return new this.handlebars.SafeString(
        `<span style="background:${color};color:white;padding:2px 6px;border-radius:3px;font-size:0.85em">${s || 'UNKNOWN'}</span>`,
      );
    });

    this.handlebars.registerHelper('cvss', (score: unknown) => {
      if (score == null || typeof score !== 'number' || Number.isNaN(score)) return '—';
      return `${score.toFixed(1)} (${cvssBucket(score)})`;
    });

    this.handlebars.registerHelper('formatDate', (date: unknown) => {
      if (date == null) return '—';
      const d = date instanceof Date ? date : new Date(String(date));
      if (Number.isNaN(d.getTime())) return '—';
      const iso = d.toISOString();
      return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
    });

    this.handlebars.registerHelper('truncate', (text: unknown, n: unknown) => {
      const s = String(text ?? '');
      const max = typeof n === 'number' ? n : Number(n);
      if (!Number.isFinite(max) || max <= 0 || s.length <= max) return s;
      return `${s.slice(0, max)}…`;
    });

    this.handlebars.registerHelper('riskBucket', (score: unknown) => {
      const n = typeof score === 'number' ? score : Number(score);
      return Number.isFinite(n) ? riskScoreBucket(n) : 'INFO';
    });

    this.handlebars.registerHelper('count', (arr: unknown) =>
      Array.isArray(arr) ? arr.length : 0,
    );

    this.handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    this.handlebars.registerHelper('gt', (a: unknown, b: unknown) => Number(a) > Number(b));
    this.handlebars.registerHelper('lt', (a: unknown, b: unknown) => Number(a) < Number(b));
  }
}
