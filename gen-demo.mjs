// Generates fabricated transcripts shaped like real Claude Code JSONL, then
// prints what the CLI shows on them — used for README sample output.
//   node gen-demo.mjs          → prints tables (deletes demo dir after)
//   node gen-demo.mjs --keep   → leaves demo-transcripts/ behind
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = 'demo-transcripts';
const u = (i, o, cw, cr) => ({ input_tokens: i, output_tokens: o, cache_creation_input_tokens: cw, cache_read_input_tokens: cr });
const asst = (uuid, model, ts, usage) =>
  JSON.stringify({ type: 'assistant', uuid, timestamp: ts, message: { id: 'msg_' + uuid, model, usage } });

let seed = 42;
const rnd = (a, b) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return a + (seed % (b - a));
};
function session(slug, model, weight, n, dayStart = 8) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    lines.push(asst(slug + '-' + i, model, `2026-09-${String(rnd(dayStart, 14)).padStart(2, '0')}T0${rnd(1, 9)}:00:00.000Z`,
      u((rnd(200, 900) * weight) | 0, (rnd(1500, 8000) * weight) | 0, (rnd(20000, 60000) * weight) | 0, (rnd(10000, 120000) * weight) | 0)));
  }
  return lines;
}
function w(slug, lines) {
  const d = join(dir, slug);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'sess.jsonl'), lines.join('\n') + '\n');
}

w('-home-beni-repos-FictionFlow', session('ff', 'claude-sonnet-4-5', 1, 28));
w('-home-beni-repos-pustakita', session('pk', 'claude-sonnet-4-5', 0.4, 19));
w('-home-beni-repos-gameforge', session('gf', 'claude-opus-4-1', 0.7, 34));
w('-home-beni-repos-tokenzip', session('tz', 'claude-haiku-4-5', 1.2, 41));

for (const args of [['--dir', dir], ['--dir', dir, '--models'], ['--dir', dir, '--days']]) {
  const r = spawnSync('node', ['agentburn.js', ...args], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
if (!process.argv.includes('--keep')) rmSync(dir, { recursive: true, force: true });
