import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { NmapXmlParser } from './nmap-xml.parser';
import { ParserRegistry } from './registry';
import { SubfinderJsonParser } from './subfinder-json';

@Global()
@Module({
  providers: [ParserRegistry, NmapXmlParser, SubfinderJsonParser],
  exports: [ParserRegistry, NmapXmlParser, SubfinderJsonParser],
})
export class ParsersModule implements OnModuleInit {
  constructor(
    private readonly registry: ParserRegistry,
    private readonly nmapXml: NmapXmlParser,
    private readonly subfinderJson: SubfinderJsonParser,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.nmapXml);
    this.registry.register(this.subfinderJson);
  }
}
