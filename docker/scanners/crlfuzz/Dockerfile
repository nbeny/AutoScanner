# crlfuzz: CRLF injection scanner. Built from source, copied into a small runtime
# that also carries `sh` for the scanner's build script.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/dwisiswant0/crlfuzz/cmd/crlfuzz@v1.4.1

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/crlfuzz /usr/local/bin/crlfuzz
USER scanner
ENTRYPOINT []
