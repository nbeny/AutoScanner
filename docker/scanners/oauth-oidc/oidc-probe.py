#!/usr/bin/env python3
"""Fetch an OIDC/OAuth issuer's well-known metadata and flag misconfigurations.
Usage: oidc-probe <issuer-base-url>. Emits a JSON report on stdout; never raises."""
import json
import sys
import urllib.request

WELL_KNOWN = [
    "/.well-known/openid-configuration",
    "/.well-known/oauth-authorization-server",
]


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "autoscanner-oidc"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "").rstrip("/")
    report = {"issuer": base, "metadataUrl": None, "findings": []}
    meta = None
    for path in WELL_KNOWN:
        url = base + path
        meta = fetch(url)
        if meta:
            report["metadataUrl"] = url
            break
    if not meta:
        print(json.dumps(report))
        return

    rt = [str(x).lower() for x in meta.get("response_types_supported", [])]
    if any("token" in t for t in rt):
        report["findings"].append({
            "id": "implicit-flow", "severity": "MEDIUM",
            "title": "Implicit flow enabled",
            "detail": "response_types_supported advertises token/id_token (implicit)."})
    if "code_challenge_methods_supported" not in meta:
        report["findings"].append({
            "id": "no-pkce", "severity": "MEDIUM",
            "title": "PKCE not advertised",
            "detail": "code_challenge_methods_supported is absent from metadata."})
    algs = [str(a).lower() for a in meta.get("id_token_signing_alg_values_supported", [])]
    if "none" in algs:
        report["findings"].append({
            "id": "alg-none", "severity": "HIGH",
            "title": "id_token signing allows 'none'",
            "detail": "id_token_signing_alg_values_supported includes none."})
    print(json.dumps(report))


if __name__ == "__main__":
    main()
