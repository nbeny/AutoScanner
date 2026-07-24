FROM python:3.11-slim
# pwncat-cs provides both the `pwncat-cs` framework and the `pwncat-nc` netcat clone.
# `timeout` ships with coreutils (present in the base image); ca-certificates for TLS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends coreutils ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir pwncat-cs \
 && adduser --disabled-password --gecos '' --uid 10001 scanner
USER scanner
ENTRYPOINT []
