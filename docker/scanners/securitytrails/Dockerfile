# Minimal image for SecurityTrails API queries (curl-based; no extra tool needed).
FROM alpine:3.20
# SECURITYTRAILS_API_KEY must be provided at runtime; do NOT bake it in.
RUN apk add --no-cache curl ca-certificates \
 && adduser -D -u 10001 scanner
USER scanner
ENTRYPOINT []
