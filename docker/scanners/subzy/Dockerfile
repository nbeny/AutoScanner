# Builds a minimal image carrying the subzy binary.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/PentestPad/subzy@v1.1.0

FROM alpine:3.20
# ca-certificates: subzy makes HTTPS requests to target hosts.
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/subzy /usr/local/bin/subzy
USER scanner
ENTRYPOINT []
