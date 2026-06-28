FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends swaks ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
