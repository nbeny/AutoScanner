FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends enum4linux-ng smbclient ldap-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos '' --uid 10001 scanner \
 && mkdir -p /out && chown scanner:scanner /out
USER scanner
ENTRYPOINT []
