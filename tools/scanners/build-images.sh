#!/usr/bin/env bash
# Builds the custom scanner images that have no pinnable upstream image.
# Run once locally before scanning, and in CI before the e2e job.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

docker build -t autoscanner/assetfinder:1.0 "$ROOT/docker/scanners/assetfinder"
# docker/scanners/puredns is added in Task 6; running this script before then
# will fail here (set -e) once it reaches the missing context.
docker build -t autoscanner/puredns:1.0 "$ROOT/docker/scanners/puredns"

echo "Built: autoscanner/assetfinder:1.0, autoscanner/puredns:1.0"
