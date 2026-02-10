# HookCats

Biztonságos webhook routing szerver különböző rendszerek eseményeinek fogadására és továbbítására chat platformok felé.

## Tartalomjegyzék

- [Funkciók](#funkciók)
- [Telepítés](#telepítés)
- [Beállítás](#beállítás)
- [Használat](#használat)
- [API](#api)
- [Hibaelhárítás](#hibaelhárítás)

---

## Funkciók

### Támogatott források

| Típus | Leírás |
|-------|--------|
| Synology DSM | Rendszer események, backup állapotok |
| Proxmox VE | VM/CT státusz változások, backup események |
| Proxmox Backup | PBS backup és verify események |
| GitLab | Push, merge request, pipeline események |
| Docker Updater | Watchtower konténer frissítési értesítések |
| Media-Webhook | Sonarr, Radarr, Bazarr média események |
| Uptime Kuma | Monitoring állapot változások |
| Generic | Tetszőleges JSON webhook |

### Támogatott célpontok

| Típus | Leírás |
|-------|--------|
| Mattermost | Incoming webhook |
| Rocket.Chat | Incoming webhook |
| Slack | Incoming webhook |
| Discord | Webhook integráció |
| Webhook | Tetszőleges HTTP endpoint |

### Egyéb

- **Dinamikus webhook URL-ek**: `/webhook/{secret_key}`
- **RBAC**: Admin és User szerepkörök
- **Team management**: Közös források, célpontok, útvonalak
- **SSO**: Authentik OAuth2/OIDC integráció
- **AES-256-GCM**: Szenzitív adatok titkosítása az adatbázisban
- **Account lockout**: 5 sikertelen kísérlet → 30 perc zárolás
- **Retry**: 3 kézbesítési próbálkozás hibakezeléssel
- **Audit log**: Teljes tevékenység naplózás

---

## Telepítés

### Előkövetelmények

- Docker Engine 20.10+
- Docker Compose 2.0+
- 512 MB RAM, 1 GB szabad tárhely

### 1. Klónozás

```bash
git clone https://github.com/bohemtucsok/HookCats.git
cd HookCats
```

### 2. Környezeti változók

```bash
cp .env.example .env
```

Generálj biztonságos értékeket és töltsd ki a `.env` fájlt:

```bash
# JWT Secret (min 32 karakter)
openssl rand -base64 32

# Webhook Secret (min 16 karakter)
openssl rand -base64 24

# Titkosítási kulcs (64 hex karakter)
openssl rand -hex 32
```

**`.env` tartalma:**

```env
# Adatbázis
MYSQL_ROOT_PASSWORD=<erős_jelszó>
MYSQL_PASSWORD=<erős_jelszó>

# Biztonság
JWT_SECRET=<min_32_karakter>
WEBHOOK_SECRET=<min_16_karakter>
SETTINGS_ENCRYPTION_KEY=<64_hex_karakter>

# Alkalmazás
NODE_ENV=production
PORT=6688
CORS_ORIGIN=https://webhook.yourdomain.com
```

> **CORS_ORIGIN**: Production környezetben kötelező megadni a konkrét domain-t. Több domain vesszővel elválasztva adható meg.

### 3. Indítás

```bash
docker compose up -d
```

Első indításkor az adatbázis séma és az alapértelmezett admin fiók automatikusan létrejön.

### 4. Első bejelentkezés

Nyisd meg a böngészőben: `http://<szerver_ip>:6688`

| | |
|-|-|
| **Felhasználónév** | `admin` |
| **Jelszó** | `admin123` |

**Első bejelentkezés után változtasd meg az admin jelszót!**

### 5. Ellenőrzés

```bash
# Health check
curl http://localhost:6688/health

# Migrációs logok
docker compose logs webhook-server | grep -i migration
```

---

## Beállítás

### Nginx reverse proxy (HTTPS)

Ajánlott production környezetben HTTPS-t használni Nginx reverse proxy mögött:

```nginx
server {
    listen 443 ssl;
    server_name webhook.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/webhook.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/webhook.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:6688;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Webhook források létrehozása

**Admin UI > Saját > Források > Új forrás**

1. Adj nevet a forrásnak (pl. "Synology Backup")
2. Válaszd ki a típust
3. Adj meg egy secret key-t (vagy generálj)
4. Válaszd ki a hatókört (Személyes vagy Csapat)

Az elkészült webhook URL: `https://webhook.yourdomain.com/webhook/{secret_key}`

### Célpontok beállítása

**Admin UI > Saját > Célpontok > Új célpont**

1. Adj nevet (pl. "Mattermost Operations")
2. Válaszd ki a típust (Mattermost, Slack, Discord, stb.)
3. Add meg a célpont webhook URL-jét
4. Válaszd ki a hatókört

### Útvonalak (routing)

**Admin UI > Saját > Útvonalak > Új útvonal**

Kösd össze a forrást a célponttal. Opcionálisan adj meg üzenet sablont:

```
**{{source}} Alert**
Status: {{status}}
Details: {{message}}
```

### SSO konfiguráció (opcionális)

**Admin UI > Beállítások > SSO beállítások**

| Mező | Érték |
|------|-------|
| SSO engedélyezés | Be |
| Provider | Authentik |
| Client ID | Az Authentik-ból |
| Client Secret | Az Authentik-ból |
| Authority URL | `https://auth.yourdomain.com/application/o/authorize/` |
| Redirect URI | `https://webhook.yourdomain.com/api/sso/callback` |
| Scopes | `openid profile email` |

Az Authentik oldalon:
- Provider Type: OAuth2/OpenID
- Redirect URIs: `https://webhook.yourdomain.com/api/sso/callback`
- Client Type: Confidential

### Team management

**Admin UI > Csapatok > Új csapat**

1. Hozz létre csapatot névvel és leírással
2. Adj hozzá tagokat (Owner / Admin / Member szerepkörrel)
3. A csapat hatókörben létrehozott források, célpontok és útvonalak a tagok számára közösen láthatók

### Felhasználók kezelése

**Admin UI > Felhasználók** (csak admin)

- Új felhasználó létrehozása
- Szerepkör váltás (Admin / User)
- Felhasználó aktiválás/deaktiválás
- Utolsó admin nem törölhető (védelem)

---

## Használat

### Webhook küldés külső rendszerekből

#### Synology DSM

Vezérlőpult > Értesítések > Webhook:

```
URL: https://webhook.yourdomain.com/webhook/<secret_key>
Method: POST
```

#### Proxmox VE

Datacenter > Notifications > Webhook:

```
URL: https://webhook.yourdomain.com/webhook/<secret_key>
Method: POST
Content-Type: application/json
```

#### GitLab

Settings > Webhooks:

```
URL: https://webhook.yourdomain.com/webhook/<secret_key>
Secret Token: <opcionális X-Webhook-Secret>
Trigger: Push events, Merge requests, Pipeline events
```

#### Uptime Kuma

Settings > Notifications > Webhook:

```
URL: https://webhook.yourdomain.com/webhook/<secret_key>
Method: POST
Content-Type: application/json
```

#### cURL teszt

```bash
curl -X POST https://webhook.yourdomain.com/webhook/<secret_key> \
  -H "Content-Type: application/json" \
  -d '{"event": "test", "message": "Hello webhook!", "severity": "info"}'
```

---

## API

Minden védett endpoint JWT token-t igényel az `Authorization: Bearer <token>` header-ben.

### Autentikáció

```
POST /api/login              # Bejelentkezés (username + password)
GET  /api/sso/login          # SSO átirányítás
GET  /api/sso/callback       # SSO callback
GET  /api/me                 # Aktuális felhasználó
```

### Webhook fogadás

```
POST /webhook/{secret_key}   # Dinamikus webhook endpoint (nincs auth)
```

### Személyes hatókör

```
GET/POST        /api/personal/sources
GET/PUT/DELETE  /api/personal/sources/:id
GET/POST        /api/personal/targets
GET/PUT/DELETE  /api/personal/targets/:id
GET/POST        /api/personal/routes
GET/PUT/DELETE  /api/personal/routes/:id
GET             /api/personal/events
GET/DELETE      /api/personal/events/:id
GET             /api/personal/deliveries
GET             /api/personal/deliveries/:id
```

### Csapat hatókör

```
GET/POST        /api/team/:teamId/sources
GET/PUT/DELETE  /api/team/:teamId/sources/:id
GET/POST        /api/team/:teamId/targets
GET/PUT/DELETE  /api/team/:teamId/targets/:id
GET/POST        /api/team/:teamId/routes
GET/PUT/DELETE  /api/team/:teamId/routes/:id
GET             /api/team/:teamId/events
GET/DELETE      /api/team/:teamId/events/:id
GET             /api/team/:teamId/deliveries
GET             /api/team/:teamId/deliveries/:id
```

### Dashboard

```
GET /api/dashboard/stats          # Statisztikák
GET /api/dashboard/recent-events  # Legutóbbi események
```

### Admin (admin szerepkör szükséges)

```
GET    /api/admin/users           # Felhasználók listázása
POST   /api/admin/users           # Felhasználó létrehozása
PUT    /api/admin/users/:id/role  # Szerepkör módosítás
PUT    /api/admin/users/:id/active # Aktiválás/deaktiválás
DELETE /api/admin/users/:id       # Felhasználó törlés
GET    /api/admin/teams           # Csapatok listázása
POST   /api/admin/teams           # Csapat létrehozás
```

### Beállítások (admin)

```
GET  /api/settings                # Beállítások lekérdezése
PUT  /api/settings                # Beállítások mentése
POST /api/settings/sso/validate   # SSO konfiguráció tesztelés
```

### Kézbesítés teszt

```
POST /api/test-delivery/:targetId  # Teszt üzenet küldése
```

### Health check

```
GET /health                       # Rendszer állapot (nincs auth)
```

---

## Hibaelhárítás

### Konténer nem indul

```bash
# Logok ellenőrzése
docker compose logs webhook-server

# MySQL logok
docker compose logs mysql
```

**Gyakori okok:**
- Hiányzó környezeti változók → ellenőrizd a `.env` fájlt
- JWT_SECRET túl rövid (min 32 karakter)
- SETTINGS_ENCRYPTION_KEY nem 64 hex karakter
- CORS_ORIGIN hiányzik production módban
- MySQL még nem kész → a `depends_on: condition: service_healthy` megoldja

### Account lockout feloldás

```bash
docker compose exec mysql mysql -u root -p webhook_db -e \
  "UPDATE users SET login_attempts = 0, locked_until = NULL WHERE username = 'admin';"
```

### Adatbázis backup

```bash
# Backup
docker compose exec mysql mysqldump -u root -p webhook_db > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T mysql mysql -u root -p webhook_db < backup.sql
```

### Szerver újraindítás

```bash
# Teljes stack
docker compose down && docker compose up -d

# Csak az alkalmazás
docker compose restart webhook-server
```

---

## Technológiai stack

| Komponens | Technológia |
|-----------|-------------|
| Backend | Node.js 18+ (Express.js) |
| Adatbázis | MySQL 8.0 |
| Frontend | Vanilla HTML/CSS/JavaScript |
| Auth | JWT + bcrypt + SSO (OAuth2/OIDC) |
| Titkosítás | AES-256-GCM |
| Infrastruktúra | Docker, Docker Compose |
| Nyelv | Magyar lokalizáció |

---

**Verzió:** 2.0
**Állapot:** Production Ready
