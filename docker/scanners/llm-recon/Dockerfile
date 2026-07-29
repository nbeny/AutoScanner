FROM python:3.12-slim
COPY llm-recon-probe.py /usr/local/bin/llm-recon-probe
RUN chmod +x /usr/local/bin/llm-recon-probe \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner /out
USER scanner
ENTRYPOINT []
