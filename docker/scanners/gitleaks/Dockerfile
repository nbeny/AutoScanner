FROM alpine:3.20
RUN apk add --no-cache ca-certificates git \
 && adduser -D -u 10001 scanner \
 && wget -q -O /tmp/gitleaks.tar.gz \
        https://github.com/gitleaks/gitleaks/releases/download/v8.18.4/gitleaks_8.18.4_linux_x64.tar.gz \
 && tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks \
 && rm /tmp/gitleaks.tar.gz \
 && chmod +x /usr/local/bin/gitleaks
USER scanner
WORKDIR /tmp
ENTRYPOINT []
