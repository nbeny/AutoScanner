# WPScan (ruby gem) WordPress scanner. Pinned for reproducibility.
FROM ruby:3.2-slim
ARG WPSCAN_VERSION=3.8.28
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential git ca-certificates \
 && gem install wpscan -v "${WPSCAN_VERSION}" --no-document \
 && apt-get purge -y build-essential \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
USER scanner
WORKDIR /home/scanner
ENTRYPOINT []
