# SSTImap — server-side template injection scanner. Pinned for reproducibility.
FROM python:3.12-slim
ARG SSTIMAP_REF=1.2.1
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && git clone --depth 1 --branch "${SSTIMAP_REF}" https://github.com/vladko312/SSTImap.git /opt/SSTImap \
 && pip install --no-cache-dir -r /opt/SSTImap/requirements.txt \
 && apt-get purge -y git && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
USER scanner
WORKDIR /home/scanner
ENTRYPOINT []
