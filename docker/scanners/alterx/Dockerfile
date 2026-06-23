# Builds an image carrying BOTH alterx and dnsx so the scanner can run
# `alterx -enrich | dnsx -silent` in one container.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/projectdiscovery/alterx/cmd/alterx@v0.0.5 \
 && go install github.com/projectdiscovery/dnsx/cmd/dnsx@v1.2.3

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/alterx /usr/local/bin/alterx
COPY --from=build /go/bin/dnsx /usr/local/bin/dnsx
USER scanner
ENTRYPOINT []
