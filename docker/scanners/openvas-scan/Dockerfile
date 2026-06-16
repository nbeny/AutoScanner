# openvas-scan: thin client that drives the openvasd HTTP API and prints the
# scan results JSON to stdout. Joins the 'autoscanner-greenbone' network.
# Endpoint paths/fields in the entrypoint are version-dependent — verify against
# the running openvasd release.
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl jq ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY openvas-scan-run.sh /usr/local/bin/openvas-scan-run
RUN chmod +x /usr/local/bin/openvas-scan-run
USER scanner
ENTRYPOINT []
