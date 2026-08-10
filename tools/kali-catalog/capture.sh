#!/usr/bin/env bash
# tools/kali-catalog/capture.sh
# Introspect installed Kali tools -> RawCapture JSONL on stdout.
#
# Category source: kali-linux-large installs the tools but registers only the
# `kali-tools-top10` metapackage, so enumerating via installed metapackages missed
# everything else. Instead we build a package->category map by QUERYING every
# `kali-tools-<cat>` metapackage's dependency list (no install needed — apt-cache
# reads the local indices), then enumerate EVERY installed tool package and tag it.
#
# Guardrails: no network (run with --network none), per-invocation timeout, output
# cap, closed stdin. Binaries without clean help emit helpTextRaw=null.
set -uo pipefail

HELP_TIMEOUT="${HELP_TIMEOUT:-5}"
HELP_MAX_BYTES="${HELP_MAX_BYTES:-65536}"

# Binaries known to hang / have side effects — never executed.
EXCLUDE_RE='^(bash|sh|dash|zsh|python[0-9.]*|perl|ruby|msfconsole|msfdb|postgres|mysql|service|systemctl|nc|ncat|telnet|ftp|ssh|screen|tmux|vi|vim|nano|less|more|man)$'

emit_help() {
  local bin="$1"
  local out
  for flag in --help -h help; do
    out="$(timeout "${HELP_TIMEOUT}" "$bin" "$flag" </dev/null 2>&1 | head -c "${HELP_MAX_BYTES}")"
    if [ -n "$out" ]; then printf '%s' "$out"; return 0; fi
  done
  return 1
}

# 1) package -> category map, from every kali-tools-<cat> metapackage in the apt
#    index (queried, NOT installed). First category a package appears in wins.
declare -A PKGCAT
for meta in $(apt-cache pkgnames kali-tools- 2>/dev/null); do
  [ "$meta" = "kali-tools" ] && continue
  category="${meta#kali-tools-}"
  for pkg in $(apt-cache depends "$meta" 2>/dev/null | awk '/Depends:/ {print $2}'); do
    [ -z "${PKGCAT[$pkg]:-}" ] && PKGCAT[$pkg]="$category"
  done
done

# 2) Emit each executable of every INSTALLED package that maps to a Kali category.
for pkg in $(dpkg-query -W -f='${Package}\n' 2>/dev/null); do
  category="${PKGCAT[$pkg]:-}"
  [ -z "$category" ] && continue
  desc="$(apt-cache show "$pkg" 2>/dev/null | awk -F': ' '/^Description(-en)?:/ {print $2; exit}')"
  homepage="$(apt-cache show "$pkg" 2>/dev/null | awk -F': ' '/^Homepage:/ {print $2; exit}')"
  for path in $(dpkg -L "$pkg" 2>/dev/null | grep -E '^/usr/(bin|sbin)/'); do
    [ -x "$path" ] || continue
    bin="$(basename "$path")"
    echo "$bin" | grep -qE "$EXCLUDE_RE" && continue
    help="$(emit_help "$bin" || true)"
    man_ok="false"; timeout "${HELP_TIMEOUT}" man "$bin" >/dev/null 2>&1 && man_ok="true"
    man_text=""
    if [ "$man_ok" = "true" ]; then
      man_text="$(timeout "${HELP_TIMEOUT}" man "$bin" 2>/dev/null | col -bx | head -c "${HELP_MAX_BYTES}")"
    fi
    jq -cn \
      --arg package "$pkg" --arg binary "$bin" --arg description "$desc" \
      --arg homepage "$homepage" --arg category "$category" \
      --arg help "$help" --arg mantext "$man_text" --argjson man "$man_ok" \
      '{package:$package, binary:$binary, description:$description,
        homepage: ($homepage|select(.!="")//null),
        categories: [$category],
        helpTextRaw: ($help|select(.!="")//null),
        manTextRaw: ($mantext|select(.!="")//null),
        manAvailable: $man}'
  done
done
