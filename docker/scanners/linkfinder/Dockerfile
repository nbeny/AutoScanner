FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && git clone --depth 1 https://github.com/GerbenJavado/LinkFinder.git /opt/linkfinder \
 && pip install --no-cache-dir -r /opt/linkfinder/requirements.txt \
 && apt-get purge -y git \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
