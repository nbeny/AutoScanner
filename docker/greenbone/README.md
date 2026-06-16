# Greenbone Scanner Stack

This directory contains the Docker Compose stack for the **Greenbone/OpenVAS scanner subset** used by AutoScanner for active network vulnerability scanning.

**Scope:** openvasd HTTP API + supporting services (Redis, MQTT broker, Notus scanner, feed-sync containers). No gvmd management layer or GSA web UI is included.

---

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A `.env` file in this directory (copy from `.env.example` and set `OPENVASD_API_KEY`)
- Outbound internet access for the initial feed sync (multi-GB download)

---

## Bring Up

```sh
# 1. Copy and configure the env file
cp docker/greenbone/.env.example docker/greenbone/.env
# Edit docker/greenbone/.env — set OPENVASD_API_KEY to a strong random value

# 2. Start the stack
docker compose -f docker/greenbone/docker-compose.greenbone.yml up -d
```

The stack starts the following services:

| Service               | Role                                           |
| --------------------- | ---------------------------------------------- |
| `openvasd`            | OpenVAS daemon + HTTP API on port 3000         |
| `redis-server`        | Knowledge-base store for openvasd              |
| `mqtt-broker`         | Message bus between openvasd and notus-scanner |
| `notus-scanner`       | OS-package advisory scanner                    |
| `vulnerability-tests` | Feed-sync: NASL scripts                        |
| `notus-data`          | Feed-sync: Notus JSON advisories               |
| `scap-data`           | Feed-sync: SCAP/NVD CVE data                   |

---

## Feed Sync

The `vulnerability-tests`, `notus-data`, and `scap-data` containers run on first boot and populate their respective Docker volumes. **Total download is multi-GB; the initial sync can take 30–60+ minutes** depending on connection speed.

Feed data is persisted in named Docker volumes (`vt_data`, `notus_data`, `scap_data`) and survives container restarts.

### Scheduled Daily Refresh

The feed containers do not auto-refresh after the first boot. To keep the feeds current, run a daily refresh — for example via a cron job or CI schedule:

```sh
docker compose -f docker/greenbone/docker-compose.greenbone.yml \
  run --rm vulnerability-tests

docker compose -f docker/greenbone/docker-compose.greenbone.yml \
  run --rm notus-data

docker compose -f docker/greenbone/docker-compose.greenbone.yml \
  run --rm scap-data
```

After the refresh, restart openvasd so it picks up the new data:

```sh
docker compose -f docker/greenbone/docker-compose.greenbone.yml restart openvasd
```

---

## Verify Feed is Loaded Before Scanning

Do not start a scan if the feed is empty — the AutoScanner client scanner will fail loudly in this case (implemented as a pre-scan health check in a later task). You can verify manually:

```sh
# Check openvasd health and VT count
curl -s -H "X-API-Key: <your-key>" http://localhost:3000/health/alive
# Expected: {"status":"alive"} or similar

curl -s -H "X-API-Key: <your-key>" http://localhost:3000/vts?page=1&pageSize=1
# If the response contains VTs, the feed loaded successfully.
# An empty result set means the feed sync has not completed yet.
```

> **Note:** `localhost:3000` is only reachable if you uncommented the `ports` block in `docker-compose.greenbone.yml`. From within the `autoscanner-greenbone` Docker network, use `http://openvasd:3000`.

---

## Networking

The stack declares the external-joinable network `autoscanner-greenbone`. The AutoScanner scan-worker joins this network at scan time:

```sh
docker run --rm --network autoscanner-greenbone \
  -e OPENVASD_API_KEY=<your-key> \
  autoscanner/openvas-scanner:latest
```

Inside the network, the daemon is reachable at `http://openvasd:3000`.

---

## Image Tags

All images default to `latest` for convenience. For reproducible deployments, pin each `*_TAG` variable in your `.env` to a specific Greenbone Community Containers release tag. Check the current release at:

- https://github.com/greenbone/greenbone-community-container/releases
- https://hub.docker.com/u/greenbone

---

## Security Notes

- The `OPENVASD_API_KEY` in `.env` must match the `OPENVAS` credential registered in the AutoScanner operator settings. If they diverge, scan-workers will receive 401 errors.
- Do not commit `.env` to version control. Only `.env.example` is tracked.
- The openvasd port is not exposed to the host by default. Uncomment the `ports` block in the compose file only for local debugging.
