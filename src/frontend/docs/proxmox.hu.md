# Proxmox VE Webhook Integráció

## Bevezetés

A Proxmox VE webhook integráció lehetővé teszi, hogy automatikus értesítéseket kapj a virtualizációs platform eseményeiről - VM státusz változások, backup eredmények, cluster események - közvetlenül a csapatod chat csatornájába.

## Támogatott Események

* **VM/LXC műveletek** - Start, stop, migrate, backup
* **Cluster események** - Node join/leave, quorum changes
* **Storage események** - Disk usage, snapshot operations
* **Backup műveletek** - VZDump sikeres/sikertelen backupok
* **Resource alerts** - CPU, RAM, disk használat riasztások
* **HA események** - High Availability státusz változások

## Részletes Beállítási Útmutató

### 1. Webhook Forrás Létrehozása

1. **Navigálj a Források oldalra** a HookCats szerveren
2. **Kattints az "Új forrás" gombra**
3. **Add meg az alábbi adatokat:**
   * **Név:** `Proxmox VE - [Cluster/Node neve]`
   * **Típus:** Válaszd ki: `proxmox`
   * **Láthatóság:** `Személyes` vagy `Csapat`
4. **Mentsd el a forrást**
5. **Másold ki a generált Secret Key-t**

**Példa Secret Key:** `n4p8w6z2m7k5x3q`

**Webhook URL formátum:**
```
https://webhook.yourdomain.com/webhook/{secret_key}
```

### 2. Proxmox Webhook Notification Setup

#### Előfeltételek:

* Root vagy admin jogosultság Proxmox szerveren
* SSH hozzáférés
* `curl` vagy `wget` telepítve (alapértelmezetten jelen van)

#### Módszer 1: Webhook Notification Script (Ajánlott)

Készíts egy webhook notification script-et Proxmox szerveren:

```bash
# SSH kapcsolódás Proxmox szerverhez
ssh root@proxmox.yourdomain.com

# Webhook script létrehozása
nano /usr/local/bin/webhook-notify.sh
```

**Script tartalma:**

```bash
#!/bin/bash

# Webhook szerver URL
WEBHOOK_URL="https://webhook.yourdomain.com/webhook/n4p8w6z2m7k5x3q"

# Paraméterek
EVENT_TYPE="${1:-unknown}"
VM_ID="${2:-N/A}"
VM_NAME="${3:-N/A}"
STATUS="${4:-N/A}"
MESSAGE="${5:-No message provided}"
HOSTNAME=$(hostname)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# JSON payload készítése
PAYLOAD=$(cat <<EOF
{
  "event_type": "$EVENT_TYPE",
  "vm_id": "$VM_ID",
  "vm_name": "$VM_NAME",
  "status": "$STATUS",
  "message": "$MESSAGE",
  "hostname": "$HOSTNAME",
  "timestamp": "$TIMESTAMP"
}
EOF
)

# Webhook küldés
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --silent --show-error

exit 0
```

**Jogosultságok beállítása:**

```bash
chmod +x /usr/local/bin/webhook-notify.sh
```

#### Módszer 2: Proxmox Notification Target (PVE 8.0+)

Proxmox VE 8.0+ verzióban használható:

```bash
# Notification target hozzáadása
pvesh create /cluster/notifications/endpoints/webhook/webhook-mattermost \
  --url "https://webhook.yourdomain.com/webhook/n4p8w6z2m7k5x3q" \
  --method POST
```

### 3. VM/LXC Backup Hook Integráció

#### VZDump Hook Script:

Proxmox VZDump (backup) műveletekhez automatikus értesítések:

```bash
# Hook script létrehozása
nano /etc/vzdump/webhook-hook.sh
```

**Hook script tartalma:**

```bash
#!/bin/bash

WEBHOOK_URL="https://webhook.yourdomain.com/webhook/n4p8w6z2m7k5x3q"

# VZDump környezeti változók
PHASE="$1"
MODE="$2"
VMID="$3"
BACKUP_FILE="$4"
TARGET_DIR="$5"
TARFILE="$6"
LOGFILE="$7"
HOSTNAME=$(hostname)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Csak log-end fázisnál küldünk értesítést (backup végeztével)
if [ "$PHASE" == "log-end" ]; then
  # Backup státusz meghatározása
  if grep -q "ERROR" "$LOGFILE"; then
    STATUS="failed"
    SEVERITY="error"
  else
    STATUS="success"
    SEVERITY="info"
  fi

  # JSON payload
  PAYLOAD=$(cat <<EOF
{
  "event_type": "proxmox_backup",
  "vm_id": "$VMID",
  "mode": "$MODE",
  "status": "$STATUS",
  "severity": "$SEVERITY",
  "backup_file": "$BACKUP_FILE",
  "target_dir": "$TARGET_DIR",
  "hostname": "$HOSTNAME",
  "timestamp": "$TIMESTAMP",
  "log_file": "$LOGFILE"
}
EOF
)

  # Webhook küldés
  curl -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --silent --show-error
fi

exit 0
```

**Jogosultságok és integráció:**

```bash
chmod +x /etc/vzdump/webhook-hook.sh

# Backup job konfigurációban hook hozzáadása:
# GUI: Datacenter → Backup → Edit Job → Script (tab)
# CLI: vzdump hook
```

### 4. HA Manager Hook Integráció

High Availability események figyelése:

```bash
# HA manager hook
nano /etc/pve/ha/webhook-ha-hook.sh
```

**HA Hook script:**

```bash
#!/bin/bash

WEBHOOK_URL="https://webhook.yourdomain.com/webhook/n4p8w6z2m7k5x3q"

EVENT="$1"
RESOURCE="$2"
STATE="$3"
NODE="$4"
HOSTNAME=$(hostname)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

PAYLOAD=$(cat <<EOF
{
  "event_type": "proxmox_ha",
  "event": "$EVENT",
  "resource": "$RESOURCE",
  "state": "$STATE",
  "node": "$NODE",
  "hostname": "$HOSTNAME",
  "timestamp": "$TIMESTAMP"
}
EOF
)

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --silent --show-error

exit 0
```

### 5. Cron-alapú Monitoring Értesítések

Rendszeres státusz ellenőrzések webhook értesítéssel:

```bash
# Storage használat monitoring
nano /usr/local/bin/proxmox-storage-monitor.sh
```

**Storage Monitor Script:**

```bash
#!/bin/bash

WEBHOOK_URL="https://webhook.yourdomain.com/webhook/n4p8w6z2m7k5x3q"
THRESHOLD=80  # Storage használat riasztási küszöb (%)

HOSTNAME=$(hostname)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Storage használat lekérdezése
STORAGE_INFO=$(pvesm status --content images | tail -n +2 | while read line; do
  NAME=$(echo $line | awk '{print $1}')
  USED=$(echo $line | awk '{print $5}' | sed 's/%//')

  if [ "$USED" -gt "$THRESHOLD" ]; then
    echo "{\"storage\": \"$NAME\", \"usage\": $USED}"
  fi
done)

# Ha van magas használatú storage
if [ ! -z "$STORAGE_INFO" ]; then
  PAYLOAD=$(cat <<EOF
{
  "event_type": "proxmox_storage_alert",
  "hostname": "$HOSTNAME",
  "timestamp": "$TIMESTAMP",
  "threshold": $THRESHOLD,
  "storages": [$STORAGE_INFO]
}
EOF
)

  curl -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --silent --show-error
fi
```

**Cron job hozzáadása:**

```bash
# Crontab szerkesztés
crontab -e

# Storage ellenőrzés óránként
0 * * * * /usr/local/bin/proxmox-storage-monitor.sh
```

### 6. Útvonal (Route) Beállítása

HookCats szerveren hozz létre routing szabályt:

1. **Navigálj az "Útvonalak" oldalra**
2. **Kattints az "Új útvonal" gombra**
3. **Add meg:**
   * **Forrás:** `Proxmox VE - [Cluster/Node neve]`
   * **Célpont:** Válaszd ki a Mattermost vagy Rocket.Chat célpontot
   * **Üzenet sablon:**

#### Általános Proxmox Sablon:

```handlebars
🖧 **Proxmox VE Értesítés**

**Esemény:** {{event_type}}
**Szerver:** {{hostname}}
**Idő:** {{timestamp}}

{{#if vm_name}}
**VM:** {{vm_name}} (ID: {{vm_id}})
{{/if}}

{{#if status}}
**Státusz:** {{status}}
{{/if}}

{{#if message}}
**Üzenet:**
{{message}}
{{/if}}
```

#### Backup Specifikus Sablon:

```handlebars
💾 **Proxmox Backup Értesítés**

**VM ID:** {{vm_id}}
**Mode:** {{mode}}
**Státusz:** {{status}}
**Szerver:** {{hostname}}
**Idő:** {{timestamp}}

{{#if backup_file}}
**Backup fájl:** {{backup_file}}
{{/if}}

{{#if severity}}
**Súlyosság:** {{severity}}
{{/if}}
```

### 7. Teszt Webhook Küldése

Manual teszt webhook küldés:

```bash
# Teszt webhook
curl -X POST https://webhook.yourdomain.com/webhook/n4p8w6z2m7k5x3q \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "proxmox_test",
    "vm_id": "100",
    "vm_name": "test-vm",
    "status": "running",
    "message": "Test webhook from Proxmox VE",
    "hostname": "pve-node1",
    "timestamp": "2025-10-12 15:45:00"
  }'
```

**Ellenőrzés:**
1. Webhook szerver **Események** oldal - látható-e a teszt esemény
2. **Deliveries** oldal - sikeres kézbesítés
3. Mattermost/Rocket.Chat csatorna - üzenet megjelent

### 8. Hibaelhárítás

#### Webhook script tesztelés:

```bash
# Manual script futtatás tesztként
/usr/local/bin/webhook-notify.sh "vm_start" "100" "test-vm" "running" "VM started successfully"
```

#### Log ellenőrzés:

```bash
# Proxmox cluster log
tail -f /var/log/pve/tasks/active

# Backup log
tail -f /var/log/vzdump.log
```

#### Hálózati kapcsolat teszt:

```bash
# Webhook szerver elérhetőség
ping webhook.yourdomain.com

# HTTPS kapcsolat teszt
curl -I https://webhook.yourdomain.com
```

#### Tipikus hibák:

* **Connection refused:** Tűzfal blokkolja a kimenő 443-as portot
* **SSL certificate error:** Self-signed certificate - használj `--insecure` flag-et curl-ben (development)
* **401 Unauthorized:** Hibás Secret Key
* **Script nem fut:** Jogosultság probléma - ellenőrizd `chmod +x` végrehajtva-e

## Példa Üzenet Formátumok

### VM Start Esemény:
```
🖧 **Proxmox VE Értesítés**

**Esemény:** vm_start
**Szerver:** pve-node1
**Idő:** 2025-10-12 14:30:15

**VM:** web-server-01 (ID: 100)

**Státusz:** running

**Üzenet:**
VM successfully started
```

### Backup Sikeres:
```
💾 **Proxmox Backup Értesítés**

**VM ID:** 105
**Mode:** snapshot
**Státusz:** success
**Szerver:** pve-node1
**Idő:** 2025-10-12 02:15:45

**Backup fájl:** /backup/vzdump-qemu-105-2025_10_12-02_15_45.vma.zst

**Súlyosság:** info
```

### Storage Alert:
```
⚠️ **Proxmox Storage Riasztás**

**Esemény:** proxmox_storage_alert
**Szerver:** pve-node1
**Idő:** 2025-10-12 10:00:00

**Threshold:** 80%

**Magas használatú storage-ok:**
- local-lvm: 85%
- backup-nfs: 92%
```

## Hasznos Tippek

* **Központi webhook script:** Készíts egy központi notification library-t, amit minden hook script használ
* **Event severity:** Használj severity szinteket (info, warning, error, critical) és azok alapján routing
* **Webhook timeout:** Állíts be rövid timeout-ot curl-ben (`--max-time 5`) hogy ne blokkolja a Proxmox műveleteket
* **Retry mechanizmus:** A HookCats szerver automatikus retry-t biztosít (3 próbálkozás)
* **Cluster setup:** Multi-node cluster esetén minden node-on állítsd be a webhook script-eket

## További Információk

* [Proxmox VE Documentation](https://pve.proxmox.com/pve-docs/)
* [HookCats API Dokumentáció](/api/docs)
* [VZDump Hooks](https://pve.proxmox.com/wiki/VZDump)
