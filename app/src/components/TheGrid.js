"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useWallet, useAddress } from "@initia/react-wallet-widget";
import { useResolverSSE } from "./useResolverSSE";
import {
  EXPLORER,
  GRIDZERO_ADDR,
  CHAIN_ID,
  GAS_DENOM,
  getCurrentRound,
  getCellCounts,
  getRound,
  hasJoined,
  getPlayerCell,
  getConfig,
  getEscrowBalance,
  getInitBalance,
  getZeroBalance,
  buildPickCellMsg,
  buildWithdrawMsg,
  toRawUinit,
  isInitAddress,
  getResolverHistory,
} from "@/lib/initia";
import {
  cacheRound,
  getCachedRounds,
  recordPick,
  getMyPicks,
} from "@/lib/history";

// ═══════════════════════════════════════════════════════════════
// gridZERO — Round-Based Betting on Initia mainnet (interwoven-1)
// Modules: gridzero::game + gridzero::zero_token @ NEXT_PUBLIC_GRIDZERO_ADDR
// Entry currency: native INIT (uinit, 6 dec). $ZERO is a native FA reward.
// All chain access is isolated in @/lib/initia.
// ═══════════════════════════════════════════════════════════════

const CELL_COST = "1";  // 1 INIT (display); real fee comes from get_config()
const ROUND_DURATION = 60;
const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
// History is now kept entirely in LOCAL CACHE (localStorage) + on-chain
// reads — see @/lib/history. No Supabase / no external backend.
const RESOLVER_URL = process.env.NEXT_PUBLIC_RESOLVER_URL || "";

const CELL_LABELS = [];
for (let r = 0; r < GRID_SIZE; r++)
  for (let c = 0; c < GRID_SIZE; c++)
    CELL_LABELS.push(`${String.fromCharCode(65 + r)}${c + 1}`);

// INIT and $ZERO are both 6-decimal. Raw integer string → human display.
const fmt = (v, d = 2) => {
  if (!v) return "0." + "0".repeat(d);
  return (Number(v) / 1e6).toFixed(d);
};
const fmtEth = (v, d = 4) => {
  if (!v) return "0." + "0".repeat(d);
  return (Number(v) / 1e6).toFixed(d);
};
// INIT with 6 decimals (full precision display).
const fmt6 = (v) => {
  if (!v) return "0.000000";
  return (Number(v) / 1e6).toFixed(6);
};
// Short tx-hash display, e.g. "a1b2…f9".
const shortTx = (h) => {
  if (!h) return "";
  const s = String(h).replace(/^0x/, "");
  return s.length <= 10 ? s : `${s.slice(0, 4)}…${s.slice(-2)}`;
};

// ─── Initia brand tokens ───
// #0C0C0C canvas · gray ramp · #2B6BFF cyan signature accent
// gold #F8C24F (Motherlode) · green #55F678 (win) · red #F85454 (loss)
const CYAN = "#2B6BFF", CYAN_LT = "#5E90FF", CYAN_DK = "#173C99", CYAN_BG = "#0C1733";
const GOLD = "#F8C24F", WIN = "#55F678", LOSS = "#F85454";
const G0 = "#F5F5F5", G1 = "#EDEDED", G2 = "#A1A6AA", G3 = "#757C82", G4 = "#585F67";
const HEAD = "'Archivo', sans-serif";
const GRIDZERO_PKG = "init1ujldjupk47tslx87ad2e84h3nwdu5xyex9rcdc";

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function TheGrid() {
  // Initia wallet widget — connect/disconnect/address + requestInitiaTx.
  const wallet = useWallet();
  const address = useAddress();
  const ready = !!wallet && !wallet.isLoading;
  const authenticated = !!address;
  const login = () => wallet?.onboard();
  const logout = () => wallet?.disconnect();

  // Contract state
  const [round, setRound] = useState(0);
  const [roundStart, setRoundStart] = useState(0);
  const [roundEnd, setRoundEnd] = useState(0);
  const [potSize, setPotSize] = useState("0");
  const [activePlayers, setActivePlayers] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [winningCell, setWinningCell] = useState(-1);
  const [currentIsBonus, setCurrentIsBonus] = useState(false);
  const [claimedCells, setClaimedCells] = useState(new Set());
  const [cellCounts, setCellCounts] = useState(new Array(TOTAL_CELLS).fill(0));
  const [playerCell, setPlayerCell] = useState(-1);
  const [gridBalance, setGridBalance] = useState("0"); // $ZERO balance (raw 6-dec)
  const [ethBalance, setEthBalance] = useState("0");   // native INIT balance (raw uinit)

  // UI state
  const [smoothTime, setSmoothTime] = useState(0);
  const [selectedCell, setSelectedCell] = useState(null);
  const lastTapRef = useRef({ cell: -1, time: 0 });
  const [hoveredCell, setHoveredCell] = useState(-1);
  const [claiming, setClaiming] = useState(false);
  const [feed, setFeed] = useState([]);
  const [userHistory, setUserHistory] = useState([]);
  const [userHistoryLoading, setUserHistoryLoading] = useState(false);
  const userHistoryLoaded = useRef(false);
  const [scanLine, setScanLine] = useState(0);
  const [error, setError] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState("");
  const [copied, setCopied] = useState(false);
  const [walletDropdown, setWalletDropdown] = useState(false); // dropdown open
  const [walletView, setWalletView] = useState("menu"); // "menu" | "withdraw"
  const walletDropdownRef = useRef(null);
  const [lastResult, setLastResult] = useState(null); // { roundId, cell, players, pot, txHash }
  const feeConfig = useRef({ feeBps: 500, resolverReward: 100000 }); // defaults, updated from chain
  const [config, setConfig] = useState(null);   // full get_config() for LIVE STATS strip
  const [escrow, setEscrow] = useState("0");      // escrow_balance() raw uinit
  const [roundHistory, setRoundHistory] = useState([]); // array of ALL loaded past results, newest first
  const [roundTxMap, setRoundTxMap] = useState(() => new Map()); // roundId -> resolve_round txHash (from resolver /history + SSE)
  const [moneyFlow, setMoneyFlow] = useState(false);
  const [gridFlash, setGridFlash] = useState(false);
  const [historyPage, setHistoryPage] = useState(0); // current page (0 = newest)
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFullyLoaded, setHistoryFullyLoaded] = useState(false); // true when scanned back to round 1
  const historyCursor = useRef(0); // next round ID to scan backwards from
  const resolverTxHash = useRef(null);
  const HISTORY_PAGE_SIZE = 10;

  const animFrame = useRef(null);
  const pollRef = useRef(null);
  const lastRoundRef = useRef(0);
  const resolverCalledForRound = useRef(0);
  const resolvedRef = useRef(false);

  // ─── Refresh top of history table (picks up TX hash immediately, ZKV hash after finality) ───
  const refreshHistoryTop = () => {
    fetchRoundHistory(0, HISTORY_PAGE_SIZE).then(fresh => {
      if (!fresh.length) return;
      setRoundHistory(prev => {
        const freshIds = new Set(fresh.map(r => r.roundId));
        const older = prev.filter(r => !freshIds.has(r.roundId));
        return [...fresh, ...older];
      });
    });
  };

  // ─── SSE: Real-time events from resolver ───
  const { connected: sseConnected } = useResolverSSE({
    url: RESOLVER_URL ? `${RESOLVER_URL.replace(/\/$/, "")}/events` : "",
    enabled: !!RESOLVER_URL,
    onRoundResolved: (data) => {
      pollState();
      // Merge the live resolve_round txHash into the round→tx map (best-effort).
      if (data && data.roundId != null && data.txHash) {
        setRoundTxMap((prev) => {
          const next = new Map(prev);
          next.set(Number(data.roundId), String(data.txHash));
          return next;
        });
      }
      // Fetch TX hash immediately, ZKV hash after ~25s finality window
      setTimeout(refreshHistoryTop, 3000);
      setTimeout(refreshHistoryTop, 25000);
      // Refresh the resolver /history map shortly after resolution.
      setTimeout(() => { loadResolverTxMap(); }, 4000);
    },
    onCellPicked: (data) => {
      setCellCounts(prev => {
        const next = [...prev];
        next[data.cell] = (next[data.cell] || 0) + 1;
        return next;
      });
      setClaimedCells(prev => new Set([...prev, data.cell]));
    },
  });

  // ─── Read fee config once on mount (gridzero::game::get_config) ───
  useEffect(() => {
    getConfig()
      .then((cfg) => {
        feeConfig.current = {
          feeBps: cfg.protocolFeeBps,
          resolverReward: Number(cfg.resolverReward),
        };
        setConfig(cfg);
      })
      .catch(() => {});
  }, []);

  // ─── Read escrow/treasury balance (gridzero::game::escrow_balance) ───
  useEffect(() => {
    let alive = true;
    const load = () => getEscrowBalance().then((v) => { if (alive) setEscrow(v); }).catch(() => {});
    load();
    const iv = setInterval(load, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // ─── Lock body scroll when mobile sidebar is open ───
  useEffect(() => {
    if (mobileMenu) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      return () => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [mobileMenu]);

  // ─── Close wallet dropdown on click outside ───
  useEffect(() => {
    if (!walletDropdown) return;
    const handler = (e) => {
      if (walletDropdownRef.current && !walletDropdownRef.current.contains(e.target)) {
        setWalletDropdown(false);
        setWalletView("menu");
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [walletDropdown]);

  // (wallet + address come from the Initia wallet widget hooks above)

  // ─── Smooth 60fps Timer ───
  useEffect(() => {
    const tick = () => {
      if (roundEnd > 0) {
        const remaining = Math.max(0, roundEnd - Date.now() / 1000);
        setSmoothTime(remaining);
      }
      animFrame.current = requestAnimationFrame(tick);
    };
    animFrame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame.current);
  }, [roundEnd]);

  // ─── Scan Line ───
  useEffect(() => {
    const iv = setInterval(() => setScanLine((p) => (p + 1) % 100), 40);
    return () => clearInterval(iv);
  }, []);

  // ─── Poll state via Initia Move views (see @/lib/initia) ───
  const pollError = useRef(null);
  const pollCount = useRef(0);
  const pollBusy = useRef(false);
  const pollState = useCallback(async () => {
    if (pollBusy.current) return; // skip if previous poll still running
    pollBusy.current = true;
    pollCount.current++;
    try {
      // 1. Current round (CRITICAL - everything depends on this)
      let cur;
      try {
        cur = await getCurrentRound();
      } catch (e) {
        pollError.current = "REST: get_current_round failed - " + (e?.message || "unknown");
        console.error("Poll: get_current_round failed", e);
        return;
      }
      const roundId = cur.roundId;
      setRound(roundId);
      pollError.current = null;

      setRoundStart(cur.startTime);
      setRoundEnd(cur.endTime);
      setPotSize(cur.totalDeposits);
      setActivePlayers(cur.totalPlayers);
      const isResolved = cur.resolved;
      setResolved(isResolved);
      resolvedRef.current = isResolved;

      // 2. Fire remaining reads in parallel.
      const promises = [
        getCellCounts(roundId).catch(() => null),
      ];
      // When resolved, fetch the winning cell from get_round.
      promises.push(isResolved ? getRound(roundId).catch(() => null) : Promise.resolve(null));

      // Player-specific reads (only if wallet connected)
      if (address) {
        promises.push(
          getPlayerCell(roundId, address).catch(() => 255),
          getZeroBalance(address).catch(() => null),
          getInitBalance(address).catch(() => null),
        );
      }

      const results = await Promise.all(promises);
      const [counts, rd] = results;

      // Winning cell (only meaningful when resolved)
      if (isResolved && rd && rd.winningCell >= 0 && rd.winningCell < TOTAL_CELLS) {
        setWinningCell(rd.winningCell);
        setCurrentIsBonus(Boolean(rd.isBonus));
      } else if (!isResolved) {
        setWinningCell(-1);
        setCurrentIsBonus(false);
      }

      // Process cell counts
      if (counts) {
        const claimed = new Set();
        const countsArr = new Array(TOTAL_CELLS).fill(0);
        for (let i = 0; i < TOTAL_CELLS; i++) {
          const count = Number(counts[i] || 0);
          countsArr[i] = count;
          if (count > 0) claimed.add(i);
        }
        setClaimedCells(claimed);
        setCellCounts(countsArr);
      }

      // Process player data
      if (address) {
        const [, , pc, zeroBal, initBal] = results;
        // get_player_cell returns 255 when not joined, else 0..24.
        if (pc != null && pc < TOTAL_CELLS) setPlayerCell(pc);
        else setPlayerCell(-1);

        if (zeroBal != null) setGridBalance(zeroBal);
        if (initBal != null) setEthBalance(initBal);
      }
    } catch (e) {
      pollError.current = "Poll error: " + (e?.message || "unknown");
      console.error("Poll error:", e);
    } finally {
      pollBusy.current = false;
    }
  }, [address, roundEnd]);

  useEffect(() => {
    pollState();
    const tick = () => {
      pollState();
      // Fast poll (500ms) while waiting for resolution, normal (3s) otherwise
      // When SSE connected, slow to 10s as safety net
      const resolving = roundEnd > 0 && Date.now() / 1000 > roundEnd && !resolvedRef.current;
      const interval = sseConnected ? 10000 : (resolving ? 500 : 3000);
      pollRef.current = setTimeout(tick, interval);
    };
    pollRef.current = setTimeout(tick, 3000);
    return () => { clearTimeout(pollRef.current); };
  }, [pollState, sseConnected]);

  // ─── Load round history from LOCAL CACHE + on-chain reads ───
  const historyLoaded = useRef(false);
  const historyLoadingRef = useRef(false);
  const historyFullyLoadedRef = useRef(false);
  const historyOffset = useRef(0);   // how many cached rounds have been served
  const backfillDone = useRef(false); // bounded backfill runs once per session

  // Bounded backfill: read current round, then scan up to ~30 previous rounds,
  // caching any that resolved with players. Public RPC is flaky — every read is
  // wrapped in try/catch and SKIPPED on failure (never throw).
  const backfillRounds = async (need) => {
    if (backfillDone.current) return;
    let currentId = 0;
    try {
      const cur = await getCurrentRound();
      currentId = cur.roundId;
    } catch (e) {
      // Can't even read current round — bail without marking done so we retry later.
      return;
    }
    const MAX_BACKFILL = 30;
    const floor = Math.max(1, currentId - MAX_BACKFILL);
    let reads = 0;
    for (let id = currentId - 1; id >= floor; id--) {
      // Stop early once we have enough cached rounds to satisfy the request.
      if (getCachedRounds().length >= need) break;
      if (reads >= MAX_BACKFILL) break;
      reads++;
      try {
        const rd = await getRound(id);
        if (rd && rd.resolved && rd.totalPlayers > 0) {
          cacheRound({ roundId: id, cell: rd.winningCell, players: rd.totalPlayers, pot: rd.totalDeposits, isBonus: rd.isBonus });
        }
      } catch {
        // flaky RPC — skip this round, keep going
      }
    }
    // Mark the bounded scan complete; if the cursor reached round 1 the table is fully loaded.
    if (floor <= 1) {
      historyFullyLoadedRef.current = true;
      setHistoryFullyLoaded(true);
    }
    backfillDone.current = true;
  };

  // Returns cached round summaries [offset, offset+limit) in the round-history shape.
  const fetchRoundHistory = async (offset, limit = HISTORY_PAGE_SIZE) => {
    if (historyLoadingRef.current) return [];
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    try {
      // First call (or until backfill completes): pull missing history from chain.
      await backfillRounds(offset + limit);

      const all = getCachedRounds();
      const slice = all.slice(offset, offset + limit);
      historyOffset.current = offset + slice.length;

      // Fully loaded when the slice is exhausted (we've served every cached round
      // and the bounded scan reached round 1).
      if (historyOffset.current >= all.length && (historyFullyLoadedRef.current || backfillDone.current)) {
        const lastId = all.length ? all[all.length - 1].roundId : 0;
        if (historyFullyLoadedRef.current || lastId <= 1) {
          historyFullyLoadedRef.current = true;
          setHistoryFullyLoaded(true);
        }
      }

      return slice.map(r => ({
        roundId: Number(r.roundId),
        cell: Number(r.cell),
        players: Number(r.players),
        pot: String(r.pot),
        isBonus: Boolean(r.isBonus),
        resolved: true,
        txHash: null,
        zkverifyTxHash: null,
      }));
    } catch (e) {
      console.error("History fetch error:", e);
      return [];
    } finally {
      historyLoadingRef.current = false;
      setHistoryLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (!historyLoaded.current) {
      historyLoaded.current = true;
      fetchRoundHistory(0, HISTORY_PAGE_SIZE).then(results => {
        if (results.length > 0) setRoundHistory(results);
      });
    }
  }, []);

  // ─── Resolver history → round→tx map (TX links for both history tables) ───
  // Primary source for the resolve_round tx hash that paid INIT + minted $ZERO.
  const loadResolverTxMap = useCallback(async () => {
    const records = await getResolverHistory(80);
    if (!Array.isArray(records) || records.length === 0) return;
    setRoundTxMap((prev) => {
      const next = new Map(prev);
      for (const rec of records) {
        if (rec && rec.roundId != null && rec.txHash) {
          next.set(Number(rec.roundId), String(rec.txHash));
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    loadResolverTxMap();
    const iv = setInterval(loadResolverTxMap, 15000);
    return () => clearInterval(iv);
  }, [loadResolverTxMap]);

  // Load older pages on demand
  const loadOlderHistory = () => {
    if (historyLoadingRef.current || historyFullyLoadedRef.current) return;
    fetchRoundHistory(historyOffset.current, HISTORY_PAGE_SIZE).then(results => {
      if (results.length > 0) {
        setRoundHistory(prev => {
          const existingIds = new Set(prev.map(r => r.roundId));
          const newOnes = results.filter(r => !existingIds.has(r.roundId));
          return [...prev, ...newOnes];
        });
      }
    });
  };

  // ─── User History from LOCAL CACHE (their picks) + on-chain round reads ───
  const userHistoryOffset = useRef(0);
  const userHistoryTotal = useRef(0);

  const fetchUserHistory = async (offset, limit = 10) => {
    if (!address) return [];
    try {
      const picks = getMyPicks(address); // newest first, [{ roundId, cell }]
      userHistoryTotal.current = picks.length;
      const slice = picks.slice(offset, offset + limit);

      const results = [];
      for (const pick of slice) {
        let rd = null;
        try {
          rd = await getRound(pick.roundId);
        } catch {
          // flaky RPC — skip rounds we can't read
        }
        if (!rd) continue;
        const resolved = !!rd.resolved;
        const won = resolved && rd.winningCell === pick.cell;
        // How many players landed on the winning cell → split the pot evenly.
        let numWinners = 1;
        if (won) {
          try {
            const counts = await getCellCounts(pick.roundId);
            numWinners = Number(counts?.[rd.winningCell]) || 1;
          } catch {
            numWinners = 1;
          }
        }
        results.push({
          roundId: pick.roundId,
          cell: pick.cell,
          won,
          resolved,
          pot: String(rd.totalDeposits),
          players: rd.totalPlayers,
          numWinners,
          cost: "1000000", // 1 INIT (6 dec)
          pickTxHash: pick.pickTxHash || null, // player's own entry tx (PICK link)
        });
      }
      return results;
    } catch (e) {
      console.error("User history fetch error:", e);
      return [];
    }
  };

  useEffect(() => {
    if (address && !userHistoryLoaded.current) {
      userHistoryLoaded.current = true;
      userHistoryOffset.current = 0;
      setUserHistoryLoading(true);
      fetchUserHistory(0, 10).then(results => {
        setUserHistory(results);
        userHistoryOffset.current = results.length;
        setUserHistoryLoading(false);
      });
    }
  }, [address]);

  // Refresh user history when round changes (new resolved round might include user)
  useEffect(() => {
    if (round > 1 && address && userHistoryLoaded.current) {
      // Re-fetch latest to pick up new entries
      fetchUserHistory(0, 10).then(results => {
        if (results.length > 0) {
          setUserHistory(prev => {
            const merged = [...results];
            const newIds = new Set(results.map(r => r.roundId));
            for (const old of prev) {
              if (!newIds.has(old.roundId)) merged.push(old);
            }
            return merged.sort((a, b) => b.roundId - a.roundId);
          });
          userHistoryOffset.current = Math.max(userHistoryOffset.current, results.length);
        }
      });
    }
  }, [round]);

  // ─── Round Change — fetch previous round data, save to history, reset grid ───
  useEffect(() => {
    if (round > 0 && round !== lastRoundRef.current) {
      const prevRound = lastRoundRef.current;

      // Fetch previous round data from chain (don't rely on stale state)
      if (prevRound > 0) {
        getRound(prevRound).then(rd => {
          const players = rd.totalPlayers;
          const cell = rd.winningCell;     // 0..24
          const pot = rd.totalDeposits;
          const isResolved = rd.resolved;
          const isBonus = rd.isBonus;
          if (players > 0) {
            // Persist resolved rounds with players to LOCAL CACHE.
            if (isResolved) {
              cacheRound({ roundId: prevRound, cell, players, pot, isBonus });
            }
            const result = {
              roundId: prevRound,
              cell,
              players,
              pot,
              isBonus,
              resolved: isResolved,
              txHash: resolverTxHash.current || null,
            };
            setLastResult(result);
            setRoundHistory(prev => {
              if (prev.some(r => r.roundId === prevRound)) return prev;
              return [result, ...prev];
            });
            if (isResolved && players > 0) { // cell 0 is valid
              addFeed(`★ Round ${prevRound} winner: Cell ${CELL_LABELS[cell] || cell}`);
              setMoneyFlow(true);
              setTimeout(() => setMoneyFlow(false), 2500);
            } else if (players > 0 && !isResolved) {
              addFeed(`△ Round ${prevRound} had ${players} player(s) but wasn't resolved`);
            }
            setHistoryPage(0);
            // Refresh user history — the just-resolved round may include this player.
            if (address && userHistoryLoaded.current) {
              fetchUserHistory(0, 10).then(results => {
                if (results.length > 0) {
                  setUserHistory(prev => {
                    const merged = [...results];
                    const newIds = new Set(results.map(r => r.roundId));
                    for (const old of prev) {
                      if (!newIds.has(old.roundId)) merged.push(old);
                    }
                    return merged.sort((a, b) => b.roundId - a.roundId);
                  });
                  userHistoryOffset.current = Math.max(userHistoryOffset.current, results.length);
                }
              });
            }
          }
          resolverTxHash.current = null;
        }).catch(e => console.error("Failed to fetch prev round:", e));
      }

      // Flash grid on reset
      setGridFlash(true);
      setTimeout(() => setGridFlash(false), 600);
      addFeed(`◆ Round ${round} started`);
      lastRoundRef.current = round;
      setSelectedCell(null);
      setPlayerCell(-1);
      setClaimedCells(new Set());
      setCellCounts(new Array(TOTAL_CELLS).fill(0));
      setWinningCell(-1);
      setResolved(false);
      resolvedRef.current = false;
    }
  }, [round]);

  // ─── Winner detected — trigger animation + update history entry ───
  useEffect(() => {
    if (resolved && winningCell >= 0 && round > 0) {
      const result = {
        roundId: round,
        cell: winningCell,
        players: activePlayers,
        pot: potSize,
        isBonus: currentIsBonus,
        resolved: true,
        txHash: resolverTxHash.current || null,
      };
      setLastResult(result);
      // Persist the resolved current round to LOCAL CACHE.
      if (activePlayers > 0) {
        cacheRound({ roundId: round, cell: winningCell, players: activePlayers, pot: potSize, isBonus: currentIsBonus });
      }
      setMoneyFlow(true);
      setTimeout(() => setMoneyFlow(false), 2500);
      // Upsert: update existing entry or prepend new one
      setRoundHistory(prev => {
        const idx = prev.findIndex(r => r.roundId === round);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = result;
          return updated;
        }
        return [result, ...prev];
      });
      setHistoryPage(0);
    }
  }, [resolved, winningCell]);

  // ─── Pick Cell — gridzero::game::pick_cell(cell) as MsgExecute ───
  // Entry currency is native INIT (uinit). No approval step on Initia.
  const claimCell = async (cellIndex) => {
    if (!wallet || !address || claiming) return;
    setClaiming(true);
    setError(null);

    try {
      addFeed(`◈ Claiming cell ${CELL_LABELS[cellIndex]}...`);
      const msg = buildPickCellMsg(address, cellIndex);
      // requestInitiaTx signs + broadcasts via the connected Initia wallet,
      // returning the tx hash once included. The return may be a string or an
      // object — normalize to a hash string for the PICK tx link.
      const res = await wallet.requestInitiaTx({ msgs: [msg] });
      const txHash = typeof res === "string" ? res : (res?.txHash || res?.transactionHash || res?.hash || "");
      addFeed(`✓ Cell ${CELL_LABELS[cellIndex]} claimed! ${String(txHash).slice(0, 8)}…`);
      // Persist this pick (with its entry tx hash) to LOCAL CACHE so user
      // history + the PICK tx link survive reloads.
      recordPick(address, round, cellIndex, txHash || null);
      setPlayerCell(cellIndex);
      setSelectedCell(null);
      pollState();
    } catch (e) {
      const msg = e?.message || "Transaction failed";
      setError(msg);
      addFeed(`✗ Failed: ${msg.slice(0, 80)}`);
    }
    setClaiming(false);
  };

  const addFeed = (msg) => {
    setFeed((prev) => [{ msg, time: Date.now() }, ...prev].slice(0, 20));
  };

  // ─── Copy Wallet Address ───
  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ─── Withdraw INIT — native coin transfer (MsgSend) ───
  const withdrawETH = async () => {
    if (!wallet || !address || !withdrawAddr || !withdrawAmt || withdrawing) return;
    setWithdrawError("");
    setWithdrawSuccess("");
    // Validate address: must be a valid init1... bech32 address
    if (!isInitAddress(withdrawAddr)) {
      setWithdrawError("Invalid address — must be a valid init1… address");
      return;
    }
    const amt = parseFloat(withdrawAmt);
    if (isNaN(amt) || amt <= 0) {
      setWithdrawError("Invalid amount");
      return;
    }
    setWithdrawing(true);
    try {
      const raw = toRawUinit(withdrawAmt);
      const msg = buildWithdrawMsg(address, withdrawAddr.trim(), raw);
      addFeed(`↗ Withdrawing ${withdrawAmt} INIT...`);
      const txHash = await wallet.requestInitiaTx({ msgs: [msg] });
      addFeed(`✓ Withdrawn ${withdrawAmt} INIT`);
      setWithdrawSuccess(`✓ Sent ${withdrawAmt} INIT · ${txHash.slice(0,10)}...${txHash.slice(-6)}`);
      setWithdrawAddr("");
      setWithdrawAmt("");
      pollState();
    } catch (e) {
      const msg = e?.message || "Withdraw failed";
      setWithdrawError(msg.slice(0, 100));
      addFeed(`✗ Withdraw failed: ${msg.slice(0, 80)}`);
    }
    setWithdrawing(false);
  };

  // ─── Derived UI State ───
  const actualDuration = (roundEnd > 0 && roundStart > 0) ? (roundEnd - roundStart) : ROUND_DURATION;
  const timerProgress = actualDuration > 0 ? smoothTime / actualDuration : 0;
  const timerColor = smoothTime > 10 ? CYAN : smoothTime > 5 ? GOLD : LOSS;

  const getStatus = () => {
    if (!ready) return "INITIALIZING...";
    if (resolved) return `ROUND ${round} RESOLVED`;
    if (smoothTime <= 0 && round > 0) return `RESOLVING ROUND ${round}...`;
    if (smoothTime <= 0) return "WAITING...";
    if (!authenticated) return `ROUND ${round} — LOGIN TO PLAY`;
    return `ROUND ${round} ACTIVE`;
  };

  const getCellState = (idx) => {
    if (resolved && winningCell === idx) return "winner";
    if (playerCell === idx) return "yours";
    if (claimedCells.has(idx)) return "claimed";
    return "empty";
  };

  // 5x5 grid zone pattern: outer=dark, inner=light, middle-row-center=opening
  // ■■■■■  Row A (0-4)   — all dark
  // ■□□□■  Row B (5-9)   — dark|light|light|light|dark
  // ■□□□■  Row C (10-14) — dark|opening×3|dark
  // ■□□□■  Row D (15-19) — dark|light|light|light|dark
  // ■■■■■  Row E (20-24) — all dark
  const DARK_CELLS = new Set([0,1,2,3,4, 5,9, 10,14, 15,19, 20,21,22,23,24]);
  const OPENING_CELLS = new Set([11,12,13]);
  const getCellZone = (idx) => {
    if (DARK_CELLS.has(idx)) return "dark";
    if (OPENING_CELLS.has(idx)) return "opening";
    return "light";
  };

  const canClaim = (idx) => {
    return !resolved && smoothTime > 0 && authenticated && playerCell < 0;
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={S.root}>
      {/* Scan line */}
      <div style={{
        ...S.scanOverlay,
        background: `linear-gradient(180deg,
          transparent ${scanLine - 2}%,
          rgba(43,107,255,0.06) ${scanLine - 1}%,
          rgba(43,107,255,0.16) ${scanLine}%,
          rgba(43,107,255,0.06) ${scanLine + 1}%,
          transparent ${scanLine + 2}%)`,
      }} />
      <div style={S.crtLines} />

      {/* ─── HEADER ─── */}
      <header style={{...S.header, display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 12px", gap:4}} className="grid-header">
        {/* Left — logo, clickable */}
        <div style={{...S.hLeft, cursor:"pointer", flexShrink:0}} onClick={()=>window.location.href="/"}>
          <LogoIcon size={22} />
          <span style={S.logo} className="grid-logo-text">GRID</span>
          <span style={S.logoSub} className="grid-logo-text">ZERO</span>
          <div style={{width:5,height:5,borderRadius:"50%",background:CYAN,boxShadow:`0 0 6px ${CYAN}`,animation:"pulse 2s ease-in-out infinite",marginLeft:3,flexShrink:0}}/>
        </div>
        {/* Center — nav, hidden on mobile */}
        <nav className="grid-header-nav" style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
          <button onClick={()=>window.location.href="/"} className="nav-btn-home" style={{background:"transparent",border:"none",fontFamily:"'Archivo', sans-serif",fontSize:10,fontWeight:700,color:"#585F67",cursor:"pointer",letterSpacing:1.5,padding:"6px 10px",borderRadius:3,transition:"color 0.2s"}}>HOME</button>
          <button className="nav-btn-play" style={{background:"transparent",border:"none",fontFamily:"'Archivo', sans-serif",fontSize:10,fontWeight:700,color:CYAN,cursor:"default",letterSpacing:1.5,padding:"6px 10px",borderRadius:3,animation:"navGlow 3s ease-in-out infinite"}}>PLAY</button>
        </nav>
        {/* Right — balances + wallet */}
        <div style={{...S.hRight, gap:6, justifyContent:"flex-end", flexShrink:0}}>
          {authenticated && (
            <>
              <span style={S.hStat} className="grid-header-stat">
                ● {fmtEth(gridBalance, 2)} <b style={{ color: "#757C82" }}>ZERO</b>
              </span>
              <span style={S.hStat} className="grid-header-stat">
                ◆ {fmt(ethBalance, 2)} <b style={{ color: CYAN }}>INIT</b>
              </span>
            </>
          )}
          {/* Mobile: show balances inline */}
          {authenticated && (
            <span className="grid-mobile-balances" style={{
              display: "none", alignItems: "center", gap: 8,
              fontSize: 11, letterSpacing: 0.5,
            }}>
              <span style={{ color: "#EDEDED" }}>{fmt(ethBalance, 2)} <b>INIT</b></span>
              <span style={{ color: "#585F67" }}>|</span>
              <span style={{ color: "#757C82" }}>{fmtEth(gridBalance, 2)} <b>ZERO</b></span>
            </span>
          )}
          {!authenticated ? (
            <button style={S.loginBtn} onClick={login}>⬡ LOGIN</button>
          ) : (
            <div ref={walletDropdownRef} style={{ position: "relative" }} className="grid-header-wallet-btn">
              <button style={{
                ...S.loginBtn,
                display: "flex", alignItems: "center", gap: 6,
              }} onClick={() => { setWalletDropdown(!walletDropdown); setWalletView("menu"); }}>
                {/* Desktop: just address */}
                <span className="wallet-addr-desktop">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "WALLET"}
                </span>
                {/* Mobile: balances + short address */}
                <span className="wallet-addr-mobile" style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap" }}>
                  <span style={{ fontSize: 10, color: "#EDEDED", fontWeight: 700 }}>{fmt(ethBalance, 2)}<span style={{ fontSize: 9, opacity: 0.7 }}> I</span></span>
                  <span style={{ color: "#585F67", fontSize: 9 }}>|</span>
                  <span style={{ fontSize: 10, color: "#757C82", fontWeight: 700 }}>{fmtEth(gridBalance, 0)}<span style={{ fontSize: 9, opacity: 0.7 }}> Z</span></span>
                  <span style={{ color: "#585F67", fontSize: 9 }}>·</span>
                  <span style={{ fontSize: 9 }}>{address ? `${address.slice(0, 4)}…${address.slice(-3)}` : "W"}</span>
                </span>
                <span style={{ fontSize: 8, opacity: 0.6, transition: "transform 0.2s", transform: walletDropdown ? "rotate(180deg)" : "none" }}>▼</span>
              </button>
              {walletDropdown && walletView === "menu" && (
                <div className="grid-wallet-dropdown" style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  width: 280, background: "#101010",
                  border: "1px solid #2F3337", borderRadius: 8,
                  overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                  zIndex: 9999, animation: "dropIn 0.15s ease-out",
                }}>
                  <button onClick={() => { copyAddress(); setWalletDropdown(false); }} style={S.dropdownItem}>
                    <span style={S.dropdownIcon}>⧉</span> {copied ? "Copied!" : "Copy Address"}
                  </button>
                  <div style={S.dropdownDivider} />
                  <button onClick={() => { wallet?.view(); setWalletDropdown(false); }} style={S.dropdownItem}>
                    <span style={S.dropdownIcon}>↗</span> Manage Wallet
                  </button>
                  <div style={S.dropdownDivider} />
                  <button onClick={() => setWalletView("withdraw")} style={S.dropdownItem}>
                    <span style={S.dropdownIcon}>↗</span> Withdraw
                  </button>
                  <div style={S.dropdownDivider} />
                  <button onClick={() => { logout(); setWalletDropdown(false); }} style={{ ...S.dropdownItem, color: "#A1A6AA" }}>
                    <span style={S.dropdownIcon}>⏻</span> Logout
                  </button>
                  {/* User History inside dropdown */}
                  {userHistory.length > 0 && (
                    <div style={{ borderTop: "1px solid #1B1C1D", padding: "10px 14px 4px" }}>
                      <div style={{ fontSize: 9, letterSpacing: 2, color: CYAN, fontWeight: 700, marginBottom: 8 }}>YOUR HISTORY</div>
                      <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {userHistory.map((h, i) => {
                          const isWin = h.won;
                          const potRaw = Number(h.pot || 0);
                          const { feeBps: fb, resolverReward: rr } = feeConfig.current;
                          const distributable = Math.max(potRaw - Math.floor(potRaw * fb / 10000) - rr, 0);
                          const perWinner = distributable / (h.numWinners || 1);
                          const displayAmt = isWin ? (perWinner / 1e6) : 1;
                          const pickTx = h.pickTxHash || null;
                          const payoutTx = isWin ? (roundTxMap.get(Number(h.roundId)) || null) : null;
                          return (
                            <div key={h.roundId} style={{
                              display: "grid", gridTemplateColumns: "34px 40px 22px 1fr 46px 46px",
                              alignItems: "center", padding: "5px 0", gap: 5,
                              borderBottom: i < userHistory.length - 1 ? "1px solid #161616" : "none",
                              fontSize: 11,
                            }}>
                              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "2px 4px", borderRadius: 3, textAlign: "center", background: isWin ? "rgba(85,246,120,0.12)" : "#1B1C1D", color: isWin ? WIN : G3 }}>
                                {isWin ? "WON" : "LOST"}
                              </span>
                              <span style={{ color: "#757C82", fontSize: 10 }}>R#{h.roundId}</span>
                              <span style={{ color: "#585F67", fontSize: 10 }}>{CELL_LABELS[h.cell] || "?"}</span>
                              <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 10, fontWeight: 700, color: isWin ? WIN : G3, textAlign: "right" }}>
                                {isWin ? "+" : "-"}{displayAmt.toFixed(2)} INIT
                              </span>
                              <span style={{ textAlign: "right", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                                {pickTx ? (
                                  <a href={`/tx/${pickTx}`} target="_blank" rel="noopener noreferrer"
                                    title="Your entry (pick) tx"
                                    style={{ color: CYAN, textDecoration: "none", whiteSpace: "nowrap" }}>
                                    {shortTx(pickTx)} ↗
                                  </a>
                                ) : (
                                  <span style={{ color: "#585F67" }}>—</span>
                                )}
                              </span>
                              <span style={{ textAlign: "right", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                                {payoutTx ? (
                                  <a href={`/tx/${payoutTx}`} target="_blank" rel="noopener noreferrer"
                                    title="Payout + $ZERO mint tx"
                                    style={{ color: WIN, textDecoration: "none", whiteSpace: "nowrap" }}>
                                    {shortTx(payoutTx)} ↗
                                  </a>
                                ) : (
                                  <span style={{ color: "#585F67" }}>—</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {userHistoryOffset.current < userHistoryTotal.current && (
                        <button
                          onClick={() => {
                            setUserHistoryLoading(true);
                            fetchUserHistory(userHistoryOffset.current, 10).then(results => {
                              setUserHistory(prev => {
                                const ids = new Set(prev.map(h => h.roundId));
                                return [...prev, ...results.filter(r => !ids.has(r.roundId))];
                              });
                              userHistoryOffset.current += results.length;
                              setUserHistoryLoading(false);
                            });
                          }}
                          style={{ width: "100%", padding: "7px 0", marginTop: 6, background: CYAN_BG, border: `1px solid ${CYAN}55`, borderRadius: 4, color: CYAN, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: 1, cursor: "pointer" }}
                        >
                          {userHistoryLoading ? "SCANNING..." : "LOAD MORE"}
                        </button>
                      )}
                    </div>
                  )}
                  {!authenticated && userHistory.length === 0 && userHistoryLoading && (
                    <div style={{ padding: "8px 14px", fontSize: 10, color: "#585F67" }}>Scanning rounds...</div>
                  )}
                </div>
              )}
              {walletDropdown && walletView === "withdraw" && (
                <div className="grid-wallet-dropdown" style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  width: 300, background: "#101010",
                  border: "1px solid #2F3337", borderRadius: 8,
                  overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                  zIndex: 9999, animation: "dropIn 0.15s ease-out",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderBottom: "1px solid #1B1C1D",
                    background: "#0C0C0C",
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: CYAN, letterSpacing: 1.5, fontFamily: HEAD }}>↗ WITHDRAW INIT</span>
                    <button onClick={() => { setWalletView("menu"); setWithdrawError(""); setWithdrawSuccess(""); }} style={{
                      fontSize: 10, color: "#757C82", cursor: "pointer", background: "none",
                      border: "1px solid #1B1C1D", padding: "4px 10px", borderRadius: 4,
                      fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
                    }}>◀ BACK</button>
                  </div>
                  <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "0 2px" }}>
                      <span style={{ color: "#585F67" }}>Available</span>
                      <span style={{ color: "#EDEDED", fontWeight: 600, cursor: "pointer" }} onClick={() => setWithdrawAmt(fmt(ethBalance, 6))}>{fmt(ethBalance)} INIT (MAX)</span>
                    </div>
                    <input
                      placeholder="Destination address (init1...)"
                      value={withdrawAddr}
                      onChange={(e) => { setWithdrawAddr(e.target.value); setWithdrawError(""); setWithdrawSuccess(""); }}
                      style={{ ...S.dropdownInput, borderColor: withdrawError ? "#F85454" : "#2F3337" }}
                    />
                    <input
                      placeholder="Amount in INIT"
                      value={withdrawAmt}
                      onChange={(e) => { setWithdrawAmt(e.target.value); setWithdrawError(""); setWithdrawSuccess(""); }}
                      style={S.dropdownInput}
                    />
                    {withdrawError && (
                      <div style={{ fontSize: 10, color: "#A1A6AA", padding: "4px 2px", lineHeight: 1.4 }}>
                        △ {withdrawError}
                      </div>
                    )}
                    {withdrawSuccess && (
                      <div style={{ fontSize: 10, color: "#EDEDED", padding: "4px 2px", lineHeight: 1.4, fontWeight: 600 }}>
                        {withdrawSuccess}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        style={{ ...S.claimBtn, flex: 1, fontSize: 11, padding: "10px", opacity: withdrawing ? 0.6 : 1 }}
                        onClick={withdrawETH}
                        disabled={withdrawing}
                      >
                        {withdrawing ? "SENDING..." : "SEND"}
                      </button>
                      <button
                        style={{ ...S.claimBtn, fontSize: 11, padding: "10px 16px", borderColor: "#585F67", color: "#757C82", background: "none" }}
                        onClick={() => { setWalletDropdown(false); setWalletView("menu"); setWithdrawAddr(""); setWithdrawAmt(""); setWithdrawError(""); setWithdrawSuccess(""); }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </header>

      {/* ─── MAIN ─── */}
      <div style={S.main} className="grid-main">

        {/* ─── GRID AREA ─── */}
        <div style={S.gridArea} className="grid-game-area">

         {/* ─── PLAY SHELL — full-width responsive container ─── */}
         <div className="play-shell">

          {/* ─── LIVE STATS strip (real on-chain data) ─── */}
          {(() => {
            const c = config;
            const feePct = c ? (c.protocolFeeBps / 100) : 5;
            const entryInit = c ? (Number(c.entryFee) / 1e6) : 1;
            const odds = c ? c.bonusRoundOdds : 100;
            const mult = c ? c.bonusMultiplier : 10;
            const zeroPer = c ? (Number(c.zeroPerRound) / 1e6) : 100;
            const mlZero = c ? (Number(c.motherlodePerRound) / 1e6) : 1000;
            const timeLeft = Math.max(0, Math.floor(smoothTime));
            return (
              <div style={S.statsWrap} className="play-stats">
                <div style={S.statCard}>
                  <div style={S.statLabel}>Round</div>
                  <div style={{ ...S.statValue, color: CYAN }}>{round > 0 ? `#${round}` : "—"}</div>
                  {currentIsBonus && !resolved && <div style={{ ...S.statSub, color: GOLD }}>★ MOTHERLODE</div>}
                </div>
                <div style={S.statCard}>
                  <div style={S.statLabel}>Pot</div>
                  <div style={{ ...S.statValue, color: CYAN }}>{fmt(potSize)}</div>
                  <div style={S.statSub}>INIT</div>
                </div>
                <div style={S.statCard}>
                  <div style={S.statLabel}>Players</div>
                  <div style={S.statValue}>{activePlayers}</div>
                  <div style={S.statSub}>this round</div>
                </div>
                <div style={S.statCard}>
                  <div style={S.statLabel}>Time Left</div>
                  <div style={{ ...S.statValue, color: timerColor }}>{resolved ? "0" : timeLeft}<span style={{ fontSize: 10, color: G3 }}>s</span></div>
                  <div style={S.statSub}>60s rounds</div>
                </div>
                <div style={S.statCard}>
                  <div style={S.statLabel}>Entry Fee</div>
                  <div style={S.statValue}>{entryInit}<span style={{ fontSize: 10, color: G3 }}> INIT</span></div>
                  <div style={S.statSub}>{feePct}% protocol fee</div>
                </div>
                <div style={S.statCard}>
                  <div style={S.statLabel}>Motherlode</div>
                  <div style={{ ...S.statValue, color: GOLD }}>1-in-{odds}</div>
                  <div style={S.statSub}>{mult}× payout</div>
                </div>
                <div style={S.statCard}>
                  <div style={S.statLabel}>$ZERO / Round</div>
                  <div style={S.statValue}>{zeroPer}</div>
                  <div style={S.statSub}>ML {mlZero} $ZERO</div>
                </div>
                <div style={S.statCard}>
                  <div style={S.statLabel}>Treasury</div>
                  <div style={{ ...S.statValue, color: CYAN_LT }}>{fmt(escrow)}</div>
                  <div style={S.statSub}>escrow INIT</div>
                </div>
              </div>
            );
          })()}

          {/* ─── TWO-COLUMN ROW (desktop) / stacked (mobile) ─── */}
          <div className="play-cols">

           {/* ─── LEFT: GAME COLUMN ─── */}
           <div className="play-grid-col">

          {/* Timer */}
          <div style={S.timerWrap} className="play-timer">
            <div style={S.timerBarBg}>
              <div style={{
                ...S.timerBarFill,
                width: `${timerProgress * 100}%`,
                backgroundColor: timerColor,
                boxShadow: `0 0 20px ${timerColor}66`,
              }} />
            </div>
            <div style={{ minWidth: 70, textAlign: "right" }}>
              <span style={{ ...S.timerNum, color: timerColor }}>
                {Math.floor(smoothTime)}
                <span style={S.timerMs}>.{Math.floor((smoothTime % 1) * 10)}</span>s
              </span>
            </div>
          </div>

          {/* Grid */}
          <div style={S.gridOuter} className="play-grid-outer">
            <div style={S.cornerTL} /><div style={S.cornerTR} />
            <div style={S.cornerBL} /><div style={S.cornerBR} />

            {/* Grid flash on new round */}
            {gridFlash && (
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: 8, zIndex: 15, pointerEvents: "none",
                animation: "gridResetFlash 0.6s ease-out forwards",
              }} />
            )}

            {/* ─── Resolution overlay ─── */}
            {smoothTime <= 0 && round > 0 && !resolved && (
              <div style={{
                position: "absolute", inset: 0, borderRadius: 8, zIndex: 20,
                display: "flex", alignItems: "center", justifyContent: "center",
                backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
                background: "rgba(8,8,8,0.75)",
                animation: "fadeIn 0.15s ease-out",
              }}>
                <div style={{ position: "relative", width: 56, height: 56 }}>
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#2B6BFF", borderRightColor: "#2B6BFF", animation: "spin 0.9s linear infinite" }} />
                  <div style={{ position: "absolute", inset: 7, borderRadius: "50%", border: "2px solid transparent", borderBottomColor: CYAN_DK, borderLeftColor: CYAN_DK, animation: "spinR 0.65s linear infinite" }} />
                  <div style={{ position: "absolute", inset: 14, borderRadius: "50%", border: "2px solid transparent", borderTopColor: CYAN_LT, animation: "spin 1.3s linear infinite" }} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: CYAN, animation: "pulse 1.2s ease-in-out infinite" }}>⬡</div>
                </div>
              </div>
            )}

            <div style={S.grid}>
              {CELL_LABELS.map((label, idx) => {
                const state = getCellState(idx);
                const zone = getCellZone(idx);
                const isSelected = selectedCell === idx;
                const isWinnerCell = resolved && winningCell === idx;
                const zoneStyle = zone === "dark" ? S.cellDark
                  : zone === "opening" ? S.cellOpening : S.cellLight;
                const hoverZone = zone === "dark" ? S.cellDarkHover
                  : zone === "opening" ? S.cellOpeningHover : S.cellLightHover;
                return (
                  <button
                    key={idx}
                    style={{
                      ...S.cell,
                      ...zoneStyle,
                      ...(state === "winner" ? S.cellWinner : {}),
                      ...(state === "yours" ? S.cellYours : {}),
                      ...(state === "claimed" ? S.cellClaimed : {}),
                      ...(isSelected ? S.cellSelected : {}),
                      ...(hoveredCell === idx && state === "empty" ? {
                        ...hoverZone,
                        transform: "translateY(-3px) scale(1.03)",
                      } : {}),
                      transition: "all 0.15s ease",
                      animationDelay: isWinnerCell ? "0s" : `${Math.floor(idx / GRID_SIZE) * 0.08}s`,
                    }}
                    onMouseEnter={() => setHoveredCell(idx)}
                    onMouseLeave={() => setHoveredCell(-1)}
                    onClick={() => {
                      if (!canClaim(idx)) return;
                      const now = Date.now();
                      const last = lastTapRef.current;
                      if (last.cell === idx && now - last.time < 400 && !claiming) {
                        // Double-tap/click — claim directly
                        claimCell(idx);
                        lastTapRef.current = { cell: -1, time: 0 };
                      } else {
                        // First tap — select
                        setSelectedCell(idx);
                        lastTapRef.current = { cell: idx, time: now };
                      }
                    }}
                    onDoubleClick={() => { if (canClaim(idx) && !claiming) claimCell(idx); }}
                  >
                    <span style={S.cellLabel}>{label}</span>
                    {state === "winner" && <span style={{ ...S.cellIcon, animation: "winnerPop 0.6s ease-out" }}>★</span>}
                    {state === "yours" && <span style={S.cellIcon}>◈</span>}
                    {state === "claimed" && state !== "yours" && <span style={S.cellIcon}>{cellCounts[idx] > 1 ? `${cellCounts[idx]}×` : "◈"}</span>}
                    {state === "empty" && <span style={{ fontSize: 14, opacity: 0.25 }}>◇</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div style={S.statusBar} className="play-status">
            <span style={{ fontWeight: 600 }}>{getStatus()}</span>
            <span style={{ color: "#A1A6AA" }}>{activePlayers} PLAYERS</span>
          </div>

          {/* Player dots */}
          <div style={S.dots} className="play-dots">
            {Array.from({ length: TOTAL_CELLS }).map((_, i) => (
              <div key={i} style={{
                ...S.progressDot,
                backgroundColor: i < activePlayers ? "#2B6BFF" : "#242629",
              }} />
            ))}
          </div>

          {/* Entry currency is native INIT — no approval step on Initia */}

          {/* Quick instruction */}
          {authenticated && playerCell < 0 && !resolved && smoothTime > 0 && (
            <div style={{
              width: "100%", maxWidth: 620, textAlign: "center",
              padding: "8px 12px", marginTop: 6,
              fontSize: 10, letterSpacing: 1.5, color: "#585F67",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              ◆ TAP TO SELECT · DOUBLE-TAP TO CLAIM ◆
            </div>
          )}

          {/* Claim button — below grid */}
          {selectedCell !== null && !claiming && authenticated && (
            <button style={{ ...S.claimBtn, maxWidth: 520, marginTop: 12 }} onClick={() => claimCell(selectedCell)}>
              ⬡ LOCK CELL {CELL_LABELS[selectedCell]} — {CELL_COST} INIT
            </button>
          )}
          {claiming && (
            <div style={{ ...S.claimingBar, maxWidth: 620, marginTop: 12 }}><div style={S.claimingDot} />CONFIRMING TX...</div>
          )}

          {/* ─── MOBILE USER HISTORY (hidden on desktop, shown on mobile) ─── */}
          {authenticated && userHistory.length > 0 && (
            <div className="grid-mobile-user-history" style={{
              width: "100%", maxWidth: 720, marginTop: 14,
              borderRadius: 10,
              border: "1px solid #242629",
              background: "#101010",
              overflow: "hidden",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px",
                borderBottom: "1px solid #1B1C1D",
                background: "#0C0C0C",
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: CYAN, fontFamily: HEAD }}>YOUR HISTORY</span>
                <span style={{ fontSize: 10, color: "#757C82", letterSpacing: 1 }}>
                  {userHistoryLoading ? "SCANNING..." : `${userHistory.length} ROUNDS`}
                </span>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(6, 1fr)",
                padding: "8px 16px 4px", gap: 4,
                borderBottom: "1px solid #1B1C1D",
              }}>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700 }}>RES</span>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700 }}>ROUND</span>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700 }}>CELL</span>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700, textAlign: "right" }}>P&L</span>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700, textAlign: "right" }}>PICK</span>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700, textAlign: "right" }}>PAYOUT</span>
              </div>
              <div className="grid-user-history-scroll" style={{ maxHeight: 240, overflowY: "auto" }}>
                {userHistory.map((h, i) => {
                  const isWin = h.won;
                  const potRaw = Number(h.pot || 0);
                  const { feeBps, resolverReward } = feeConfig.current;
                  const distributable = Math.max(potRaw - Math.floor(potRaw * feeBps / 10000) - resolverReward, 0);
                  const perWinner = distributable / (h.numWinners || 1);
                  const displayAmt = isWin ? (perWinner / 1e6) : 1;
                  const pickTx = h.pickTxHash || null;
                  const payoutTx = isWin ? (roundTxMap.get(Number(h.roundId)) || null) : null;
                  return (
                    <div key={h.roundId} style={{
                      display: "grid", gridTemplateColumns: "repeat(6, 1fr)",
                      alignItems: "center",
                      padding: "7px 16px", gap: 4,
                      borderBottom: "1px solid #161616",
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 1,
                        padding: "2px 0", borderRadius: 3, textAlign: "center",
                        background: isWin ? "rgba(85,246,120,0.12)" : "#1B1C1D",
                        color: isWin ? WIN : G3,
                      }}>
                        {isWin ? "WON" : "LOST"}
                      </span>
                      <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, fontWeight: 700, color: "#EDEDED" }}>#{h.roundId}</span>
                      <span style={{ fontSize: 11, color: "#A1A6AA" }}>{CELL_LABELS[h.cell] || "?"}</span>
                      <span style={{
                        fontFamily: "'Archivo', sans-serif", fontSize: 10, fontWeight: 700,
                        color: isWin ? WIN : G3, textAlign: "right", whiteSpace: "nowrap",
                      }}>
                        {isWin ? "+" : "-"}{displayAmt.toFixed(2)} INIT
                      </span>
                      <span style={{ textAlign: "right", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                        {pickTx ? (
                          <a href={`/tx/${pickTx}`} target="_blank" rel="noopener noreferrer"
                            title="Your entry (pick) tx"
                            style={{ color: CYAN, textDecoration: "none", whiteSpace: "nowrap" }}>
                            {shortTx(pickTx)} ↗
                          </a>
                        ) : (
                          <span style={{ color: "#585F67" }}>—</span>
                        )}
                      </span>
                      <span style={{ textAlign: "right", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                        {payoutTx ? (
                          <a href={`/tx/${payoutTx}`} target="_blank" rel="noopener noreferrer"
                            title="Payout + $ZERO mint tx"
                            style={{ color: WIN, textDecoration: "none", whiteSpace: "nowrap" }}>
                            {shortTx(payoutTx)} ↗
                          </a>
                        ) : (
                          <span style={{ color: "#585F67" }}>—</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {userHistory.length > 0 && userHistoryOffset.current < userHistoryTotal.current && (
                <div style={{
                  padding: "8px 16px", textAlign: "center",
                  borderTop: "1px solid #1B1C1D",
                  background: "#0C0C0C",
                }}>
                  <button
                    onClick={() => {
                      setUserHistoryLoading(true);
                      fetchUserHistory(userHistoryOffset.current, 10).then(results => {
                        setUserHistory(prev => {
                          const ids = new Set(prev.map(h => h.roundId));
                          return [...prev, ...results.filter(r => !ids.has(r.roundId))];
                        });
                        userHistoryOffset.current += results.length;
                        setUserHistoryLoading(false);
                      });
                    }}
                    style={{
                      width: "100%", padding: "6px 0",
                      background: CYAN_BG, border: `1px solid ${CYAN}55`,
                      borderRadius: 4, color: CYAN, fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                      letterSpacing: 1, cursor: "pointer",
                    }}
                  >
                    {userHistoryLoading ? "SCANNING..." : "LOAD MORE"}
                  </button>
                </div>
              )}
            </div>
          )}

           </div>{/* ─── /LEFT GAME COLUMN ─── */}

           {/* ─── RIGHT: SIDEBAR COLUMN (round history + live feed) ─── */}
           <div className="play-side-col">

          {/* ─── ROUND HISTORY TABLE (paginated) ─── */}
          {(() => {
            const totalPages = Math.ceil(roundHistory.length / HISTORY_PAGE_SIZE) || 1;
            const pageStart = historyPage * HISTORY_PAGE_SIZE;
            const pageRows = roundHistory.slice(pageStart, pageStart + HISTORY_PAGE_SIZE);
            const hasOlder = roundHistory.length > 0 && (historyPage < totalPages - 1 || !historyFullyLoaded);
            const hasNewer = historyPage > 0;
            return (
            <div className="play-history-card" style={{
              width: "100%", maxWidth: 520, marginTop: 14,
              borderRadius: 10,
              border: "1px solid #242629",
              background: "#101010",
              overflow: "hidden",
              animation: "winnerBannerIn 0.5s ease-out",
            }}>
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px",
                borderBottom: "1px solid #1B1C1D",
                background: "#0C0C0C",
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: G1, fontFamily: HEAD }}>ROUND HISTORY</span>
                <span style={{ fontSize: 10, color: "#757C82", letterSpacing: 1 }}>
                  {historyLoading ? "SCANNING..." : `${roundHistory.length} ROUNDS${historyFullyLoaded ? "" : "+"} · PAGE ${historyPage + 1}`}
                </span>
              </div>
              {/* Column headers */}
              <div style={{
                display: "grid", gridTemplateColumns: "52px 1fr 48px 1fr 58px",
                padding: "8px 16px 4px", gap: 4,
                borderBottom: "1px solid #1B1C1D",
              }}>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700 }}>ROUND</span>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700 }}>WINNER</span>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700, textAlign: "right" }}>PLAYERS</span>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700, textAlign: "right" }}>POT</span>
                <span style={{ fontSize: 9, color: "#585F67", letterSpacing: 1.5, fontWeight: 700, textAlign: "right" }}>TX</span>
              </div>
              {/* Rows */}
              <div className="play-history-rows">
                {pageRows.length === 0 && (
                  <div style={{ padding: "20px 16px", textAlign: "center", color: "#757C82", fontSize: 11, letterSpacing: 1 }}>
                    {historyLoading ? "⟐ SCANNING ROUNDS..." : "NO ROUNDS WITH PLAYERS FOUND"}
                  </div>
                )}
                {pageRows.map((r, i) => {
                  const globalIdx = pageStart + i;
                  const isLatest = globalIdx === 0 && moneyFlow;
                  const isBonus = !!r.isBonus;
                  const txHash = roundTxMap.get(Number(r.roundId)) || null;
                  return (
                    <div key={r.roundId} style={{
                      display: "grid", gridTemplateColumns: "52px 1fr 48px 1fr 58px",
                      alignItems: "center",
                      padding: "7px 16px", gap: 4,
                      borderBottom: "1px solid #1B1C1D",
                      background: isLatest ? CYAN_BG : isBonus ? "rgba(248,194,79,0.05)" : "transparent",
                      transition: "background 0.5s ease",
                      animation: globalIdx === 0 ? "winnerBannerIn 0.4s ease-out" : "none",
                    }}>
                      <span style={{
                        fontFamily: "'Archivo', sans-serif", fontSize: 11, fontWeight: 700,
                        color: isLatest ? CYAN : "#EDEDED",
                      }}>#{r.roundId}</span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
                        color: r.resolved === false ? "#A1A6AA" : (isBonus ? GOLD : CYAN), letterSpacing: 0.5,
                      }}>
                        {r.resolved === false ? "⏳" : (CELL_LABELS[r.cell] || "?")}
                        {isBonus && r.resolved !== false && (
                          <span title="Motherlode round" style={{ fontSize: 10, color: GOLD }}>★ BONUS</span>
                        )}
                      </span>
                      <span style={{
                        fontFamily: "'Archivo', sans-serif", fontSize: 11, fontWeight: 600,
                        color: "#A1A6AA", textAlign: "right",
                      }}>{r.players ?? "—"}</span>
                      <span style={{
                        fontFamily: "'Archivo', sans-serif", fontSize: 11, fontWeight: 700,
                        color: isLatest ? CYAN : "#EDEDED", textAlign: "right",
                        animation: isLatest ? "pulse 1s ease-in-out infinite" : "none",
                      }}>{fmt(r.pot)}</span>
                      <span style={{ textAlign: "right", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                        {txHash ? (
                          <a href={`/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                            title="Payout + $ZERO mint tx"
                            style={{ color: CYAN, textDecoration: "none", whiteSpace: "nowrap" }}>
                            {shortTx(txHash)} ↗
                          </a>
                        ) : (
                          <span style={{ color: "#585F67" }}>—</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Pagination */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 16px",
                borderTop: "1px solid #1B1C1D",
                background: "#0C0C0C",
              }}>
                <button
                  onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                  disabled={!hasNewer}
                  style={{
                    background: hasNewer ? "#0C1733" : "transparent",
                    border: hasNewer ? "1px solid #2B6BFF55" : "1px solid #1B1C1D",
                    color: hasNewer ? CYAN : "#585F67",
                    padding: "4px 14px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    letterSpacing: 1.5, cursor: hasNewer ? "pointer" : "default",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >◀ NEWER</button>
                <span style={{ fontSize: 10, color: "#757C82", letterSpacing: 1 }}>
                  {pageStart + 1}–{Math.min(pageStart + HISTORY_PAGE_SIZE, roundHistory.length)} of {roundHistory.length}{historyFullyLoaded ? "" : "+"}
                </span>
                <button
                  onClick={() => {
                    const nextPage = historyPage + 1;
                    const nextStart = nextPage * HISTORY_PAGE_SIZE;
                    // If we need more data, fetch it
                    if (nextStart >= roundHistory.length - HISTORY_PAGE_SIZE && !historyFullyLoaded) {
                      loadOlderHistory();
                    }
                    setHistoryPage(nextPage);
                  }}
                  disabled={!hasOlder || historyLoading}
                  style={{
                    background: hasOlder ? "#0C1733" : "transparent",
                    border: hasOlder ? "1px solid #2B6BFF55" : "1px solid #1B1C1D",
                    color: hasOlder ? CYAN : "#585F67",
                    padding: "4px 14px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    letterSpacing: 1.5, cursor: hasOlder ? "pointer" : "default",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >{historyLoading ? "LOADING..." : "OLDER ▶"}</button>
              </div>
            </div>
            );
          })()}

          {/* ─── LIVE ACTIVITY FEED (real session events) ─── */}
          <div className="play-feed-card" style={{
            width: "100%", maxWidth: 520, marginTop: 14,
            borderRadius: 10, border: "1px solid #242629", background: "#101010", overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px", borderBottom: "1px solid #1B1C1D", background: "#0C0C0C",
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: G1, fontFamily: HEAD }}>LIVE FEED</span>
              <span style={S.liveTag}>● LIVE</span>
            </div>
            <div className="play-feed-rows" style={{ padding: "8px 16px", maxHeight: 240, overflowY: "auto" }}>
              {feed.length === 0 ? (
                <div style={S.feedEmpty}>Waiting for activity…</div>
              ) : (
                feed.map((f, i) => (
                  <div key={f.time + "-" + i} style={S.feedItem}>
                    <span style={S.feedTime}>{new Date(f.time).toLocaleTimeString([], { hour12: false })}</span>
                    <span style={{ color: G2 }}>{f.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>

           </div>{/* ─── /RIGHT SIDEBAR COLUMN ─── */}

          </div>{/* ─── /TWO-COLUMN ROW ─── */}

          {/* ─── CONTRACT / ON-CHAIN INFO (full width) ─── */}
          <div className="play-contract-card" style={{
            width: "100%", maxWidth: 520, marginTop: 14,
            borderRadius: 10, border: "1px solid #242629", background: "#101010", overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px", borderBottom: "1px solid #1B1C1D", background: "#0C0C0C",
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: G1, fontFamily: HEAD }}>CONTRACT</span>
              <span style={{ fontSize: 10, color: CYAN, letterSpacing: 1 }}>● {CHAIN_ID}</span>
            </div>
            <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 9, letterSpacing: 1.5, color: "#585F67", fontWeight: 700, flexShrink: 0 }}>GRIDZERO PKG</span>
                <a href={`https://scan.initia.xyz/interwoven-1/accounts/${GRIDZERO_PKG}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: CYAN, textDecoration: "none", wordBreak: "break-all", textAlign: "right" }}>
                  {`${GRIDZERO_PKG.slice(0, 12)}…${GRIDZERO_PKG.slice(-8)}`} ↗
                </a>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 9, letterSpacing: 1.5, color: "#585F67", fontWeight: 700 }}>$ZERO ASSET</span>
                <span style={{ fontSize: 10, color: "#A1A6AA", textAlign: "right" }}>Native FA · 6 decimals</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 9, letterSpacing: 1.5, color: "#585F67", fontWeight: 700 }}>ENTRY · VRF</span>
                <span style={{ fontSize: 10, color: "#A1A6AA", textAlign: "right" }}>Native INIT · keccak-derived VRF</span>
              </div>
            </div>
          </div>

         </div>{/* ─── /PLAY SHELL ─── */}
        </div>

      </div>

      {/* Debug: show poll errors visibly */}
      {round === 0 && (
        <div style={{
          width: "100%", maxWidth: 900, padding: "10px 16px", margin: "8px auto",
          background: "rgba(248,84,84,0.08)", border: "1px solid rgba(248,84,84,0.35)",
          borderRadius: 8, fontSize: 11, color: "#A1A6AA", fontFamily: "'JetBrains Mono', monospace",
        }}>
          <b>△ DEBUG:</b> Round = 0 (not loading). Polls: {pollCount.current}.
          {pollError.current && <span> Error: {pollError.current}</span>}
          {!pollError.current && <span> No error caught — poll may not have run yet. Check console.</span>}
          <br/>REST: Initia (interwoven-1) | Package: {(GRIDZERO_ADDR || "(unset)").slice(0,10)}...
        </div>
      )}

      {/* ─── FOOTER ─── */}
      <footer style={S.footer}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LogoIcon size={16} />
          <span style={S.gridOnline}>GRID ONLINE</span>
        </span>
        <span style={{ fontSize: 11, color: "#585F67", letterSpacing: 1 }}>ON-CHAIN · INITIA · KECCAK-DERIVED VRF</span>
      </footer>

      {/* ─── CSS ─── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; padding: 0; background: #0C0C0C; overflow-x: hidden; }
        @keyframes cellAppear { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 8px rgba(43,107,255,0.35), inset 0 0 8px rgba(43,107,255,0.12); }
          50% { box-shadow: 0 0 20px rgba(43,107,255,0.65), inset 0 0 15px rgba(43,107,255,0.22); }
        }
        @keyframes winnerGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(43,107,255,0.45), inset 0 0 10px rgba(43,107,255,0.15); }
          50% { box-shadow: 0 0 30px rgba(43,107,255,0.85), inset 0 0 20px rgba(43,107,255,0.32); }
        }
        @keyframes slideIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes moneyFlowBg {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes coinFlow {
          0% { opacity: 0; transform: translateX(-8px) scale(0.5); }
          40% { opacity: 1; transform: translateX(0) scale(1); }
          100% { opacity: 0; transform: translateX(8px) scale(0.5); }
        }
        @keyframes winnerPop {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes gridResetFlash {
          0% { background: rgba(43,107,255,0.22); }
          100% { background: transparent; }
        }
        @keyframes particleFlow {
          0% { left: -5%; opacity: 0; }
          15% { opacity: 0.8; }
          85% { opacity: 0.8; }
          100% { left: 105%; opacity: 0; }
        }
        @keyframes winnerBannerIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes scanGlow {
          0% { text-shadow: 0 0 4px #2B6BFF; }
          50% { text-shadow: 0 0 12px #2B6BFF, 0 0 24px #2B6BFF44; }
          100% { text-shadow: 0 0 4px #2B6BFF; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes spinR { to { transform: rotate(-360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes navGlow { 0%,100%{text-shadow:0 0 6px rgba(43,107,255,0.55)}50%{text-shadow:0 0 14px rgba(43,107,255,0.95)} }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        .nav-btn-home:hover { color: #F5F5F5 !important; }
        .nav-btn-play { pointer-events: none; }
        .wallet-addr-mobile { display: none !important; }
        .wallet-addr-desktop { display: inline !important; }
        @media (max-width: 640px) {
          .grid-header-nav { display: none !important; }
          .grid-header-stat { display: none !important; }
          .grid-mobile-balances { display: none !important; }
          .wallet-addr-desktop { display: none !important; }
          .wallet-addr-mobile { display: flex !important; }
          .grid-logo-text { font-size: 14px !important; letter-spacing: 1px !important; }
          .grid-header-logo-icon { width: 18px !important; height: 18px !important; }
          .grid-header-wallet-btn button { font-size: 9px !important; padding: 5px 8px !important; letter-spacing: 0.5px !important; }
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .grid-user-history-scroll::-webkit-scrollbar { width: 4px; }
        .grid-user-history-scroll::-webkit-scrollbar-track { background: #161616; }
        .grid-user-history-scroll::-webkit-scrollbar-thumb { background: #2F3337; border-radius: 2px; }
        @media (max-width: 768px) {
          .grid-wallet-dropdown { right: 0 !important; left: auto !important; max-width: calc(100vw - 16px) !important; }
        }
        @media (max-width: 768px) {
          .grid-main { flex-direction: column !important; }
          .grid-mobile-user-history { display: block !important; }
          .grid-sidebar-backdrop {
            display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.75); z-index: 9998;
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
            touch-action: none;
          }
          .grid-sidebar-backdrop.open { display: block !important; }
          .grid-sidebar {
            position: fixed !important; top: 0 !important; right: 0 !important; bottom: 0 !important;
            width: 90vw !important; max-width: 420px !important;
            height: 100% !important; height: 100dvh !important;
            z-index: 9999 !important;
            overflow-y: auto !important; overflow-x: hidden !important;
            -webkit-overflow-scrolling: touch !important;
            background: #101010 !important;
            border-left: 1px solid #242629 !important;
            padding: 0 16px 16px !important;
            padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important;
            transform: translateX(100%) !important;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            box-shadow: none !important;
            will-change: transform !important;
            overscroll-behavior: contain !important;
          }
          .grid-sidebar.open {
            transform: translateX(0) !important;
            box-shadow: -8px 0 40px rgba(0,0,0,0.6) !important;
          }
          .grid-sidebar-header {
            position: sticky !important; top: 0 !important; z-index: 10 !important;
            background: #101010 !important;
            padding: 16px 0 12px !important;
            margin: 0 -16px !important; padding-left: 16px !important; padding-right: 16px !important;
            padding-top: calc(16px + env(safe-area-inset-top, 0px)) !important;
            border-bottom: 1px solid #1B1C1D !important;
            display: flex !important; justify-content: space-between !important; align-items: center !important;
          }
          .grid-game-area {
            padding: 8px 12px !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            max-height: none !important;
            justify-content: flex-start !important;
            flex: 1 1 auto !important;
            min-height: 0 !important;
          }
          .grid-header-stat { display: none !important; }
          .grid-header-wallet-btn { font-size: 10px !important; }
        }

      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function LogoIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <defs>
        <linearGradient id={`lg${size}`} x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={CYAN} />
          <stop offset="100%" stopColor={CYAN_DK} />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="72" height="72" rx="16" fill="#101010" stroke={CYAN} strokeWidth="2" strokeOpacity="0.55" />
      <line x1="30" y1="4" x2="30" y2="76" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5" />
      <line x1="50" y1="4" x2="50" y2="76" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5" />
      <line x1="4" y1="30" x2="76" y2="30" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5" />
      <line x1="4" y1="50" x2="76" y2="50" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5" />
      <text x="40" y="56" textAnchor="middle" fontFamily={HEAD} fontWeight="900" fontSize="48" fill={`url(#lg${size})`} letterSpacing="-2">0</text>
    </svg>
  );
}

function Panel({ title, live, children }) {
  return (
    <div style={S.panel}>
      <div style={S.panelHead}>
        <span>{title}</span>
        {live && <span style={S.liveTag}>● LIVE</span>}
      </div>
      <div style={{ padding: "8px 14px" }}>{children}</div>
    </div>
  );
}

function Row({ label, value, hl }) {
  return (
    <div style={S.row}>
      <span style={S.rowLabel}>{label}</span>
      <span style={{ ...S.rowValue, ...(hl ? { color: "#EDEDED" } : {}) }}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const S = {
  root: {
    fontFamily: "'JetBrains Mono', monospace",
    background: "radial-gradient(ellipse at 50% -5%, #0C1733 0%, #101010 40%, #0C0C0C 100%)",
    color: G2, minHeight: "100vh",
    display: "flex", flexDirection: "column",
    position: "relative",
  },
  scanOverlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: "none", zIndex: 2, transition: "background 0.04s linear",
  },
  crtLines: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: "none", zIndex: 1,
    backgroundImage: "radial-gradient(rgba(43,107,255,0.045) 1px, transparent 1px)",
    backgroundSize: "22px 22px",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "0 20px", height: 64, borderBottom: "1px solid #1B1C1D",
    background: "rgba(12,12,12,0.94)", backdropFilter: "blur(8px)", zIndex: 10, position: "relative",
    flexWrap: "nowrap", gap: 8, flexShrink: 0,
  },
  hLeft: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  hRight: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 3, background: CYAN, boxShadow: `0 0 12px ${CYAN}` },
  logo: { fontFamily: HEAD, fontWeight: 900, fontSize: 18, color: G0, letterSpacing: 2 },
  logoSub: { fontFamily: HEAD, fontWeight: 600, fontSize: 18, color: CYAN, letterSpacing: 2 },
  badge: { fontSize: 9, padding: "2px 6px", borderRadius: 3, background: CYAN_BG, color: CYAN, letterSpacing: 1.5, fontWeight: 700 },
  hStat: { fontSize: 13, color: G2, letterSpacing: 0.5, fontFamily: "'JetBrains Mono', monospace" },
  loginBtn: {
    fontFamily: HEAD, fontSize: 11, fontWeight: 800,
    padding: "7px 14px", borderRadius: 6,
    border: `1px solid ${CYAN}`,
    background: CYAN_BG,
    color: CYAN, cursor: "pointer", letterSpacing: 1.5,
  },
  menuBtn: { fontSize: 20, background: "none", border: "1px solid #242629", color: G1, borderRadius: 6, padding: "4px 10px", cursor: "pointer" },
  main: { display: "flex", flex: 1, gap: 0, position: "relative", zIndex: 5 },
  gridArea: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "16px 24px", minHeight: 0, overflowY: "auto" },
  timerWrap: { width: "100%", maxWidth: 620, display: "flex", alignItems: "center", gap: 12, marginBottom: 12 },
  timerBarBg: { flex: 1, height: 12, borderRadius: 6, background: "#1B1C1D", overflow: "hidden", border: "1px solid #242629" },
  timerBarFill: { height: "100%", borderRadius: 6 },
  timerNum: { fontFamily: HEAD, fontSize: 20, fontWeight: 800, transition: "color 0.5s ease" },
  timerMs: { fontSize: 14, opacity: 0.7 },
  gridOuter: { position: "relative", width: "100%", maxWidth: 620, padding: 12 },
  cornerTL: { position: "absolute", top: 0, left: 0, width: 20, height: 20, borderLeft: `2px solid ${CYAN}`, borderTop: `2px solid ${CYAN}`, opacity: 0.55 },
  cornerTR: { position: "absolute", top: 0, right: 0, width: 20, height: 20, borderRight: `2px solid ${CYAN}`, borderTop: `2px solid ${CYAN}`, opacity: 0.55 },
  cornerBL: { position: "absolute", bottom: 0, left: 0, width: 20, height: 20, borderLeft: `2px solid ${CYAN}`, borderBottom: `2px solid ${CYAN}`, opacity: 0.55 },
  cornerBR: { position: "absolute", bottom: 0, right: 0, width: 20, height: 20, borderRight: `2px solid ${CYAN}`, borderBottom: `2px solid ${CYAN}`, opacity: 0.55 },
  grid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, width: "100%" },
  cell: {
    fontFamily: "'JetBrains Mono', monospace", position: "relative",
    aspectRatio: "1", minHeight: 64,
    borderRadius: 8,
    cursor: "pointer", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 2,
    fontSize: 11, fontWeight: 600, transition: "all 0.15s ease",
    animation: "cellAppear 0.4s ease both",
    touchAction: "manipulation",
    border: "none",
  },
  // ── Base logo zones (Initia gray ramp) ──
  cellDark: {
    background: "#1B1C1D",
    border: "1px solid #2F3337",
    color: G4,
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)",
  },
  cellLight: {
    background: "#242629",
    border: "1px solid #383D42",
    color: G3,
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)",
  },
  cellOpening: {
    background: "#2F3337",
    border: "1px solid #383D42",
    color: G2,
    boxShadow: "inset 0 1px 4px rgba(0,0,0,0.25)",
  },
  cellDarkHover: {
    background: "#242629",
    borderColor: `${CYAN}66`,
    color: CYAN_LT,
    boxShadow: `inset 0 1px 3px rgba(0,0,0,0.3), 0 0 16px rgba(43,107,255,0.18)`,
  },
  cellLightHover: {
    background: "#2F3337",
    borderColor: `${CYAN}77`,
    color: CYAN_LT,
    boxShadow: `0 0 18px rgba(43,107,255,0.2)`,
  },
  cellOpeningHover: {
    background: "#383D42",
    borderColor: `${CYAN}88`,
    color: CYAN,
    boxShadow: `0 0 22px rgba(43,107,255,0.25)`,
  },
  cellClaimed: { borderColor: CYAN_DK, color: CYAN_LT },
  cellYours: { borderColor: CYAN, color: CYAN, background: CYAN_BG, animation: "glow 2s ease-in-out infinite" },
  cellWinner: { background: CYAN_BG, borderColor: CYAN, color: CYAN, boxShadow: "0 0 22px rgba(43,107,255,0.5), inset 0 0 12px rgba(43,107,255,0.2)", animation: "winnerGlow 1.5s ease-in-out infinite" },
  cellSelected: { background: CYAN_BG, borderColor: CYAN, color: CYAN, boxShadow: "0 0 24px rgba(43,107,255,0.45)" },
  cellLabel: { letterSpacing: 1 },
  cellIcon: { fontSize: 16 },
  statusBar: { display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 620, padding: "8px 12px", marginTop: 8, fontSize: 11, letterSpacing: 1.5, color: G3 },
  dots: { display: "flex", gap: 3, width: "100%", maxWidth: 620, padding: "0 12px" },
  progressDot: { flex: 1, height: 3, borderRadius: 2, transition: "background-color 0.5s ease" },
  sidebar: {
    width: 340, minWidth: 300, borderLeft: "1px solid #1B1C1D",
    background: "rgba(16,16,16,0.98)", padding: 16,
    display: "flex", flexDirection: "column", gap: 12,
    overflowY: "auto", maxHeight: "calc(100vh - 100px)",
  },
  closeBtn: { alignSelf: "flex-end", background: "none", border: "none", color: G2, fontSize: 18, cursor: "pointer", padding: "4px 8px" },
  loginPrompt: { border: `1px solid ${CYAN}33`, borderRadius: 8, background: CYAN_BG, padding: 16, textAlign: "center" },
  loginPromptTitle: { fontFamily: HEAD, fontSize: 16, fontWeight: 800, color: G0, marginTop: 14, marginBottom: 8, letterSpacing: 2 },
  loginPromptText: { fontSize: 12, color: G2, marginBottom: 12, lineHeight: 1.5 },
  panel: { border: "1px solid #242629", borderRadius: 8, background: "#101010", overflow: "hidden" },
  panelHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", fontSize: 11, fontWeight: 800, letterSpacing: 2, color: G1, borderBottom: "1px solid #1B1C1D", fontFamily: HEAD },
  liveTag: { color: CYAN, fontSize: 10, letterSpacing: 1, animation: "scanGlow 2s ease-in-out infinite" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 12 },
  rowLabel: { color: G3, letterSpacing: 0.5 },
  rowValue: { fontWeight: 800, color: G1, fontFamily: HEAD, fontSize: 13 },
  claimBtn: {
    fontFamily: HEAD, fontSize: 12, fontWeight: 800,
    padding: "14px 20px", borderRadius: 8,
    border: "none",
    background: CYAN,
    color: "#04181E", cursor: "pointer", letterSpacing: 1,
    transition: "all 0.2s", textAlign: "center", width: "100%",
    boxShadow: "0 4px 24px rgba(43,107,255,0.35)",
  },
  claimingBar: { display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderRadius: 8, border: `1px solid ${CYAN}55`, background: CYAN_BG, color: CYAN, fontSize: 12, fontWeight: 600, letterSpacing: 1 },
  claimingDot: { width: 8, height: 8, borderRadius: "50%", background: CYAN, animation: "pulse 1s ease-in-out infinite" },
  errorBox: { padding: "10px 14px", borderRadius: 6, border: `1px solid ${LOSS}55`, background: "rgba(248,84,84,0.08)", color: LOSS, fontSize: 11, cursor: "pointer" },
  feedBody: { maxHeight: 200, overflowY: "auto" },
  feedEmpty: { color: G4, fontSize: 12, fontStyle: "italic", padding: "12px 0" },
  feedItem: { fontSize: 11, padding: "4px 0", borderBottom: "1px solid #1B1C1D", display: "flex", gap: 8, animation: "slideIn 0.3s ease" },
  feedTime: { color: G4, fontSize: 10, flexShrink: 0 },
  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderTop: "1px solid #1B1C1D", background: "rgba(12,12,12,0.95)", zIndex: 10, position: "relative" },
  greenDot: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: CYAN, boxShadow: `0 0 6px ${CYAN}88` },
  gridOnline: { fontSize: 12, fontWeight: 800, color: CYAN, letterSpacing: 1.5, fontFamily: HEAD, animation: "scanGlow 3s ease-in-out infinite" },
  dropdownItem: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11, color: G1, cursor: "pointer",
    border: "none", background: "none", width: "100%",
    textAlign: "left", letterSpacing: 0.5,
    WebkitTapHighlightColor: "transparent",
  },
  dropdownIcon: { fontSize: 14, width: 20, textAlign: "center", color: CYAN },
  dropdownDivider: { height: 1, background: "#1B1C1D" },
  dropdownInput: {
    width: "100%", padding: "10px 12px", fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    background: "#0C0C0C", border: "1px solid #2F3337",
    borderRadius: 6, color: G1, outline: "none", letterSpacing: 0.3,
  },
  // ── LIVE STATS strip ──
  statsWrap: { width: "100%", maxWidth: 620, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 },
  statCard: { background: "#101010", border: "1px solid #242629", borderRadius: 8, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  statLabel: { fontSize: 8, letterSpacing: 1.5, color: G4, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  statValue: { fontFamily: HEAD, fontSize: 15, fontWeight: 800, color: G1, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  statSub: { fontSize: 8, color: G4, letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
};
