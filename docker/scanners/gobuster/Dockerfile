# gobuster directory brute-forcer.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/OJ/gobuster/v3@latest

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/gobuster /usr/local/bin/gobuster
COPY wordlist.txt /etc/gobuster/content.txt
USER scanner
ENTRYPOINT []
