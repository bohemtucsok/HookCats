#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HookCatsClient } from './api-client.js';
import { registerSourceTools } from './tools/sources.js';
import { registerTargetTools } from './tools/targets.js';
import { registerRouteTools } from './tools/routes.js';
import { registerEventTools } from './tools/events.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerDeliveryTools } from './tools/deliveries.js';

const HOOKCATS_URL = process.env.HOOKCATS_URL;
const HOOKCATS_API_KEY = process.env.HOOKCATS_API_KEY;

if (!HOOKCATS_URL || !HOOKCATS_API_KEY) {
  console.error('Missing required environment variables: HOOKCATS_URL, HOOKCATS_API_KEY');
  process.exit(1);
}

const client = new HookCatsClient(HOOKCATS_URL, HOOKCATS_API_KEY);

const server = new McpServer({
  name: 'hookcats',
  version: '1.0.0'
});

registerDashboardTools(server, client);
registerSourceTools(server, client);
registerTargetTools(server, client);
registerRouteTools(server, client);
registerEventTools(server, client);
registerDeliveryTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('HookCats MCP Server running on stdio');
