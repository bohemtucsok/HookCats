import { z } from 'zod';

export function registerDeliveryTools(server, client) {
  server.tool(
    'hookcats_list_deliveries',
    'List webhook delivery attempts in HookCats',
    {
      limit: z.number().optional().describe('Maximum number of deliveries (default 50)'),
      status: z.enum(['pending', 'sent', 'failed']).optional().describe('Filter by delivery status')
    },
    async ({ limit, status }) => {
      const params = [];
      if (limit) params.push(`limit=${limit}`);
      if (status) params.push(`status=${status}`);
      const query = params.length > 0 ? `?${params.join('&')}` : '';
      const result = await client.get(`/deliveries${query}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
      };
    }
  );

  server.tool(
    'hookcats_test_delivery',
    'Send a test notification to a target to verify its webhook URL is working',
    {
      target_id: z.number().describe('Target ID to send test message to')
    },
    async ({ target_id }) => {
      const result = await client.post(`/test-delivery/${target_id}`, {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data || { message: 'Test delivery sent' }, null, 2) }]
      };
    }
  );
}
