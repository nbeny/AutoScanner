# internetdb: thin wrapper that queries Shodan's free InternetDB API (no key).
# Just needs curl + CA roots; the scanner build script does the HTTP calls.
FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl \
 && adduser -D -u 10001 scanner
USER scanner
ENTRYPOINT []
