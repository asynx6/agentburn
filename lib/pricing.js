// List-price USD per 1M tokens: [input, output, cacheWrite, cacheRead].
// Sources: anthropic.com/pricing (2026-09). Unknown models → 0 (never lie
// with a made-up number).

export const PRICING = {
  'claude-opus-4-1': [15, 75, 18.75, 1.5],
  'claude-opus-4': [15, 75, 18.75, 1.5],
  'claude-sonnet-4-5': [3, 15, 3.75, 0.3],
  'claude-sonnet-4': [3, 15, 3.75, 0.3],
  'claude-3-7-sonnet': [3, 15, 3.75, 0.3],
  'claude-haiku-4-5': [0.8, 4, 1, 0.08],
  'claude-3-5-haiku': [0.8, 4, 1, 0.08],
};

export function priceFor(model) {
  if (!model) return null;
  const m = String(model).toLowerCase();
  if (PRICING[m]) return { name: m, ...table(PRICING[m]) };
  // family fallbacks on partial match (date suffixes like -20260701)
  for (const key of Object.keys(PRICING)) {
    if (m.startsWith(key)) return { name: key, ...table(PRICING[key]) };
  }
  return null;
}
const table = ([i, o, cw, cr]) => ({ input: i, output: o, cacheWrite: cw, cacheRead: cr });

// usage = Anthropic-style object { input_tokens, output_tokens,
// cache_read_input_tokens, cache_creation_input_tokens }
export function costOf(usage, model) {
  const p = priceFor(model);
  if (!p) return null;
  return (
    ((usage.input_tokens || 0) / 1e6) * p.input +
    ((usage.output_tokens || 0) / 1e6) * p.output +
    ((usage.cache_creation_input_tokens || 0) / 1e6) * p.cacheWrite +
    ((usage.cache_read_input_tokens || 0) / 1e6) * p.cacheRead
  );
}
