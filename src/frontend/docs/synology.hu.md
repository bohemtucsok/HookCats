# Synology NAS Webhook Integráció

## Bevezetés

A Synology NAS webhook integráció lehetővé teszi, hogy automatikus értesítéseket kapj a NAS eszköz eseményeiről közvetlenül a Mattermost vagy Rocket.Chat csapatod chat csatornájába.

## Támogatott Események

* **Rendszer frissítések** - DSM verzió frissítések
* **Tároló státusz** - Lemezek, RAID tömbök változásai
* **Biztonsági riasztások** - Bejelentkezési kísérletek, firewall események
* **Backup státusz** - Hyper Backup és Active Backup állapotok
* **Alkalmazás értesítések** - Download Station, Surveillance Station események
* **Hálózati változások** - IP cím, kapcsolat változások

## Részletes Beállítási Útmutató

### 1. Webhook Forrás Létrehozása

1. **Navigálj a Források oldalra** a HookCats szerveren
2. **Kattints az "Új forrás" gombra**
3. **Add meg az alábbi adatokat:**
   * **Név:** `Synology NAS - [Eszköz neve]`
   * **Típus:** Válaszd ki: `synology`
   * **Láthatóság:** `Személyes` vagy `Csapat` (ha csapat erőforrásként használod)
4. **Mentsd el a forrást**
5. **Másold ki a generált Secret Key-t** - erre később szükséged lesz!

**Példa Secret Key:** `h7k9m2x5p3w8q1z`

**Webhook URL formátum:**
```
https://webhook.yourdomain.com/webhook/{secret_key}
```

### 2. Synology DSM Webhook Beállítása

#### Lépések a DSM Felületen:

1. **Lépj be a Synology DSM felületére** böngészőből
2. **Nyisd meg a Control Panel-t**
3. **Navigálj:** `Control Panel → Notification → Webhook`
4. **Kattints az "Add" gombra**

#### Webhook Konfiguráció:

* **Provider:** `Custom Webhook`
* **Webhook Name:** `HookCats - Mattermost/RocketChat`
* **Webhook URL:**
  ```
  https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z
  ```
  *(Cseréld ki a domain-t és secret_key-t a sajátodra!)*
* **HTTP Method:** `POST`
* **Content Type:** `application/json`

#### Payload Sablon (JSON):

```json
{
  "event_type": "synology_notification",
  "hostname": "@@HOSTNAME@@",
  "timestamp": "@@DATE_TIME@@",
  "category": "@@CATEGORY@@",
  "event": "@@EVENT@@",
  "message": "@@DESCRIPTION@@",
  "severity": "@@SEVERITY@@"
}
```

### 3. Események Kiválasztása

A **Notification** beállításokban válaszd ki az értesítéseket:

#### Ajánlott események:

* ✅ **System:**
  * DSM update available
  * DSM update installed
  * System crash or reboot

* ✅ **Storage:**
  * Volume degraded
  * Disk failure
  * Storage pool warning

* ✅ **Security:**
  * Failed login attempts
  * IP blocked by firewall
  * Certificate expiration warning

* ✅ **Backup:**
  * Backup task completed
  * Backup task failed
  * Version backup restored

### 4. Útvonal (Route) Beállítása

Miután létrehoztad a forrást, **hozz létre egy routing szabályt:**

1. **Navigálj az "Útvonalak" oldalra**
2. **Kattints az "Új útvonal" gombra**
3. **Add meg:**
   * **Forrás:** `Synology NAS - [Eszköz neve]`
   * **Célpont:** Válaszd ki a Mattermost vagy Rocket.Chat célpontot
   * **Üzenet sablon:**

```handlebars
🖥️ **Synology NAS Értesítés**

**Esemény:** {{event}}
**Szerver:** {{hostname}}
**Kategória:** {{category}}
**Idő:** {{timestamp}}

**Leírás:**
{{message}}

**Súlyosság:** {{severity}}
```

### 5. Teszt Értesítés Küldése

1. **Synology DSM-ben** kattints a **"Send Test Notification"** gombra
2. **Ellenőrizd az Események oldalon**, hogy megérkezett-e a teszt webhook
3. **Nézd meg a Mattermost/Rocket.Chat csatornát**, ahol meg kell jelenjen az értesítés

### 6. Hibaelhárítás

#### Ha nem érkeznek értesítések:

1. **Ellenőrizd a Secret Key-t** - pontosan egyezik-e a forrás konfigurációval
2. **Teszteld az URL elérhetőségét:**
   ```bash
   curl -X POST https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z \
     -H "Content-Type: application/json" \
     -d '{"test": "synology_test"}'
   ```
3. **Nézd meg az Események oldalt** - láthatóak-e a bejövő webhook eseménye
4. **Ellenőrizd a Delivery státuszokat** - sikeresen kézbesítésre kerültek-e az üzenetek
5. **Synology log-ok ellenőrzése:**
   * DSM: `Control Panel → Log Center → System`

#### Tipikus hibák:

* **401 Unauthorized:** Hibás Secret Key
* **404 Not Found:** Hibás webhook URL
* **500 Internal Server Error:** Szerver oldali probléma - ellenőrizd a HookCats szerver log-jait

## Példa Üzenet Formátumok

### Biztonsági Esemény:
```
🖥️ **Synology NAS Értesítés**

**Esemény:** Failed Login Attempt
**Szerver:** synology-nas-01
**Kategória:** Security
**Idő:** 2025-10-12 14:32:15

**Leírás:**
User attempted to log in from IP 192.168.1.100 but failed (5 attempts)

**Súlyosság:** High
```

### Storage Esemény:
```
🖥️ **Synology NAS Értesítés**

**Esemény:** Volume Status Change
**Szerver:** synology-nas-01
**Kategória:** Storage
**Idő:** 2025-10-12 10:15:30

**Leírás:**
Volume1 status changed to Degraded - Disk 3 has failed

**Súlyosság:** Critical
```

## Hasznos Tippek

* **Severity alapú szűrés:** Állíts be különböző routing szabályokat severity alapján (critical események külön csatornába)
* **Kategória alapú routing:** Különböző kategóriák (security, storage, backup) külön célpontokra irányítása
* **Emoji használat:** Használj különböző emoji-kat az események típusának vizuális megkülönböztetésére
* **@mention használat:** Critical események esetén használj @channel vagy @here mention-t a Mattermost/Rocket.Chat üzenetekben

## További Információk

* [Synology DSM Documentation](https://www.synology.com/support/documentation)
* [HookCats API Dokumentáció](/api/docs)
* [Mattermost Incoming Webhooks](https://docs.mattermost.com/developer/webhooks-incoming.html)
