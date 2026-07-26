# socialscan: email/username registration availability across platforms (key-free).
FROM python:3.12-slim
RUN pip install --no-cache-dir socialscan==1.4.2 \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
