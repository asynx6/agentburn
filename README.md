# agentburn

**Where did my Claude Code money go?** It reads the session transcripts
already sitting in `~/.claude/projects/`, prices every model turn at Anthropic
list rates, and breaks your burn down by project, model, day, and session —
plus a cache-hit ratio that usually explains the biggest number on the page.

```
$ agentburn

  agentburn — ~/.claude/projects
  4 sessions · 122 model turns · $40.53 at list price
  11.52M in · 0.50M out · cache hit 62%

  project            turns  cost     cache%  tokens
  ──────────────────────────────────────────────────────────────
  gameforge          34     $29.04   63%     2.59M in · 0.12M out
  FictionFlow        28     $6.40    61%     2.92M in · 0.11M out
  tokenzip           41     $3.21    62%     5.27M in · 0.24M out
  pustakita          19     $1.87    58%     0.74M in · 0.04M out
```

(Sample output from fabricated transcripts — `node gen-demo.mjs` regenerates
it. On a real machine it reads your real history.)

## Why the two numbers that matter are turns and cache%

Claude Code re-sends context every turn. A 40-turn session that writes a
big project to cache on turn 1 and reuses it 39 times is cheap. The same
session blowing its cache every few turns (`/compact`, switched model,
changed MCP servers) pays full input price repeatedly — that's the bill you
never see explained anywhere else. agentburn surfaces it per project:

- **turns** — how chatty the session really was
- **cache%** — share of input served from cache (90% cheaper than fresh)
- **cost by model** — the opus rows always sort first, and they should

## Usage

```bash
npx @asynx6/agentburn   # or npm i -g @asynx6/agentburn
agentburn                    # totals + top projects
agentburn --models           # which model ate the budget
agentburn --days             # per-day table (find your bad Tuesday)
agentburn --sessions         # top individual sessions
agentburn --project tokenzip # one project, all details
agentburn --since 2026-09-01 # cutoff
agentburn --dir ./transcripts   # custom path (CI, other machines)
agentburn --json             # machine-readable, pipe to anything
```

Zero dependencies, Node ≥ 18, single file, auditable. **Reads local JSONL
only — nothing is uploaded anywhere, no API key needed.**

## Honest limitations

- Prices are Anthropic **list** numbers from `lib/pricing.js` (2026-09).
  Max/enterprise plans, prompt-discount agreements, or third-party
  backends (Bedrock/Vertex contracts) bill differently. Unknown models are
  counted as $0 and *listed*, never guessed.
- Transcript `usage` is what the API reported — it excludes any overhead
  your plan adds.
- Sub-agent (sidechain) turns are counted, attributed to their parent
  project; they show up as high turn counts.
- Claude Code can rewrite transcripts (compaction); we dedupe by message
  uuid but a rewritten history is billed as-is.
- The number is a ceiling estimate "what this would cost at list price",
  not a invoice reconciliation.

## Tests

```bash
node test.js   # pricing math, dedupe, project parsing, --since
```

## Ecosystem

Made by the same hands as [tokenzip](https://github.com/asynx6/tokenzip)
(what one image costs before you send it) and
[vibe-locker](https://github.com/asynx6/vibe-locker) (what you leaked while
shipping). agentburn closes the loop: tokenzip saves the tokens up front,
agentburn shows what happened after.

## License

MIT
