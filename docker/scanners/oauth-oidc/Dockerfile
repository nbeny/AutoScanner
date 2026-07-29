FROM python:3.12-slim
COPY oidc-probe.py /usr/local/bin/oidc-probe
RUN chmod +x /usr/local/bin/oidc-probe \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner /out
USER scanner
ENTRYPOINT []
