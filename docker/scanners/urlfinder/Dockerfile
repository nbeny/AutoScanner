FROM golang:1.22-alpine AS build
RUN apk add --no-cache git ca-certificates \
 && go install github.com/projectdiscovery/urlfinder/cmd/urlfinder@v0.0.6

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/urlfinder /usr/local/bin/urlfinder
USER scanner
ENTRYPOINT []
