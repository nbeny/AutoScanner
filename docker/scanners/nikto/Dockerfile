# Nikto (perl) web-server scanner. Pinned to a release tag for reproducibility.
FROM perl:5.40-slim
ARG NIKTO_VERSION=2.5.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates libnet-ssleay-perl \
 && git clone --branch "${NIKTO_VERSION}" --depth 1 https://github.com/sullo/nikto.git /opt/nikto \
 && rm -rf /var/lib/apt/lists/* \
 && printf '#!/bin/sh\nexec perl /opt/nikto/program/nikto.pl "$@"\n' > /usr/local/bin/nikto \
 && chmod +x /usr/local/bin/nikto \
 && useradd -u 10001 -m scanner
USER scanner
WORKDIR /home/scanner
ENTRYPOINT []
