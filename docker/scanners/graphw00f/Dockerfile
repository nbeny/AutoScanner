FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && git clone --depth 1 https://github.com/dolevf/graphw00f.git /opt/graphw00f \
 && pip install --no-cache-dir -r /opt/graphw00f/requirements.txt \
 && apt-get purge -y git && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner:scanner /out
USER scanner
ENTRYPOINT []
