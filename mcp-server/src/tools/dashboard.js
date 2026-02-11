import { z } from 'zod';

export function registerDashboardTools(server, client) {
  server.tool(
    'hookcats_get_dashboard',
    'Get HookCats dashboard overview with statistics (total sources, targets, routes, events, delivery rates)',
    {},
    async () => {
      const result = await client.get('/dashboard/stats');
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_get_recent_events',
    'Get the most recent webhook events received by HookCats',
    {
      limit: z.number().optional().describe('Maximum number of events to return (default 10)')
    },
    async ({ limit }) => {
      const query = limit ? `?limit=${limit}` : '';
      const result = await client.get(`/dashboard/recent-events${query}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );
}
