<p align="center">
  <img src="docs/images/login-screenshot.png" width="600" alt="HookCats login page" />
</p>

<p align="center">
  <strong>Route webhooks from your infrastructure to your chat. In seconds.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#supported-sources">Sources</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#api-reference">API</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node 18+" />
  <img src="https://img.shields.io/badge/docker-ready-blue" alt="Docker Ready" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20HU-orange" alt="Bilingual" />
</p>

---

## Why HookCats?

If you run a homelab or manage infrastructure, you know the drill: Synology sends alerts one way, Proxmox another, GitLab has its own webhook format, Uptime Kuma does its thing... and you just want **one place** to collect them all and forward them to your Mattermost, Slack, or Discord.

**HookCats** is a self-hosted webhook routing server that acts as the central hub between your infrastructure and your team chat. It receives webhooks from any supported source, formats the messages nicely, and delivers them to your preferred chat platform.

No cloud dependency. No subscription. No data leaving your network. Just a single Docker container.

### The problem it solves

```
Before HookCats:
  Synology  ──→ Email ──→ 📧 (who reads those?)
  Proxmox   ──→ ??? ──→ nothing
  GitLab    ──→ separate Mattermost hook
  Sonarr    ──→ another Mattermost hook
  Uptime    ──→ yet another hook

After HookCats:
  Synology  ──→ HookCats ──→ #ops-alerts
  Proxmox   ──→ HookCats ──→ #ops-alerts
  GitLab    ──→ HookCats ──→ #dev-updates
  Sonarr    ──→ HookCats ──→ #media
  Uptime    ──→ HookCats ──→ #monitoring
```

One dashboard. Full control over routing. Message history and delivery tracking.

---

## Features

- **8 source types** with intelligent message formatting (see table below)
- **5 target types**: Mattermost, Rocket.Chat, Slack, Discord, generic webhook
- **Dynamic webhook URLs**: each source gets a unique `/webhook/{secret_key}` endpoint
- **Visual admin UI** with dark mode, real-time dashboard, and charts
- **Team management**: share sources, targets, and routes across your team
- **RBAC**: Admin and User roles with scope-based access control
- **SSO**: Authentik OAuth2/OIDC integration (optional)
- **Security**: AES-256-GCM encryption for sensitive data, HMAC signature validation, account lockout, rate limiting, audit logging
- **Bilingual**: full English and Hungarian UI with runtime language switching
- **Retry logic**: 3 delivery attempts with error tracking
- **Zero dependencies on external services**: runs entirely on your own hardware

---

## Supported Sources

| Source | What it catches | Format |
|--------|----------------|--------|
| **Synology DSM** | System events, backup status, disk warnings | Rich formatted messages |
| **Proxmox VE** | VM/CT status changes, backup events, cluster alerts | Structured with VM details |
| **Proxmox Backup** | Backup job results, verification status | Task-level detail |
| **GitLab** | Push, merge request, pipeline, tag events | Commit-level breakdown |
| **Docker Updater** | Watchtower container update notifications | Before/after image info |
| **Media Webhook** | Sonarr, Radarr, Bazarr grab/download/upgrade | Episode/movie details |
| **Uptime Kuma** | Monitor up/down state changes | Status + duration |
| **Generic** | Any JSON payload | Pass-through with template |

---

## Quick Start

### Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 512 MB RAM, 1 GB disk

### 1. Clone and configure

```bash
git clone https://github.com/bohemtucsok/HookCats.git
cd HookCats
cp .env.example .env
```

Generate secure values:

```bash
# JWT Secret (min 32 characters)
openssl rand -base64 32

# Webhook Secret
openssl rand -base64 24

# Settings encryption key (64 hex chars)
openssl rand -hex 32
```

Edit `.env` with your generated values:

```env
MYSQL_ROOT_PASSWORD=<strong_password>
MYSQL_PASSWORD=<strong_password>
JWT_SECRET=<min_32_characters>
WEBHOOK_SECRET=<your_webhook_secret>
SETTINGS_ENCRYPTION_KEY=<64_hex_characters>
CORS_ORIGIN=https://hooks.yourdomain.com
```

### 2. Launch

```bash
docker compose up -d
```

The database schema and default admin account are created automatically on first start.

### 3. Log in

Open `http://<your-server>:6688` in your browser.

| | |
|-|-|
| **Username** | `admin` |
| **Password** | `admin123` |

> **Change the default password immediately after first login.**

### 4. Create your first route

1. **Sources** > New Source > pick type, name it, set a secret key
2. **Targets** > New Target > pick your chat platform, paste the incoming webhook URL
3. **Routes** > New Route > connect source to target

Your webhook URL is: `https://hooks.yourdomain.com/webhook/<secret_key>`

Point your Synology/Proxmox/GitLab/etc. at that URL and you're done.

---

## Configuration

### Nginx reverse proxy (recommended for production)

```nginx
server {
    listen 443 ssl;
    server_name hooks.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/hooks.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hooks.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:6688;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### SSO with Authentik (optional)

Go to **Settings > SSO** in the admin panel:

| Setting | Value |
|---------|-------|
| SSO Enabled | Yes |
| Provider | Authentik |
| Client ID | From your Authentik provider |
| Client Secret | From your Authentik provider |
| Authority URL | `https://auth.yourdomain.com/application/o/authorize/` |
| Redirect URI | `https://hooks.yourdomain.com/api/sso/callback` |

On the Authentik side, create an OAuth2/OpenID provider with:
- Redirect URI: `https://hooks.yourdomain.com/api/sso/callback`
- Client Type: Confidential
- Scopes: `openid profile email`

### Language / i18n

HookCats ships with **English** (default) and **Hungarian** translations. The UI detects your browser language automatically, or you can switch at any time via the language toggle in the header. The preference is saved per-user in the database.

Backend error messages also respect the selected language via the `X-Language` HTTP header.

### Team management

Create teams to share sources, targets, and routes among users:

1. **Teams** > New Team
2. Add members with roles: **Owner**, **Admin**, or **Member**
3. Switch to team scope to create shared resources

Team resources are visible to all team members. Personal resources remain private.

---

## Source Setup Examples

<details>
<summary><strong>Synology DSM</strong></summary>

Control Panel > Notifications > Webhook:

```
URL: https://hooks.yourdomain.com/webhook/<secret_key>
Method: POST
```
</details>

<details>
<summary><strong>Proxmox VE</strong></summary>

Datacenter > Notifications > Add Webhook:

```
URL: https://hooks.yourdomain.com/webhook/<secret_key>
Method: POST
Content-Type: application/json
```
</details>

<details>
<summary><strong>GitLab</strong></summary>

Settings > Webhooks:

```
URL: https://hooks.yourdomain.com/webhook/<secret_key>
Secret Token: <optional, for X-Webhook-Secret validation>
Trigger: Push events, Merge requests, Pipeline events
```
</details>

<details>
<summary><strong>Uptime Kuma</strong></summary>

Settings > Notifications > Add > Webhook:

```
URL: https://hooks.yourdomain.com/webhook/<secret_key>
Method: POST
Content-Type: application/json
```
</details>

<details>
<summary><strong>Quick test with cURL</strong></summary>

```bash
curl -X POST https://hooks.yourdomain.com/webhook/<secret_key> \
  -H "Content-Type: application/json" \
  -d '{"event": "test", "message": "Hello from HookCats!", "severity": "info"}'
```
</details>

---

## API Reference

All protected endpoints require a JWT token via `Authorization: Bearer <token>`.

### Authentication

```
POST /api/login                    # Login (username + password)
GET  /api/sso/login                # SSO redirect
GET  /api/sso/callback             # SSO callback
GET  /api/me                       # Current user profile
PUT  /api/profile/language         # Update language preference
```

### Webhook Ingress (no auth)

```
POST /webhook/{secret_key}         # Receive webhook from external source
GET  /health                       # Health check
```

### Personal Scope

```
GET/POST       /api/personal/sources|targets|routes
GET/PUT/DELETE /api/personal/sources|targets|routes/:id
GET            /api/personal/events|deliveries
GET/DELETE     /api/personal/events/:id
GET            /api/personal/deliveries/:id
```

### Team Scope

```
GET/POST       /api/team/:teamId/sources|targets|routes
GET/PUT/DELETE /api/team/:teamId/sources|targets|routes/:id
GET            /api/team/:teamId/events|deliveries
GET/DELETE     /api/team/:teamId/events/:id
GET            /api/team/:teamId/deliveries/:id
```

### Admin

```
GET/POST       /api/admin/users
PUT            /api/admin/users/:id/role|active
DELETE         /api/admin/users/:id
GET/POST       /api/admin/teams
GET/PUT        /api/settings
POST           /api/settings/sso/validate
POST           /api/test-delivery/:targetId
```

### Dashboard

```
GET /api/dashboard/stats           # Statistics overview
GET /api/dashboard/recent-events   # Recent events feed
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 18 + Express.js |
| Database | MySQL 8.0 |
| Frontend | Vanilla JS (no framework, no build step) |
| Auth | JWT + bcrypt + OAuth2/OIDC SSO |
| Encryption | AES-256-GCM (settings), bcrypt (passwords) |
| Infrastructure | Docker + Docker Compose |
| i18n | English + Hungarian |

---

## Troubleshooting

<details>
<summary><strong>Container won't start</strong></summary>

```bash
docker compose logs webhook-server
docker compose logs mysql
```

Common causes:
- Missing `.env` values
- `JWT_SECRET` too short (min 32 chars)
- `SETTINGS_ENCRYPTION_KEY` not 64 hex chars
- `CORS_ORIGIN` missing in production mode
</details>

<details>
<summary><strong>Account locked out</strong></summary>

After 5 failed login attempts, the account locks for 30 minutes. To unlock immediately:

```bash
docker compose exec mysql mysql -u root -p webhook_db -e \
  "UPDATE users SET login_attempts = 0, locked_until = NULL WHERE username = 'admin';"
```
</details>

<details>
<summary><strong>Database backup & restore</strong></summary>

```bash
# Backup
docker compose exec mysql mysqldump -u root -p webhook_db > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T mysql mysql -u root -p webhook_db < backup.sql
```
</details>

---

## Supporters

<p align="center">
  <a href="https://infotipp.hu"><img src="docs/images/infotipp-logo.png" height="40" alt="Infotipp Rendszerház Kft." /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://brutefence.com"><img src="docs/images/brutefence.png" height="40" alt="BruteFence" /></a>
</p>

---

## License

[MIT](LICENSE) -- use it, fork it, self-host it. Contributions welcome.
