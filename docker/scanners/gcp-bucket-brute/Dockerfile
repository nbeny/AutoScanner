FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && git clone --depth 1 https://github.com/RhinoSecurityLabs/GCPBucketBrute.git /opt/gcpbucketbrute \
 && pip install --no-cache-dir google-cloud-storage requests colorama \
 && apt-get purge -y git && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner:scanner /out
COPY wordlists/small.txt /opt/wordlists/small.txt
COPY wordlists/medium.txt /opt/wordlists/medium.txt
COPY wordlists/large.txt /opt/wordlists/large.txt
USER scanner
ENTRYPOINT []
