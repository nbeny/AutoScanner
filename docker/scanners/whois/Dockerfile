# Minimal image carrying the whois client.
FROM alpine:3.20
RUN apk add --no-cache whois ca-certificates \
 && adduser -D -u 10001 scanner
USER scanner
ENTRYPOINT []
