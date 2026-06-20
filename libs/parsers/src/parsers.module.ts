import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { CrtshJsonParser } from './crtsh-json';
import { ShodanJsonParser } from './shodan-json';
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
import { TlsxJsonParser } from './tlsx-json';
import { WhatwebJsonParser } from './whatweb-json';
import { TheHarvesterTextParser } from './theharvester-text';
import { SslscanTextParser } from './sslscan-text';
import { GobusterTextParser } from './gobuster-text';
import { CensysJsonParser } from './censys-json';
import { AsnmapJsonParser } from './asnmap-json';
import { FaviconJsonParser } from './favicon-json';
import { Wafw00fJsonParser } from './wafw00f-json';
import { CdncheckJsonParser } from './cdncheck-json';
import { JsReconJsonParser } from './js-recon-json';
import { CloudEnumTextParser } from './cloud-enum-text';
import { TrufflehogJsonParser } from './trufflehog-json';
import { SecuritytrailsJsonParser } from './securitytrails-json';
import { SmtpNmapXmlParser } from './smtp-nmap-xml';
import { SnmpTextParser } from './snmp-text';
import { SmbTextParser } from './smb-text';
import { KiterunnerTextParser } from './kiterunner-text';
import { DalfoxJsonParser } from './dalfox-json';
import { SqlmapJsonParser } from './sqlmap-json';
import { CommixTextParser } from './commix-text';
import { OpenvasdJsonParser } from './openvasd-json';
import { WpscanJsonParser } from './wpscan-json';
import { NiktoJsonParser } from './nikto-json';
import { ArjunJsonParser } from './arjun-json';

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
    ShodanJsonParser,
    TlsxJsonParser,
    WhatwebJsonParser,
    TheHarvesterTextParser,
    SslscanTextParser,
    GobusterTextParser,
    CensysJsonParser,
    AsnmapJsonParser,
    FaviconJsonParser,
    Wafw00fJsonParser,
    CdncheckJsonParser,
    JsReconJsonParser,
    CloudEnumTextParser,
    TrufflehogJsonParser,
    SecuritytrailsJsonParser,
    SmtpNmapXmlParser,
    SnmpTextParser,
    SmbTextParser,
    KiterunnerTextParser,
    DalfoxJsonParser,
    SqlmapJsonParser,
    CommixTextParser,
    OpenvasdJsonParser,
    WpscanJsonParser,
    NiktoJsonParser,
    ArjunJsonParser,
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
    ShodanJsonParser,
    TlsxJsonParser,
    WhatwebJsonParser,
    TheHarvesterTextParser,
    SslscanTextParser,
    GobusterTextParser,
    CensysJsonParser,
    AsnmapJsonParser,
    FaviconJsonParser,
    Wafw00fJsonParser,
    CdncheckJsonParser,
    JsReconJsonParser,
    CloudEnumTextParser,
    TrufflehogJsonParser,
    SecuritytrailsJsonParser,
    SmtpNmapXmlParser,
    SnmpTextParser,
    SmbTextParser,
    KiterunnerTextParser,
    DalfoxJsonParser,
    SqlmapJsonParser,
    CommixTextParser,
    OpenvasdJsonParser,
    WpscanJsonParser,
    NiktoJsonParser,
    ArjunJsonParser,
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
    private readonly shodanJson: ShodanJsonParser,
    private readonly tlsxJson: TlsxJsonParser,
    private readonly whatwebJson: WhatwebJsonParser,
    private readonly theHarvesterText: TheHarvesterTextParser,
    private readonly sslscanText: SslscanTextParser,
    private readonly gobusterText: GobusterTextParser,
    private readonly censysJson: CensysJsonParser,
    private readonly asnmapJson: AsnmapJsonParser,
    private readonly faviconJson: FaviconJsonParser,
    private readonly wafw00fJson: Wafw00fJsonParser,
    private readonly cdncheckJson: CdncheckJsonParser,
    private readonly jsReconJson: JsReconJsonParser,
    private readonly cloudEnumText: CloudEnumTextParser,
    private readonly trufflehogJson: TrufflehogJsonParser,
    private readonly securitytrailsJson: SecuritytrailsJsonParser,
    private readonly smtpNmapXml: SmtpNmapXmlParser,
    private readonly snmpText: SnmpTextParser,
    private readonly smbText: SmbTextParser,
    private readonly kiterunnerText: KiterunnerTextParser,
    private readonly dalfoxJson: DalfoxJsonParser,
    private readonly sqlmapJson: SqlmapJsonParser,
    private readonly commixText: CommixTextParser,
    private readonly openvasdJson: OpenvasdJsonParser,
    private readonly wpscanJson: WpscanJsonParser,
    private readonly niktoJson: NiktoJsonParser,
    private readonly arjunJson: ArjunJsonParser,
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
    this.registry.register(this.shodanJson);
    this.registry.register(this.tlsxJson);
    this.registry.register(this.whatwebJson);
    this.registry.register(this.theHarvesterText);
    this.registry.register(this.sslscanText);
    this.registry.register(this.gobusterText);
    this.registry.register(this.censysJson);
    this.registry.register(this.asnmapJson);
    this.registry.register(this.faviconJson);
    this.registry.register(this.wafw00fJson);
    this.registry.register(this.cdncheckJson);
    this.registry.register(this.jsReconJson);
    this.registry.register(this.cloudEnumText);
    this.registry.register(this.trufflehogJson);
    this.registry.register(this.securitytrailsJson);
    this.registry.register(this.smtpNmapXml);
    this.registry.register(this.snmpText);
    this.registry.register(this.smbText);
    this.registry.register(this.kiterunnerText);
    this.registry.register(this.dalfoxJson);
    this.registry.register(this.sqlmapJson);
    this.registry.register(this.commixText);
    this.registry.register(this.openvasdJson);
    this.registry.register(this.wpscanJson);
    this.registry.register(this.niktoJson);
    this.registry.register(this.arjunJson);
  }
}
