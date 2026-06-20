# s3scanner (Go) cloud bucket permission scanner. Pinned via go install.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/sa7mon/s3scanner@v3.0.4

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/s3scanner /usr/local/bin/s3scanner
USER scanner
ENTRYPOINT []
