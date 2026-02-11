import { z } from 'zod';

export function registerEventTools(server, client) {
  server.tool(
    'hookcats_list_events',
    'List webhook events received by HookCats',
    {
      limit: z.number().optional().describe('Maximum number of events (default 50)'),
      source_id: z.number().optional().describe('Filter by source ID')
    },
    async ({ limit, source_id }) => {
      const params = [];
      if (limit) params.push(`limit=${limit}`);
      if (source_id) params.push(`source_id=${source_id}`);
      const query = params.length > 0 ? `?${params.join('&')}` : '';
      const result = await client.get(`/events${query}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_get_event',
    'Get details of a specific webhook event including its payload',
    {
      id: z.number().describe('Event ID')
    },
    async ({ id }) => {
      const result = await client.get(`/events/${id}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_get_event_stats',
    'Get webhook event statistics for a time range',
    {
      range: z.enum(['24h', '7d', '30d']).optional().describe('Time range for statistics (default 7d)')
    },
    async ({ range }) => {
      const query = range ? `?range=${range}` : '';
      const result = await client.get(`/events/stats${query}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );
}
