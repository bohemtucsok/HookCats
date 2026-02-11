import { z } from 'zod';

export function registerSourceTools(server, client) {
  server.tool(
    'hookcats_list_sources',
    'List all webhook sources configured in HookCats',
    {},
    async () => {
      const result = await client.get('/sources');
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_create_source',
    'Create a new webhook source in HookCats',
    {
      name: z.string().describe('Name for the webhook source'),
      type: z.enum(['synology', 'proxmox', 'proxmox_backup', 'gitlab', 'docker_updater', 'media-webhook', 'uptime-kuma', 'generic'])
        .describe('Source type (determines how incoming webhooks are parsed)'),
      secret_key: z.string().optional().describe('Custom secret key for the webhook URL (auto-generated if omitted)'),
      webhook_secret: z.string().optional().describe('HMAC secret for webhook signature validation')
    },
    async ({ name, type, secret_key, webhook_secret }) => {
      const body = { name, type };
      if (secret_key) body.secret_key = secret_key;
      if (webhook_secret) body.webhook_secret = webhook_secret;
      const result = await client.post('/sources', body);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_delete_source',
    'Delete a webhook source from HookCats (checks for active routes first)',
    {
      id: z.number().describe('Source ID to delete')
    },
    async ({ id }) => {
      // Check for active routes first
      try {
        const check = await client.get(`/sources/${id}/delete-check`);
        if (check.data && check.data.hasActiveRoutes) {
          return {
            content: [{ type: 'text', text: `Cannot delete source ${id}: it has active routes. Delete the routes first.\n${JSON.stringify(check.data, null, 2)}` }]
          };
        }
      } catch (_e) {
        // delete-check may not exist, proceed with delete
      }

      const result = await client.del(`/sources/${id}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data || { message: 'Source deleted' }, null, 2) }]
      };
    }
  );
}
