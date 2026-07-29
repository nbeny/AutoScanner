#!/usr/bin/env python3
"""Fingerprint exposed LLM inference endpoints. Usage: llm-recon-probe <base-url>.
Emits JSON on stdout; never raises."""
import json
import sys
import urllib.request

# (path, method, needle-in-body, id, title, severity)
CHECKS = [
    ("/api/tags", "GET", "models", "ollama-open", "Exposed Ollama API", "HIGH"),
    ("/api/version", "GET", "version", "ollama-version", "Ollama version endpoint reachable", "MEDIUM"),
    ("/v1/models", "GET", "\"data\"", "openai-compat-open", "Exposed OpenAI-compatible /v1/models", "HIGH"),
    ("/v2/health/ready", "GET", "", "triton-open", "Exposed Triton inference server", "MEDIUM"),
    ("/docs", "GET", "LangServe", "langserve-open", "Exposed LangServe app", "MEDIUM"),
]


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "autoscanner-llmrecon"})
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status, r.read(65536).decode("utf-8", "replace")
    except Exception:
        return None, None


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "").rstrip("/")
    report = {"baseUrl": base, "findings": []}
    if not base:
        print(json.dumps(report))
        return
    for path, _method, needle, fid, title, sev in CHECKS:
        status, body = fetch(base + path)
        if status is None or status >= 400 or body is None:
            continue
        if needle and needle.lower() not in body.lower():
            continue
        report["findings"].append({
            "id": fid, "severity": sev, "title": title,
            "detail": f"GET {path} returned HTTP {status} without authentication."})
    print(json.dumps(report))


if __name__ == "__main__":
    main()
