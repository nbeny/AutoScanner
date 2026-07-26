# oralyzer: open-redirect fuzzer. Cloned from source; the wrapper cds into the
# repo so its bundled payload list resolves.
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && pip install --no-cache-dir requests colorama tld \
 && git clone --depth 1 https://github.com/r0075h3ll/Oralyzer.git /opt/oralyzer \
 && printf '#!/bin/sh\ncd /opt/oralyzer && exec python oralyzer.py "$@"\n' > /usr/local/bin/oralyzer \
 && chmod +x /usr/local/bin/oralyzer \
 && apt-get purge -y git && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
