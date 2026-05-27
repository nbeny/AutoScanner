import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { DnsxJsonParser } from './dnsx-json';
import { HttpxJsonParser } from './httpx-json';
import { NmapXmlParser } from './nmap-xml.parser';
import { ParserRegistry } from './registry';
import { SubfinderJsonParser } from './subfinder-json';

@Global()
@Module({
  providers: [ParserRegistry, NmapXmlParser, SubfinderJsonParser, HttpxJsonParser, DnsxJsonParser],
  exports: [ParserRegistry, NmapXmlParser, SubfinderJsonParser, HttpxJsonParser, DnsxJsonParser],
})
export class ParsersModule implements OnModuleInit {
  constructor(
    private readonly registry: ParserRegistry,
    private readonly nmapXml: NmapXmlParser,
    private readonly subfinderJson: SubfinderJsonParser,
    private readonly httpxJson: HttpxJsonParser,
    private readonly dnsxJson: DnsxJsonParser,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.nmapXml);
    this.registry.register(this.subfinderJson);
    this.registry.register(this.httpxJson);
    this.registry.register(this.dnsxJson);
  }
}
