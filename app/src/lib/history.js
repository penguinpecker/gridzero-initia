// ═══════════════════════════════════════════════════════════════
// history.js — LOCAL CACHE for gridZERO round + player history.
//
// Replaces the old Supabase backend. Everything persists in
// localStorage so history survives reloads with NO external backend.
//
//   gz:rounds:v1          → map roundId -> { roundId, cell, players, pot, isBonus }
//   gz:mypicks:v1:<addr>  → array of { roundId, cell }  (one address)
//
// All chain reads happen in TheGrid.js via @/lib/initia; this module
// is pure storage + sorting. SSR-safe (guards window/localStorage).
// ═══════════════════════════════════════════════════════════════

const ROUNDS_KEY = "gz:rounds:v1";
const PICKS_PREFIX = "gz:mypicks:v1:";

// ─── SSR / no-window guards ───
function hasStorage() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function readJSON(key, fallback) {
  if (!hasStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / serialization failure — silently ignore, cache is best-effort
  }
}

const picksKey = (address) => `${PICKS_PREFIX}${String(address || "").toLowerCase()}`;

// ═══════════════════════════════════════════════════════════════
// ROUNDS — { roundId, cell, players, pot }
// ═══════════════════════════════════════════════════════════════

// Merge a round summary into the rounds map (upsert by roundId).
export function cacheRound(summary) {
  if (!summary || summary.roundId == null) return;
  const roundId = Number(summary.roundId);
  if (!Number.isFinite(roundId) || roundId <= 0) return;
  const map = readJSON(ROUNDS_KEY, {});
  // Preserve any previously cached fields (e.g. isBonus) when re-caching.
  const prev = map[roundId] || {};
  map[roundId] = {
    roundId,
    cell: Number(summary.cell),
    players: Number(summary.players),
    pot: String(summary.pot),
    isBonus: summary.isBonus != null ? Boolean(summary.isBonus) : Boolean(prev.isBonus),
  };
  writeJSON(ROUNDS_KEY, map);
}

// All cached round summaries, sorted by roundId descending (newest first).
export function getCachedRounds() {
  const map = readJSON(ROUNDS_KEY, {});
  return Object.values(map)
    .map((r) => ({
      roundId: Number(r.roundId),
      cell: Number(r.cell),
      players: Number(r.players),
      pot: String(r.pot),
      isBonus: Boolean(r.isBonus),
    }))
    .sort((a, b) => b.roundId - a.roundId);
}

// ═══════════════════════════════════════════════════════════════
// PLAYER PICKS — { roundId, cell } per address
// ═══════════════════════════════════════════════════════════════

// Append a pick for an address (dedupe by roundId — last write wins).
// Optionally persists the player's own entry (pick) tx hash.
export function recordPick(address, roundId, cell, pickTxHash) {
  if (!address || roundId == null) return;
  const rid = Number(roundId);
  if (!Number.isFinite(rid) || rid <= 0) return;
  const key = picksKey(address);
  const picks = readJSON(key, []);
  const prev = (Array.isArray(picks) ? picks : []).find(
    (p) => Number(p.roundId) === rid
  );
  const filtered = (Array.isArray(picks) ? picks : []).filter(
    (p) => Number(p.roundId) !== rid
  );
  const entry = { roundId: rid, cell: Number(cell) };
  // Preserve a previously-stored tx hash if this call doesn't supply one.
  const tx = pickTxHash || (prev && prev.pickTxHash) || null;
  if (tx) entry.pickTxHash = String(tx);
  filtered.push(entry);
  writeJSON(key, filtered);
}

// All picks for an address, sorted by roundId descending (newest first).
export function getMyPicks(address) {
  if (!address) return [];
  const picks = readJSON(picksKey(address), []);
  return (Array.isArray(picks) ? picks : [])
    .map((p) => ({
      roundId: Number(p.roundId),
      cell: Number(p.cell),
      pickTxHash: p.pickTxHash ? String(p.pickTxHash) : null,
    }))
    .sort((a, b) => b.roundId - a.roundId);
}
