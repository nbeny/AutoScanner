# Minimal image carrying the shodan CLI.
FROM python:3.12-slim
RUN pip install --no-cache-dir shodan==1.31.0 \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
