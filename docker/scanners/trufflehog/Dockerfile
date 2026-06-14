# Builds a minimal image carrying the trufflehog binary.
# The official trufflesecurity/trufflehog image is distroless (no sh), so we
# copy the binary into an alpine runtime that has sh + git.
# Assumption: the binary lives at /usr/bin/trufflehog inside the official image;
# this matches the install path used in trufflehog's own Dockerfile and release
# scripts as of v3.x. Verify with `docker run --rm --entrypoint /bin/ls
# trufflesecurity/trufflehog:latest /usr/bin/trufflehog` if the image changes.
FROM trufflesecurity/trufflehog:latest AS upstream

FROM alpine:3.20
# git is required: trufflehog's --github mode clones repositories locally.
# ca-certificates: all GitHub / API calls are HTTPS.
# GITHUB_TOKEN (and other secrets) must be provided at runtime; do NOT bake them in.
RUN apk add --no-cache ca-certificates git \
 && adduser -D -u 10001 scanner
COPY --from=upstream /usr/bin/trufflehog /usr/local/bin/trufflehog
USER scanner
ENTRYPOINT []
