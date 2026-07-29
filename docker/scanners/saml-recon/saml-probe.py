#!/usr/bin/env python3
"""Discover SAML metadata at common endpoints and flag weak-signature signals.
Usage: saml-probe <base-url-or-metadata-url>. Emits JSON on stdout; never raises."""
import json
import sys
import urllib.request

PATHS = [
    "",  # treat arg as a direct metadata URL first
    "/saml/metadata",
    "/simplesaml/saml2/idp/metadata.php",
    "/FederationMetadata/2007-06/FederationMetadata.xml",
    "/auth/realms/master/protocol/saml/descriptor",
]


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "autoscanner-saml"})
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read().decode("utf-8", "replace")
            return body if "EntityDescriptor" in body or "SPSSODescriptor" in body else None
    except Exception:
        return None


def main():
    arg = (sys.argv[1] if len(sys.argv) > 1 else "").rstrip("/")
    report = {"metadataUrl": None, "found": False, "findings": []}
    xml = None
    for path in PATHS:
        url = arg if path == "" else arg + path
        if not url:
            continue
        xml = fetch(url)
        if xml:
            report["metadataUrl"] = url
            report["found"] = True
            break
    if not xml:
        print(json.dumps(report))
        return

    low = xml.lower()
    if "rsa-sha1" in low or "#sha1" in low:
        report["findings"].append({
            "id": "sha1-signature", "severity": "MEDIUM",
            "title": "SAML metadata signed with SHA-1",
            "detail": "SignatureMethod/DigestMethod references SHA-1."})
    if "<ds:signature" not in low and "<signature" not in low:
        report["findings"].append({
            "id": "unsigned-metadata", "severity": "LOW",
            "title": "SAML metadata is not signed",
            "detail": "No <Signature> element present in EntityDescriptor."})
    print(json.dumps(report))


if __name__ == "__main__":
    main()
