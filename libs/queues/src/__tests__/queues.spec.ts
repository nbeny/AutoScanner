import { ParseJobPayload, PayloadFor, QueueName, ScanJobPayload } from '..';

/**
 * After the Kafka migration this lib no longer owns any queue wiring — BullMQ and its
 * job options are gone. What survives is the payload contract (now carried in Kafka
 * message envelopes) and the `scan-control` Redis channel, so that is what we pin here.
 * `QueueName` is kept as the stable logical identifier behind each topic.
 */
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
});
