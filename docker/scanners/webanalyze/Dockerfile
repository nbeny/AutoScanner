FROM golang:1.22-alpine AS build
RUN go install github.com/rverton/webanalyze/cmd/webanalyze@v0.4.1

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /go/bin/webanalyze /usr/local/bin/webanalyze
# Bake the fingerprint DB into the image so runtime needs no -update / network for apps.
RUN cd / && webanalyze -update && test -f /technologies.json
ENTRYPOINT []
