FROM rustscan/rustscan:2.3.0
USER root
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 scanner
USER scanner
ENTRYPOINT []
