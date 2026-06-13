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

echo "Built: autoscanner/assetfinder:1.0, autoscanner/puredns:1.0, autoscanner/gau:1.0, autoscanner/ffuf:1.0, autoscanner/whois:1.0, autoscanner/crtsh:1.0, autoscanner/shodan:1.0, autoscanner/whatweb:1.0, autoscanner/theharvester:1.0"
