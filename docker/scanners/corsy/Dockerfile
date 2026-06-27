FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && pip install --no-cache-dir requests tld colorama \
 && git clone --branch v1.0 --depth 1 https://github.com/s0md3v/Corsy.git /opt/corsy \
 && printf '#!/bin/sh\nexec python /opt/corsy/corsy.py "$@"\n' > /usr/local/bin/corsy \
 && chmod +x /usr/local/bin/corsy \
 && apt-get purge -y git && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
