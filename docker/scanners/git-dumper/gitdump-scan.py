#!/usr/bin/env python3
"""Detect an exposed .git/ directory and, if found, dump it and sweep for secrets.
Usage: gitdump-scan <base-url>. Emits JSON on stdout; never raises."""
import json
import os
import re
import subprocess
import sys
import urllib.request

# High-signal secret patterns to grep the dumped working tree for.
SECRET_RES = [
    ("aws-access-key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("generic-secret", re.compile(r"(?i)(password|passwd|secret|api[_-]?key|token)\s*[=:]\s*['\"][^'\"]{6,}['\"]")),
    ("url-cred", re.compile(r"[a-z][a-z0-9+.-]*://[^/\s:@]+:[^/\s:@]+@")),
]


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "autoscanner-gitdump"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:
        return None


def is_exposed(git_url):
    head = fetch(git_url + "HEAD")
    if head and head.strip().startswith("ref:"):
        return True
    cfg = fetch(git_url + "config")
    return bool(cfg and "[core]" in cfg)


def sweep(root):
    findings = []
    for dirpath, _dirs, files in os.walk(root):
        if os.path.basename(dirpath) == ".git":
            continue  # skip git internals; scan the recovered working tree
        for name in files:
            path = os.path.join(dirpath, name)
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    content = fh.read(200000)
            except Exception:
                continue
            rel = os.path.relpath(path, root)
            for sid, rx in SECRET_RES:
                if rx.search(content):
                    findings.append({
                        "id": "secret", "severity": "CRITICAL",
                        "title": "Secret in exposed git repo",
                        "detail": f"{sid} pattern in {rel}"})
                    break  # one finding per file
    return findings


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "").rstrip("/")
    git_url = base + "/.git/"
    report = {"gitUrl": git_url, "exposed": False, "findings": []}
    if not base or not is_exposed(git_url):
        print(json.dumps(report))
        return

    report["exposed"] = True
    report["findings"].append({
        "id": "exposed-git", "severity": "HIGH",
        "title": "Exposed .git directory",
        "detail": ".git/HEAD or .git/config is publicly reachable — source code is recoverable."})

    out_dir = "/tmp/repo"
    try:
        subprocess.run(
            ["git-dumper", git_url, out_dir],
            timeout=300, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        if os.path.isdir(out_dir):
            report["findings"].extend(sweep(out_dir))
    except Exception:
        pass  # keep the HIGH exposure finding even if the dump/sweep fails

    print(json.dumps(report))


if __name__ == "__main__":
    main()
