# OAST collaborator (self-hosted interactsh)

Out-of-band application security testing (OAST) catches **blind** vulnerabilities —
SSRF, blind XXE, blind injection — where the only signal is the target reaching
out to a server you control. The `web-dast` scanner wires nuclei to this
collaborator when it is configured.

This stack is **opt-in** and intentionally **not** part of `pnpm dev:up`. It is
the one always-on piece of the active-injection toolset, so you run it only when
you need blind detection — keeping idle RAM at zero otherwise.

## Prerequisites

A public domain you control, plus a host with a public IP:

1. Pick a subdomain, e.g. `oast.example.com`.
2. Add an `A` record for `oast.example.com` → this host's public IP.
3. Add an `NS` record delegating `oast.example.com` to itself
   (`oast.example.com. IN NS oast.example.com.`) so interactsh can answer DNS
   for the unique callback subdomains it generates.
4. Open inbound `53/udp`, `53/tcp`, `80`, and `443` on the host firewall.

## Run

```bash
export OAST_DOMAIN=oast.example.com
export OAST_TOKEN="$(openssl rand -hex 24)"
pnpm oast:up      # docker compose -f docker/oast/docker-compose.oast.yml up -d
pnpm oast:down    # stop it
```

## Point scan-worker at it

Set these in the scan-worker environment:

| Var                 | Meaning                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OAST_SERVER_URL`   | `https://oast.example.com` — enables blind detection via this server.                                                                                           |
| `OAST_TOKEN`        | Must match the server's `OAST_TOKEN`.                                                                                                                           |
| `OAST_ALLOW_PUBLIC` | `true` opts into ProjectDiscovery's PUBLIC `oast.pro` when no self-hosted server is set. **Off by default — interaction data would leave your infrastructure.** |

## Degradation states (what `web-dast` does)

1. **`OAST_SERVER_URL` set** → full blind + in-band detection (self-hosted).
2. **Unset, `OAST_ALLOW_PUBLIC` unset/false** → in-band only; nuclei runs with
   `-no-interactsh` so no callback ever leaves to a third party.
3. **Unset, `OAST_ALLOW_PUBLIC=true`** → nuclei uses its default public
   interactsh. Convenient, but interaction data transits ProjectDiscovery.

The image tag `projectdiscovery/interactsh-server:v1.2.0` is version-sensitive;
verify against the current release before deploying.
