import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { CrtshJsonParser } from './crtsh-json';
import { DnsxJsonParser } from './dnsx-json';
import { FfufJsonParser } from './ffuf-json';
import { HttpxJsonParser } from './httpx-json';
import { KatanaJsonParser } from './katana-json';
import { NaabuJsonParser } from './naabu-json';
import { NmapXmlParser } from './nmap-xml.parser';
import { NucleiJsonParser } from './nuclei-json';
import { ParserRegistry } from './registry';
import { SubfinderJsonParser } from './subfinder-json';
import { HostlinesTextParser } from './hostlines-text';
import { UrllinesTextParser } from './urllines-text';
import { WhoisTextParser } from './whois-text';

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
    KatanaJsonParser,
    UrllinesTextParser,
    FfufJsonParser,
    WhoisTextParser,
    CrtshJsonParser,
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
    KatanaJsonParser,
    UrllinesTextParser,
    FfufJsonParser,
    WhoisTextParser,
    CrtshJsonParser,
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
    private readonly katanaJson: KatanaJsonParser,
    private readonly urllinesText: UrllinesTextParser,
    private readonly ffufJson: FfufJsonParser,
    private readonly whoisText: WhoisTextParser,
    private readonly crtshJson: CrtshJsonParser,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.nmapXml);
    this.registry.register(this.subfinderJson);
    this.registry.register(this.httpxJson);
    this.registry.register(this.dnsxJson);
    this.registry.register(this.naabuJson);
    this.registry.register(this.nucleiJson);
    this.registry.register(this.hostlinesText);
    this.registry.register(this.katanaJson);
    this.registry.register(this.urllinesText);
    this.registry.register(this.ffufJson);
    this.registry.register(this.whoisText);
    this.registry.register(this.crtshJson);
  }
}
