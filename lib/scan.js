// Transcript scanner: ~/.claude/projects/**/*.jsonl (override with --dir).
// Aggregates per-turn usage into per-project / per-model / per-day buckets.
// Dedupes by message.id when present (Claude Code retries can double-write).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { costOf, priceFor } from './pricing.js';

export function defaultProjectsDir() {
  return join(homedir(), '.claude', 'projects');
}

function* jsonlFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* jsonlFiles(p);
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield p;
  }
}

export function newBuckets() {
  return {
    sessions: new Set(),
    turns: 0,
    dupes: 0,
    unknownModel: new Set(),
    totals: emptyUsage(),
    cost: 0,
    byProject: new Map(), // slug → {…bucket}
    byModel: new Map(), // model → {usage, cost, turns}
    byDay: new Map(), // YYYY-MM-DD → {usage, cost}
    bySession: new Map(), // session id → { project, usage, cost, first, last }
  };
}

function emptyUsage() {
  return { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
}
function addUsage(a, u) {
  for (const k of Object.keys(a)) a[k] += u[k] || 0;
}

/**
 * @param dir projects root (default ~/.claude/projects)
 * @param opts { since?: ISO date string, top?: number }
 */
export function scan(dir = defaultProjectsDir(), opts = {}) {
  const since = opts.since ? Date.parse(opts.since) : 0;
  const b = newBuckets();
  const seen = new Set();

  for (const file of jsonlFiles(dir)) {
    let text;
    try {
      // transcripts can be large; cap at 64 MB per file
      if (statSync(file).size > 64 * 1024 * 1024) continue;
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const project = decodeProject(dir, file);
    const sessionId = sessionIdOf(file);
    b.sessions.add(project + '/' + sessionId);

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue; // truncated tail line while writing — fine
      }
      if (rec.type !== 'assistant' || !rec.message?.usage) continue;
      const ts = rec.timestamp ? Date.parse(rec.timestamp) : 0;
      if (since && ts && ts < since) continue;
      // each transcript line has its own uuid — that's the natural dedupe key
      const key = rec.uuid || sessionId + '|' + (rec.message.id || Math.random());
      if (seen.has(key)) {
        b.dupes++;
        continue;
      }
      seen.add(key);

      const u = rec.message.usage;
      const model = rec.message.model || 'unknown';
      const cost = costOf(u, model) || 0;
      if (!priceFor(model)) b.unknownModel.add(model);

      b.turns++;
      addUsage(b.totals, u);
      b.cost += cost;

      upsert(b.byProject, project, u, cost);
      upsert(b.byModel, model, u, cost);
      if (ts) {
        const day = new Date(ts).toISOString().slice(0, 10);
        upsert(b.byDay, day, u, cost);
      }
      upsertSession(b.bySession, sessionId, project, u, cost, ts);
    }
  }
  return b;
}

function upsert(map, key, u, cost) {
  let row = map.get(key);
  if (!row) {
    row = { usage: emptyUsage(), cost: 0, turns: 0 };
    map.set(key, row);
  }
  addUsage(row.usage, u);
  row.cost += cost;
  row.turns++;
}
function upsertSession(map, id, project, u, cost, ts) {
  let row = map.get(id);
  if (!row) {
    row = { project, usage: emptyUsage(), cost: 0, turns: 0, first: ts, last: ts };
    map.set(id, row);
  }
  addUsage(row.usage, u);
  row.cost += cost;
  row.turns++;
  if (ts) {
    if (!row.first || ts < row.first) row.first = ts;
    if (!row.last || ts > row.last) row.last = ts;
  }
}

// slug = folder name; Claude Code encodes /home/u/proj → -home-u-proj and
// C:\Users\x\repo → C--Users-x-repo. Pretty name = last path segment.
function decodeProject(root, file) {
  const rel = file.slice(root.length + 1);
  const slug = rel.split(/[\\/]/)[0] || rel;
  const segs = slug.split(/[-_/]+/).filter(Boolean);
  return segs[segs.length - 1] || slug;
}
function sessionIdOf(file) {
  return file.split(/[\\/]/).pop().replace(/\.jsonl$/, '').slice(0, 8);
}
