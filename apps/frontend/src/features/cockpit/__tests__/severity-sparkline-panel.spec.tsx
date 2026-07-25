import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { SEVERITY_TREND_QUERY } from '../../../lib/graphql/queries';
import { SeveritySparklinePanel } from '../severity-sparkline-panel';

const mocks = [
  {
    request: {
      query: SEVERITY_TREND_QUERY,
      variables: { engagementId: undefined, range: undefined },
    },
    result: {
      data: {
        severityTrend: [
          {
            bucketDate: '2026-01-01',
            counts: { critical: 1, high: 2, medium: 0, low: 0, info: 0 },
          },
          {
            bucketDate: '2026-01-02',
            counts: { critical: 0, high: 1, medium: 3, low: 1, info: 0 },
          },
        ],
      },
    },
  },
];

describe('<SeveritySparklinePanel />', () => {
  it('renders a sparkline with one bar per bucket', async () => {
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <SeveritySparklinePanel engagementId={undefined} />
      </MockedProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('severity-sparkline').querySelectorAll('[data-bar]'),
      ).toHaveLength(2),
    );
  });
});
