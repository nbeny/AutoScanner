FROM python:3.12-slim
COPY saml-probe.py /usr/local/bin/saml-probe
RUN chmod +x /usr/local/bin/saml-probe \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner /out
USER scanner
ENTRYPOINT []
