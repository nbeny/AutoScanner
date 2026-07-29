FROM python:3.12-slim
COPY llm-attack-probe.py /usr/local/bin/llm-attack-probe
RUN chmod +x /usr/local/bin/llm-attack-probe \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner /out
USER scanner
ENTRYPOINT []
