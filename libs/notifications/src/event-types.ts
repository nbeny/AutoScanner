export enum NotificationEventType {
  SCAN_COMPLETED = 'scan.completed',
  SCAN_FAILED = 'scan.failed',
  FINDING_CRITICAL = 'finding.critical',
  RISK_ALERT = 'risk.alert',
  REPORT_READY = 'report.ready',
  SCHEDULE_FINISHED = 'schedule.finished',
}

export interface NotificationEventPayload {
  engagementId: string;
  engagementName?: string;
  scanId?: string;
  templateRunId?: string;
  reportId?: string;
  findingId?: string;
  severity?: string;
  title?: string;
  assetId?: string;
  riskScore?: number;
  [k: string]: unknown;
}

export interface RenderedMessage {
  subject: string;
  body: string;
}

export function renderNotificationMessage(
  eventType: NotificationEventType,
  payload: NotificationEventPayload,
): RenderedMessage {
  const eng = payload.engagementName ?? payload.engagementId;
  switch (eventType) {
    case NotificationEventType.SCAN_COMPLETED:
      return {
        subject: `Scan completed — ${eng}`,
        body: `A scan completed for engagement "${eng}" (run ${payload.templateRunId ?? payload.scanId ?? 'n/a'}).`,
      };
    case NotificationEventType.SCAN_FAILED:
      return {
        subject: `Scan failed — ${eng}`,
        body: `A scan failed for engagement "${eng}" (run ${payload.templateRunId ?? payload.scanId ?? 'n/a'}).`,
      };
    case NotificationEventType.FINDING_CRITICAL:
      return {
        subject: `Critical finding — ${eng}`,
        body: `A CRITICAL finding was raised for engagement "${eng}"${
          payload.title ? `: ${String(payload.title)}` : ''
        }. Action required.`,
      };
    case NotificationEventType.RISK_ALERT:
      return {
        subject: `Risk alert — ${eng}`,
        body: `An asset in engagement "${eng}" crossed the high-risk threshold (score ${
          payload.riskScore ?? 'n/a'
        }). Action required.`,
      };
    case NotificationEventType.REPORT_READY:
      return {
        subject: `Report ready — ${eng}`,
        body: `A report is ready for engagement "${eng}" (report ${payload.reportId ?? 'n/a'}).`,
      };
    case NotificationEventType.SCHEDULE_FINISHED:
      return {
        subject: `Schedule finished — ${eng}`,
        body: `A scheduled run finished for engagement "${eng}".`,
      };
    default:
      return {
        subject: `Notification — ${eng}`,
        body: `Event ${String(eventType)} for engagement "${eng}".`,
      };
  }
}
