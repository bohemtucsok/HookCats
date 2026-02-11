import { z } from 'zod';

export function registerTargetTools(server, client) {
  server.tool(
    'hookcats_list_targets',
    'List all notification targets configured in HookCats',
    {},
    async () => {
      const result = await client.get('/targets');
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_create_target',
    'Create a new notification target in HookCats',
    {
      name: z.string().describe('Name for the target'),
      type: z.enum(['mattermost', 'rocketchat', 'webhook'])
        .describe('Target type (chat platform or generic webhook)'),
      webhook_url: z.string().describe('Webhook URL where notifications will be sent')
    },
    async ({ name, type, webhook_url }) => {
      const result = await client.post('/targets', { name, type, webhook_url });
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_delete_target',
    'Delete a notification target from HookCats',
    {
      id: z.number().describe('Target ID to delete')
    },
    async ({ id }) => {
      const result = await client.del(`/targets/${id}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data || { message: 'Target deleted' }, null, 2) }]
      };
    }
  );
}
