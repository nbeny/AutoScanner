# cloud_enum: multi-cloud asset enumeration (AWS/Azure/GCP buckets, etc.).
FROM python:3.12-slim
# Cloned from GitHub (no PyPI release). NOTE: this tracks HEAD of the default
# branch — builds are not reproducible. TODO(phase-8.1 follow-up): pin to a
# specific commit SHA (git clone --depth 1 then `git checkout <sha>`) for
# reproducible images.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 https://github.com/initstring/cloud_enum.git /opt/cloud_enum \
 && pip install --no-cache-dir -r /opt/cloud_enum/requirements.txt \
 && printf '#!/bin/sh\nexec python /opt/cloud_enum/cloud_enum.py "$@"\n' > /usr/local/bin/cloud_enum \
 && chmod +x /usr/local/bin/cloud_enum \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
