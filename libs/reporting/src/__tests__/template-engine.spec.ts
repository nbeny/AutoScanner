import { TemplateEngine } from '../template-engine';

describe('TemplateEngine', () => {
  const engine = new TemplateEngine();

  describe('severityBadge helper', () => {
    it.each(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'])('renders a badge for %s', (severity) => {
      const out = engine.render('{{severityBadge sev}}', { sev: severity });
      expect(out).toContain(severity);
      expect(out).toContain('<span');
    });

    it('falls back to INFO color for unknown severity', () => {
      const out = engine.render('{{severityBadge sev}}', { sev: 'WHATEVER' });
      expect(out).toContain('WHATEVER');
    });
  });

  describe('cvss helper', () => {
    it.each([
      [9.5, '9.5 (CRITICAL)'],
      [7.5, '7.5 (HIGH)'],
      [5.0, '5.0 (MEDIUM)'],
      [2.0, '2.0 (LOW)'],
    ])('formats %s as %s', (score, expected) => {
      expect(engine.render('{{cvss s}}', { s: score })).toBe(expected);
    });

    it('returns em-dash for null/missing', () => {
      expect(engine.render('{{cvss s}}', { s: null })).toBe('—');
      expect(engine.render('{{cvss s}}', {})).toBe('—');
    });
  });

  describe('formatDate helper', () => {
    it('formats an ISO string', () => {
      expect(engine.render('{{formatDate d}}', { d: '2026-06-12T14:30:00Z' })).toBe(
        '2026-06-12 14:30:00 UTC',
      );
    });

    it('formats a Date instance', () => {
      const d = new Date('2026-06-12T14:30:00Z');
      expect(engine.render('{{formatDate d}}', { d })).toBe('2026-06-12 14:30:00 UTC');
    });

    it('returns em-dash for invalid input', () => {
      expect(engine.render('{{formatDate d}}', { d: 'not-a-date' })).toBe('—');
      expect(engine.render('{{formatDate d}}', { d: null })).toBe('—');
    });
  });

  describe('truncate helper', () => {
    it('truncates with ellipsis', () => {
      expect(engine.render('{{truncate t 5}}', { t: 'hello world' })).toBe('hello…');
    });

    it('passes through when length is within limit', () => {
      expect(engine.render('{{truncate t 50}}', { t: 'short' })).toBe('short');
    });
  });

  describe('riskBucket helper', () => {
    it.each([
      [95, 'CRITICAL'],
      [70, 'HIGH'],
      [50, 'MEDIUM'],
      [25, 'LOW'],
      [5, 'INFO'],
    ])('buckets risk score %s as %s', (score, expected) => {
      expect(engine.render('{{riskBucket s}}', { s: score })).toBe(expected);
    });
  });

  describe('count helper', () => {
    it('counts array length', () => {
      expect(engine.render('{{count xs}}', { xs: [1, 2, 3] })).toBe('3');
    });

    it('returns 0 for non-array', () => {
      expect(engine.render('{{count xs}}', { xs: null })).toBe('0');
    });
  });

  describe('compare helpers', () => {
    it('eq returns true/false', () => {
      expect(engine.render('{{#if (eq a b)}}yes{{else}}no{{/if}}', { a: 1, b: 1 })).toBe('yes');
      expect(engine.render('{{#if (eq a b)}}yes{{else}}no{{/if}}', { a: 1, b: 2 })).toBe('no');
    });

    it('gt/lt return numeric comparisons', () => {
      expect(engine.render('{{#if (gt a b)}}gt{{/if}}', { a: 5, b: 3 })).toBe('gt');
      expect(engine.render('{{#if (lt a b)}}lt{{/if}}', { a: 1, b: 2 })).toBe('lt');
    });
  });
});
