// Best-effort reference pricing per upstream model, with per-route manual override.
import fs from 'node:fs';

const TABLE = JSON.parse(fs.readFileSync(new URL('./model_prices.json', import.meta.url), 'utf8'))
  .map((entry) => ({ regex: new RegExp(entry.match, 'i'), input: entry.input, output: entry.output }));
const cache = new Map();

// Returns the base model id candidates for matching (full id and last path segment).
function candidates(model) {
  const lower = String(model || '').toLowerCase();
  const base = lower.split('/').pop().split(':')[0];
  return lower === base ? [lower] : [lower, base];
}

// Looks up reference pricing for an upstream model id, or null when unknown.
export function lookupPricing(model) {
  if (!model) return null;
  if (cache.has(model)) return cache.get(model);
  let result = null;
  for (const entry of TABLE) {
    if (candidates(model).some((candidate) => entry.regex.test(candidate))) {
      result = { input: entry.input, output: entry.output };
      break;
    }
  }
  cache.set(model, result);
  return result;
}

// Resolves a route's effective cost per million tokens and where it came from.
export function resolveRouteCost(route) {
  const hasManual = route.inputCostPerM !== null || route.outputCostPerM !== null;
  const auto = route.inputCostPerM === null || route.outputCostPerM === null
    ? lookupPricing(route.upstreamModel)
    : null;
  const input = route.inputCostPerM ?? auto?.input ?? 0;
  const output = route.outputCostPerM ?? auto?.output ?? 0;
  const source = hasManual ? (auto ? 'mixed' : 'manual') : (auto ? 'auto' : 'unknown');
  return { input, output, source };
}
