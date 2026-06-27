FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends onesixtyone ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos '' --uid 10001 scanner
COPY communities.txt /opt/onesixtyone/communities.txt
USER scanner
ENTRYPOINT []
