import { Injectable } from '@nestjs/common';
import { AppEnv, EnvSchema } from './env.schema';

@Injectable()
export class AppConfigService {
  readonly env: AppEnv;

  constructor() {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const formatted = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment variables:\n${formatted}`);
    }
    this.env = parsed.data;
  }

  get isProd(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }
}
