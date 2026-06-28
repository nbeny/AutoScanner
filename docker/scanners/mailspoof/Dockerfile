FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && git clone --depth 1 https://github.com/chenjj/mailspoof.git /opt/mailspoof \
 && pip install --no-cache-dir dnspython colorama \
 && apt-get purge -y git && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
