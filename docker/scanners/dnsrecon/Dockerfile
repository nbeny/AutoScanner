FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends dnsrecon ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos '' --uid 10001 scanner \
 && mkdir -p /out /opt/dnsrecon && chown scanner:scanner /out
COPY brute.txt /opt/dnsrecon/brute.txt
USER scanner
ENTRYPOINT []
