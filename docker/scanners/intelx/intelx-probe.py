#!/usr/bin/env python3
"""Query Intelligence X for leaked documents / pastes / breach records
affecting an email or domain and normalise the matches into a
breach-exposure report.

Usage: intelx-probe <query>
Reads the API key from the INTELX_API_KEY env var (injected by scan-worker).
Emits {"query": q, "exposures": [...]} on stdout; NEVER raises -- on a
missing key, missing query, exhausted credits, or any request/parsing error
it emits an empty exposures list so the pipeline keeps flowing.
"""
import json
import os
import sys
import urllib.request

API_BASE = "https://2.intelx.io"
PASSWORD_KEYS = ("password", "passwd", "hash", "credential", "secret")


def _request(url, api_key, method="GET", payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "x-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "autoscanner-intelx",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def search(query, api_key):
    """Kick off an Intelligence X search and return its search id."""
    body = {"term": query, "maxresults": 100, "media": 0}
    result = _request(f"{API_BASE}/intelligent/search", api_key, method="POST", payload=body)
    if not isinstance(result, dict):
        return None
    search_id = result.get("id")
    return search_id if isinstance(search_id, str) and search_id else None


def fetch_results(search_id, api_key):
    """Fetch the records for a previously started search id."""
    url = f"{API_BASE}/intelligent/search/result?id={search_id}"
    result = _request(url, api_key, method="GET")
    if not isinstance(result, dict):
        return []
    records = result.get("records")
    return records if isinstance(records, list) else []


def data_classes_for(record):
    """Best-effort extraction of leaked data classes from an Intelligence X record."""
    classes = []
    for key in ("tags", "keywords", "types", "type"):
        val = record.get(key)
        if isinstance(val, list):
            classes.extend(str(v) for v in val)
        elif isinstance(val, str):
            classes.append(val)
    media_type = record.get("media")
    if isinstance(media_type, (str, int)):
        classes.append(str(media_type))

    seen = set()
    deduped = []
    for c in classes:
        c = c.strip()
        if c and c.lower() not in seen:
            seen.add(c.lower())
            deduped.append(c)
    return deduped


def password_exposed(record, classes):
    try:
        blob = json.dumps(record).lower()
    except Exception:
        blob = ""
    if any(k in blob for k in PASSWORD_KEYS):
        return True
    return any(any(k in c.lower() for k in PASSWORD_KEYS) for c in classes)


def to_exposure(record):
    if not isinstance(record, dict):
        return None
    name = record.get("bucket") or record.get("name") or record.get("systemid")
    breach_name = str(name).strip() if name else "intelx-record"
    if not breach_name:
        return None
    classes = data_classes_for(record)
    exposure = {
        "breachName": breach_name,
        "dataClasses": classes,
        "passwordExposed": password_exposed(record, classes),
    }
    date = record.get("date") or record.get("added")
    if isinstance(date, str) and date.strip():
        exposure["breachDate"] = date
    return exposure


def main():
    query = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    report = {"query": query, "exposures": []}
    api_key = os.environ.get("INTELX_API_KEY", "").strip()

    if not query or not api_key:
        print(json.dumps(report))
        return

    try:
        search_id = search(query, api_key)
        if search_id:
            for record in fetch_results(search_id, api_key):
                exposure = to_exposure(record)
                if exposure:
                    report["exposures"].append(exposure)
    except Exception:
        # Never raise: missing/invalid key, exhausted credits, network error,
        # bad JSON, unexpected shape all degrade to an empty exposures list.
        pass

    print(json.dumps(report))


if __name__ == "__main__":
    main()
