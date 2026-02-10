# General Webhook Configuration

## Introduction

This guide provides detailed information on using the HookCats server to receive and forward webhooks from any custom source.

## Webhook Architecture

The HookCats server uses a dynamic endpoint system:

```
[Source System] → [POST /webhook/{secret_key}] → [HookCats]
                                                           ↓
                                                    [Routing Engine]
                                                           ↓
                                         [Mattermost / Rocket.Chat]
```

### Benefits:

* ✅ **Dynamic endpoints:** Unique secret_key for each source
* ✅ **Automatic routing:** Source identification based on secret_key
* ✅ **Retry mechanism:** 3 attempts on failed delivery
* ✅ **Scope-based isolation:** Personal and Team resources
* ✅ **Audit trail:** Complete event and delivery log

## Creating a Source

### 1. Adding a Source

**Steps:**

1. Navigate to the **Sources** page
2. Click the **"New Source"** button
3. Fill in the details:
   * **Name:** Identifier name (e.g. `GitHub Webhooks`, `Custom API`)
   * **Type:** Choose an existing type or enter a custom one (e.g. `github`, `custom`, `api`)
   * **Visibility:**
     - `Personal` - only you have access
     - `Team` - team members can also view and manage it
4. **Secret Key is generated automatically** - copy it and store it securely!

### 2. Secret Key Management

**Important security rules:**

* ❌ **DO NOT** share the Secret Key publicly
* ❌ **DO NOT** commit it to version control (Git)
* ✅ **DO** use environment variables (`.env`)
* ✅ **DO** store it in a secure location (password manager)

**Secret Key format:**
```
h7k9m2x5p3w8q1z
```
*15 characters, alphanumeric, randomly generated*

**Full webhook URL:**
```
https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z
```

### 3. Setting Up Scope

#### Personal Scope:
* Only you can view and manage it
* Events appear only in your own log
* Ideal for individual projects

#### Team Scope:
* Team members can view and manage it
* Events appear in the shared team log
* Ideal for shared infrastructure

## Creating a Target

### 1. Mattermost Target

**Obtaining a Mattermost Incoming Webhook URL:**

1. In Mattermost: **Main Menu → Integrations**
2. **Incoming Webhooks** → **Add Incoming Webhook**
3. Fill in:
   * **Title:** `HookCats Notifications`
   * **Description:** `Automatic webhook forwarding`
   * **Channel:** Select a channel (e.g. `#infrastructure`)
4. Copy the **Webhook URL**

**Example URL:**
```
https://mattermost.yourdomain.com/hooks/abc123def456ghi789
```

**Creating a target on the HookCats server:**

1. Navigate to the **Targets** page
2. Click the **"New Target"** button
3. Fill in:
   * **Name:** `Mattermost - Infrastructure`
   * **Type:** `mattermost`
   * **Webhook URL:** *(paste the Mattermost URL)*
   * **Visibility:** `Personal` or `Team`

### 2. Rocket.Chat Target

**Obtaining a Rocket.Chat Incoming Webhook URL:**

1. In Rocket.Chat: **Administration → Integrations**
2. **New Integration → Incoming WebHook**
3. Configure:
   * **Enabled:** `True`
   * **Name:** `HookCats`
   * **Post to Channel:** `#infrastructure`
   * **Post as:** `webhook-bot`
4. **Save** → copy the **Webhook URL**

**Example URL:**
```
https://rocketchat.yourdomain.com/hooks/ABC123/DEF456GHI789
```

**On the HookCats server:**

Create the target the same way as the Mattermost target, but select the `rocketchat` type.

## Routing Configuration

### 1. Creating a Routing Rule

**Routing rule:** Defines which targets a webhook received from a source should be forwarded to.

**Steps:**

1. Navigate to the **Routes** page
2. Click the **"New Route"** button
3. Fill in:
   * **Source:** Select the source
   * **Target:** Select the target
   * **Visibility:** `Personal` or `Team`
   * **Message template:** Handlebars format template

### 2. Message Template

The HookCats server uses the **Handlebars** template engine.

#### Basic Template:

```handlebars
**Webhook Notification**

**Source:** {{source_name}}
**Time:** {{timestamp}}

{{#if event_type}}
**Event:** {{event_type}}
{{/if}}

**Data:**
```json
{{payload_json}}
```
```

#### Handlebars Helpers:

**Conditional rendering:**
```handlebars
{{#if variable}}
  This only appears if variable exists
{{/if}}

{{#unless variable}}
  This appears if variable does NOT exist
{{/unless}}
```

**Loops (arrays):**
```handlebars
{{#each items}}
  - {{this.name}}: {{this.value}}
{{/each}}
```

**Variables:**
```handlebars
{{variable_name}}
{{nested.object.property}}
{{array.[0]}}
```

### 3. Example Templates

#### GitHub Webhook Template:

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

#### Docker Hub Webhook Template:

```handlebars
🐳 **Docker Hub Webhook**

**Repository:** {{repository.repo_name}}
**Event:** {{push_data.tag}}
**Pushed by:** {{push_data.pusher}}
**Time:** {{push_data.pushed_at}}

**Image:** `{{repository.repo_name}}:{{push_data.tag}}`

[View on Docker Hub]({{repository.repo_url}})
```

#### Generic API Webhook Template:

```handlebars
📡 **API Webhook Notification**

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

## Webhook Payload Formats

### JSON Payload (application/json)

**Example request using curl:**

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

**Example request using curl:**

```bash
curl -X POST https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z \
  -d "event_type=deployment" \
  -d "status=success" \
  -d "service=web-api" \
  -d "version=v2.1.0"
```

**Using a template with form data:**

```handlebars
**Deployment Notification**

**Service:** {{service}}
**Version:** {{version}}
**Status:** {{status}}
**Event:** {{event_type}}
```

## HTTP Headers and Security

### Authentication

The HookCats server uses **secret_key-based authentication** in the URL:

```
POST /webhook/{secret_key}
```

**No additional headers are required**, but optional headers can be sent:

```bash
curl -X POST https://webhook.yourdomain.com/webhook/h7k9m2x5p3w8q1z \
  -H "Content-Type: application/json" \
  -H "User-Agent: MyApp/1.0" \
  -H "X-Custom-Header: custom-value" \
  -d '{"event": "test"}'
```

### HMAC Signature (optional)

If the source supports HMAC signatures:

**GitHub example:**

```javascript
const crypto = require('crypto');

const payload = JSON.stringify(webhookData);
const secret = 'your-webhook-secret';
const signature = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

// Send as header:
// X-Hub-Signature-256: sha256=<signature>
```

## Monitoring and Debugging

### 1. Events Page

**What you see:**
* All received webhooks
* Timestamp
* Source information
* Raw payload (JSON)
* Processing status

**Useful filters:**
* By source
* By time range
* By scope (personal/team)

### 2. Deliveries Page

**What you see:**
* Delivery statuses (success/failed/pending)
* Number of retry attempts
* Error messages (if failed)
* Response timings

**Statuses:**

* ✅ **Success:** Successfully delivered
* ❌ **Failed:** Permanently failed (after 3 attempts)
* ⏳ **Pending:** In progress (retry)

### 3. Test Delivery

**Sending a manual test message:**

1. Navigate to the **Targets** page
2. Select a target
3. Click the **"Send Test"** button
4. Check the Mattermost/Rocket.Chat channel

## Troubleshooting

### Common Problems and Solutions:

#### 1. **404 Not Found**

**Cause:** Incorrect webhook URL or secret_key

**Solution:**
* Verify the secret_key is correct
* Check the domain and port settings
* Test:
  ```bash
  curl -I https://webhook.yourdomain.com/webhook/YOUR_SECRET_KEY
  ```

#### 2. **401 Unauthorized**

**Cause:** Invalid or expired secret_key

**Solution:**
* Check if the source is active
* Generate a new secret_key if needed

#### 3. **500 Internal Server Error**

**Cause:** Server-side error (routing, template, database)

**Solution:**
* Check the payload format on the **Events** page
* Review the server logs:
  ```bash
  docker-compose logs webhook-server
  ```

#### 4. **Message not arriving at the target channel**

**Cause:** Routing error, invalid target URL, template error

**Solution:**
* Check the delivery status on the **Deliveries** page
* Test the target URL manually:
  ```bash
  curl -X POST https://mattermost.yourdomain.com/hooks/YOUR_HOOK \
    -H "Content-Type: application/json" \
    -d '{"text": "Test message"}'
  ```
* Verify the message template syntax

#### 5. **Template rendering error**

**Cause:** Invalid Handlebars syntax or missing variables

**Solution:**
* Use `{{#if}}` conditions for all optional variables
* Test the template with different payloads
* Check the payload structure on the **Events** page

## Best Practices

### 1. Naming Conventions

**Sources:**
* `[Platform] - [Environment] - [Instance]`
* Example: `Synology - Production - NAS-01`

**Targets:**
* `[Chat Platform] - [Channel Purpose]`
* Example: `Mattermost - Infrastructure Alerts`

**Routes:**
* `[Source Name] → [Target Name]`
* Example: `GitHub Production → Mattermost Development`

### 2. Scope Strategy

**When to use Personal Scope:**
* Individual development environments
* Test webhooks
* Personal monitoring

**When to use Team Scope:**
* Production infrastructure
* Shared services
* Team-level notifications

### 3. Security Guidelines

✅ **Follow these practices:**
* Use HTTPS for all webhook URLs
* Store secret_keys securely
* Use strong, unique secret_keys for each source
* Regularly review unused sources and remove them
* Use team scope for shared resources with proper access control

❌ **Avoid these practices:**
* Using HTTP in production environments
* Sharing secret_keys in public repositories
* Using the same secret_key for multiple sources
* Leaving inactive sources enabled

### 4. Template Optimization

**Concise messages:**
* Display only the most important information
* Use emojis for visual indicators
* Use markdown formatting for readability

**Linking:**
* Always provide links for further details
* Use short, descriptive link text

**Example optimized template:**

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

## Example Integrations

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

**Python example:**

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

# Usage:
send_webhook("script_completed", {
    "script": "data_processing.py",
    "status": "success",
    "records_processed": 1543
})
```

## Additional Information

* [HookCats API Documentation](/api/docs)
* [Handlebars Template Guide](https://handlebarsjs.com/guide/)
* [Mattermost Webhook Documentation](https://docs.mattermost.com/developer/webhooks-incoming.html)
* [Rocket.Chat Webhook Documentation](https://docs.rocket.chat/use-rocket.chat/workspace-administration/integrations)
