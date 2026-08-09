import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppConfigService } from '@autoscanner/config';
import type { Readable } from 'node:stream';
import { retryTransient } from './retry';
import type {
  GetObjectResult,
  ObjectStorage,
  PresignedUrlInput,
  PutObjectInput,
  StorageBucket,
} from './types';

export const S3_CLIENT = Symbol('S3_CLIENT');

const DEFAULT_PRESIGN_TTL_SECONDS = 3600;

@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  private readonly logger = new Logger(S3ObjectStorage.name);
  private readonly client: S3Client;

  constructor(
    private readonly config: AppConfigService,
    @Optional() @Inject(S3_CLIENT) injectedClient?: S3Client,
  ) {
    this.client =
      injectedClient ??
      new S3Client({
        endpoint: this.config.env.S3_ENDPOINT,
        region: this.config.env.S3_REGION,
        credentials: {
          accessKeyId: this.config.env.S3_ACCESS_KEY,
          secretAccessKey: this.config.env.S3_SECRET_KEY,
        },
        forcePathStyle: true,
        maxAttempts: 5,
      });
  }

  async ensureBucket(bucket: StorageBucket): Promise<void> {
    try {
      await retryTransient(() => this.client.send(new HeadBucketCommand({ Bucket: bucket })));
      return;
    } catch (err) {
      const code = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (code.$metadata?.httpStatusCode !== 404 && code.name !== 'NotFound') {
        if (code.name !== 'NoSuchBucket' && code.$metadata?.httpStatusCode !== 301) throw err;
      }
    }
    try {
      await retryTransient(() => this.client.send(new CreateBucketCommand({ Bucket: bucket })));
      this.logger.log(`Created bucket: ${bucket}`);
    } catch (err) {
      const code = (err as { name?: string }).name;
      if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists') return;
      throw err;
    }
  }

  // NB: retry is only fully safe when `input.body` is a Buffer/string — a
  // `Readable` stream is consumed on the first attempt, so a retried send
  // would resend an empty body. The scan-worker always passes a Buffer for
  // scanner output, so this is safe in practice; streaming callers would
  // need to buffer before calling putObject to retry safely.
  async putObject(input: PutObjectInput): Promise<{ etag?: string }> {
    const res = await retryTransient(() =>
      this.client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
          Metadata: input.metadata,
        }),
      ),
    );
    return { etag: res.ETag };
  }

  async getObject(bucket: StorageBucket, key: string): Promise<GetObjectResult> {
    const res = await retryTransient(() =>
      this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key })),
    );
    if (!res.Body) throw new Error(`No body returned for ${bucket}/${key}`);
    return {
      body: res.Body as Readable,
      contentLength: res.ContentLength,
      contentType: res.ContentType,
      etag: res.ETag,
    };
  }

  async headObject(
    bucket: StorageBucket,
    key: string,
  ): Promise<{ exists: boolean; size?: number }> {
    try {
      const res = await retryTransient(() =>
        this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
      );
      return { exists: true, size: res.ContentLength };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return { exists: false };
      throw err;
    }
  }

  async deleteObject(bucket: StorageBucket, key: string): Promise<void> {
    await retryTransient(() =>
      this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
    );
  }

  async presignGetUrl(input: PresignedUrlInput): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: input.bucket, Key: input.key });
    return getSignedUrl(this.client, cmd, {
      expiresIn: input.expiresInSeconds ?? DEFAULT_PRESIGN_TTL_SECONDS,
    });
  }

  async presignPutUrl(input: PresignedUrlInput): Promise<string> {
    const cmd = new PutObjectCommand({ Bucket: input.bucket, Key: input.key });
    return getSignedUrl(this.client, cmd, {
      expiresIn: input.expiresInSeconds ?? DEFAULT_PRESIGN_TTL_SECONDS,
    });
  }
}
