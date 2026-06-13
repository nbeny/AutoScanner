# Builds a minimal image carrying the assetfinder binary.
FROM golang:1.22-alpine AS build
# assetfinder publishes no semver/module tags (master-only), so @latest is the
# only option. The built image is pinned downstream as autoscanner/assetfinder:1.0;
# rebuild that tag deliberately to pick up upstream changes.
RUN apk add --no-cache git \
 && go install github.com/tomnomnom/assetfinder@latest

FROM alpine:3.20
# ca-certificates is required: assetfinder queries HTTPS sources (crt.sh,
# certspotter, web.archive.org, ...). Without it Go's TLS stack rejects every
# cert and the tool returns zero results silently.
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/assetfinder /usr/local/bin/assetfinder
USER scanner
ENTRYPOINT []
