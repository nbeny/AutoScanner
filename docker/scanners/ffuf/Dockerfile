# Builds an image carrying the ffuf binary + a small bundled content wordlist.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/ffuf/ffuf/v2@latest

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/ffuf /usr/local/bin/ffuf
COPY wordlist.txt /etc/ffuf/content.txt
USER scanner
ENTRYPOINT []
