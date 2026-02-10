# Synology NAS Webhook Integration

## Introduction

The Synology NAS webhook integration allows you to receive automatic notifications about your NAS device events directly in your Mattermost or Rocket.Chat team chat channel.

## Supported Events

* **System updates** - DSM version updates
* **Storage status** - Disk and RAID array changes
* **Security alerts** - Login attempts, firewall events
* **Backup status** - Hyper Backup and Active Backup states
* **Application notifications** - Download Station, Surveillance Station events
* **Network changes** - IP address and connection changes

## Detailed Setup Guide

### 1. Creating a Webhook Source

1. **Navigate to the Sources page** on the HookCats server
2. **Click the "New Source" button**
3. **Fill in the following details:**
   * **Name:** `Synology NAS - [Device name]`
   * **Type:** Select: `synology`
   * **Visibility:** `Personal` or `Team` (if using as a team resource)
4. **Save the source**
5. **Copy the generated Secret Key** - you will need this later!

**Example Secret Key:** `h7k9m2x5p3w8q1z`

**Webhook URL format:**
```
https://webhook.yourdomain.com/webhook/{secret_key}
```

### 2. Synology DSM Webhook Configuration

#### Steps in the DSM Interface:

1. **Log in to the Synology DSM interface** from your browser
2. **Open the Control Panel**
3. **Navigate to:** `Control Panel → Notification → Webhook`
4. **Click the "Add" button**

#### Webhook Configuration:

* **Provider:** `Custom Webhook`
* **Webhook Name:** `HookCats - Mattermost/RocketChat`
* **Webhook URL:**
  ```
  https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z
  ```
  *(Replace the domain and secret_key with your own!)*
* **HTTP Method:** `POST`
* **Content Type:** `application/json`

#### Payload Template (JSON):

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

### 3. Selecting Events

In the **Notification** settings, select the notifications you want to receive:

#### Recommended events:

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

### 4. Route Setup

After creating the source, **create a routing rule:**

1. **Navigate to the "Routes" page**
2. **Click the "New Route" button**
3. **Fill in:**
   * **Source:** `Synology NAS - [Device name]`
   * **Target:** Select your Mattermost or Rocket.Chat target
   * **Message template:**

```handlebars
🖥️ **Synology NAS Notification**

**Event:** {{event}}
**Server:** {{hostname}}
**Category:** {{category}}
**Time:** {{timestamp}}

**Description:**
{{message}}

**Severity:** {{severity}}
```

### 5. Sending a Test Notification

1. **In Synology DSM**, click the **"Send Test Notification"** button
2. **Check the Events page** to verify the test webhook was received
3. **Check your Mattermost/Rocket.Chat channel** where the notification should appear

### 6. Troubleshooting

#### If notifications are not arriving:

1. **Verify the Secret Key** - make sure it matches the source configuration exactly
2. **Test the URL reachability:**
   ```bash
   curl -X POST https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z \
     -H "Content-Type: application/json" \
     -d '{"test": "synology_test"}'
   ```
3. **Check the Events page** - see if incoming webhook events are visible
4. **Check Delivery statuses** - verify whether the messages were delivered successfully
5. **Check Synology logs:**
   * DSM: `Control Panel → Log Center → System`

#### Common errors:

* **401 Unauthorized:** Invalid Secret Key
* **404 Not Found:** Incorrect webhook URL
* **500 Internal Server Error:** Server-side issue - check the HookCats server logs

## Example Message Formats

### Security Event:
```
🖥️ **Synology NAS Notification**

**Event:** Failed Login Attempt
**Server:** synology-nas-01
**Category:** Security
**Time:** 2025-10-12 14:32:15

**Description:**
User attempted to log in from IP 192.168.1.100 but failed (5 attempts)

**Severity:** High
```

### Storage Event:
```
🖥️ **Synology NAS Notification**

**Event:** Volume Status Change
**Server:** synology-nas-01
**Category:** Storage
**Time:** 2025-10-12 10:15:30

**Description:**
Volume1 status changed to Degraded - Disk 3 has failed

**Severity:** Critical
```

## Useful Tips

* **Severity-based filtering:** Set up different routing rules based on severity (route critical events to a separate channel)
* **Category-based routing:** Direct different categories (security, storage, backup) to separate targets
* **Emoji usage:** Use different emojis to visually distinguish between event types
* **@mention usage:** For critical events, use @channel or @here mentions in Mattermost/Rocket.Chat messages

## Additional Information

* [Synology DSM Documentation](https://www.synology.com/support/documentation)
* [HookCats API Documentation](/api/docs)
* [Mattermost Incoming Webhooks](https://docs.mattermost.com/developer/webhooks-incoming.html)
