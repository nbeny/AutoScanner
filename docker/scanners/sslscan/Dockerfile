# sslscan TLS/SSL cipher + protocol scanner.
FROM alpine:3.20
RUN apk add --no-cache sslscan ca-certificates \
 && adduser -D -u 10001 scanner
USER scanner
ENTRYPOINT []
