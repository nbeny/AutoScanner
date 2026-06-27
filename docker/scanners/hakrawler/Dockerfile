FROM golang:1.22-bookworm AS build
RUN go install github.com/hakluke/hakrawler@v1.0.3

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY --from=build /go/bin/hakrawler /usr/local/bin/hakrawler
USER scanner
ENTRYPOINT []
