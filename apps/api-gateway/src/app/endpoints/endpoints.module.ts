import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EndpointsResolver } from './endpoints.resolver';
import { EndpointsService } from './endpoints.service';

@Module({
  imports: [AuthModule],
  providers: [EndpointsResolver, EndpointsService],
})
export class EndpointsModule {}
