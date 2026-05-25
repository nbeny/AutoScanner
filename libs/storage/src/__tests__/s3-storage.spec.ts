import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { rawOutputKey } from '../types';
import { S3ObjectStorage } from '../s3-storage';

const TEST_ENDPOINT = process.env['S3_ENDPOINT'] ?? 'http://localhost:9000';
const TEST_REGION = process.env['S3_REGION'] ?? 'us-east-1';
const TEST_ACCESS = process.env['S3_ACCESS_KEY'] ?? 'autoscanner';
const TEST_SECRET = process.env['S3_SECRET_KEY'] ?? 'devpassword';

function makeStorage(): S3ObjectStorage {
  const client = new S3Client({
    endpoint: TEST_ENDPOINT,
    region: TEST_REGION,
    credentials: { accessKeyId: TEST_ACCESS, secretAccessKey: TEST_SECRET },
    forcePathStyle: true,
  });
  const fakeConfig = {
    env: {
      S3_ENDPOINT: TEST_ENDPOINT,
      S3_REGION: TEST_REGION,
      S3_ACCESS_KEY: TEST_ACCESS,
      S3_SECRET_KEY: TEST_SECRET,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return new S3ObjectStorage(fakeConfig, client);
}

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

describe('rawOutputKey()', () => {
  it('produces the spec-conformant key shape', () => {
    expect(
      rawOutputKey({
        engagementId: 'eng_1',
        scanId: 'scan_1',
        scanJobId: 'job_1',
        scannerName: 'nmap',
        format: 'XML',
      }),
    ).toBe('eng_1/scan_1/job_1/nmap-xml.xml');
  });
});

describe('S3ObjectStorage (integration)', () => {
  let storage: S3ObjectStorage;
  let s3Ready = false;
  const bucket = 'raw-outputs' as const;
  const key = `test/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;

  beforeAll(async () => {
    try {
      storage = makeStorage();
      await storage.ensureBucket(bucket);
      s3Ready = true;
    } catch (err) {
      console.warn(
        `[storage] S3/MinIO unreachable at ${TEST_ENDPOINT} — tests will no-op: ${(err as Error).message}`,
      );
    }
  }, 30_000);

  const guarded = (fn: () => Promise<void>) => async () => {
    if (!s3Ready) return;
    await fn();
  };

  it(
    'puts, heads, gets, and deletes an object',
    guarded(async () => {
      const payload = 'hello-storage';
      await storage.putObject({ bucket, key, body: payload, contentType: 'text/plain' });

      const head = await storage.headObject(bucket, key);
      expect(head.exists).toBe(true);
      expect(head.size).toBe(payload.length);

      const got = await storage.getObject(bucket, key);
      expect(await streamToString(got.body)).toBe(payload);

      await storage.deleteObject(bucket, key);
      const headAfter = await storage.headObject(bucket, key);
      expect(headAfter.exists).toBe(false);
    }),
    30_000,
  );

  it(
    'generates a presigned GET url',
    guarded(async () => {
      await storage.putObject({ bucket, key, body: 'presign' });
      const url = await storage.presignGetUrl({ bucket, key, expiresInSeconds: 60 });
      expect(url).toMatch(/^https?:\/\//);
      expect(url).toContain(key);
      await storage.deleteObject(bucket, key);
    }),
    30_000,
  );
});
