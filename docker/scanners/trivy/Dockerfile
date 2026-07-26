# trivy: reuse the official (alpine-based) image, but reset the ENTRYPOINT so the
# scanner's `sh -lc` build script runs. Trivy's cache is redirected to /tmp at
# runtime (TRIVY_CACHE_DIR) to respect the read-only rootfs.
FROM aquasec/trivy:0.55.0
USER root
RUN adduser -D -u 10001 scanner 2>/dev/null || true
USER scanner
ENTRYPOINT []
