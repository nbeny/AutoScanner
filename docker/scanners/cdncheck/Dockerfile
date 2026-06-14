# cdncheck: identifies hosts behind CDNs, WAFs, or cloud providers (ProjectDiscovery).
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/projectdiscovery/cdncheck/cmd/cdncheck@latest

FROM alpine:3.20
# ca-certificates: cdncheck resolves HTTPS fingerprint APIs and CIDR data.
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/cdncheck /usr/local/bin/cdncheck
USER scanner
ENTRYPOINT []
