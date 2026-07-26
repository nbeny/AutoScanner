# smuggler: HTTP request smuggling detector (Python stdlib only). Cloned from
# source; invoked by absolute path so CWD can be the writable /tmp at runtime.
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && git clone --depth 1 https://github.com/defparam/smuggler.git /opt/smuggler \
 && printf '#!/bin/sh\nexec python /opt/smuggler/smuggler.py "$@"\n' > /usr/local/bin/smuggler \
 && chmod +x /usr/local/bin/smuggler \
 && apt-get purge -y git && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
