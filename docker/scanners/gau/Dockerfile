# Builds a minimal image carrying the gau binary.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/lc/gau/v2/cmd/gau@latest

FROM alpine:3.20
# ca-certificates: gau queries HTTPS archive sources (web.archive.org, otx, ...).
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/gau /usr/local/bin/gau
USER scanner
ENTRYPOINT []
