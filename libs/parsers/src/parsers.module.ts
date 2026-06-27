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
import { KerbruteTextParser } from './kerbrute-text';
import { LdapTextParser } from './ldap-text';
import { KubeHunterJsonParser } from './kube-hunter-json';
import { KubeletctlJsonParser } from './kubeletctl-json';
import { S3scannerJsonParser } from './s3scanner-json';
import { CloudbruteTextParser } from './cloudbrute-text';
import { MasscanJsonParser } from './masscan-json/masscan-json.parser';
import { SshAuditJsonParser } from './ssh-audit-json';
import { NbtscanTextParser } from './nbtscan-text/nbtscan-text.parser';
import { RdpSecCheckTextParser } from './rdp-sec-check-text/rdp-sec-check-text.parser';
import { AbuseipdbJsonParser } from './abuseipdb-json/abuseipdb-json.parser';
import { GreynoiseJsonParser } from './greynoise-json/greynoise-json.parser';
import { WebDastJsonParser } from './web-dast-json';
import { SstimapTextParser } from './sstimap-text';
import { ZapJsonParser } from './zap-json';
import { SubzyJsonParser } from './subzy-json';
import { MetabigorJsonParser } from './metabigor-json';
import { IplinesTextParser } from './iplines-text';
import { SpiderfootJsonParser } from './spiderfoot-json';
import { MaigretTextParser } from './maigret-text';
import { HoleheTextParser } from './holehe-text';
import { DnstwistJsonParser } from './dnstwist-json';
import { WebanalyzeJsonParser } from './webanalyze-json';
import { SubjsTextParser } from './subjs-text';
import { ChaosJsonParser } from './chaos-json';
import { UncoverJsonlParser } from './uncover-jsonl';
import { FofaJsonParser } from './fofa-json';
import { GitleaksJsonParser } from './gitleaks-json';
import { RustscanGreppableParser } from './rustscan-greppable';
import { OnesixtyoneTextParser } from './onesixtyone-text';
import { Enum4LinuxJsonParser } from './enum4linux-json';
import { IkeScanTextParser } from './ike-scan-text';
import { DnsreconJsonParser } from './dnsrecon-json';
import { FeroxbusterJsonParser } from './feroxbuster-json';
import { HakrawlerTextParser } from './hakrawler-text';
import { GospiderJsonParser } from './gospider-json';
import { CariddiJsonParser } from './cariddi-json';
import { CorsyJsonParser } from './corsy-json';
import { LinkfinderTextParser } from './linkfinder-text';

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
    KerbruteTextParser,
    LdapTextParser,
    KubeHunterJsonParser,
    KubeletctlJsonParser,
    S3scannerJsonParser,
    CloudbruteTextParser,
    MasscanJsonParser,
    SshAuditJsonParser,
    NbtscanTextParser,
    RdpSecCheckTextParser,
    AbuseipdbJsonParser,
    GreynoiseJsonParser,
    WebDastJsonParser,
    SstimapTextParser,
    ZapJsonParser,
    SubzyJsonParser,
    MetabigorJsonParser,
    IplinesTextParser,
    SpiderfootJsonParser,
    MaigretTextParser,
    HoleheTextParser,
    DnstwistJsonParser,
    WebanalyzeJsonParser,
    SubjsTextParser,
    ChaosJsonParser,
    UncoverJsonlParser,
    FofaJsonParser,
    GitleaksJsonParser,
    RustscanGreppableParser,
    OnesixtyoneTextParser,
    Enum4LinuxJsonParser,
    IkeScanTextParser,
    DnsreconJsonParser,
    FeroxbusterJsonParser,
    HakrawlerTextParser,
    GospiderJsonParser,
    CariddiJsonParser,
    CorsyJsonParser,
    LinkfinderTextParser,
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
    KerbruteTextParser,
    LdapTextParser,
    KubeHunterJsonParser,
    KubeletctlJsonParser,
    S3scannerJsonParser,
    CloudbruteTextParser,
    MasscanJsonParser,
    SshAuditJsonParser,
    NbtscanTextParser,
    RdpSecCheckTextParser,
    AbuseipdbJsonParser,
    GreynoiseJsonParser,
    WebDastJsonParser,
    SstimapTextParser,
    ZapJsonParser,
    SubzyJsonParser,
    MetabigorJsonParser,
    IplinesTextParser,
    SpiderfootJsonParser,
    MaigretTextParser,
    HoleheTextParser,
    DnstwistJsonParser,
    WebanalyzeJsonParser,
    SubjsTextParser,
    ChaosJsonParser,
    UncoverJsonlParser,
    FofaJsonParser,
    GitleaksJsonParser,
    RustscanGreppableParser,
    OnesixtyoneTextParser,
    Enum4LinuxJsonParser,
    IkeScanTextParser,
    DnsreconJsonParser,
    FeroxbusterJsonParser,
    HakrawlerTextParser,
    GospiderJsonParser,
    CariddiJsonParser,
    CorsyJsonParser,
    LinkfinderTextParser,
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
    private readonly kerbruteText: KerbruteTextParser,
    private readonly ldapText: LdapTextParser,
    private readonly kubeHunterJson: KubeHunterJsonParser,
    private readonly kubeletctlJson: KubeletctlJsonParser,
    private readonly s3scannerJson: S3scannerJsonParser,
    private readonly cloudbruteText: CloudbruteTextParser,
    private readonly masscanJson: MasscanJsonParser,
    private readonly sshAuditJson: SshAuditJsonParser,
    private readonly nbtscanText: NbtscanTextParser,
    private readonly rdpSecCheckText: RdpSecCheckTextParser,
    private readonly abuseipdbJson: AbuseipdbJsonParser,
    private readonly greynoise: GreynoiseJsonParser,
    private readonly webDastJson: WebDastJsonParser,
    private readonly sstimapText: SstimapTextParser,
    private readonly zapJson: ZapJsonParser,
    private readonly subzyJson: SubzyJsonParser,
    private readonly metabigorJson: MetabigorJsonParser,
    private readonly iplinesText: IplinesTextParser,
    private readonly spiderfootJson: SpiderfootJsonParser,
    private readonly maigretText: MaigretTextParser,
    private readonly holeheText: HoleheTextParser,
    private readonly dnstwistJson: DnstwistJsonParser,
    private readonly webanalyzeJson: WebanalyzeJsonParser,
    private readonly subjsText: SubjsTextParser,
    private readonly chaosJson: ChaosJsonParser,
    private readonly uncoverJsonl: UncoverJsonlParser,
    private readonly fofaJson: FofaJsonParser,
    private readonly gitleaksJson: GitleaksJsonParser,
    private readonly rustscanGreppable: RustscanGreppableParser,
    private readonly onesixtyoneText: OnesixtyoneTextParser,
    private readonly enum4linuxJson: Enum4LinuxJsonParser,
    private readonly ikeScanText: IkeScanTextParser,
    private readonly dnsreconJson: DnsreconJsonParser,
    private readonly feroxbusterJson: FeroxbusterJsonParser,
    private readonly hakrawlerText: HakrawlerTextParser,
    private readonly gospiderJson: GospiderJsonParser,
    private readonly cariddiJson: CariddiJsonParser,
    private readonly corsyJson: CorsyJsonParser,
    private readonly linkfinderText: LinkfinderTextParser,
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
    this.registry.register(this.kerbruteText);
    this.registry.register(this.ldapText);
    this.registry.register(this.kubeHunterJson);
    this.registry.register(this.kubeletctlJson);
    this.registry.register(this.s3scannerJson);
    this.registry.register(this.cloudbruteText);
    this.registry.register(this.masscanJson);
    this.registry.register(this.sshAuditJson);
    this.registry.register(this.nbtscanText);
    this.registry.register(this.rdpSecCheckText);
    this.registry.register(this.abuseipdbJson);
    this.registry.register(this.greynoise);
    this.registry.register(this.webDastJson);
    this.registry.register(this.sstimapText);
    this.registry.register(this.zapJson);
    this.registry.register(this.subzyJson);
    this.registry.register(this.metabigorJson);
    this.registry.register(this.iplinesText);
    this.registry.register(this.spiderfootJson);
    this.registry.register(this.maigretText);
    this.registry.register(this.holeheText);
    this.registry.register(this.dnstwistJson);
    this.registry.register(this.webanalyzeJson);
    this.registry.register(this.subjsText);
    this.registry.register(this.chaosJson);
    this.registry.register(this.uncoverJsonl);
    this.registry.register(this.fofaJson);
    this.registry.register(this.gitleaksJson);
    this.registry.register(this.rustscanGreppable);
    this.registry.register(this.onesixtyoneText);
    this.registry.register(this.enum4linuxJson);
    this.registry.register(this.ikeScanText);
    this.registry.register(this.dnsreconJson);
    this.registry.register(this.feroxbusterJson);
    this.registry.register(this.hakrawlerText);
    this.registry.register(this.gospiderJson);
    this.registry.register(this.cariddiJson);
    this.registry.register(this.corsyJson);
    this.registry.register(this.linkfinderText);
  }
}
