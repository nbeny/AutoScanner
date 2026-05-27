import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { DnsxJsonParser } from './dnsx-json';
import { HttpxJsonParser } from './httpx-json';
import { NaabuJsonParser } from './naabu-json';
import { NmapXmlParser } from './nmap-xml.parser';
import { ParserRegistry } from './registry';
import { SubfinderJsonParser } from './subfinder-json';

@Global()
@Module({
  providers: [
    ParserRegistry,
    NmapXmlParser,
    SubfinderJsonParser,
    HttpxJsonParser,
    DnsxJsonParser,
    NaabuJsonParser,
  ],
  exports: [
    ParserRegistry,
    NmapXmlParser,
    SubfinderJsonParser,
    HttpxJsonParser,
    DnsxJsonParser,
    NaabuJsonParser,
  ],
})
export class ParsersModule implements OnModuleInit {
  constructor(
    private readonly registry: ParserRegistry,
    private readonly nmapXml: NmapXmlParser,
    private readonly subfinderJson: SubfinderJsonParser,
    private readonly httpxJson: HttpxJsonParser,
    private readonly dnsxJson: DnsxJsonParser,
    private readonly naabuJson: NaabuJsonParser,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.nmapXml);
    this.registry.register(this.subfinderJson);
    this.registry.register(this.httpxJson);
    this.registry.register(this.dnsxJson);
    this.registry.register(this.naabuJson);
  }
}
