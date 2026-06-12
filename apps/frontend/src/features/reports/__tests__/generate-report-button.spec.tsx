import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  GENERATE_REPORT_MUTATION,
  REPORTS_QUERY,
  REPORT_TEMPLATES_QUERY,
} from '../../../lib/graphql/queries';
import { GenerateReportButton } from '../generate-report-button';

const engagementId = 'eng_1';

const templatesMock = {
  request: { query: REPORT_TEMPLATES_QUERY },
  result: {
    data: {
      reportTemplates: [
        {
          __typename: 'ReportTemplate',
          id: 't1',
          slug: 'executive-summary-pdf',
          name: 'Executive summary (PDF)',
          description: null,
          format: 'PDF',
          isDefault: true,
        },
        {
          __typename: 'ReportTemplate',
          id: 't2',
          slug: 'json-full-export',
          name: 'JSON export',
          description: null,
          format: 'JSON',
          isDefault: true,
        },
      ],
    },
  },
};

const reportsMock = {
  request: { query: REPORTS_QUERY, variables: { engagementId } },
  result: { data: { reports: [] } },
};

describe('<GenerateReportButton />', () => {
  it('opens the panel and submits generateReport with the selected template', async () => {
    let mutationCalled = false;
    const generateMock = {
      request: {
        query: GENERATE_REPORT_MUTATION,
        variables: { input: { engagementId, templateSlug: 'executive-summary-pdf' } },
      },
      result: () => {
        mutationCalled = true;
        return {
          data: {
            generateReport: {
              __typename: 'Report',
              id: 'rep_new',
              status: 'PENDING',
              format: 'PDF',
              template: {
                __typename: 'ReportTemplate',
                id: 't1',
                slug: 'executive-summary-pdf',
                name: 'Executive summary (PDF)',
              },
            },
          },
        };
      },
    };

    render(
      <MockedProvider mocks={[templatesMock, generateMock, reportsMock]}>
        <GenerateReportButton engagementId={engagementId} />
      </MockedProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /open generate report panel/i }));

    await waitFor(() =>
      expect((screen.getByLabelText('Template') as HTMLSelectElement).value).toBe(
        'executive-summary-pdf',
      ),
    );

    fireEvent.submit(screen.getByLabelText('generate-report'));

    await waitFor(() => expect(mutationCalled).toBe(true));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/rep_new/i));
  });
});
