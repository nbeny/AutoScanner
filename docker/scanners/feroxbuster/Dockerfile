FROM rust:1.78-bookworm AS build
RUN cargo install feroxbuster --version 2.11.0 --locked

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY --from=build /usr/local/cargo/bin/feroxbuster /usr/local/bin/feroxbuster
COPY wordlist.txt /etc/feroxbuster/wordlist.txt
USER scanner
ENTRYPOINT []
