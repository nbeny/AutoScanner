FROM python:3.12-slim
RUN adduser --disabled-password --gecos '' --uid 10001 scanner
COPY check.py /usr/local/bin/check.py
RUN chmod +x /usr/local/bin/check.py
USER scanner
ENTRYPOINT []
