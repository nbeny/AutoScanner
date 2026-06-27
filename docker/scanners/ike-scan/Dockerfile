FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ike-scan ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos '' --uid 10001 scanner
USER scanner
ENTRYPOINT []
