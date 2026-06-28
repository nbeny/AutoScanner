FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && pip install --no-cache-dir emailrep \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner:scanner /out
USER scanner
ENTRYPOINT []
