# Builds a minimal image carrying the github-subdomains binary.
FROM golang:1.22-alpine AS build
# github-subdomains has no stable release tags; @latest is the only option.
RUN apk add --no-cache git \
 && go install github.com/gwen001/github-subdomains@latest

FROM alpine:3.20
# ca-certificates: github-subdomains queries the GitHub API over HTTPS.
# GITHUB_TOKEN must be provided at runtime via --env; do NOT bake it in.
RUN apk add --no-cache ca-certificates \
 && adduser -D -u 10001 scanner
COPY --from=build /go/bin/github-subdomains /usr/local/bin/github-subdomains
USER scanner
ENTRYPOINT []
