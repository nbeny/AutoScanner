#!/usr/bin/env python3
import json
import os
import sys
import urllib.request
import urllib.error

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no target"}))
        sys.exit(1)

    ip = sys.argv[1]
    api_key = os.environ.get("ABUSEIPDB_API_KEY", "")
    if not api_key:
        print(json.dumps({"error": "ABUSEIPDB_API_KEY not set"}))
        sys.exit(0)

    url = f"https://api.abuseipdb.com/api/v2/check?ipAddress={ip}&maxAgeInDays=90&verbose"
    req = urllib.request.Request(url, headers={"Key": api_key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(json.dumps({"error": f"HTTP {e.code}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
