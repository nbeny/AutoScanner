# theHarvester OSINT email/host gathering.
FROM python:3.12-slim
# Maintained theHarvester ships only on GitHub; the PyPI 'theHarvester' is a stale 2019 squat.
RUN pip install --no-cache-dir 'git+https://github.com/laramies/theHarvester.git@4.11.1' \
 && useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
