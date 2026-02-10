# Proxmox VE Webhook Integration

## Introduction

The Proxmox VE webhook integration allows you to receive automatic notifications about virtualization platform events -- VM status changes, backup results, cluster events -- directly in your team's chat channel.

## Supported Events

* **VM/LXC operations** - Start, stop, migrate, backup
* **Cluster events** - Node join/leave, quorum changes
* **Storage events** - Disk usage, snapshot operations
* **Backup operations** - VZDump successful/failed backups
* **Resource alerts** - CPU, RAM, disk usage alerts
* **HA events** - High Availability status changes

## Detailed Setup Guide

### 1. Creating a Webhook Source

1. **Navigate to the Sources page** on the HookCats server
2. **Click the "New Source" button**
3. **Fill in the following details:**
   * **Name:** `Proxmox VE - [Cluster/Node name]`
   * **Type:** Select: `proxmox`
   * **Visibility:** `Personal` or `Team`
4. **Save the source**
5. **Copy the generated Secret Key**

**Example Secret Key:** `n4p8w6z2m7k5x3q`

**Webhook URL format:**
```
https://webhook.yourdomain.com/webhook/{secret_key}
```

### 2. Proxmox Webhook Notification Setup

#### Prerequisites:

* Root or admin privileges on the Proxmox server
* SSH access
* `curl` or `wget` installed (present by default)

#### Method 1: Webhook Notification Script (Recommended)

Create a webhook notification script on the Proxmox server:

```bash
# Connect to the Proxmox server via SSH
ssh root@proxmox.yourdomain.com

# Create the webhook script
nano /usr/local/bin/webhook-notify.sh
```

**Script contents:**

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

**Set permissions:**

```bash
chmod +x /usr/local/bin/webhook-notify.sh
```

#### Method 2: Proxmox Notification Target (PVE 8.0+)

Available in Proxmox VE 8.0+ versions:

```bash
# Notification target hozzáadása
pvesh create /cluster/notifications/endpoints/webhook/webhook-mattermost \
  --url "https://webhook.yourdomain.com/webhook/n4p8w6z2m7k5x3q" \
  --method POST
```

### 3. VM/LXC Backup Hook Integration

#### VZDump Hook Script:

Automatic notifications for Proxmox VZDump (backup) operations:

```bash
# Hook script létrehozása
nano /etc/vzdump/webhook-hook.sh
```

**Hook script contents:**

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

**Permissions and integration:**

```bash
chmod +x /etc/vzdump/webhook-hook.sh

# Backup job konfigurációban hook hozzáadása:
# GUI: Datacenter → Backup → Edit Job → Script (tab)
# CLI: vzdump hook
```

### 4. HA Manager Hook Integration

Monitoring High Availability events:

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

### 5. Cron-Based Monitoring Notifications

Regular status checks with webhook notifications:

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

**Add cron job:**

```bash
# Crontab szerkesztés
crontab -e

# Storage ellenőrzés óránként
0 * * * * /usr/local/bin/proxmox-storage-monitor.sh
```

### 6. Route Setup

Create a routing rule on the HookCats server:

1. **Navigate to the "Routes" page**
2. **Click the "New Route" button**
3. **Fill in:**
   * **Source:** `Proxmox VE - [Cluster/Node name]`
   * **Target:** Select the Mattermost or Rocket.Chat target
   * **Message template:**

#### General Proxmox Template:

```handlebars
🖧 **Proxmox VE Notification**

**Event:** {{event_type}}
**Server:** {{hostname}}
**Time:** {{timestamp}}

{{#if vm_name}}
**VM:** {{vm_name}} (ID: {{vm_id}})
{{/if}}

{{#if status}}
**Status:** {{status}}
{{/if}}

{{#if message}}
**Message:**
{{message}}
{{/if}}
```

#### Backup-Specific Template:

```handlebars
💾 **Proxmox Backup Notification**

**VM ID:** {{vm_id}}
**Mode:** {{mode}}
**Status:** {{status}}
**Server:** {{hostname}}
**Time:** {{timestamp}}

{{#if backup_file}}
**Backup file:** {{backup_file}}
{{/if}}

{{#if severity}}
**Severity:** {{severity}}
{{/if}}
```

### 7. Sending a Test Webhook

Manual test webhook delivery:

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

**Verification:**
1. Webhook server **Events** page - check if the test event is visible
2. **Deliveries** page - confirm successful delivery
3. Mattermost/Rocket.Chat channel - verify that the message appeared

### 8. Troubleshooting

#### Testing the webhook script:

```bash
# Manual script futtatás tesztként
/usr/local/bin/webhook-notify.sh "vm_start" "100" "test-vm" "running" "VM started successfully"
```

#### Checking logs:

```bash
# Proxmox cluster log
tail -f /var/log/pve/tasks/active

# Backup log
tail -f /var/log/vzdump.log
```

#### Network connectivity test:

```bash
# Webhook szerver elérhetőség
ping webhook.yourdomain.com

# HTTPS kapcsolat teszt
curl -I https://webhook.yourdomain.com
```

#### Common errors:

* **Connection refused:** Firewall is blocking outgoing traffic on port 443
* **SSL certificate error:** Self-signed certificate -- use the `--insecure` flag with curl (development only)
* **401 Unauthorized:** Invalid Secret Key
* **Script not running:** Permission issue -- verify that `chmod +x` has been applied

## Example Message Formats

### VM Start Event:
```
🖧 **Proxmox VE Notification**

**Event:** vm_start
**Server:** pve-node1
**Time:** 2025-10-12 14:30:15

**VM:** web-server-01 (ID: 100)

**Status:** running

**Message:**
VM successfully started
```

### Backup Successful:
```
💾 **Proxmox Backup Notification**

**VM ID:** 105
**Mode:** snapshot
**Status:** success
**Server:** pve-node1
**Time:** 2025-10-12 02:15:45

**Backup file:** /backup/vzdump-qemu-105-2025_10_12-02_15_45.vma.zst

**Severity:** info
```

### Storage Alert:
```
⚠️ **Proxmox Storage Alert**

**Event:** proxmox_storage_alert
**Server:** pve-node1
**Time:** 2025-10-12 10:00:00

**Threshold:** 80%

**High-usage storages:**
- local-lvm: 85%
- backup-nfs: 92%
```

## Useful Tips

* **Centralized webhook script:** Create a centralized notification library that all hook scripts can use
* **Event severity:** Use severity levels (info, warning, error, critical) and set up routing based on them
* **Webhook timeout:** Set a short timeout in curl (`--max-time 5`) so it doesn't block Proxmox operations
* **Retry mechanism:** The HookCats server provides automatic retries (3 attempts)
* **Cluster setup:** For multi-node clusters, configure the webhook scripts on every node

## Additional Resources

* [Proxmox VE Documentation](https://pve.proxmox.com/pve-docs/)
* [HookCats API Documentation](/api/docs)
* [VZDump Hooks](https://pve.proxmox.com/wiki/VZDump)
