# Builds an image carrying massdns + puredns and bundled defaults.
FROM golang:1.22-bookworm AS gobuild
RUN go install github.com/d3mondev/puredns/v2@v2.1.1

FROM debian:bookworm-slim AS massdns
RUN apt-get update \
 && apt-get install -y --no-install-recommends git gcc make libc6-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --branch v1.1.0 --depth 1 https://github.com/blechschmidt/massdns.git /src/massdns \
 && make -C /src/massdns

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY --from=gobuild /go/bin/puredns /usr/local/bin/puredns
COPY --from=massdns /src/massdns/bin/massdns /usr/local/bin/massdns
COPY resolvers.txt /etc/puredns/resolvers.txt
COPY wordlist.txt /etc/puredns/wordlist.txt
USER scanner
ENTRYPOINT []
