FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && pip install --no-cache-dir git-dumper \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner /out
COPY gitdump-scan.py /usr/local/bin/gitdump-scan
RUN chmod +x /usr/local/bin/gitdump-scan
USER scanner
ENTRYPOINT []
