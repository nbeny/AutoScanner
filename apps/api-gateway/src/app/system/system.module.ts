import { Module } from '@nestjs/common';
import { SystemResolver } from './system.resolver';

@Module({
  providers: [SystemResolver],
})
export class SystemModule {}
