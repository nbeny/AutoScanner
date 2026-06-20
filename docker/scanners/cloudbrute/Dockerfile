# CloudBrute (Go) multi-cloud public-resource brute. Pinned via git clone + go build.
# The upstream config.yaml (provider definitions) is copied from the repo; the
# permutation wordlist is bundled locally.
FROM golang:1.22-alpine AS build
ARG CLOUDBRUTE_VERSION=v1.0.7
RUN apk add --no-cache git \
 && git clone --branch "${CLOUDBRUTE_VERSION}" --depth 1 https://github.com/0xsha/CloudBrute.git /src \
 && cd /src && go build -o /out/cloudbrute .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner \
 && mkdir -p /etc/cloudbrute
COPY --from=build /out/cloudbrute /usr/local/bin/cloudbrute
COPY --from=build /src/data/config.yaml /etc/cloudbrute/config.yaml
COPY wordlist.txt /etc/cloudbrute/wordlist.txt
USER scanner
ENTRYPOINT []
