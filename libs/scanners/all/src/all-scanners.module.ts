import { Module } from '@nestjs/common';

import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NmapScannerModule } from '@autoscanner/scanners-nmap';
import { SubfinderScannerModule } from '@autoscanner/scanners-subfinder';
import { HttpxScannerModule } from '@autoscanner/scanners-httpx';
import { DnsxScannerModule } from '@autoscanner/scanners-dnsx';
import { NaabuScannerModule } from '@autoscanner/scanners-naabu';
import { NucleiScannerModule } from '@autoscanner/scanners-nuclei';
import { FindomainScannerModule } from '@autoscanner/scanners-findomain';
import { AmassScannerModule } from '@autoscanner/scanners-amass';
import { AssetfinderScannerModule } from '@autoscanner/scanners-assetfinder';
import { PurednsScannerModule } from '@autoscanner/scanners-puredns';
import { KatanaScannerModule } from '@autoscanner/scanners-katana';
import { GauScannerModule } from '@autoscanner/scanners-gau';
import { FfufScannerModule } from '@autoscanner/scanners-ffuf';
import { GobusterScannerModule } from '@autoscanner/scanners-gobuster';
import { WhoisScannerModule } from '@autoscanner/scanners-whois';
import { CrtshScannerModule } from '@autoscanner/scanners-crtsh';
import { ShodanScannerModule } from '@autoscanner/scanners-shodan';
import { TlsxScannerModule } from '@autoscanner/scanners-tlsx';
import { WhatwebScannerModule } from '@autoscanner/scanners-whatweb';
import { WpscanScannerModule } from '@autoscanner/scanners-wpscan';
import { TheHarvesterScannerModule } from '@autoscanner/scanners-theharvester';
import { SslscanScannerModule } from '@autoscanner/scanners-sslscan';
import { CensysScannerModule } from '@autoscanner/scanners-censys';
import { AsnmapScannerModule } from '@autoscanner/scanners-asnmap';
import { CloudEnumScannerModule } from '@autoscanner/scanners-cloud-enum';
import { GithubSubdomainsScannerModule } from '@autoscanner/scanners-github-subdomains';
import { TrufflehogScannerModule } from '@autoscanner/scanners-trufflehog';
import { SecuritytrailsScannerModule } from '@autoscanner/scanners-securitytrails';
import { FaviconScannerModule } from '@autoscanner/scanners-favicon';
import { Wafw00fScannerModule } from '@autoscanner/scanners-wafw00f';
import { CdncheckScannerModule } from '@autoscanner/scanners-cdncheck';
import { JsReconScannerModule } from '@autoscanner/scanners-js-recon';
import { GowitnessScannerModule } from '@autoscanner/scanners-gowitness';
import { SmtpReconScannerModule } from '@autoscanner/scanners-smtp-recon';
import { SnmpReconScannerModule } from '@autoscanner/scanners-snmp-recon';
import { SmbEnumScannerModule } from '@autoscanner/scanners-smb-enum';
import { ApiDiscoveryScannerModule } from '@autoscanner/scanners-api-discovery';
import { XssScanScannerModule } from '@autoscanner/scanners-xss-scan';
import { SqliScanScannerModule } from '@autoscanner/scanners-sqli-scan';
import { CmdiScanScannerModule } from '@autoscanner/scanners-cmdi-scan';
import { WebDastScannerModule } from '@autoscanner/scanners-web-dast';
import { SstiScanScannerModule } from '@autoscanner/scanners-ssti-scan';
import { ZapScanScannerModule } from '@autoscanner/scanners-zap-scan';
import { OpenvasScanScannerModule } from '@autoscanner/scanners-openvas-scan';
import { NiktoScannerModule } from '@autoscanner/scanners-nikto';
import { ArjunScannerModule } from '@autoscanner/scanners-arjun';
import { KerbruteScannerModule } from '@autoscanner/scanners-kerbrute';
import { LdapEnumScannerModule } from '@autoscanner/scanners-ldap-enum';
import { KubeHunterScannerModule } from '@autoscanner/scanners-kube-hunter';
import { KubeletctlScannerModule } from '@autoscanner/scanners-kubeletctl';
import { S3scannerScannerModule } from '@autoscanner/scanners-s3scanner';
import { CloudbruteScannerModule } from '@autoscanner/scanners-cloudbrute';
import { MasscanScannerModule } from '@autoscanner/scanners-masscan';
import { SshAuditScannerModule } from '@autoscanner/scanners-ssh-audit';
import { NbtscanScannerModule } from '@autoscanner/scanners-nbtscan';
import { RdpSecCheckScannerModule } from '@autoscanner/scanners-rdp-sec-check';
import { AbuseipdbScannerModule } from '@autoscanner/scanners-abuseipdb';
import { GreynoiseScannerModule } from '@autoscanner/scanners-greynoise';
import { SubzyScannerModule } from '@autoscanner/scanners-subzy';
import { AlterxScannerModule } from '@autoscanner/scanners-alterx';
import { MetabigorScannerModule } from '@autoscanner/scanners-metabigor';
import { MapcidrScannerModule } from '@autoscanner/scanners-mapcidr';
import { CeroScannerModule } from '@autoscanner/scanners-cero';
import { WaymoreScannerModule } from '@autoscanner/scanners-waymore';
import { ParamspiderScannerModule } from '@autoscanner/scanners-paramspider';
import { SpiderfootScannerModule } from '@autoscanner/scanners-spiderfoot';
import { MaigretScannerModule } from '@autoscanner/scanners-maigret';
import { HoleheScannerModule } from '@autoscanner/scanners-holehe';
import { DnstwistScannerModule } from '@autoscanner/scanners-dnstwist';
import { WebanalyzeScannerModule } from '@autoscanner/scanners-webanalyze';
import { SubjsScannerModule } from '@autoscanner/scanners-subjs';
import { ChaosScannerModule } from '@autoscanner/scanners-chaos';
import { UncoverScannerModule } from '@autoscanner/scanners-uncover';
import { FofaScannerModule } from '@autoscanner/scanners-fofa';
import { UrlfinderScannerModule } from '@autoscanner/scanners-urlfinder';
import { GitleaksScannerModule } from '@autoscanner/scanners-gitleaks';

/**
 * Single import that registers every concrete scanner in the per-process
 * `ScannerRegistry`. Imported by api-gateway (ScansModule), scan-worker, and
 * orchestrator-worker so a scanner is runnable standalone AND in a template
 * without each app maintaining its own scanner import list.
 *
 * Each scanner module guards its `registry.register` with `has()` so importing
 * this module is idempotent across module re-inits (tests, hot reload).
 */
const SCANNER_MODULES = [
  NmapScannerModule,
  SubfinderScannerModule,
  HttpxScannerModule,
  DnsxScannerModule,
  NaabuScannerModule,
  NucleiScannerModule,
  FindomainScannerModule,
  AmassScannerModule,
  AssetfinderScannerModule,
  PurednsScannerModule,
  KatanaScannerModule,
  GauScannerModule,
  FfufScannerModule,
  GobusterScannerModule,
  WhoisScannerModule,
  CrtshScannerModule,
  ShodanScannerModule,
  TlsxScannerModule,
  WhatwebScannerModule,
  WpscanScannerModule,
  TheHarvesterScannerModule,
  SslscanScannerModule,
  CensysScannerModule,
  AsnmapScannerModule,
  CloudEnumScannerModule,
  GithubSubdomainsScannerModule,
  TrufflehogScannerModule,
  SecuritytrailsScannerModule,
  FaviconScannerModule,
  Wafw00fScannerModule,
  CdncheckScannerModule,
  JsReconScannerModule,
  GowitnessScannerModule,
  SmtpReconScannerModule,
  SnmpReconScannerModule,
  SmbEnumScannerModule,
  ApiDiscoveryScannerModule,
  XssScanScannerModule,
  SqliScanScannerModule,
  CmdiScanScannerModule,
  WebDastScannerModule,
  SstiScanScannerModule,
  ZapScanScannerModule,
  OpenvasScanScannerModule,
  NiktoScannerModule,
  ArjunScannerModule,
  KerbruteScannerModule,
  LdapEnumScannerModule,
  KubeHunterScannerModule,
  KubeletctlScannerModule,
  S3scannerScannerModule,
  CloudbruteScannerModule,
  MasscanScannerModule,
  SshAuditScannerModule,
  NbtscanScannerModule,
  RdpSecCheckScannerModule,
  AbuseipdbScannerModule,
  GreynoiseScannerModule,
  SubzyScannerModule,
  AlterxScannerModule,
  MetabigorScannerModule,
  MapcidrScannerModule,
  CeroScannerModule,
  WaymoreScannerModule,
  ParamspiderScannerModule,
  SpiderfootScannerModule,
  MaigretScannerModule,
  HoleheScannerModule,
  DnstwistScannerModule,
  WebanalyzeScannerModule,
  SubjsScannerModule,
  ChaosScannerModule,
  UncoverScannerModule,
  FofaScannerModule,
  UrlfinderScannerModule,
  GitleaksScannerModule,
];

@Module({
  imports: [ScannerSdkModule, ...SCANNER_MODULES],
  exports: [...SCANNER_MODULES],
})
export class AllScannersModule {}
