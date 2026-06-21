#!/usr/bin/env bash
# Builds the custom scanner images that have no pinnable upstream image.
# Run once locally before scanning, and in CI before the e2e job.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

docker build -t autoscanner/assetfinder:1.0 "$ROOT/docker/scanners/assetfinder"
docker build -t autoscanner/puredns:1.0 "$ROOT/docker/scanners/puredns"
docker build -t autoscanner/gau:1.0 "$ROOT/docker/scanners/gau"
docker build -t autoscanner/ffuf:1.0 "$ROOT/docker/scanners/ffuf"
docker build -t autoscanner/whois:1.0 "$ROOT/docker/scanners/whois"
docker build -t autoscanner/crtsh:1.0 "$ROOT/docker/scanners/crtsh"
docker build -t autoscanner/shodan:1.0 "$ROOT/docker/scanners/shodan"
docker build -t autoscanner/whatweb:1.0 "$ROOT/docker/scanners/whatweb"
docker build -t autoscanner/theharvester:1.0 "$ROOT/docker/scanners/theharvester"
docker build -t autoscanner/sslscan:1.0 "$ROOT/docker/scanners/sslscan"
docker build -t autoscanner/gobuster:1.0 "$ROOT/docker/scanners/gobuster"
docker build -t autoscanner/censys:1.0 "$ROOT/docker/scanners/censys"
docker build -t autoscanner/wpscan:1.0 "$ROOT/docker/scanners/wpscan"
docker build -t autoscanner/nikto:1.0 "$ROOT/docker/scanners/nikto"
docker build -t autoscanner/arjun:1.0 "$ROOT/docker/scanners/arjun"
docker build -t autoscanner/kerbrute:1.0 "$ROOT/docker/scanners/kerbrute"
docker build -t autoscanner/ldap-enum:1.0 "$ROOT/docker/scanners/ldap-enum"
docker build -t autoscanner/kubeletctl:1.0 "$ROOT/docker/scanners/kubeletctl"
docker build -t autoscanner/s3scanner:1.0 "$ROOT/docker/scanners/s3scanner"
docker build -t autoscanner/cloudbrute:1.0 "$ROOT/docker/scanners/cloudbrute"
docker build -t autoscanner/masscan:1.0 "$ROOT/docker/scanners/masscan"
docker build -t autoscanner/ssh-audit:1.0 "$ROOT/docker/scanners/ssh-audit"
docker build -t autoscanner/nbtscan:1.0 "$ROOT/docker/scanners/nbtscan"
docker build -t autoscanner/rdp-sec-check:1.0 "$ROOT/docker/scanners/rdp-sec-check"
docker build -t autoscanner/abuseipdb:1.0 "$ROOT/docker/scanners/abuseipdb"
docker build -t autoscanner/greynoise:1.0 "$ROOT/docker/scanners/greynoise"

echo "Built: autoscanner/assetfinder:1.0, autoscanner/puredns:1.0, autoscanner/gau:1.0, autoscanner/ffuf:1.0, autoscanner/whois:1.0, autoscanner/crtsh:1.0, autoscanner/shodan:1.0, autoscanner/whatweb:1.0, autoscanner/theharvester:1.0, autoscanner/sslscan:1.0, autoscanner/gobuster:1.0, autoscanner/censys:1.0, autoscanner/wpscan:1.0, autoscanner/nikto:1.0, autoscanner/arjun:1.0, autoscanner/kerbrute:1.0, autoscanner/ldap-enum:1.0, autoscanner/kubeletctl:1.0, autoscanner/s3scanner:1.0, autoscanner/cloudbrute:1.0, autoscanner/masscan:1.0, autoscanner/ssh-audit:1.0, autoscanner/nbtscan:1.0, autoscanner/rdp-sec-check:1.0, autoscanner/abuseipdb:1.0, autoscanner/greynoise:1.0"
