// End-to-end check against a running server: npm run smoke -- <endpoint url>
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2];
if (!url) {
  console.error('usage: npm run smoke -- http://localhost:8787/mcp/<MCP_PATH_SECRET>');
  process.exit(1);
}

const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

const calls: Array<[string, Record<string, unknown>]> = [
  ['get_usage', { pokemon: 'Garchomp', top: 3 }],
  ['get_meta_ranking', { top: 5 }],
  ['get_meta_ranking', { top: 3, type: '강철' }],
  ['get_usage', { pokemon: '망나뇽', top: 2 }],
  [
    'calc_damage',
    {
      attacker: { name: '메가한카리아스Z', nature: '명랑', sp: { atk: 32, spe: 32, hp: 2 } },
      defender: { name: '누리레느', useCommonSet: true },
      move: '지진',
    },
  ],
  ['calc_damage', { attacker: { name: '한카리' }, defender: { name: '누리레느' }, move: '지진' }],
  ['get_usage_trend', { pokemon: 'Dragonite', days: 16, top: 1 }],
  [
    'calc_damage',
    { attacker: { name: 'Garchomp', useCommonSet: true }, defender: { name: 'Primarina' }, move: 'Moonblast' },
  ],
  [
    'calc_damage',
    {
      attacker: { name: 'Garchomp', nature: 'Jolly', sp: { atk: 32, spe: 32, hp: 2 } },
      defender: { name: 'Primarina', useCommonSet: true },
      move: 'Earthquake',
    },
  ],
  ['calc_damage', { attacker: { name: 'Garchomp' }, defender: { name: 'Primarina' }, move: 'Earthquak' }],
  [
    'calc_damage',
    { attacker: { name: 'Garchomp', sp: { atk: 32, spe: 32, hp: 32 } }, defender: { name: 'Primarina' }, move: 'Earthquake' },
  ],
];

for (const [name, args] of calls) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Array<{ text: string }>)[0].text;
  console.log(`\n${name}${res.isError ? ' (error)' : ''}:`, text.slice(0, 600));
}

await client.close();
