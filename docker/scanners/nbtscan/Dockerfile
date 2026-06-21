FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends nbtscan \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos '' --uid 10001 scanner
USER scanner
ENTRYPOINT []
