import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TrendChart, toTrendSeries } from '../trend-chart';

describe('toTrendSeries', () => {
  it('maps buckets to series rows filling missing keys with 0', () => {
    const rows = toTrendSeries([{ bucketDate: '2026-01-01', counts: { critical: 2 } }] as any, [
      'critical',
      'high',
    ]);
    expect(rows).toEqual([{ label: '2026-01-01', critical: 2, high: 0 }]);
  });
});

describe('<TrendChart />', () => {
  it('renders an svg with a line per key', () => {
    const { container } = render(
      <TrendChart
        width={400}
        height={200}
        rows={[{ bucketDate: '2026-01-01', counts: { critical: 1, high: 0 } }] as any}
        keys={['critical', 'high']}
        colors={{ critical: '#b91c1c', high: '#ea580c' }}
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
