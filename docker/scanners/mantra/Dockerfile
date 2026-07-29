FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/brosck/mantra@latest

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner \
 && mkdir -p /out && chown scanner /out
COPY --from=build /go/bin/mantra /usr/local/bin/mantra
USER scanner
ENTRYPOINT []
