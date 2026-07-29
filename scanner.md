# Scanner inventory

Full list of the **109** scanners registered in
[`libs/scanners/all/src/all-scanners.module.ts`](libs/scanners/all/src/all-scanners.module.ts).
Each adapter lives at `libs/scanners/<name>/src/<name>.scanner.ts` and exports a
`ScannerDefinition` (name, `category[]`, `inputSchema`, `docker` spec, `build()`, `outputs[]`).

The two groups below split on the scanner's declared `ScannerCategory`:

- **OSINT / passive** — tagged `OSINT` or `IDENTITY_OSINT`: query third-party
  data sources / APIs, do not (or barely) touch the target directly.
- **IP / active scanning** — everything else: probe the target host, network,
  service, or web app directly.

> **Underlying tool** is the real CLI/engine inside the container. Where it
> differs from the scanner name (wrappers, meta-scanners), the tool is called out
> explicitly. `autoscanner/*:1.0` images are custom-built via
> `tools/scanners/build-images.sh` (`pnpm scanners:build`); other images are
> pulled from upstream registries.

---

## OSINT / passive scanners (30)

| Scanner             | Path (`libs/scanners/…`) | Docker image                        | Underlying tool              | Categories                           |
| ------------------- | ------------------------ | ----------------------------------- | ---------------------------- | ------------------------------------ |
| `abuseipdb`         | `abuseipdb/`             | `autoscanner/abuseipdb:1.0`         | AbuseIPDB API                | PASSIVE_RECON, OSINT                 |
| `censys`            | `censys/`                | `autoscanner/censys:1.0`            | Censys Search API            | OSINT                                |
| `chaos`             | `chaos/`                 | `autoscanner/chaos:1.0`             | ProjectDiscovery Chaos API   | OSINT, SUBDOMAIN_ENUM                |
| `cloud-enum`        | `cloud-enum/`            | `autoscanner/cloud-enum:1.0`        | cloud_enum                   | CLOUD, OSINT                         |
| `crtsh`             | `crtsh/`                 | `autoscanner/crtsh:1.0`             | crt.sh CT JSON API (curl/jq) | OSINT, PASSIVE_RECON, SUBDOMAIN_ENUM |
| `dnstwist`          | `dnstwist/`              | `autoscanner/dnstwist:1.0`          | dnstwist                     | OSINT, PASSIVE_RECON                 |
| `emailfinder`       | `emailfinder/`           | `autoscanner/emailfinder:1.0`       | emailfinder                  | OSINT, IDENTITY_OSINT                |
| `emailrep`          | `emailrep/`              | `autoscanner/emailrep:1.0`          | EmailRep.io API              | OSINT, IDENTITY_OSINT                |
| `fofa`              | `fofa/`                  | `autoscanner/fofa:1.0`              | FOFA API                     | OSINT, PASSIVE_RECON                 |
| `gcp-bucket-brute`  | `gcp-bucket-brute/`      | `autoscanner/gcp-bucket-brute:1.0`  | GCPBucketBrute               | CLOUD, OSINT                         |
| `github-subdomains` | `github-subdomains/`     | `autoscanner/github-subdomains:1.0` | github-subdomains            | OSINT, SUBDOMAIN_ENUM                |
| `gitleaks`          | `gitleaks/`              | `autoscanner/gitleaks:1.0`          | gitleaks                     | OSINT, VULN_SCAN                     |
| `greynoise`         | `greynoise/`             | `autoscanner/greynoise:1.0`         | GreyNoise API                | PASSIVE_RECON, OSINT                 |
| `holehe`            | `holehe/`                | `autoscanner/holehe:1.0`            | holehe                       | IDENTITY_OSINT, OSINT                |
| `internetdb`        | `internetdb/`            | `autoscanner/internetdb:1.0`        | Shodan InternetDB API        | PASSIVE_RECON, OSINT                 |
| `maigret`           | `maigret/`               | `autoscanner/maigret:1.0`           | maigret                      | IDENTITY_OSINT, OSINT                |
| `mailspoof`         | `mailspoof/`             | `autoscanner/mailspoof:1.0`         | mailspoof (SPF/DMARC)        | OSINT, SMTP                          |
| `metabigor`         | `metabigor/`             | `autoscanner/metabigor:1.0`         | metabigor                    | OSINT, PASSIVE_RECON                 |
| `msftrecon`         | `msftrecon/`             | `autoscanner/msftrecon:1.0`         | msftrecon                    | CLOUD, OSINT, PASSIVE_RECON          |
| `phoneinfoga`       | `phoneinfoga/`           | `autoscanner/phoneinfoga:1.0`       | PhoneInfoga                  | OSINT                                |
| `sherlock`          | `sherlock/`              | `autoscanner/sherlock:1.0`          | sherlock                     | IDENTITY_OSINT, OSINT                |
| `shodan`            | `shodan/`                | `autoscanner/shodan:1.0`            | Shodan API                   | OSINT                                |
| `socialscan`        | `socialscan/`            | `autoscanner/socialscan:1.0`        | socialscan                   | IDENTITY_OSINT, OSINT                |
| `spiderfoot`        | `spiderfoot/`            | `autoscanner/spiderfoot:1.0`        | SpiderFoot                   | OSINT, PASSIVE_RECON                 |
| `spoofy`            | `spoofy/`                | `autoscanner/spoofy:1.0`            | spoofy (SPF/DMARC)           | OSINT, SMTP                          |
| `theharvester`      | `theharvester/`          | `autoscanner/theharvester:1.0`      | theHarvester                 | OSINT, PASSIVE_RECON                 |
| `trufflehog`        | `trufflehog/`            | `autoscanner/trufflehog:1.0`        | trufflehog                   | OSINT, VULN_SCAN                     |
| `uncover`           | `uncover/`               | `autoscanner/uncover:1.0`           | uncover (ProjectDiscovery)   | OSINT, PASSIVE_RECON                 |
| `urlfinder`         | `urlfinder/`             | `autoscanner/urlfinder:1.0`         | urlfinder (ProjectDiscovery) | OSINT, PASSIVE_RECON                 |
| `whois`             | `whois/`                 | `autoscanner/whois:1.0`             | whois                        | OSINT, PASSIVE_RECON                 |

---

## IP / active-scanning scanners (79)

### Subdomain / DNS discovery (14)

| Scanner          | Path (`libs/scanners/…`) | Docker image                         | Underlying tool            | Categories                         |
| ---------------- | ------------------------ | ------------------------------------ | -------------------------- | ---------------------------------- |
| `amass`          | `amass/`                 | `caffix/amass:v4.2.0`                | OWASP Amass (passive)      | SUBDOMAIN_ENUM, PASSIVE_RECON      |
| `subfinder`      | `subfinder/`             | `projectdiscovery/subfinder:v2.14.0` | subfinder                  | SUBDOMAIN_ENUM, PASSIVE_RECON      |
| `assetfinder`    | `assetfinder/`           | `autoscanner/assetfinder:1.0`        | assetfinder                | SUBDOMAIN_ENUM, PASSIVE_RECON      |
| `findomain`      | `findomain/`             | `edu4rdshl/findomain:9.0.4`          | findomain                  | SUBDOMAIN_ENUM, PASSIVE_RECON      |
| `puredns`        | `puredns/`               | `autoscanner/puredns:1.0`            | puredns + massdns          | SUBDOMAIN_ENUM, DNS                |
| `alterx`         | `alterx/`                | `autoscanner/alterx:1.0`             | alterx                     | SUBDOMAIN_ENUM, DNS                |
| `dnsx`           | `dnsx/`                  | `projectdiscovery/dnsx:v1.2.3`       | dnsx                       | DNS, PASSIVE_RECON                 |
| `dnsrecon`       | `dnsrecon/`              | `autoscanner/dnsrecon:1.0`           | dnsrecon                   | DNS, SUBDOMAIN_ENUM                |
| `cero`           | `cero/`                  | `autoscanner/cero:1.0`               | cero (TLS SAN scrape)      | SUBDOMAIN_ENUM, SSL_TLS            |
| `subzy`          | `subzy/`                 | `autoscanner/subzy:1.0`              | subzy (subdomain takeover) | SUBDOMAIN_ENUM, VULN_SCAN          |
| `securitytrails` | `securitytrails/`        | `autoscanner/securitytrails:1.0`     | SecurityTrails API         | PASSIVE_RECON, DNS                 |
| `asnmap`         | `asnmap/`                | `autoscanner/asnmap:1.0`             | asnmap                     | PASSIVE_RECON, NETWORK_DISCOVERY   |
| `mapcidr`        | `mapcidr/`               | `projectdiscovery/mapcidr:v1.1.34`   | mapcidr                    | NETWORK_DISCOVERY                  |
| `cdncheck`       | `cdncheck/`              | `autoscanner/cdncheck:1.0`           | cdncheck                   | WEB_FINGERPRINT, NETWORK_DISCOVERY |

### Port / network scanning (5)

| Scanner    | Path (`libs/scanners/…`) | Docker image                    | Underlying tool      | Categories                                      |
| ---------- | ------------------------ | ------------------------------- | -------------------- | ----------------------------------------------- |
| `nmap`     | `nmap/`                  | `instrumentisto/nmap:7.98-r2`   | nmap                 | NETWORK_DISCOVERY, PORT_SCAN, SERVICE_DETECTION |
| `naabu`    | `naabu/`                 | `projectdiscovery/naabu:v2.6.1` | naabu                | PORT_SCAN, NETWORK_DISCOVERY                    |
| `masscan`  | `masscan/`               | `autoscanner/masscan:1.0`       | masscan              | PORT_SCAN, NETWORK_DISCOVERY                    |
| `rustscan` | `rustscan/`              | `autoscanner/rustscan:1.0`      | RustScan             | PORT_SCAN, NETWORK_DISCOVERY                    |
| `ike-scan` | `ike-scan/`              | `autoscanner/ike-scan:1.0`      | ike-scan (IPsec/IKE) | NETWORK_DISCOVERY, SERVICE_DETECTION            |

### Web fingerprint / crawl / content enumeration (28)

| Scanner         | Path (`libs/scanners/…`) | Docker image                     | Underlying tool           | Categories                     |
| --------------- | ------------------------ | -------------------------------- | ------------------------- | ------------------------------ |
| `httpx`         | `httpx/`                 | `projectdiscovery/httpx:v1.9.0`  | httpx                     | WEB_FINGERPRINT, PASSIVE_RECON |
| `favicon`       | `favicon/`               | `projectdiscovery/httpx:v1.9.0`  | httpx (favicon hash)      | WEB_FINGERPRINT                |
| `whatweb`       | `whatweb/`               | `autoscanner/whatweb:1.0`        | WhatWeb                   | WEB_FINGERPRINT                |
| `webanalyze`    | `webanalyze/`            | `autoscanner/webanalyze:1.0`     | webanalyze (Wappalyzer)   | WEB_FINGERPRINT                |
| `wafw00f`       | `wafw00f/`               | `autoscanner/wafw00f:1.0`        | wafw00f                   | WEB_FINGERPRINT                |
| `gowitness`     | `gowitness/`             | `autoscanner/gowitness:1.0`      | gowitness (screenshots)   | WEB_FINGERPRINT                |
| `katana`        | `katana/`                | `projectdiscovery/katana:v1.6.1` | katana (crawler)          | WEB_ENUM, WEB_FINGERPRINT      |
| `gau`           | `gau/`                   | `autoscanner/gau:1.0`            | gau (getallurls)          | WEB_ENUM, PASSIVE_RECON        |
| `waymore`       | `waymore/`               | `autoscanner/waymore:1.0`        | waymore                   | WEB_ENUM, PASSIVE_RECON        |
| `gospider`      | `gospider/`              | `autoscanner/gospider:1.0`       | gospider                  | WEB_ENUM, WEB_FINGERPRINT      |
| `hakrawler`     | `hakrawler/`             | `autoscanner/hakrawler:1.0`      | hakrawler                 | WEB_ENUM, WEB_FINGERPRINT      |
| `cariddi`       | `cariddi/`               | `autoscanner/cariddi:1.0`        | cariddi                   | WEB_ENUM, VULN_SCAN            |
| `subjs`         | `subjs/`                 | `autoscanner/subjs:1.0`          | subjs                     | WEB_ENUM, PASSIVE_RECON        |
| `paramspider`   | `paramspider/`           | `autoscanner/paramspider:1.0`    | ParamSpider               | WEB_ENUM                       |
| `ffuf`          | `ffuf/`                  | `autoscanner/ffuf:1.0`           | ffuf                      | WEB_ENUM                       |
| `gobuster`      | `gobuster/`              | `autoscanner/gobuster:1.0`       | gobuster                  | WEB_ENUM                       |
| `feroxbuster`   | `feroxbuster/`           | `autoscanner/feroxbuster:1.0`    | feroxbuster               | WEB_ENUM, WEB_FINGERPRINT      |
| `nikto`         | `nikto/`                 | `autoscanner/nikto:1.0`          | Nikto                     | WEB_ENUM                       |
| `wpscan`        | `wpscan/`                | `autoscanner/wpscan:1.0`         | WPScan                    | WEB_ENUM, WEB_FINGERPRINT      |
| `js-recon`      | `js-recon/`              | `autoscanner/js-recon:1.0`       | LinkFinder + secret regex | WEB_ENUM, VULN_SCAN            |
| `linkfinder`    | `linkfinder/`            | `autoscanner/linkfinder:1.0`     | LinkFinder                | WEB_ENUM, API_SECURITY         |
| `jsluice`       | `jsluice/`               | `autoscanner/jsluice:1.0`        | jsluice                   | WEB_ENUM, API_SECURITY         |
| `arjun`         | `arjun/`                 | `autoscanner/arjun:1.0`          | Arjun (param discovery)   | WEB_ENUM, API_SECURITY         |
| `api-discovery` | `api-discovery/`         | `autoscanner/api-discovery:1.0`  | kiterunner (API wordlist) | API_SECURITY, WEB_ENUM         |
| `kiterunner`    | `kiterunner/`            | `autoscanner/kiterunner:1.0`     | kiterunner                | WEB_ENUM, API_SECURITY         |
| `graphw00f`     | `graphw00f/`             | `autoscanner/graphw00f:1.0`      | graphw00f                 | WEB_ENUM, API_SECURITY         |
| `graphql-cop`   | `graphql-cop/`           | `autoscanner/graphql-cop:1.0`    | graphql-cop               | WEB_ENUM, API_SECURITY         |
| `corsy`         | `corsy/`                 | `autoscanner/corsy:1.0`          | Corsy (CORS misconfig)    | WEB_ENUM, VULN_SCAN            |

### TLS / SSL (3)

| Scanner   | Path (`libs/scanners/…`) | Docker image                   | Underlying tool | Categories |
| --------- | ------------------------ | ------------------------------ | --------------- | ---------- |
| `sslscan` | `sslscan/`               | `autoscanner/sslscan:1.0`      | sslscan         | SSL_TLS    |
| `tlsx`    | `tlsx/`                  | `projectdiscovery/tlsx:v1.2.2` | tlsx            | SSL_TLS    |
| `testssl` | `testssl/`               | `autoscanner/testssl:1.0`      | testssl.sh      | SSL_TLS    |

### Vulnerability scan / DAST / active injection (13)

| Scanner        | Path (`libs/scanners/…`) | Docker image                     | Underlying tool                     | Categories                  |
| -------------- | ------------------------ | -------------------------------- | ----------------------------------- | --------------------------- |
| `nuclei`       | `nuclei/`                | `projectdiscovery/nuclei:v3.9.0` | nuclei                              | VULN_SCAN, WEB_ENUM         |
| `web-dast`     | `web-dast/`              | `projectdiscovery/nuclei:v3.9.0` | nuclei `-dast` (+ OAST/interactsh)  | VULN_SCAN, WEB_ENUM         |
| `zap-scan`     | `zap-scan/`              | `ghcr.io/zaproxy/zaproxy:2.15.0` | OWASP ZAP                           | VULN_SCAN, WEB_ENUM         |
| `openvas-scan` | `openvas-scan/`          | `autoscanner/openvas-scan:1.0`   | OpenVAS / Greenbone                 | VULN_SCAN, NETWORK_ANALYSIS |
| `trivy`        | `trivy/`                 | `autoscanner/trivy:1.0`          | Trivy                               | VULN_SCAN, CONTAINER_K8S    |
| `sqli-scan`    | `sqli-scan/`             | `autoscanner/sqli-scan:1.0`      | sqlmap (detection only)             | VULN_SCAN, WEB_ENUM         |
| `xss-scan`     | `xss-scan/`              | `ghcr.io/hahwul/dalfox:v2.9.4`   | dalfox                              | VULN_SCAN, WEB_ENUM         |
| `cmdi-scan`    | `cmdi-scan/`             | `autoscanner/cmdi-scan:1.0`      | commix (detection only)             | VULN_SCAN, WEB_ENUM         |
| `ssti-scan`    | `ssti-scan/`             | `autoscanner/ssti-scan:1.0`      | SSTImap                             | VULN_SCAN, WEB_ENUM         |
| `crlfuzz`      | `crlfuzz/`               | `autoscanner/crlfuzz:1.0`        | crlfuzz                             | VULN_SCAN, WEB_ENUM         |
| `oralyzer`     | `oralyzer/`              | `autoscanner/oralyzer:1.0`       | Oralyzer (open redirect)            | VULN_SCAN, WEB_ENUM         |
| `smuggler`     | `smuggler/`              | `autoscanner/smuggler:1.0`       | smuggler (HTTP desync)              | VULN_SCAN, WEB_ENUM         |
| `pwncat`       | `pwncat/`                | `autoscanner/pwncat:1.0`         | pwncat (experimental exploit probe) | VULN_SCAN                   |

### Cloud / storage (2)

| Scanner      | Path (`libs/scanners/…`) | Docker image                 | Underlying tool | Categories |
| ------------ | ------------------------ | ---------------------------- | --------------- | ---------- |
| `cloudbrute` | `cloudbrute/`            | `autoscanner/cloudbrute:1.0` | CloudBrute      | CLOUD      |
| `s3scanner`  | `s3scanner/`             | `autoscanner/s3scanner:1.0`  | S3Scanner       | CLOUD      |

### SMB / Windows / Active Directory (5)

| Scanner         | Path (`libs/scanners/…`) | Docker image                    | Underlying tool                | Categories                     |
| --------------- | ------------------------ | ------------------------------- | ------------------------------ | ------------------------------ |
| `smb-enum`      | `smb-enum/`              | `autoscanner/smb-enum:1.0`      | enum4linux-ng                  | SMB_WINDOWS                    |
| `enum4linux-ng` | `enum4linux-ng/`         | `autoscanner/enum4linux-ng:1.0` | enum4linux-ng                  | SMB_WINDOWS, ACTIVE_DIRECTORY  |
| `nbtscan`       | `nbtscan/`               | `autoscanner/nbtscan:1.0`       | nbtscan                        | SMB_WINDOWS, NETWORK_DISCOVERY |
| `kerbrute`      | `kerbrute/`              | `autoscanner/kerbrute:1.0`      | kerbrute                       | ACTIVE_DIRECTORY               |
| `ldap-enum`     | `ldap-enum/`             | `autoscanner/ldap-enum:1.0`     | ldapsearch (anonymous RootDSE) | ACTIVE_DIRECTORY               |

### Kubernetes / container (2)

| Scanner       | Path (`libs/scanners/…`) | Docker image                 | Underlying tool | Categories    |
| ------------- | ------------------------ | ---------------------------- | --------------- | ------------- |
| `kube-hunter` | `kube-hunter/`           | `aquasec/kube-hunter:0.6.8`  | kube-hunter     | CONTAINER_K8S |
| `kubeletctl`  | `kubeletctl/`            | `autoscanner/kubeletctl:1.0` | kubeletctl      | CONTAINER_K8S |

### SNMP / service auditing (4)

| Scanner         | Path (`libs/scanners/…`) | Docker image                    | Underlying tool            | Categories              |
| --------------- | ------------------------ | ------------------------------- | -------------------------- | ----------------------- |
| `snmp-recon`    | `snmp-recon/`            | `autoscanner/snmp-recon:1.0`    | SNMP community enumeration | SNMP                    |
| `onesixtyone`   | `onesixtyone/`           | `autoscanner/onesixtyone:1.0`   | onesixtyone                | NETWORK_DISCOVERY, SNMP |
| `ssh-audit`     | `ssh-audit/`             | `autoscanner/ssh-audit:1.0`     | ssh-audit                  | SERVICE_DETECTION       |
| `rdp-sec-check` | `rdp-sec-check/`         | `autoscanner/rdp-sec-check:1.0` | rdp-sec-check              | SERVICE_DETECTION       |

### SMTP / mail (2)

| Scanner      | Path (`libs/scanners/…`) | Docker image                  | Underlying tool         | Categories |
| ------------ | ------------------------ | ----------------------------- | ----------------------- | ---------- |
| `smtp-recon` | `smtp-recon/`            | `instrumentisto/nmap:7.98-r2` | nmap NSE (SMTP scripts) | SMTP       |
| `swaks`      | `swaks/`                 | `autoscanner/swaks:1.0`       | swaks                   | SMTP       |

### Auth / token (1)

| Scanner    | Path (`libs/scanners/…`) | Docker image               | Underlying tool | Categories              |
| ---------- | ------------------------ | -------------------------- | --------------- | ----------------------- |
| `jwt-tool` | `jwt-tool/`              | `autoscanner/jwt-tool:1.0` | jwt_tool        | API_SECURITY, VULN_SCAN |

---

## Maintenance

- Source of truth for the registered set is
  `libs/scanners/all/src/all-scanners.module.ts` (`SCANNER_MODULES` array).
- When adding a scanner (see **Adding a scanner** in [`CLAUDE.md`](CLAUDE.md)),
  add a row to the matching table here and bump the counts.
- `autoscanner/*:1.0` images must be built (`pnpm scanners:build`) before those
  scanners can run; upstream images are pulled on first use.
