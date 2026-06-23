FROM golang:1.22-alpine AS build
RUN go install github.com/lc/subjs@v1.0.1

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /go/bin/subjs /usr/local/bin/subjs
ENTRYPOINT []
