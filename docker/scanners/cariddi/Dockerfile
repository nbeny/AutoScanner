FROM golang:1.22-bookworm AS build
RUN go install github.com/edoardottt/cariddi/cmd/cariddi@v1.3.2

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY --from=build /go/bin/cariddi /usr/local/bin/cariddi
USER scanner
ENTRYPOINT []
