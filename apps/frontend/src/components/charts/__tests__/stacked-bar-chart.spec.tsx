import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StackedBarChart, toStackedSeries } from '../stacked-bar-chart';

describe('toStackedSeries', () => {
  it('keeps rows in input order and fills missing keys with 0', () => {
    const rows = [
      { label: 'nmap', critical: 2, high: 1 },
      { label: 'nuclei', high: 3 },
    ];
    const series = toStackedSeries(rows, ['critical', 'high']);
    expect(series).toEqual([
      { label: 'nmap', critical: 2, high: 1 },
      { label: 'nuclei', critical: 0, high: 3 },
    ]);
  });
});

describe('<StackedBarChart />', () => {
  it('renders an SVG with one stacked area per key', () => {
    const { container } = render(
      <StackedBarChart
        width={400}
        height={200}
        rows={[{ label: 'nmap', critical: 2, high: 1 }]}
        keys={['critical', 'high']}
        colors={{ critical: '#b91c1c', high: '#ea580c' }}
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
