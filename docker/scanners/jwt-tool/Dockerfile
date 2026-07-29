FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && pip install --no-cache-dir termcolor cprint pycryptodomex requests ratelimit \
 && git clone --depth 1 https://github.com/ticarpi/jwt_tool.git /opt/jwt_tool \
 && printf '#!/bin/sh\nexec python /opt/jwt_tool/jwt_tool.py "$@"\n' > /usr/local/bin/jwt_tool \
 && chmod +x /usr/local/bin/jwt_tool \
 && mkdir -p /opt/wordlists \
 && printf 'secret\npassword\n123456\nchangeme\njwt\nkey\n' > /opt/wordlists/jwt-secrets.txt \
 && apt-get purge -y git && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner /out
# jwt_tool's very first-ever invocation only bootstraps ~/.jwt_tool/jwtconf.ini and exits
# without running the requested scan/exploit mode. Since every scan job gets a fresh
# container, that first invocation would otherwise be wasted on every single run. Trigger
# the bootstrap now, as the `scanner` user, so the config pre-exists at container start.
USER scanner
RUN jwt_tool eyJhbGciOiJIUzI1NiJ9.e30.YQ > /dev/null 2>&1 || true
ENTRYPOINT []
