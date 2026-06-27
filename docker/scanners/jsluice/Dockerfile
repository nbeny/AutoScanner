FROM golang:1.22-bookworm AS build
# TODO(phase-14a): pin to a real BishopFox/jsluice tag once they tag a v1.x release.
RUN go install github.com/BishopFox/jsluice/cmd/jsluice@latest
# jsluice was originally authored by Hakluke at BishopFox; the upstream is github.com/BishopFox/jsluice.

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY --from=build /go/bin/jsluice /usr/local/bin/jsluice
USER scanner
ENTRYPOINT []
