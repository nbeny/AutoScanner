#!/usr/bin/env python3
import json
import sys
import urllib.request
import urllib.error

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no target"}))
        sys.exit(1)

    ip = sys.argv[1]
    url = f"https://api.greynoise.io/v3/community/{ip}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "autoscanner/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # IP not in GreyNoise database — emit clean result
            print(json.dumps({"ip": ip, "noise": False, "riot": False, "message": "not found"}))
        else:
            print(json.dumps({"error": f"HTTP {e.code}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
