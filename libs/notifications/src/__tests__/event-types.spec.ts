import {
  NotificationEventType,
  renderNotificationMessage,
  type NotificationEventPayload,
} from '../event-types';

describe('NotificationEventType', () => {
  it('has the 6 expected values', () => {
    expect(NotificationEventType.SCAN_COMPLETED).toBe('scan.completed');
    expect(NotificationEventType.SCAN_FAILED).toBe('scan.failed');
    expect(NotificationEventType.FINDING_CRITICAL).toBe('finding.critical');
    expect(NotificationEventType.RISK_ALERT).toBe('risk.alert');
    expect(NotificationEventType.REPORT_READY).toBe('report.ready');
    expect(NotificationEventType.SCHEDULE_FINISHED).toBe('schedule.finished');
    expect(Object.keys(NotificationEventType)).toHaveLength(6);
  });
});

describe('renderNotificationMessage', () => {
  const basePayload: NotificationEventPayload = {
    engagementId: 'eng-123',
    engagementName: 'Acme Corp',
  };

  it('renders SCAN_COMPLETED with engagement name and templateRunId', () => {
    const payload: NotificationEventPayload = {
      ...basePayload,
      templateRunId: 'run-abc',
    };
    const msg = renderNotificationMessage(NotificationEventType.SCAN_COMPLETED, payload);
    expect(msg.subject).toContain('Acme Corp');
    expect(msg.subject).toContain('Scan completed');
    expect(msg.body).toContain('Acme Corp');
    expect(msg.body).toContain('run-abc');
  });

  it('renders SCAN_COMPLETED using engagementId when name absent', () => {
    const payload: NotificationEventPayload = { engagementId: 'eng-123', scanId: 'scan-1' };
    const msg = renderNotificationMessage(NotificationEventType.SCAN_COMPLETED, payload);
    expect(msg.subject).toContain('eng-123');
    expect(msg.body).toContain('scan-1');
  });

  it('renders SCAN_FAILED', () => {
    const msg = renderNotificationMessage(NotificationEventType.SCAN_FAILED, basePayload);
    expect(msg.subject).toContain('Scan failed');
    expect(msg.body).toContain('Acme Corp');
  });

  it('renders FINDING_CRITICAL', () => {
    const msg = renderNotificationMessage(NotificationEventType.FINDING_CRITICAL, basePayload);
    expect(msg.subject).toContain('Critical finding');
    expect(msg.body).toContain('Acme Corp');
  });

  it('renders REPORT_READY with reportId', () => {
    const payload: NotificationEventPayload = { ...basePayload, reportId: 'rpt-1' };
    const msg = renderNotificationMessage(NotificationEventType.REPORT_READY, payload);
    expect(msg.subject).toContain('Report ready');
    expect(msg.body).toContain('rpt-1');
  });

  it('renders SCHEDULE_FINISHED', () => {
    const msg = renderNotificationMessage(NotificationEventType.SCHEDULE_FINISHED, basePayload);
    expect(msg.subject).toContain('Schedule finished');
    expect(msg.body).toContain('Acme Corp');
  });

  it('falls back to generic message for unknown event type', () => {
    const msg = renderNotificationMessage('unknown.event' as NotificationEventType, basePayload);
    expect(msg.subject).toContain('Notification');
    expect(msg.body).toContain('unknown.event');
  });
});
