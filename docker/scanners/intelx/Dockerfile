FROM python:3.12-slim
COPY intelx-probe.py /usr/local/bin/intelx-probe
RUN chmod +x /usr/local/bin/intelx-probe \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner /out
USER scanner
ENTRYPOINT []
