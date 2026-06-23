# ParamSpider (python) archive parameter miner. Pinned to a specific commit.
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir "git+https://github.com/devanshbatham/paramspider@4d05080c7d8c5cd51090eef7e9d8c8df88dbb1b6" \
 && useradd -u 10001 -m scanner
USER scanner
WORKDIR /home/scanner
ENTRYPOINT []
