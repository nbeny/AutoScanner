FROM golang:1.22-bookworm AS build
RUN go install github.com/BishopFox/jsluice/cmd/jsluice@v0.0.0-20240206
# Mandiant repo lives at github.com/BishopFox/jsluice (community fork tracks Mandiant upstream).

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY --from=build /go/bin/jsluice /usr/local/bin/jsluice
USER scanner
ENTRYPOINT []
