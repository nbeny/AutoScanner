# smb-enum: anonymous SMB/Windows enumeration via enum4linux-ng.
# enum4linux-ng shells out to smbclient and rpcclient (from samba-common-bin).
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      smbclient \
      samba-common-bin \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir enum4linux-ng \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
