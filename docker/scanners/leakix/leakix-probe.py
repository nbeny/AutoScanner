#!/usr/bin/env python3
"""Query LeakIX for leaks / exposed services affecting a domain or host and
normalise the matches into a breach-exposure report.

Usage: leakix-probe <query>
Reads the API key from the LEAKIX_API_KEY env var (injected by scan-worker).
Emits {"query": q, "exposures": [...]} on stdout; NEVER raises -- on a
missing key, missing query, or any request/parsing error it emits an empty
exposures list so the pipeline keeps flowing.
"""
import json
import os
import sys
import urllib.request

API_BASE = "https://leakix.net"
PASSWORD_KEYS = ("password", "passwd", "hash", "credential", "secret")


def fetch(query, api_key):
    url = f"{API_BASE}/domain/{query}"
    req = urllib.request.Request(
        url,
        headers={
            "api-key": api_key,
            "Accept": "application/json",
            "User-Agent": "autoscanner-leakix",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def data_classes_for(event):
    """Best-effort extraction of leaked data classes from a LeakIX event."""
    classes = []
    leak = event.get("leak")
    if isinstance(leak, dict):
        dataset = leak.get("dataset")
        if isinstance(dataset, dict):
            for key in ("collections", "fields", "type"):
                val = dataset.get(key)
                if isinstance(val, list):
                    classes.extend(str(v) for v in val)
                elif isinstance(val, str):
                    classes.append(val)
        leak_type = leak.get("type")
        if isinstance(leak_type, str):
            classes.append(leak_type)
    protocol = event.get("protocol")
    if isinstance(protocol, str):
        classes.append(protocol)

    seen = set()
    deduped = []
    for c in classes:
        c = c.strip()
        if c and c.lower() not in seen:
            seen.add(c.lower())
            deduped.append(c)
    return deduped


def password_exposed(event, classes):
    try:
        blob = json.dumps(event).lower()
    except Exception:
        blob = ""
    if any(k in blob for k in PASSWORD_KEYS):
        return True
    return any(any(k in c.lower() for k in PASSWORD_KEYS) for c in classes)


def to_exposure(event):
    if not isinstance(event, dict):
        return None
    plugin = event.get("plugin") or event.get("event_type") or event.get("event_source")
    breach_name = str(plugin).strip() if plugin else "leakix-exposure"
    if not breach_name:
        return None
    classes = data_classes_for(event)
    exposure = {
        "breachName": breach_name,
        "dataClasses": classes,
        "passwordExposed": password_exposed(event, classes),
    }
    date = event.get("time") or event.get("last_seen") or event.get("firstSeen") or event.get("date")
    if isinstance(date, str) and date.strip():
        exposure["breachDate"] = date
    return exposure


def main():
    query = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    report = {"query": query, "exposures": []}
    api_key = os.environ.get("LEAKIX_API_KEY", "").strip()

    if not query or not api_key:
        print(json.dumps(report))
        return

    try:
        data = fetch(query, api_key)
        if isinstance(data, list):
            events = data
        elif isinstance(data, dict):
            events = data.get("events", []) or []
        else:
            events = []
        for event in events:
            exposure = to_exposure(event)
            if exposure:
                report["exposures"].append(exposure)
    except Exception:
        # Never raise: missing key, network error, bad JSON, unexpected
        # shape all degrade to an empty exposures list.
        pass

    print(json.dumps(report))


if __name__ == "__main__":
    main()
