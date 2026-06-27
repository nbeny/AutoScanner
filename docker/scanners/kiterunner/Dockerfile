FROM golang:1.22-bookworm AS build
RUN go install github.com/assetnote/kiterunner/cmd/kr@v1.0.2

FROM debian:bookworm-slim AS wordlist
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && mkdir -p /opt/wordlists \
 && curl -sL https://wordlists-cdn.assetnote.io/data/kiterunner/routes-large.kite \
        -o /opt/wordlists/routes-large.kite \
 && test -s /opt/wordlists/routes-large.kite

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY --from=build /go/bin/kr /usr/local/bin/kr
COPY --from=wordlist /opt/wordlists/routes-large.kite /opt/wordlists/routes-large.kite
USER scanner
ENTRYPOINT []
