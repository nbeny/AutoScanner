import { Module } from '@nestjs/common';

/**
 * CloudCredentialsModule — empty re-export shell. The 3 services
 * are registered by the api-gateway-side CloudCredentialsApiModule
 * to keep them in the same DI scope as the SECRET_BOX provider.
 */
@Module({
  providers: [],
  exports: [],
})
export class CloudCredentialsModule {}
