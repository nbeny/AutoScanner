FROM debian:bookworm-slim AS fetch
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL -o /tmp/rdp-sec-check.pl \
    https://raw.githubusercontent.com/CiscoCXSecurity/rdp-sec-check/8d77ab0e62b26ff75e43bb86d09e6a8284a76b80/rdp-sec-check.pl \
 && chmod +x /tmp/rdp-sec-check.pl

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends perl libio-socket-ssl-perl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos '' --uid 10001 scanner
COPY --from=fetch /tmp/rdp-sec-check.pl /usr/local/bin/rdp-sec-check.pl
USER scanner
ENTRYPOINT []
