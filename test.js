// agentburn tests — fabricated transcripts in a temp dir, no ~/.claude needed.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { scan } from './lib/scan.js';
import { costOf, priceFor } from './lib/pricing.js';

let pass = 0, fail = 0;
const ok = (c, name) => {
  if (c) pass++;
  else { fail++; console.error('FAIL ' + name); }
};

// pricing
{
  const p = priceFor('claude-sonnet-4-5-20260701');
  ok(p && p.name === 'claude-sonnet-4-5', 'model with date suffix resolves');
  ok(priceFor('gpt-6') === null, 'unknown model → null, no fake price');
  // 1M fresh in + 1M out on sonnet = 3 + 15
  ok(Math.abs(costOf({ input_tokens: 1e6, output_tokens: 1e6 }, 'claude-sonnet-4-5') - 18) < 1e-9, 'input+output math');
  // cache: 1M write (3.75) + 1M read (0.3)
  const c = costOf({ cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 }, 'claude-sonnet-4-5');
  ok(Math.abs(c - 4.05) < 1e-9, 'cache write+read math');
}

const TMP = join(process.env.TEMP || '/tmp', 'agentburn-test-' + Date.now());
const asst = (usage, model, ts, uuid) =>
  JSON.stringify({ type: 'assistant', timestamp: ts, uuid, message: { id: 'msg_' + uuid, model, usage } });

{
  mkdirSync(join(TMP, '-home-beni-repos-alpha'), { recursive: true });
  mkdirSync(join(TMP, '-home-beni-repos-beta'), { recursive: true });
  const t1 = '2026-09-10T10:00:00.000Z', t2 = '2026-09-11T10:00:00.000Z';
  const u = (i, o, cw, cr) => ({ input_tokens: i, output_tokens: o, cache_creation_input_tokens: cw, cache_read_input_tokens: cr });

  writeFileSync(join(TMP, '-home-beni-repos-alpha', 'sess-a.jsonl'), [
    asst(u(100, 50, 1000, 5000), 'claude-sonnet-4-5', t1, 'u1'),
    asst(u(80, 40, 0, 20000), 'claude-sonnet-4-5', t2, 'u2'),
    'not json at all {{{', // garbage tolerated
    '',
    JSON.stringify({ type: 'user', timestamp: t1, message: { content: 'hi' } }), // non-billable
  ].join('\n') + '\n');
  writeFileSync(join(TMP, '-home-beni-repos-alpha', 'sess-b.jsonl'), [
    asst(u(0, 10, 500, 0), 'claude-opus-4-1', t2, 'u3'),
    asst(u(100, 50, 1000, 5000), 'claude-sonnet-4-5', t1, 'u1'), // duplicate uuid → dedupe
  ].join('\n') + '\n');
  writeFileSync(join(TMP, '-home-beni-repos-beta', 'sess-c.jsonl'), [
    asst(u(1, 2, 3, 4), 'mystery-model-9', t1, 'u4'),
  ].join('\n') + '\n');
}

{
  const b = scan(TMP);
  ok(b.turns === 4, '4 unique turns (dupe dropped): got ' + b.turns);
  ok(b.dupes === 1, 'one dupe counted');
  ok(b.totals.input_tokens === 181, 'input sums across projects (garbage & user skipped)');
  ok(b.sessions.size === 3, '3 sessions across 2 projects');
  ok(b.byProject.get('alpha').turns === 3, 'project alpha: 3 turns');
  ok(b.byProject.get('beta').turns === 1, 'project beta: 1 turn');
  ok(b.byModel.has('claude-opus-4-1'), 'opus bucketed');
  ok([...b.unknownModel].includes('mystery-model-9'), 'unknown model flagged, not priced');
  ok(b.cost > 0, 'cost accumulates for priced turns');
  ok(b.byDay.get('2026-09-10').turns === 2 && b.byDay.get('2026-09-11').turns === 2, 'per-day split');

  const c10 = scan(TMP, { since: '2026-09-11' });
  ok(c10.turns === 2 && !c10.byDay.has('2026-09-10'), '--since filters older turns');

  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${fail === 0 ? '✔' : '✖'} ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
