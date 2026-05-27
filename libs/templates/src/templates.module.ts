import { Global, Module } from '@nestjs/common';
import { TemplateRegistry } from './registry';

@Global()
@Module({
  providers: [TemplateRegistry],
  exports: [TemplateRegistry],
})
export class TemplatesModule {}
