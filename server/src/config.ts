// Runtime settings, read once from the environment.
export const config = {
  port: Number(process.env.PORT ?? 8787),
  // Secret path segment: the MCP endpoint is served at /mcp/<MCP_PATH_SECRET>.
  // Both Claude and ChatGPT connect without OAuth, so this is the only gate.
  mcpPathSecret: process.env.MCP_PATH_SECRET ?? '',
  battleDataBaseUrl: process.env.BATTLE_DATA_BASE_URL ?? 'https://championsbattledata.com',
  cacheTtlMs: Number(process.env.CACHE_TTL_MINUTES ?? 360) * 60_000,
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60),
};

export const ATTRIBUTION =
  'Battle data provided by Pokemon Champions Battle Data (https://championsbattledata.com/)';
