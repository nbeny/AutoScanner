import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { HttpxJsonParser } from './httpx-json';
import { NmapXmlParser } from './nmap-xml.parser';
import { ParserRegistry } from './registry';
import { SubfinderJsonParser } from './subfinder-json';

@Global()
@Module({
  providers: [ParserRegistry, NmapXmlParser, SubfinderJsonParser, HttpxJsonParser],
  exports: [ParserRegistry, NmapXmlParser, SubfinderJsonParser, HttpxJsonParser],
})
export class ParsersModule implements OnModuleInit {
  constructor(
    private readonly registry: ParserRegistry,
    private readonly nmapXml: NmapXmlParser,
    private readonly subfinderJson: SubfinderJsonParser,
    private readonly httpxJson: HttpxJsonParser,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.nmapXml);
    this.registry.register(this.subfinderJson);
    this.registry.register(this.httpxJson);
  }
}
