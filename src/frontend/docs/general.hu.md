# Általános Webhook Konfiguráció

## Bevezetés

Ez az útmutató részletes információkat tartalmaz a HookCats szerver használatához bármilyen egyedi forrásból történő webhook fogadáshoz és továbbításhoz.

## Webhook Architektúra

A HookCats szerver dinamikus endpoint rendszert használ:

```
[Forrás Rendszer] → [POST /webhook/{secret_key}] → [HookCats]
                                                           ↓
                                                    [Routing Engine]
                                                           ↓
                                         [Mattermost / Rocket.Chat]
```

### Előnyök:

* ✅ **Dinamikus endpoint-ok:** Minden forráshoz egyedi secret_key
* ✅ **Automatikus routing:** Forrás azonosítás secret_key alapján
* ✅ **Retry mechanizmus:** 3 próbálkozás sikertelen kézbesítés esetén
* ✅ **Scope alapú elkülönítés:** Personal és Team erőforrások
* ✅ **Audit trail:** Teljes esemény és kézbesítési napló

## Forrás (Source) Létrehozása

### 1. Forrás Hozzáadása

**Lépések:**

1. Navigálj a **Források** oldalra
2. Kattints az **"Új forrás"** gombra
3. Add meg az adatokat:
   * **Név:** Azonosító név (pl. `GitHub Webhooks`, `Custom API`)
   * **Típus:** Válassz létező típust vagy írd be az egyedit (pl. `github`, `custom`, `api`)
   * **Láthatóság:**
     - `Személyes` - csak te férsz hozzá
     - `Csapat` - csapattagok is látják és kezelhetik
4. **Secret Key automatikusan generálódik** - másold ki biztonságosan!

### 2. Secret Key Kezelése

**Fontos biztonsági szabályok:**

* ❌ **NE** oszd meg nyilvánosan a Secret Key-t
* ❌ **NE** commit-old verziókezelő rendszerbe (Git)
* ✅ **IGEN** használj környezeti változókat (`.env`)
* ✅ **IGEN** tárold biztonságos helyen (password manager)

**Secret Key formátum:**
```
h7k9m2x5p3w8q1z
```
*15 karakter, alfanumerikus, véletlenszerű*

**Teljes webhook URL:**
```
https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z
```

### 3. Scope Beállítása

#### Personal Scope:
* Csak te látod és kezelheted
* Események csak a te naplódban jelennek meg
* Ideális egyéni projektekhez

#### Team Scope:
* Csapattagok látják és kezelhetik
* Események közös csapat naplóban
* Ideális megosztott infrastruktúrához

## Célpont (Target) Létrehozása

### 1. Mattermost Célpont

**Mattermost Incoming Webhook URL beszerzése:**

1. Mattermost felületen: **Main Menu → Integrations**
2. **Incoming Webhooks** → **Add Incoming Webhook**
3. Add meg:
   * **Title:** `HookCats Értesítések`
   * **Description:** `Automatikus webhook továbbítás`
   * **Channel:** Válassz csatornát (pl. `#infrastructure`)
4. Másold ki az **Webhook URL-t**

**Példa URL:**
```
https://mattermost.yourdomain.com/hooks/abc123def456ghi789
```

**HookCats szerveren célpont létrehozása:**

1. Navigálj a **Célpontok** oldalra
2. **"Új célpont"** gomb
3. Add meg:
   * **Név:** `Mattermost - Infrastructure`
   * **Típus:** `mattermost`
   * **Webhook URL:** *(illeszd be a Mattermost URL-t)*
   * **Láthatóság:** `Személyes` vagy `Csapat`

### 2. Rocket.Chat Célpont

**Rocket.Chat Incoming Webhook URL beszerzése:**

1. Rocket.Chat: **Administration → Integrations**
2. **New Integration → Incoming WebHook**
3. Állítsd be:
   * **Enabled:** `True`
   * **Name:** `HookCats`
   * **Post to Channel:** `#infrastructure`
   * **Post as:** `webhook-bot`
4. **Save** → másold ki a **Webhook URL-t**

**Példa URL:**
```
https://rocketchat.yourdomain.com/hooks/ABC123/DEF456GHI789
```

**HookCats szerveren:**

Ugyanúgy hozd létre, mint a Mattermost célpontot, de válaszd a `rocketchat` típust.

## Routing (Útvonal) Konfiguráció

### 1. Routing Szabály Létrehozása

**Routing szabály:** Meghatározza, hogy egy forrásból érkező webhook melyik célpontokra kerüljön továbbításra.

**Lépések:**

1. Navigálj az **Útvonalak** oldalra
2. **"Új útvonal"** gomb
3. Add meg:
   * **Forrás:** Válaszd ki a forrást
   * **Célpont:** Válaszd ki a célpontot
   * **Láthatóság:** `Személyes` vagy `Csapat`
   * **Üzenet sablon:** Handlebars formátumú sablon

### 2. Üzenet Sablon (Message Template)

A HookCats szerver **Handlebars** template engine-t használ.

#### Alapvető Sablon:

```handlebars
**Webhook Értesítés**

**Forrás:** {{source_name}}
**Idő:** {{timestamp}}

{{#if event_type}}
**Esemény:** {{event_type}}
{{/if}}

**Adat:**
```json
{{payload_json}}
```
```

#### Handlebars Helper-ek:

**Feltételes megjelenítés:**
```handlebars
{{#if variable}}
  Ez csak akkor jelenik meg, ha variable létezik
{{/if}}

{{#unless variable}}
  Ez akkor jelenik meg, ha variable NEM létezik
{{/unless}}
```

**Loop-ok (tömbök):**
```handlebars
{{#each items}}
  - {{this.name}}: {{this.value}}
{{/each}}
```

**Változók:**
```handlebars
{{variable_name}}
{{nested.object.property}}
{{array.[0]}}
```

### 3. Példa Sablonok

#### GitHub Webhook Sablon:

```handlebars
🔔 **GitHub Webhook**

**Repository:** {{repository.name}}
**Event:** {{event_type}}
**Author:** {{sender.login}}
**Time:** {{created_at}}

{{#if commits}}
**Commits:**
{{#each commits}}
  - `{{id}}` - {{message}} ({{author.name}})
{{/each}}
{{/if}}

{{#if pull_request}}
**Pull Request:** #{{pull_request.number}} - {{pull_request.title}}
**State:** {{pull_request.state}}
{{/if}}

[View on GitHub]({{repository.html_url}})
```

#### Docker Hub Webhook Sablon:

```handlebars
🐳 **Docker Hub Webhook**

**Repository:** {{repository.repo_name}}
**Event:** {{push_data.tag}}
**Pushed by:** {{push_data.pusher}}
**Time:** {{push_data.pushed_at}}

**Image:** `{{repository.repo_name}}:{{push_data.tag}}`

[View on Docker Hub]({{repository.repo_url}})
```

#### Generic API Webhook Sablon:

```handlebars
📡 **API Webhook Értesítés**

**Source:** {{source_name}}
**Timestamp:** {{timestamp}}

{{#if status}}
**Status:** {{status}}
{{/if}}

{{#if message}}
**Message:**
{{message}}
{{/if}}

**Raw Data:**
```json
{{payload_json}}
```
```

## Webhook Payload Formátumok

### JSON Payload (application/json)

**Példa küldés curl-lel:**

```bash
curl -X POST https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "deployment",
    "status": "success",
    "service": "web-api",
    "version": "v2.1.0",
    "timestamp": "2025-10-12T14:30:00Z",
    "details": {
      "deployed_by": "john.doe",
      "environment": "production",
      "duration": "45s"
    }
  }'
```

### Form Data Payload (application/x-www-form-urlencoded)

**Példa küldés curl-lel:**

```bash
curl -X POST https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z \
  -d "event_type=deployment" \
  -d "status=success" \
  -d "service=web-api" \
  -d "version=v2.1.0"
```

**Sablon használata form-data esetén:**

```handlebars
**Deployment Értesítés**

**Service:** {{service}}
**Version:** {{version}}
**Status:** {{status}}
**Event:** {{event_type}}
```

## HTTP Headers és Security

### Authentikáció

A HookCats szerver **secret_key alapú authentikációt** használ az URL-ben:

```
POST /webhook/{secret_key}
```

**Nincs szükség további header-ekre**, de opcionálisan küldhetők:

```bash
curl -X POST https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z \
  -H "Content-Type: application/json" \
  -H "User-Agent: MyApp/1.0" \
  -H "X-Custom-Header: custom-value" \
  -d '{"event": "test"}'
```

### HMAC Signature (opcionális)

Ha a forrás támogatja HMAC signature-t:

**GitHub példa:**

```javascript
const crypto = require('crypto');

const payload = JSON.stringify(webhookData);
const secret = 'your-webhook-secret';
const signature = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

// Header küldése:
// X-Hub-Signature-256: sha256=<signature>
```

## Monitoring és Debugging

### 1. Események (Events) Oldal

**Mit látsz:**
* Összes fogadott webhook
* Timestamp
* Forrás információk
* Raw payload (JSON)
* Processing státusz

**Hasznos szűrések:**
* Forrás szerint
* Időintervallum szerint
* Scope szerint (personal/team)

### 2. Kézbesítések (Deliveries) Oldal

**Mit látsz:**
* Kézbesítési státuszok (success/failed/pending)
* Retry próbálkozások száma
* Hiba üzenetek (ha sikertelen)
* Response időzítések

**Státuszok:**

* ✅ **Success:** Sikeresen kézbesítve
* ❌ **Failed:** Végleg sikertelen (3 próbálkozás után)
* ⏳ **Pending:** Folyamatban (retry)

### 3. Teszt Kézbesítés

**Manuális teszt üzenet küldése:**

1. Navigálj a **Célpontok** oldalra
2. Válassz egy célpontot
3. Kattints a **"Teszt küldés"** gombra
4. Ellenőrizd a Mattermost/Rocket.Chat csatornát

## Hibaelhárítás

### Gyakori problémák és megoldások:

#### 1. **404 Not Found**

**Ok:** Hibás webhook URL vagy secret_key

**Megoldás:**
* Ellenőrizd a secret_key pontosságát
* Ellenőrizd a domain és port beállításokat
* Teszt:
  ```bash
  curl -I https://webhook.yourdomain.com/webhook/YOUR_SECRET_KEY
  ```

#### 2. **401 Unauthorized**

**Ok:** Invalid vagy expired secret_key

**Megoldás:**
* Ellenőrizd, hogy a forrás aktív-e
* Generálj új secret_key-t ha szükséges

#### 3. **500 Internal Server Error**

**Ok:** Szerver oldali hiba (routing, template, database)

**Megoldás:**
* Ellenőrizd az **Események** oldalon a payload formátumot
* Nézd meg a szerver log-okat:
  ```bash
  docker-compose logs webhook-server
  ```

#### 4. **Üzenet nem érkezik meg a célpont csatornára**

**Ok:** Routing hiba, invalid target URL, template hiba

**Megoldás:**
* Ellenőrizd a **Kézbesítések** oldalon a delivery státuszt
* Teszteld a target URL-t manuálisan:
  ```bash
  curl -X POST https://mattermost.yourdomain.com/hooks/YOUR_HOOK \
    -H "Content-Type: application/json" \
    -d '{"text": "Test message"}'
  ```
* Ellenőrizd a message template szintaxisát

#### 5. **Template rendering hiba**

**Ok:** Hibás Handlebars szintaxis vagy hiányzó változók

**Megoldás:**
* Használj `{{#if}}` feltételt minden opcionális változónál
* Teszteld a template-et különböző payload-okkal
* Ellenőrizd a payload struktúrát az **Események** oldalon

## Best Practices

### 1. Naming Conventions

**Források:**
* `[Platform] - [Environment] - [Instance]`
* Példa: `Synology - Production - NAS-01`

**Célpontok:**
* `[Chat Platform] - [Channel Purpose]`
* Példa: `Mattermost - Infrastructure Alerts`

**Útvonalak:**
* `[Source Name] → [Target Name]`
* Példa: `GitHub Production → Mattermost Development`

### 2. Scope Stratégia

**Personal Scope használata:**
* Egyéni fejlesztési környezetek
* Teszt webhook-ok
* Személyes monitoring

**Team Scope használata:**
* Production infrastruktúra
* Megosztott szolgáltatások
* Csapat szintű értesítések

### 3. Security Guidelines

✅ **Kövesd ezeket:**
* Használj HTTPS-t minden webhook URL-nél
* Tárold biztonságosan a secret_key-eket
* Használj erős, egyedi secret_key-eket minden forráshoz
* Rendszeresen ellenőrizd a nem használt forrásokat és töröld őket
* Használj team scope-ot megosztott erőforrásokhoz megfelelő jogosultság kezeléssel

❌ **Kerüld ezeket:**
* HTTP használata production környezetben
* Secret_key-ek megosztása nyilvános repository-kban
* Ugyanazon secret_key használata több forráshoz
* Inaktív források aktív hagyása

### 4. Template Optimization

**Tömör üzenetek:**
* Csak a legfontosabb információkat jelenítsd meg
* Használj emoji-kat vizuális jelölésekhez
* Használj markdown formázást az olvashatósághoz

**Linkelés:**
* Mindig adj meg link-eket további részletekhez
* Használj rövid, leíró link szövegeket

**Példa optimalizált sablon:**

```handlebars
{{#if status equals "error"}}🔴{{else}}✅{{/if}} **{{service}} Deployment**

**Version:** `{{version}}` | **Env:** {{environment}} | **By:** {{deployed_by}}

{{#if status equals "error"}}
❌ **Error:** {{error_message}}
{{else}}
✅ Deployment successful in {{duration}}
{{/if}}

[View Logs]({{logs_url}})
```

## Példa Integrációk

### 1. GitHub Actions Webhook

**GitHub Actions workflow:**

```yaml
name: Deploy Notification

on:
  deployment_status:

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Send Webhook
        run: |
          curl -X POST ${{ secrets.WEBHOOK_URL }} \
            -H "Content-Type: application/json" \
            -d '{
              "event_type": "github_deployment",
              "status": "${{ github.event.deployment_status.state }}",
              "environment": "${{ github.event.deployment.environment }}",
              "repository": "${{ github.repository }}",
              "commit": "${{ github.sha }}",
              "actor": "${{ github.actor }}"
            }'
```

### 2. Jenkins Pipeline Webhook

**Jenkinsfile:**

```groovy
pipeline {
    agent any

    stages {
        stage('Deploy') {
            steps {
                // Deployment steps...
            }
        }
    }

    post {
        always {
            script {
                def webhookUrl = "${env.WEBHOOK_URL}"
                def payload = """
                {
                    "event_type": "jenkins_build",
                    "status": "${currentBuild.result}",
                    "job": "${env.JOB_NAME}",
                    "build_number": "${env.BUILD_NUMBER}",
                    "duration": "${currentBuild.durationString}"
                }
                """

                sh "curl -X POST ${webhookUrl} -H 'Content-Type: application/json' -d '${payload}'"
            }
        }
    }
}
```

### 3. Python Script Webhook

**Python példa:**

```python
import requests
import json
from datetime import datetime

WEBHOOK_URL = "https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z"

def send_webhook(event_type, data):
    payload = {
        "event_type": event_type,
        "timestamp": datetime.now().isoformat(),
        "data": data
    }

    try:
        response = requests.post(
            WEBHOOK_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=5
        )
        response.raise_for_status()
        print(f"Webhook sent successfully: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"Webhook error: {e}")

# Használat:
send_webhook("script_completed", {
    "script": "data_processing.py",
    "status": "success",
    "records_processed": 1543
})
```

## További Információk

* [HookCats API Dokumentáció](/api/docs)
* [Handlebars Template Guide](https://handlebarsjs.com/guide/)
* [Mattermost Webhook Documentation](https://docs.mattermost.com/developer/webhooks-incoming.html)
* [Rocket.Chat Webhook Documentation](https://docs.rocket.chat/use-rocket.chat/workspace-administration/integrations)
