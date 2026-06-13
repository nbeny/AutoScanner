# Builds a minimal image carrying the assetfinder binary.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/tomnomnom/assetfinder@latest

FROM alpine:3.20
RUN adduser -D -u 10001 scanner
COPY --from=build /go/bin/assetfinder /usr/local/bin/assetfinder
USER scanner
ENTRYPOINT []
