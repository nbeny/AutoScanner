# testssl: reuse the official image (bundles openssl + bash), but reset the
# ENTRYPOINT so the scanner's `sh -lc` build script runs. Results are written to
# the writable /tmp at runtime.
FROM drwetter/testssl.sh:3.2
USER root
RUN adduser -D -u 10001 scanner 2>/dev/null || true
USER scanner
ENTRYPOINT []
