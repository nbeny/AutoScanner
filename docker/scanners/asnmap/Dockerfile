# Builds a minimal image carrying the asnmap binary.
FROM golang:1.22-alpine AS build
# asnmap has no stable release tags older than v1; @latest tracks the current release.
RUN apk add --no-cache git \
 && go install github.com/projectdiscovery/asnmap/cmd/asnmap@latest

FROM alpine:3.20
# ca-certificates: asnmap queries HTTPS APIs (ip-api, ipinfo, ...) and
# the ProjectDiscovery CHAOS dataset over TLS.
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/asnmap /usr/local/bin/asnmap
USER scanner
ENTRYPOINT []
