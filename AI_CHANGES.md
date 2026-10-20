# AI-Assisted Changes

A record of the changes made with Claude Code while adding **titan** (a Proxmox VM on atlas) to the dashboard alongside **Vault** (the Synology NAS).

---

## Overview

The dashboard used to talk to a single host, the Synology NAS. It now pulls data from two hosts:

```
Browser → dashboard backend ──HTTP──► titan helper (on titan :4222) → docker CLI, /proc, df
                            ──SNMP──► Vault (metrics)
                            ──HTTPS─► Vault DSM API (containers, logs)
                            ──HTTP──► NAS helper (on Vault :4111) → synopkg
```

Containers from both hosts appear in **one services list**, and a badge on each card shows which host it runs on. The metrics routes accept a `host` parameter (`synology` or `titan`).

---

## Session 1: 2026-08-14, titan integration

### New files

| File | Purpose |
|---|---|
| `backend/src/lib/titan-helper.ts` | A small Express server that runs **on titan itself**, outside Docker. It wraps the `docker` CLI and reads `/proc` and `df` for host metrics. This is the same pattern as `host-helper.ts` on the NAS. |
| `backend/src/lib/titan.ts` | The backend's client for the titan helper: `getTitanContainers`, `getTitanContainer`, `titanContainerAction`, `getTitanSystemMetrics`. |
| `backend/src/lib/http.ts` | Shared `getJson` and `postJson` functions with a timeout, moved out of `routes/packages.ts`. |
| `frontend/src/components/HostBadge.tsx` | A colored badge showing a service's host (Synology or Titan). |

#### Titan helper endpoints

| Endpoint | Action |
|---|---|
| `GET /health` | `{"ok":true}` |
| `GET /containers` | `docker ps -a` |
| `GET /containers/:name` | `docker inspect` |
| `POST /containers/:name/{start,stop,restart}` | the matching `docker` command |
| `GET /system` | CPU %, memory, disks, network bytes |

### Modified files

| File | Change |
|---|---|
| `shared/types.ts` | Added `Host = 'synology' \| 'titan'` and a `Host` field on `Service`. Replaced `PublicUrl` and `InternalUrl` with a single `Url` field. |
| `backend/src/routes/services.ts` | Lists containers from both hosts. Service IDs now look like `<host>:<name>`, and every route (`/:id`, `/inspect`, `/start`, `/stop`, `/restart`) uses the host to decide where to send the request. URLs are built as `https://{name}.home.sterling-dev.com`, so the reverse-proxy lookup was removed. |
| `backend/src/routes/metrics.ts` | Keeps separate metric history for each host. Polls Vault over SNMP and titan through its helper. Accepts `?host=synology\|titan` (default `synology`). |
| `backend/src/routes/packages.ts` | Uses the shared `getJson` from `lib/http.ts`. |
| `backend/src/lib/snmp.ts` | Guards against an undefined byte when decoding Counter64 values (a type-safety fix). |
| `frontend/src/components/ServiceCard.tsx` | Shows a `HostBadge` under the health badge. |
| `frontend/src/components/ServiceDetailModal.tsx` | Adds a `HostBadge` and uses `service.Url` for the URL row and the "Open App" button. The port-based URL guess was removed. |
| `frontend/vite.config.ts` | Comment only: corrected the example `VITE_HMR_HOST`. |
| `backend/.gitignore` | `.env` → `*.env`, so `backend.env` is never committed. |

---

## Session 2: 2026-10-20, environment variables and titan helper deployment

### Code change

| File | Change |
|---|---|
| `backend/package.json` | The `dev` and `start` scripts now pass `--env-file=backend.env`. Before this, `import 'dotenv/config'` only looked for a file named `.env`, so **none of the values in `backend.env` were being loaded**. Run npm from `backend/`, because the path is relative to the current directory. |

### Configuration, not committed

`backend/backend.env` is ignored by git. The host values were set to:

```
SYNO_HOST=https://10.0.0.30:5051
SNMP_HOST=10.0.0.30
SYNO_HELPER_URL=http://10.0.0.30:4111
TITAN_HELPER_URL=http://172.18.0.1:4222
```

- **Vault uses its LAN IP (`10.0.0.30`).** `dsm.home.sterling-dev.com` resolves to `10.0.0.100`, the reverse proxy. DSM on port 5051 and the NAS helper on 4111 refused connections there, and SNMP can't go through an HTTP proxy at all. The backend already ignores the NAS's self-signed certificate, so using an IP costs nothing.
- **titan uses `172.18.0.1`,** titan's gateway address on the `private` Docker network (`br-a14dafd7f04c`, `172.18.0.0/16`). The same URL works from the dev container (code-server on `private`) and from the final app, which will run as a container on `private`. It works because a container reaches the host through its network's gateway address, and the host can also reach that address.
- If `private` is ever recreated, pin its subnet so the gateway doesn't change:
  `docker network create --subnet 172.18.0.0/16 --gateway 172.18.0.1 private`

### Deployment on titan (outside the repo)

The titan helper was installed on titan as a systemd service:

| Item | Value |
|---|---|
| Folder | `/root/Scripts/Titan-Helper/` (holds a **copy** of `titan-helper.ts`) |
| Packages | `express`, `dotenv`, `tsx` on Node 22 |
| `.env` | `TITAN_HELPER_PORT=4222`, `TITAN_HELPER_HOST=172.18.0.1`, `TITAN_NET_IFACE=ens18` |
| Service | `/etc/systemd/system/titan-helper.service` (`User=root`, `After=docker.service`, `Restart=on-failure`) |

- The helper listens only on `172.18.0.1`, so it can be reached from titan and its containers but not from the LAN. That matters because it has no authentication and can start and stop containers.
- **After editing `titan-helper.ts`:** copy it to `/root/Scripts/Titan-Helper/` and run `systemctl restart titan-helper`. To follow its log, use `journalctl -u titan-helper -f`.

### Verified

I ran the backend from the dev container and checked each data source:

| Data | Vault | titan |
|---|---|---|
| CPU / memory / disk metrics | ✅ | ✅ |
| Containers | ✅ (2) | ✅ (21) |
| Packages | ✅ | n/a |
| Network traffic counters | not checked | ✅ (`ens18` shows real traffic counts) |

Both `backend` and `frontend` typecheck cleanly.

---

## Environment variable reference

| Process | Runs on | Variables |
|---|---|---|
| Dashboard backend (`server.ts`) | titan, in a container on `private` | `PORT`, `SYNO_HOST`, `SYNO_USER`, `SYNO_PASS`, `SNMP_HOST`, `SNMP_COMMUNITY`, `SYNO_HELPER_URL`, `TITAN_HELPER_URL` |
| NAS helper (`host-helper.ts`) | Vault | `SYNO_HELPER_PORT` (required), `SYNO_HELPER_HOST`, `SYNOPKG_PATH` |
| titan helper (`titan-helper.ts`) | titan host | `TITAN_HELPER_PORT` (required), `TITAN_HELPER_HOST`, `DOCKER_PATH`, `TITAN_NET_IFACE` |

---

## Open follow-ups

- **titan disk list:** `df` in the titan helper also reports `/sys/firmware/efi/efivars` and `/mnt/vault/plexmedia`, Vault's storage mounted on titan. Excluding `efivarfs` and network filesystems (`nfs`, `nfs4`, `cifs`) would stop Vault's storage from also being reported as titan's.
- **Vault network graph:** `metrics.ts` looks for an interface named `eth0`. Not yet confirmed; if the graph stays empty, check Vault's interface name, which is `ovs_eth0` when Open vSwitch is enabled.
- **`backend.env.example`:** add an example file with no secrets in it, so the required variables are documented in the repo.
- **`frontend/package-lock.json`:** has an unrelated dependency refresh, including a pre-release version, that isn't part of this work. Review it separately.
