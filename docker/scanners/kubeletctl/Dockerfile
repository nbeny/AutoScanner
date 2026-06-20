# kubeletctl (Go) exposed-kubelet enumeration. Pinned release binary.
FROM alpine:3.20 AS fetch
ARG KUBELETCTL_VERSION=v1.13
RUN apk add --no-cache wget ca-certificates \
 && wget -O /tmp/kubeletctl "https://github.com/cyberark/kubeletctl/releases/download/${KUBELETCTL_VERSION}/kubeletctl_linux_amd64" \
 && chmod +x /tmp/kubeletctl

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=fetch /tmp/kubeletctl /usr/local/bin/kubeletctl
USER scanner
ENTRYPOINT []
