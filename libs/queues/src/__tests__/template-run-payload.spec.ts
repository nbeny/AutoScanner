import { PayloadFor, QueueName, TemplateRunPayload } from '..';

describe('@autoscanner/queues TEMPLATE_RUNS', () => {
  it('uses the stable wire identifier "template-runs"', () => {
    expect(QueueName.TEMPLATE_RUNS).toBe('template-runs');
  });

  it('PayloadFor<TEMPLATE_RUNS> resolves to TemplateRunPayload shape', () => {
    const payload: PayloadFor<typeof QueueName.TEMPLATE_RUNS> = {
      templateRunId: 'tr_1',
      engagementId: 'e_1',
    } satisfies TemplateRunPayload;

    expect(payload.templateRunId).toBe('tr_1');
    expect(payload.engagementId).toBe('e_1');
  });
});
