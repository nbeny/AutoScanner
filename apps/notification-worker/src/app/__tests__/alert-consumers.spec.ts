import { NotificationEventType } from '@autoscanner/notifications';

import { RiskAlertConsumer } from '../risk-alert.consumer';
import { CriticalFindingConsumer } from '../critical-finding.consumer';

function ctx<T>(payload: T) {
  return { id: 'm', type: 't', key: 'k', attempt: 1, payload } as never;
}

describe('RiskAlertConsumer', () => {
  it('fans out a RISK_ALERT for the orphan security.risk.alert event', async () => {
    const fanout = { fanout: jest.fn().mockResolvedValue(2) };
    const c = new RiskAlertConsumer(fanout as never, { register: jest.fn() } as never);

    const res = await c.process(ctx({ assetId: 'a1', engagementId: 'e1', riskScore: 9.2 }));

    expect(res).toEqual({ enqueued: 2 });
    expect(fanout.fanout).toHaveBeenCalledWith(
      NotificationEventType.RISK_ALERT,
      expect.objectContaining({ engagementId: 'e1', assetId: 'a1', riskScore: 9.2 }),
    );
  });

  it('subscribes to the risk-alert topic', () => {
    const c = new RiskAlertConsumer({} as never, { register: jest.fn() } as never);
    expect(c.topic).toBe('security.risk.alert');
  });
});

describe('CriticalFindingConsumer', () => {
  it('fans out FINDING_CRITICAL only for CRITICAL findings', async () => {
    const fanout = { fanout: jest.fn().mockResolvedValue(1) };
    const c = new CriticalFindingConsumer(fanout as never, { register: jest.fn() } as never);

    const res = await c.process(
      ctx({
        scanJobId: 's',
        engagementId: 'e1',
        findingId: 'f1',
        title: 'RCE',
        severity: 'CRITICAL',
      }),
    );

    expect(res).toEqual({ enqueued: 1 });
    expect(fanout.fanout).toHaveBeenCalledWith(
      NotificationEventType.FINDING_CRITICAL,
      expect.objectContaining({ engagementId: 'e1', findingId: 'f1', title: 'RCE' }),
    );
  });

  it('ignores non-critical findings', async () => {
    const fanout = { fanout: jest.fn() };
    const c = new CriticalFindingConsumer(fanout as never, { register: jest.fn() } as never);

    const res = await c.process(ctx({ scanJobId: 's', engagementId: 'e1', severity: 'HIGH' }));

    expect(res).toEqual({ enqueued: 0 });
    expect(fanout.fanout).not.toHaveBeenCalled();
  });

  it('uses a distinct consumer group so it does not compete with threat-intel/compliance', () => {
    const c = new CriticalFindingConsumer({} as never, { register: jest.fn() } as never);
    expect(c.topic).toBe('security.finding.created');
    expect(c.groupId).toBe('alert:finding-critical');
  });
});
