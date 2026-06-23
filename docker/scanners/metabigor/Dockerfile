# Builds a minimal image carrying the metabigor binary.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/j3ssie/metabigor@v1.13.6

FROM alpine:3.20
# ca-certificates: metabigor queries public BGP/registry APIs over HTTPS.
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/metabigor /usr/local/bin/metabigor
USER scanner
ENTRYPOINT []
