# sherlock: username OSINT across 400+ sites (key-free).
FROM python:3.12-slim
RUN pip install --no-cache-dir sherlock-project==0.15.0 \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
