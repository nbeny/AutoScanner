# phoneinfoga: static Go binary from the upstream release, dropped into a small
# base that also carries `sh` so the scanner's build script can loop over numbers.
FROM alpine:3.20
ARG VERSION=v2.11.0
RUN apk add --no-cache ca-certificates wget \
 && wget -qO /tmp/pi.tar.gz \
      "https://github.com/sundowndev/phoneinfoga/releases/download/${VERSION}/phoneinfoga_Linux_x86_64.tar.gz" \
 && tar -xzf /tmp/pi.tar.gz -C /usr/local/bin phoneinfoga \
 && chmod +x /usr/local/bin/phoneinfoga \
 && rm -f /tmp/pi.tar.gz \
 && adduser -D -u 10001 scanner
USER scanner
ENTRYPOINT []
