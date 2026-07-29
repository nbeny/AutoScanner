FROM python:3.12-slim
COPY leakix-probe.py /usr/local/bin/leakix-probe
RUN chmod +x /usr/local/bin/leakix-probe \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner /out
USER scanner
ENTRYPOINT []
