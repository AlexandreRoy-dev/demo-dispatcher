# Demo Dispatcher

Prospect demo: a dispatcher enters the day’s call addresses for **one fictional tech** (Jordan Hale). The app calls **Google Routes API** with `TRAFFIC_AWARE_OPTIMAL` + `optimizeWaypointOrder` so the stop order and drive times use **live traffic**, then plots the route on a map.

Live URL (after deploy): [https://dispatch.codesurmesure.ca](https://dispatch.codesurmesure.ca)

Guertech dispatch prototype: [https://dispatch.codesurmesure.ca/guertech](https://dispatch.codesurmesure.ca/guertech) (`/guertech`). Jordan Hale demo stays at `/`.

## Features

- Single-tech day form (start / depot, stops, optional end)
- Places autocomplete on address fields
- Server-side route optimization via Google Routes API (traffic-aware)
- Optimized stop order, traffic ETAs, distance, and map polyline

## Google Cloud setup

Enable these APIs on your Google Cloud project:

1. **Routes API** (required for traffic-aware optimization)
2. **Maps JavaScript API**
3. **Places API**

Create API keys:

| Env var | Use | Suggested restriction |
|---------|-----|------------------------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Map + Places in browser | HTTP referrers: `localhost:3000/*`, `dispatch.codesurmesure.ca/*` |
| `GOOGLE_MAPS_SERVER_API_KEY` | Routes API on server | IP: `158.69.1.173` (and your local IP for dev) |

Copy `.env.example` → `.env.local` and fill in the keys.

Billing must be enabled on the Google Cloud project for Routes / Maps to return live results.

## Local development

```bash
npm install
cp .env.example .env.local   # then edit keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sample Montréal addresses are prefilled; click **Optimize route**.

## VPS deploy (DuProprio sync host)

Host: `ubuntu@158.69.1.173` (SSH key `~/.ssh/ovh_vps`)

| Item | Value |
|------|--------|
| App dir | `/var/www/demo-dispatcher` |
| Process | systemd `demo-dispatcher` → `127.0.0.1:3010` |
| Proxy | nginx → `https://dispatch.codesurmesure.ca` (Certbot SSL) |

From this repo (with `.env.local` present so keys upload as server `.env`):

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\deploy.ps1
```

DNS on **codesurmesure.ca** (GoDaddy): **A** record `dispatch` → `158.69.1.173`, then:

```bash
sudo certbot --nginx -d dispatch.codesurmesure.ca
```

Does **not** modify `/root/duproprio-lead-pipeline` or the marketplace on port `3000`.

### Google keys on the server

```bash
ssh -i ~/.ssh/ovh_vps ubuntu@158.69.1.173
nano /var/www/demo-dispatcher/.env
sudo systemctl restart demo-dispatcher
```

Enable **Routes API** (not only Directions). Optimization uses traffic-aware routing so stop order and ETAs follow live traffic.

## API

`POST /api/optimize-route`

```json
{
  "start": "1000 Rue de la Gauchetière O, Montréal, QC",
  "stops": ["…", "…"],
  "end": "1000 Rue de la Gauchetière O, Montréal, QC"
}
```

Uses Google Routes `computeRoutes` with:

- `routingPreference: "TRAFFIC_AWARE_OPTIMAL"`
- `optimizeWaypointOrder: true`
- `departureTime: <now>`
