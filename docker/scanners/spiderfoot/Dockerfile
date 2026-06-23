# SpiderFoot OSINT, used in one-shot CLI mode (no web server).
FROM python:3.9-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
USER scanner
WORKDIR /home/scanner
RUN git clone --branch v4.0 --depth 1 https://github.com/smicallef/spiderfoot.git /home/scanner/spiderfoot \
 && pip install --no-cache-dir --user -r /home/scanner/spiderfoot/requirements.txt
ENV PATH="/home/scanner/.local/bin:${PATH}"
ENV HOME=/home/scanner
WORKDIR /home/scanner/spiderfoot
ENTRYPOINT []
