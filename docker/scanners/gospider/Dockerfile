FROM golang:1.22-bookworm AS build
RUN go install github.com/jaeles-project/gospider@v1.1.6

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY --from=build /go/bin/gospider /usr/local/bin/gospider
USER scanner
ENTRYPOINT []
