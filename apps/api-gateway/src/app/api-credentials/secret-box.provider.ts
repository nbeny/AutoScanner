import { SecretBox } from '@autoscanner/common';
import { AppConfigService } from '@autoscanner/config';
import type { Provider } from '@nestjs/common';

export const SECRET_BOX = Symbol('SECRET_BOX');

export const secretBoxProvider: Provider = {
  provide: SECRET_BOX,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService) => new SecretBox(cfg.env.MASTER_ENCRYPTION_KEY),
};
