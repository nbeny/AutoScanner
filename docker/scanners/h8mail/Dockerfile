FROM python:3.12-slim
RUN pip install --no-cache-dir h8mail \
 && useradd -u 10001 -m scanner \
 && mkdir -p /out && chown scanner /out
USER scanner
ENTRYPOINT []
