import { HttpException, Injectable, Logger } from '@nestjs/common';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import Redis from 'ioredis';
import { AppConfigService } from '@autoscanner/config';
import { PrismaService } from '@autoscanner/database';

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);
  private readonly redis: Redis;
  private readonly s3: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    cfg: AppConfigService,
  ) {
    this.redis = new Redis(cfg.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.s3 = new S3Client({
      endpoint: cfg.env.S3_ENDPOINT,
      region: cfg.env.S3_REGION,
      credentials: {
        accessKeyId: cfg.env.S3_ACCESS_KEY,
        secretAccessKey: cfg.env.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
  }

  async check(): Promise<Record<string, string>> {
    const [db, redis, s3] = await Promise.all([this.checkDb(), this.checkRedis(), this.checkS3()]);
    const result = { db, redis, s3 };
    const failing = Object.entries(result).filter(([, v]) => v !== 'ok');
    if (failing.length > 0) {
      throw new HttpException(result, 503);
    }
    return result;
  }

  private async checkDb(): Promise<string> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (err) {
      this.logger.warn(`DB readiness failed: ${(err as Error).message}`);
      return 'fail';
    }
  }

  private async checkRedis(): Promise<string> {
    try {
      if (this.redis.status === 'end' || this.redis.status === 'wait') {
        await this.redis.connect();
      }
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'ok' : 'fail';
    } catch (err) {
      this.logger.warn(`Redis readiness failed: ${(err as Error).message}`);
      return 'fail';
    }
  }

  private async checkS3(): Promise<string> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: 'raw-outputs' }));
      return 'ok';
    } catch (err) {
      this.logger.warn(`S3 readiness failed: ${(err as Error).message}`);
      return 'fail';
    }
  }
}
