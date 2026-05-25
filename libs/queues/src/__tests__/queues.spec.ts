import {
  DEFAULT_JOB_OPTIONS,
  ParseJobPayload,
  PayloadFor,
  QueueName,
  ScanJobPayload,
  buildQueueOptions,
} from '..';

describe('@autoscanner/queues', () => {
  describe('QueueName', () => {
    it('uses stable wire identifiers', () => {
      expect(QueueName.SCAN_JOBS).toBe('scan-jobs');
      expect(QueueName.PARSE_JOBS).toBe('parse-jobs');
    });

    it('PayloadFor maps each queue to its payload type', () => {
      const scan: PayloadFor<typeof QueueName.SCAN_JOBS> = {
        scanJobId: 'job_1',
        scannerName: 'nmap',
        target: '127.0.0.1',
        input: { ports: '1-1000' },
        engagementId: 'eng_1',
      } satisfies ScanJobPayload;

      const parse: PayloadFor<typeof QueueName.PARSE_JOBS> = {
        scanJobId: 'job_1',
        rawOutputKey: 'raw-outputs/eng_1/job_1/nmap.xml',
        parserName: 'nmap-xml',
        scannerName: 'nmap',
        target: '127.0.0.1',
        engagementId: 'eng_1',
      } satisfies ParseJobPayload;

      expect(scan.scannerName).toBe('nmap');
      expect(parse.parserName).toBe('nmap-xml');
    });
  });

  describe('DEFAULT_JOB_OPTIONS', () => {
    it('retries 3 times with exponential backoff', () => {
      expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
      expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({ type: 'exponential', delay: 5_000 });
    });

    it('cleans completed jobs after 7 days and 5000 entries', () => {
      expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toEqual({ age: 7 * 86_400, count: 5_000 });
    });

    it('keeps failed jobs for 30 days', () => {
      expect(DEFAULT_JOB_OPTIONS.removeOnFail).toEqual({ age: 30 * 86_400 });
    });
  });

  describe('buildQueueOptions', () => {
    it('returns connection.url and defaultJobOptions', () => {
      const opts = buildQueueOptions('redis://localhost:6379');
      expect(opts.defaultJobOptions).toBe(DEFAULT_JOB_OPTIONS);
      expect((opts.connection as { url: string }).url).toBe('redis://localhost:6379');
    });
  });
});
