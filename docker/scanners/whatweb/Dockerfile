# WhatWeb (ruby) web fingerprinter.
FROM ruby:3.2-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 https://github.com/urbanadventurer/WhatWeb.git /opt/whatweb \
 && useradd -u 10001 -m scanner
ENV PATH="/opt/whatweb:${PATH}"
USER scanner
WORKDIR /opt/whatweb
ENTRYPOINT []
