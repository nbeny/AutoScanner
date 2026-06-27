FROM python:3.12-slim
RUN pip install --no-cache-dir fofa-py==1.1.1 \
 && useradd -m -u 10001 scanner \
 && cat > /usr/local/bin/fofa-client.py <<'PY'
import json, os, sys
from fofa import Client

email = os.environ.get('FOFA_EMAIL', '')
key   = os.environ.get('FOFA_KEY', '')
query = os.environ.get('FOFA_QUERY', '')
size  = int(os.environ.get('FOFA_SIZE', '100'))
if not (email and key and query):
    print('[]')
    sys.exit(0)
cli = Client(email, key)
fields = 'host,ip,port,title,server,protocol,banner'
try:
    data = cli.search(query, size=size, fields=fields)
    rows = []
    for r in data.get('results', []):
        rows.append(dict(zip(fields.split(','), r)))
    json.dump(rows, sys.stdout)
except Exception as e:
    print('[]')
    print(f'fofa-error: {e}', file=sys.stderr)
PY
RUN chmod +x /usr/local/bin/fofa-client.py
USER scanner
ENTRYPOINT []
