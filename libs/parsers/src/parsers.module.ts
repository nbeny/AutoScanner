import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { DnsxJsonParser } from './dnsx-json';
import { HttpxJsonParser } from './httpx-json';
import { NaabuJsonParser } from './naabu-json';
import { NmapXmlParser } from './nmap-xml.parser';
import { NucleiJsonParser } from './nuclei-json';
import { ParserRegistry } from './registry';
import { SubfinderJsonParser } from './subfinder-json';
import { HostlinesTextParser } from './hostlines-text';

@Global()
@Module({
  providers: [
    ParserRegistry,
    NmapXmlParser,
    SubfinderJsonParser,
    HttpxJsonParser,
    DnsxJsonParser,
    NaabuJsonParser,
    NucleiJsonParser,
    HostlinesTextParser,
  ],
  exports: [
    ParserRegistry,
    NmapXmlParser,
    SubfinderJsonParser,
    HttpxJsonParser,
    DnsxJsonParser,
    NaabuJsonParser,
    NucleiJsonParser,
    HostlinesTextParser,
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
    private readonly nucleiJson: NucleiJsonParser,
    private readonly hostlinesText: HostlinesTextParser,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.nmapXml);
    this.registry.register(this.subfinderJson);
    this.registry.register(this.httpxJson);
    this.registry.register(this.dnsxJson);
    this.registry.register(this.naabuJson);
    this.registry.register(this.nucleiJson);
    this.registry.register(this.hostlinesText);
  }
}
