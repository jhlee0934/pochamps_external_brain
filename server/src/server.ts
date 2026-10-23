import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

const INSTRUCTIONS = `Pokemon Champions (Singles) battle assistant tools.
Rules for answering:
- Take every number (usage %, damage %, KO chance, stats) from tool results. Never estimate them.
- Pokemon Champions uses Stat Points (SP): max 32 per stat, 66 total, IVs fixed at 31, level 50. Do not talk in EVs.
- When useCommonSet filled fields, say which ones were assumed.
- Tools accept English or Korean names. Results carry official Korean names in "ko" fields; when replying in Korean, use those instead of translating names yourself.
- Credit "Pokemon Champions Battle Data" when you cite usage numbers.`;

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'pochamps', version: '0.1.0' },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server);
  return server;
}
