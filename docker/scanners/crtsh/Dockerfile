# Minimal image to query crt.sh certificate transparency JSON.
FROM alpine:3.20
RUN apk add --no-cache curl ca-certificates \
 && adduser -D -u 10001 scanner
USER scanner
ENTRYPOINT []
