FROM golang:1.22-alpine AS build
RUN apk add --no-cache git ca-certificates \
 && go install github.com/projectdiscovery/uncover/cmd/uncover@v1.0.8

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/uncover /usr/local/bin/uncover
USER scanner
ENTRYPOINT []
