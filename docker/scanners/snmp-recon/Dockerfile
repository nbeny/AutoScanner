# snmp-recon: SNMP enumeration using onesixtyone (community scanner) and
# snmpwalk (OID walker). The 'snmp' package provides snmpwalk/snmpget.
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      onesixtyone \
      snmp \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos '' --uid 10001 scanner
USER scanner
ENTRYPOINT []
