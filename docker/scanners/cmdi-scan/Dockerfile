# cmdi-scan: OS command-injection detection using commix (Python).
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 https://github.com/commixproject/commix.git /opt/commix \
 && ln -s /opt/commix/commix.py /usr/local/bin/commix \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
