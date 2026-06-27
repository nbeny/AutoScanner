FROM golang:1.22-alpine AS build
RUN apk add --no-cache git ca-certificates \
 && go install github.com/projectdiscovery/chaos-client/cmd/chaos@v0.5.1

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/chaos /usr/local/bin/chaos
USER scanner
ENTRYPOINT []
