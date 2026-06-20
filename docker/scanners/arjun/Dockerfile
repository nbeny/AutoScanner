# Arjun (python) HTTP parameter discovery. Pinned for reproducibility.
FROM python:3.12-slim
ARG ARJUN_VERSION=2.2.7
RUN pip install --no-cache-dir "arjun==${ARJUN_VERSION}" \
 && useradd -u 10001 -m scanner
USER scanner
WORKDIR /home/scanner
ENTRYPOINT []
