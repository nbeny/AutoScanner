FROM python:3.12-slim
RUN pip install --no-cache-dir ssh-audit \
 && adduser --disabled-password --gecos '' --uid 10001 scanner
USER scanner
ENTRYPOINT []
