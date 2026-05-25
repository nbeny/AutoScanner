import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { NmapXmlParser } from './nmap-xml.parser';
import { ParserRegistry } from './registry';

@Global()
@Module({
  providers: [ParserRegistry, NmapXmlParser],
  exports: [ParserRegistry, NmapXmlParser],
})
export class ParsersModule implements OnModuleInit {
  constructor(
    private readonly registry: ParserRegistry,
    private readonly nmapXml: NmapXmlParser,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.nmapXml);
  }
}
