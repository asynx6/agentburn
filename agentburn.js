#!/usr/bin/env node
// agentburn — "where did my Claude Code money go?"
// Reads local ~/.claude/projects transcripts (never uploads anything) and
// breaks down token burn by project / model / day / session, at list price.
//
//   agentburn                      totals + top projects
//   agentburn --models             model-by-model
//   agentburn --days               per-day table
//   agentburn --sessions           top sessions
//   agentburn --project myrepo     everything about one project
//   agentburn --since 2026-09-01   cutoff
//   agentburn --json               machine-readable

import { scan, defaultProjectsDir } from './lib/scan.js';
import { priceFor } from './lib/pricing.js';

const argv = process.argv.slice(2);
const flagVal = (n, d) => {
  const i = argv.indexOf(n);
  return i > -1 ? argv[i + 1] : d;
};
const has = (n) => argv.includes(n);

if (has('--help') || has('-h')) {
  console.log(`agentburn v${process.env.npm_package_version || '0.1.1'} — where did my Claude Code money go?

usage: agentburn [--models] [--days] [--sessions] [--project NAME]
                 [--since YYYY-MM-DD] [--dir PATH] [--json]

reads ~/.claude/projects/**/*.jsonl locally. list prices, no network.`);
  process.exit(0);
}
if (has('--version') || has('-v')) {
  console.log(process.env.npm_package_version || '0.1.1');
  process.exit(0);
}

const dir = flagVal('--dir', defaultProjectsDir());
let b;
try {
  b = scan(dir, { since: flagVal('--since', null) });
} catch (e) {
  console.error('cannot scan:', e.message);
  process.exit(1);
}

const tok = (u) => ((u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens) / 1e6).toFixed(2) + 'M in · ' + (u.output_tokens / 1e6).toFixed(2) + 'M out';
const cacheRatio = (u) => {
  const total = u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens;
  return total ? Math.round((u.cache_read_input_tokens / total) * 100) : 0;
};
const money = (n) => '$' + n.toFixed(2);

if (has('--json')) {
  const obj = (m) => Object.fromEntries([...m].map(([k, v]) => [k, { ...v, usage: v.usage }]));
  console.log(JSON.stringify({
    dir, sessions: b.sessions.size, turns: b.turns,
    totals: b.totals, cost: +b.cost.toFixed(4),
    cacheHitPct: cacheRatio(b.totals),
    projects: obj(b.byProject), models: obj(b.byModel), days: obj(b.byDay),
    sessionsDetail: obj(b.bySession),
    unknownModels: [...b.unknownModel],
  }, null, 1));
  process.exit(0);
}

const rowsOf = (m, n = 12) =>
  [...m.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, n);
const pad = (s, w) => String(s).padEnd(w).slice(0, w);

console.log('');
console.log(`  agentburn — ${dir}`);
console.log(`  ${b.sessions.size} sessions · ${b.turns} model turns · ${money(b.cost)} at list price`);
console.log(`  ${tok(b.totals)} · cache hit ${cacheRatio(b.totals)}%`);
if (b.unknownModel.size) console.log(`  ⚠ unpriced models: ${[...b.unknownModel].join(', ')} (counted as $0)`);
console.log('');

const view = has('--models') ? 'models' : has('--days') ? 'days' : has('--sessions') ? 'sessions' : 'projects';
const map = view === 'models' ? b.byModel : view === 'days' ? b.byDay : view === 'sessions' ? b.bySession : b.byProject;
const label = view === 'sessions' ? 'session (project)' : view.slice(0, -1);

if (has('--project')) {
  const want = flagVal('--project', '');
  const hit = [...b.byProject.entries()].filter(([k]) => k.includes(want));
  if (!hit.length) { console.error(`no project matching "${want}"`); process.exit(1); }
  for (const [name, v] of hit) {
    console.log(`  ${name}: ${v.turns} turns · ${money(v.cost)} · ${tok(v.usage)} · cache ${cacheRatio(v.usage)}%`);
  }
  process.exit(0);
}

console.log(`  ${pad(label, 26)} ${pad('turns', 6)} ${pad('cost', 9)} ${pad('cache%', 7)} tokens`);
console.log('  ' + '─'.repeat(78));
for (const [name, v] of rowsOf(map)) {
  const who = view === 'sessions' ? `${name} (${v.project})` : name;
  console.log(`  ${pad(who, 26)} ${pad(v.turns, 6)} ${pad(money(v.cost), 9)} ${pad(cacheRatio(v.usage) + '%', 7)} ${tok(v.usage)}`);
}
console.log('');
console.log('  cache hit % = share of input tokens served from cache (90% cheaper than fresh input).');
console.log('  low % with many turns → re-sending context without cache: /compact, trim MCPs, fewer giant files per tool call.');
