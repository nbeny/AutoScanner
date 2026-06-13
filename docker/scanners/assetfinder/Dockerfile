# Builds a minimal image carrying the assetfinder binary.
FROM golang:1.22-alpine AS build
# assetfinder has no upstream release tags; @latest is the only option (pin the built image tag instead).
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
