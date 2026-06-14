# wafw00f: Web Application Firewall detection tool.
# wafw00f is published on PyPI; pip install is the canonical installation method.
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir wafw00f \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
