# Censys CLI for OSINT host/domain search.
FROM python:3.12-slim
RUN pip install --no-cache-dir censys \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
