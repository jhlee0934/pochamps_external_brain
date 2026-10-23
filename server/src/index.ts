// HTTP entry point. Serves MCP over Streamable HTTP in stateless mode:
// every POST gets a fresh server + transport, so no session state is kept.
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { createServer } from './server.js';

if (config.mcpPathSecret.length < 16) {
  console.error('MCP_PATH_SECRET must be set (16+ chars). It is the only access control.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '256kb' }));

// Fixed-window rate limit for the whole endpoint; this is a single-user server.
let windowStart = Date.now();
let hits = 0;
function rateLimited(): boolean {
  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    hits = 0;
  }
  return ++hits > config.rateLimitPerMinute;
}

const mcpPath = `/mcp/${config.mcpPathSecret}`;

app.post(mcpPath, async (req: Request, res: Response) => {
  if (rateLimited()) {
    res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Rate limited' }, id: null });
    return;
  }
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  }
});

// Stateless mode has no server-initiated stream or session to delete.
app.all(mcpPath, (_req: Request, res: Response) => {
  res
    .status(405)
    .set('Allow', 'POST')
    .type('text/plain; charset=utf-8')
    .send('MCP endpoint is up. It only accepts POST from an MCP client (Claude, ChatGPT, npm run smoke).');
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.send('ok');
});

app.listen(config.port, () => {
  console.log(`pochamps MCP server on http://localhost:${config.port}/mcp/<MCP_PATH_SECRET>`);
});
