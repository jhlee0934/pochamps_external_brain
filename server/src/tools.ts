import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ATTRIBUTION } from './config.js';
import { CalcInputError, gen, runCalc, type SideInput } from './calc/champions.js';
import { getLearnset, getRanking, getTrend, getUsage, NotFoundError } from './data/battleData.js';
import { toID } from '@smogon/calc';
import { NameError, toEnglish, toKorean, type Kind } from './i18n.js';

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
});

const fail = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

// Validation problems the caller can fix become tool errors; anything else is rethrown.
function userError(e: unknown) {
  if (e instanceof NameError || e instanceof CalcInputError) return fail(e.message);
  throw e;
}

// Adds the Korean name to each { name } entry.
const withKo = <T extends { name: string }>(kind: Kind, entries: T[]) =>
  entries.map((e) => ({ ...e, ko: toKorean(kind, e.name) }));

const NAME_HINT = 'English or Korean name';

const spSchema = z
  .object({
    hp: z.number().int().min(0).max(32),
    atk: z.number().int().min(0).max(32),
    def: z.number().int().min(0).max(32),
    spa: z.number().int().min(0).max(32),
    spd: z.number().int().min(0).max(32),
    spe: z.number().int().min(0).max(32),
  })
  .partial()
  .describe('Stat Points (SP): 0-32 per stat, 66 total. Omitted stats are 0.');

const sideSchema = z.object({
  name: z.string().describe(`Pokemon, ${NAME_HINT}, e.g. "Garchomp", "메가한카리아스Z", "알로라 라이츄"`),
  useCommonSet: z
    .boolean()
    .optional()
    .describe(
      'Fill any omitted nature/sp/item/ability with the most used option from current Singles ladder data. ' +
        'Each field is picked independently (the data has no combinations), so the result approximates a ' +
        'typical set rather than one players are confirmed to use.',
    ),
  nature: z.string().optional().describe(`${NAME_HINT}, e.g. "Jolly" or "명랑"`),
  sp: spSchema.optional(),
  item: z.string().optional().describe(`${NAME_HINT}, e.g. "Choice Scarf" or "구애스카프"`),
  ability: z.string().optional().describe(NAME_HINT),
  boosts: z
    .object({
      atk: z.number().int().min(-6).max(6),
      def: z.number().int().min(-6).max(6),
      spa: z.number().int().min(-6).max(6),
      spd: z.number().int().min(-6).max(6),
      spe: z.number().int().min(-6).max(6),
    })
    .partial()
    .optional(),
  status: z.enum(['brn', 'par', 'psn', 'tox', 'slp', 'frz']).optional(),
  curHpPercent: z.number().min(1).max(100).optional(),
  stacks: z
    .object({
      hitsTaken: z.number().int().min(0).max(6).describe('Times hit so far (Rage Fist)'),
      alliesFainted: z
        .number()
        .int()
        .min(0)
        .max(5)
        .describe('Fainted allies (Last Respects defaults to 2 = power 150; Supreme Overlord defaults to 0)'),
      metronomeUses: z.number().int().min(0).max(5).describe('Consecutive uses holding Metronome'),
      conditionMet: z
        .boolean()
        .describe('Power-doubling condition met (Stomping Tantrum, Temper Flare, Avalanche, Payback, Assurance)'),
    })
    .partial()
    .optional()
    .describe('Battle-state stacks, used when this side attacks'),
});

type SideArgs = z.infer<typeof sideSchema>;

// "Charizard-Mega-Y" -> "Charizard", "Meowstic-F-Mega" -> "Meowstic-F", "Floette-Mega" -> "Floette-Eternal".
function megaBaseName(name: string, baseSpecies?: string): string {
  if (!name.includes('-Mega')) return name;
  const prefix = name.split('-Mega')[0].replace(/-M$/, ''); // Meowstic-M-Mega: the male form is the plain one
  return baseSpecies?.startsWith(prefix) ? baseSpecies : prefix;
}

// Megas share their base Pokemon's ladder entry; other forms (Rotom-Wash, Raichu-Alola) have their own.
function usageKey(name: string): string {
  const species = gen.species.get(toID(name));
  return toID(species ? megaBaseName(species.name, species.baseSpecies) : name);
}

async function resolveSide({ useCommonSet, ...input }: SideArgs): Promise<{ side: SideInput; filled: string[] }> {
  const side: SideInput = {
    ...input,
    name: toEnglish('species', input.name),
    nature: input.nature && toEnglish('natures', input.nature),
    item: input.item && toEnglish('items', input.item),
    ability: input.ability && toEnglish('abilities', input.ability),
  };
  if (!useCommonSet) return { side, filled: [] };
  const usage = await getUsage(usageKey(side.name));
  const filled: string[] = [];
  const pick = <T>(current: T | undefined, top: T | undefined, label: string) => {
    if (current !== undefined || top === undefined) return current;
    filled.push(label);
    return top;
  };
  return {
    side: {
      ...side,
      nature: pick(side.nature, usage.natures[0]?.name, 'nature'),
      sp: pick(side.sp, usage.spreads[0]?.sp, 'sp'),
      item: pick(side.item, usage.items[0]?.name, 'item'),
      ability: pick(side.ability, usage.abilities[0]?.name, 'ability'),
    },
    filled,
  };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    'get_usage',
    {
      title: 'Ladder usage for a Pokemon',
      description:
        'Current Pokemon Champions ranked ladder usage for one Pokemon: top moves, held items, abilities, ' +
        'natures, Stat Point spreads and common teammates, with percentages. Use this for any question about ' +
        'what a Pokemon usually runs; never guess usage numbers. Mega forms are reported under the base Pokemon.',
      inputSchema: {
        pokemon: z.string().describe(`${NAME_HINT} or Showdown id, e.g. "Garchomp", "한카리아스", "raichualola"`),
        format: z.enum(['Singles', 'Doubles']).default('Singles'),
        season: z.string().optional().describe('Season id such as "M6"; omit for the current season'),
        top: z.number().int().min(1).max(10).default(5).describe('Entries to return per category'),
      },
      annotations: READ_ONLY,
    },
    async ({ pokemon, format, season, top }) => {
      try {
        const u = await getUsage(usageKey(toEnglish('species', pokemon)), format, season);
        return json({
          ...u,
          ko: toKorean('species', u.pokemon),
          moves: withKo('moves', u.moves.slice(0, top)),
          items: withKo('items', u.items.slice(0, top)),
          abilities: withKo('abilities', u.abilities.slice(0, top)),
          natures: withKo('natures', u.natures.slice(0, top)),
          spreads: u.spreads.slice(0, top),
          teammates: withKo('species', u.teammates.slice(0, top).map((name) => ({ name }))),
          attribution: ATTRIBUTION,
        });
      } catch (e) {
        if (e instanceof NotFoundError) return fail(`No ladder data for "${pokemon}" (${format}).`);
        return userError(e);
      }
    },
  );

  server.registerTool(
    'get_meta_ranking',
    {
      title: 'Ladder usage ranking',
      description:
        'Pokemon Champions ranked ladder usage ranking (rank order only; the data has no per-Pokemon usage ' +
        'percentage, win rate or sample size). Each entry includes types and the most used move, item, ability ' +
        'and nature. Use this to find the current meta threats or to pick which Pokemon to calculate against.',
      inputSchema: {
        format: z.enum(['Singles', 'Doubles']).default('Singles'),
        top: z.number().int().min(1).max(100).default(30),
        offset: z.number().int().min(0).default(0).describe('Skip this many entries, for paging'),
        type: z.string().optional().describe('Only Pokemon of this type, e.g. "Steel" or "강철"'),
      },
      annotations: READ_ONLY,
    },
    async ({ format, top, offset, type }) => {
      try {
        const typeName = type && toEnglish('types', type);
        const { generatedAt, entries } = await getRanking(format);
        const filtered = typeName
          ? entries.filter((e) => e.types.some((t) => toID(t) === toID(typeName)))
          : entries;
        return json({
          format,
          dataGeneratedAt: generatedAt,
          totalRanked: entries.length,
          matched: filtered.length,
          entries: filtered.slice(offset, offset + top).map((e) => ({
            ...e,
            ko: {
              pokemon: toKorean('species', e.pokemon),
              types: e.types.map((t) => toKorean('types', t)),
              topMove: toKorean('moves', e.topMove),
              topItem: toKorean('items', e.topItem),
              topAbility: toKorean('abilities', e.topAbility),
              topNature: toKorean('natures', e.topNature),
            },
          })),
          attribution: ATTRIBUTION,
        });
      } catch (e) {
        return userError(e);
      }
    },
  );

  server.registerTool(
    'get_usage_trend',
    {
      title: 'Usage trend over recent days',
      description:
        'Daily snapshots of one Pokemon\'s ladder rank and top moves/items/natures, oldest first. Snapshots are ' +
        'cumulative from the start of the season, so changes are large early in a season and small later. ' +
        'Daily history exists from season M6 onward. Use this for questions about rising or falling Pokemon ' +
        'or changing sets.',
      inputSchema: {
        pokemon: z.string().describe(`${NAME_HINT} or Showdown id`),
        format: z.enum(['Singles', 'Doubles']).default('Singles'),
        days: z.number().int().min(2).max(31).default(14),
        season: z.string().optional().describe('Season id such as "M6"; omit for the newest snapshots'),
        top: z.number().int().min(1).max(10).default(3).describe('Entries per category per day'),
      },
      annotations: READ_ONLY,
    },
    async ({ pokemon, format, days, season, top }) => {
      try {
        const trend = await getTrend(usageKey(toEnglish('species', pokemon)), format, days, season, top);
        const first = trend.points[0];
        const last = trend.points.at(-1);
        return json({
          ...trend,
          ko: toKorean('species', trend.pokemon),
          points: trend.points.map((p) => ({
            ...p,
            moves: withKo('moves', p.moves),
            items: withKo('items', p.items),
            natures: withKo('natures', p.natures),
          })),
          rankChange: first && last ? { from: first.rank, to: last.rank, fromDate: first.date, toDate: last.date } : null,
          attribution: ATTRIBUTION,
        });
      } catch (e) {
        if (e instanceof NotFoundError) return fail(`No daily data for "${pokemon}" (${format}).`);
        return userError(e);
      }
    },
  );

  server.registerTool(
    'calc_damage',
    {
      title: 'Damage calculation (Pokemon Champions, Singles)',
      description:
        'Exact damage range and KO chance for one move under Pokemon Champions rules (level 50, IVs 31, ' +
        'Stat Points instead of EVs). Always call this instead of estimating damage. Set useCommonSet on a ' +
        'side to fill omitted nature/SP/item/ability from current ladder usage, and report which fields were ' +
        'filled that way.',
      inputSchema: {
        attacker: sideSchema,
        defender: sideSchema,
        move: z.string().describe(`Move, ${NAME_HINT}, e.g. "Earthquake" or "지진"`),
        isCrit: z.boolean().optional(),
        field: z
          .object({
            weather: z.enum(['Sun', 'Rain', 'Sand', 'Snow']).optional(),
            terrain: z.enum(['Electric', 'Grassy', 'Psychic', 'Misty']).optional(),
            defenderReflect: z.boolean().optional(),
            defenderLightScreen: z.boolean().optional(),
            defenderStealthRock: z.boolean().optional().describe('Include Stealth Rock damage in KO chance'),
            defenderSpikes: z
              .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
              .optional()
              .describe('Spikes layers on the defender side, included in KO chance'),
          })
          .optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ attacker, defender, move, isCrit, field }) => {
      try {
        const a = await resolveSide(attacker);
        const d = await resolveSide(defender);
        const moveName = toEnglish('moves', move);
        const result = runCalc({ attacker: a.side, defender: d.side, move: moveName, isCrit, field });
        const warnings: string[] = [];
        const learnset = await getLearnset(usageKey(a.side.name));
        if (learnset && ![...learnset].some((m) => toID(m) === toID(moveName))) {
          warnings.push(
            `${result.attacker.name} cannot learn ${moveName} in Pokemon Champions; this matchup cannot happen in a real battle.`,
          );
        }
        return json({
          ...result,
          ko: {
            attacker: toKorean('species', result.attacker.name),
            attackerItem: toKorean('items', result.attacker.item),
            attackerAbility: toKorean('abilities', result.attacker.ability),
            defender: toKorean('species', result.defender.name),
            defenderItem: toKorean('items', result.defender.item),
            defenderAbility: toKorean('abilities', result.defender.ability),
            move: toKorean('moves', moveName),
          },
          warnings,
          filledFromUsage: { attacker: a.filled, defender: d.filled },
          inputs: { attacker: a.side, defender: d.side },
        });
      } catch (e) {
        if (e instanceof NotFoundError) return fail(`useCommonSet: no ladder data for that Pokemon.`);
        return userError(e);
      }
    },
  );
}
