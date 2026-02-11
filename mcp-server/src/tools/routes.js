import { z } from 'zod';

export function registerRouteTools(server, client) {
  server.tool(
    'hookcats_list_routes',
    'List all source-to-target routes configured in HookCats',
    {},
    async () => {
      const result = await client.get('/routes');
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_create_route',
    'Create a new route that connects a source to a target in HookCats',
    {
      source_id: z.number().describe('Source ID to route from'),
      target_id: z.number().describe('Target ID to route to'),
      message_template: z.string().optional().describe('Custom message template (use {{source}}, {{message}} placeholders)')
    },
    async ({ source_id, target_id, message_template }) => {
      const body = { source_id, target_id };
      if (message_template) body.message_template = message_template;
      const result = await client.post('/routes', body);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_delete_route',
    'Delete a source-to-target route from HookCats',
    {
      id: z.number().describe('Route ID to delete')
    },
    async ({ id }) => {
      const result = await client.del(`/routes/${id}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data || { message: 'Route deleted' }, null, 2) }]
      };
    }
  );
}
