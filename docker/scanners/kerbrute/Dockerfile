# kerbrute (Go) Kerberos user enum + AS-REP roasting. Pinned release binary.
FROM alpine:3.20 AS fetch
ARG KERBRUTE_VERSION=v1.0.3
RUN apk add --no-cache wget ca-certificates \
 && wget -O /tmp/kerbrute "https://github.com/ropnop/kerbrute/releases/download/${KERBRUTE_VERSION}/kerbrute_linux_amd64" \
 && chmod +x /tmp/kerbrute

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=fetch /tmp/kerbrute /usr/local/bin/kerbrute
COPY userlist.txt /etc/kerbrute/userlist.txt
USER scanner
ENTRYPOINT []
