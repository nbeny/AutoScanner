# Builds a minimal image carrying the cero binary.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/glebarez/cero@v1.3.0

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/cero /usr/local/bin/cero
USER scanner
ENTRYPOINT []
