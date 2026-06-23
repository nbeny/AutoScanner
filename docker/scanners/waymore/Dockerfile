# Waymore (python) archive URL harvester. Pinned for reproducibility.
FROM python:3.12-slim
ARG WAYMORE_VERSION=4.3
RUN pip install --no-cache-dir "waymore==${WAYMORE_VERSION}" \
 && useradd -u 10001 -m scanner
USER scanner
WORKDIR /home/scanner
ENTRYPOINT []
