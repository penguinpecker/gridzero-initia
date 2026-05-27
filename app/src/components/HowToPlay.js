"use client";
import { useEffect, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// HOW TO PLAY — Initia brand
// #0C0C0C canvas · gray ramp · #2B6BFF cyan signature accent
// Gold #F8C24F = Motherlode · headings = Archivo (wide grotesk)
// ═══════════════════════════════════════════════════════════════

// Brand tokens
const CYAN = "#2B6BFF", CYAN_LT = "#5E90FF", CYAN_DK = "#173C99", CYAN_BG = "#0C1733";
const GOLD = "#F8C24F";
const G0 = "#F5F5F5", G1 = "#EDEDED", G2 = "#A1A6AA", G3 = "#757C82", G4 = "#585F67";
const HEAD = "'Archivo', sans-serif";

const GRID_SIZE = 5;
const CELL_LABELS = [];
for (let r = 0; r < GRID_SIZE; r++)
  for (let c = 0; c < GRID_SIZE; c++)
    CELL_LABELS.push(`${String.fromCharCode(65 + r)}${c + 1}`);

// Base logo pattern
const DARK_CELLS = new Set([0,1,2,3,4, 5,9, 10,14, 15,19, 20,21,22,23,24]);
const OPENING_CELLS = new Set([11,12,13]);
const getCellZone = (idx) => {
  if (DARK_CELLS.has(idx)) return "dark";
  if (OPENING_CELLS.has(idx)) return "opening";
  return "light";
};

// Demo states for the example grid
const DEMO_CLAIMED = new Set([1, 8, 12]);
const DEMO_YOURS = 9; // B5
const DEMO_WINNER = 12; // C3

function HTPLogoIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <defs>
        <linearGradient id={`htplg${size}`} x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={CYAN} />
          <stop offset="100%" stopColor={CYAN_DK} />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="72" height="72" rx="16" fill="#101010" stroke={CYAN} strokeWidth="2" strokeOpacity="0.55" />
      <line x1="30" y1="4" x2="30" y2="76" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5" />
      <line x1="50" y1="4" x2="50" y2="76" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5" />
      <line x1="4" y1="30" x2="76" y2="30" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5" />
      <line x1="4" y1="50" x2="76" y2="50" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5" />
      <text x="40" y="56" textAnchor="middle" fontFamily={HEAD} fontWeight="900" fontSize="48" fill={`url(#htplg${size})`} letterSpacing="-2">0</text>
    </svg>
  );
}

export default function HowToPlay() {
  const [scanLine, setScanLine] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setScanLine(p => (p + 0.4) % 110), 40);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={S.root}>
      {/* Dotted grid texture */}
      <div style={S.dotGrid} />
      {/* Scan line */}
      <div style={{
        ...S.scanOverlay,
        background: `linear-gradient(180deg,
          transparent ${scanLine - 2}%,
          rgba(43,107,255,0.05) ${scanLine - 1}%,
          rgba(43,107,255,0.14) ${scanLine}%,
          rgba(43,107,255,0.05) ${scanLine + 1}%,
          transparent ${scanLine + 2}%)`,
      }} />
      <div style={S.crtLines} />

      {/* Header */}
      <header style={S.header}>
        <div style={S.hLeft}>
          <HTPLogoIcon size={28} />
          <span style={S.logo}>GRID</span>
          <span style={S.logoSub}>ZERO</span>
          <span style={S.badge}>HOW TO PLAY</span>
        </div>
        <div style={S.hRight}>
          <a href="/" style={S.backBtn}>← BACK TO GRID</a>
        </div>
      </header>

      {/* Content */}
      <div style={S.content}>
        {/* Hero */}
        <div style={S.hero}>
          <div style={S.heroTag}>PROTOCOL BRIEFING</div>
          <h1 style={S.heroTitle}>HOW TO PLAY</h1>
          <p style={S.heroDesc}>
            Pick a cell. Lock 1 INIT. A provably fair VRF selects the winning cell.
            If it's yours, you take the pot. 60-second rounds, fully on-chain.
          </p>
        </div>

        {/* Steps */}
        <div style={S.steps}>
          <Step num="01" title="CONNECT & FUND">
            Connect the Initia Wallet extension or Keplr.
            You'll need <Hl>INIT on Initia</Hl> to play. Each round costs <Hl>1 INIT</Hl> per cell pick.
          </Step>

          <Step num="02" title="PICK YOUR CELL">
            The grid is a <Hl>5×5 board with 25 cells</Hl>. Each round lasts <Hl>60 seconds</Hl>.
            Click any cell to select it, then confirm to lock your pick on-chain.
            Multiple players can pick the same cell.
          </Step>

          <Step num="03" title="ROUND RESOLVES">
            When the timer hits zero, <Hl>provably fair on-chain randomness (keccak-derived VRF)</Hl> selects
            the winning cell from occupied cells only. This is cryptographically verifiable randomness — no one can
            predict or manipulate the outcome. It is <Hl>fully settled on Initia</Hl>.
          </Step>

          <Step num="04" title="WINNERS GET PAID">
            If you picked the winning cell, you <span style={{ color: CYAN, fontWeight: 600 }}>split the pot</span> with
            anyone else who picked the same cell. Fewer players on your cell = bigger payout.
            All payouts are instant and on-chain. Winners also earn <Hl>$ZERO tokens</Hl>.
          </Step>

          <Step num="05" title="NEXT ROUND STARTS">
            A new round begins automatically. The grid resets, the timer restarts,
            and you can pick again. Every round is independent — fresh odds, fresh grid, fresh chance.
          </Step>
        </div>

        {/* Demo Grid */}
        <div style={S.demoSection}>
          <div style={S.demoLabel}>EXAMPLE ROUND</div>
          <div style={S.demoGridWrap}>
            <div style={S.cornerTL} /><div style={S.cornerTR} />
            <div style={S.cornerBL} /><div style={S.cornerBR} />
            <div style={S.demoGrid}>
              {CELL_LABELS.map((label, idx) => {
                const zone = getCellZone(idx);
                const isWinner = idx === DEMO_WINNER;
                const isYours = idx === DEMO_YOURS;
                const isClaimed = DEMO_CLAIMED.has(idx);

                let zoneStyle = zone === "dark" ? S.dcDark
                  : zone === "opening" ? S.dcOpening : S.dcLight;

                let stateStyle = {};
                if (isWinner) stateStyle = S.dcWinner;
                else if (isYours) stateStyle = S.dcYours;
                else if (isClaimed) stateStyle = S.dcPicked;

                return (
                  <div key={idx} style={{
                    ...S.demoCell, ...zoneStyle, ...stateStyle,
                    animationDelay: `${idx * 0.02}s`,
                  }}>
                    <span style={{ fontSize: 14 }}>
                      {isWinner ? "★" : isYours ? "◈" : isClaimed ? "◈" : "◇"}
                    </span>
                    <span style={{ fontSize: 8, letterSpacing: 1 }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={S.legend}>
            <LegendItem color="#1B1C1D" border="#2F3337" label="Empty" />
            <LegendItem color={CYAN_BG} border={CYAN_DK} label="Claimed" />
            <LegendItem color={CYAN_BG} border={CYAN} label="Your Pick" glow />
            <LegendItem color={CYAN_BG} border={CYAN} label="Winner" />
          </div>
        </div>

        {/* Info Cards */}
        <div style={S.infoGrid} className="htp-info-grid">
          <InfoCard icon="⬡" title="PROVABLY FAIR">
            Every round uses <Hl>provably fair on-chain randomness (keccak-derived VRF)</Hl>, fully settled on Initia.
            The winning cell is determined by cryptographic randomness that nobody can predict or tamper with.
          </InfoCard>
          <InfoCard icon="◈" title="FULLY ON-CHAIN">
            All bets, payouts, and round results are recorded on <Hl>Initia</Hl>.
            No custodial risk. Your funds are in the Move contract until you win.
            Verify everything on the Initia explorer.
          </InfoCard>
          <InfoCard icon="●" title="$ZERO REWARDS">
            Winners earn <Hl>$ZERO tokens</Hl> on top of the INIT pot.
            $ZERO is the native reward token — hold it, trade it, or accumulate for the Motherlode.
          </InfoCard>
          <InfoCard icon="↗" title="INSTANT PAYOUTS">
            Winners receive INIT directly to their wallet within seconds of each round resolving.
            No claiming, no delays — just on-chain settlement on Initia.
          </InfoCard>
        </div>

        {/* Special Rounds */}
        <div style={S.specialsSection}>
          <div style={S.specialsTitle}>SPECIAL ROUNDS</div>
          <div style={S.specialCards} className="htp-special-cards">
            <div style={S.specialMotherlode}>
              <div style={{ fontSize: 28, marginBottom: 10, color: GOLD }}>★</div>
              <div style={{ ...S.specialName, color: GOLD }}>MOTHERLODE</div>
              <div style={{ fontSize: 11, color: "rgba(248,194,79,0.7)", marginBottom: 10 }}>
                1 in 100 rounds (~secondary VRF)
              </div>
              <div style={S.specialDesc}>
                On a Motherlode round, winners receive <span style={{ color: GOLD, fontWeight: 600 }}>10× the normal INIT payout</span> plus
                10× $ZERO emission. Triggered by a secondary VRF derivation on resolve.
              </div>
            </div>
            <div style={S.specialBonus}>
              <div style={{ fontSize: 28, marginBottom: 10, color: CYAN }}>⬡</div>
              <div style={{ ...S.specialName, color: CYAN }}>$ZERO REWARDS</div>
              <div style={{ fontSize: 11, color: CYAN_LT, marginBottom: 10 }}>
                100 $ZERO every round
              </div>
              <div style={S.specialDesc}>
                Each resolved round mints 100 $ZERO to the winning cell, split among its players.
                Same gameplay, same cost — accumulate $ZERO on top of every INIT pot you win.
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={S.ctaSection}>
          <a href="/" style={S.ctaBtn}>⬡ START PLAYING</a>
          <div style={S.ctaSub}>
            ON-CHAIN · INITIA · KECCAK-DERIVED VRF
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={S.footer}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <HTPLogoIcon size={16} />
          <span style={S.footerOnline}>GRID ONLINE</span>
        </span>
        <span style={{ fontSize: 11, color: G4, letterSpacing: 1 }}>ON-CHAIN · INITIA · KECCAK-DERIVED VRF</span>
      </footer>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; padding: 0; background: #0C0C0C; overflow-x: hidden; }
        @keyframes cellAppear { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes glowCyan {
          0%, 100% { box-shadow: 0 0 8px rgba(43,107,255,0.3); }
          50% { box-shadow: 0 0 22px rgba(43,107,255,0.65); }
        }
        @keyframes winnerGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(43,107,255,0.35); }
          50% { box-shadow: 0 0 28px rgba(43,107,255,0.8); }
        }
        @keyframes scanGlow {
          0% { text-shadow: 0 0 4px ${CYAN}; }
          50% { text-shadow: 0 0 14px ${CYAN}; }
          100% { text-shadow: 0 0 4px ${CYAN}; }
        }
        @media (max-width: 640px) {
          .htp-info-grid { grid-template-columns: 1fr !important; }
          .htp-special-cards { flex-direction: column !important; }
          .htp-demo-grid { width: 260px !important; }
          .htp-hero-title { font-size: 24px !important; letter-spacing: 2px !important; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──
function Step({ num, title, children }) {
  return (
    <div style={S.step}>
      <div style={S.stepNum}>{num}</div>
      <div style={{ flex: 1 }}>
        <div style={S.stepTitle}>{title}</div>
        <div style={S.stepDesc}>{children}</div>
      </div>
    </div>
  );
}

function Hl({ children }) {
  return <span style={{ color: CYAN, fontWeight: 600 }}>{children}</span>;
}

function InfoCard({ icon, title, children }) {
  return (
    <div style={S.infoCard}>
      <div style={{ fontSize: 22, marginBottom: 10, color: CYAN }}>{icon}</div>
      <div style={S.infoCardTitle}>{title}</div>
      <div style={S.infoCardText}>{children}</div>
    </div>
  );
}

function LegendItem({ color, border, label, glow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: G3 }}>
      <div style={{
        width: 10, height: 10, borderRadius: 3,
        background: color, border: `1px solid ${border}`,
        ...(glow ? { boxShadow: "0 0 6px rgba(43,107,255,0.5)" } : {}),
      }} />
      {label}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const S = {
  root: {
    fontFamily: "'JetBrains Mono', monospace",
    background: "radial-gradient(ellipse at 50% 0%, #0C1733 0%, #101010 38%, #0C0C0C 100%)",
    color: G1, minHeight: "100vh",
    display: "flex", flexDirection: "column", position: "relative",
  },
  dotGrid: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: "none", zIndex: 0,
    backgroundImage: "radial-gradient(rgba(43,107,255,0.05) 1px, transparent 1px)",
    backgroundSize: "22px 22px",
  },
  scanOverlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: "none", zIndex: 2, transition: "background 0.04s linear",
  },
  crtLines: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: "none", zIndex: 1,
    background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)",
  },

  // Header
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 20px", borderBottom: "1px solid #1B1C1D",
    background: "rgba(12,12,12,0.92)", zIndex: 10, position: "relative",
  },
  hLeft: { display: "flex", alignItems: "center", gap: 10 },
  hRight: { display: "flex", alignItems: "center", gap: 16 },
  dot: { width: 10, height: 10, borderRadius: 3, background: CYAN, boxShadow: `0 0 12px ${CYAN}` },
  logo: { fontFamily: HEAD, fontWeight: 900, fontSize: 18, color: G0, letterSpacing: 3 },
  logoSub: { fontFamily: HEAD, fontWeight: 600, fontSize: 18, color: CYAN, letterSpacing: 2 },
  badge: {
    fontSize: 9, padding: "3px 8px", borderRadius: 4,
    background: CYAN_BG, color: CYAN,
    letterSpacing: 1.5, fontWeight: 700, border: `1px solid ${CYAN}44`,
  },
  backBtn: {
    fontFamily: HEAD, fontSize: 11, fontWeight: 700,
    padding: "8px 18px", borderRadius: 8,
    border: `1px solid ${CYAN}55`,
    background: CYAN_BG,
    color: CYAN, cursor: "pointer", letterSpacing: 1.5, textDecoration: "none",
  },

  // Content
  content: {
    flex: 1, maxWidth: 780, margin: "0 auto",
    padding: "40px 28px 60px", position: "relative", zIndex: 5,
  },

  // Hero
  hero: { textAlign: "center", marginBottom: 48 },
  heroTag: { fontSize: 10, letterSpacing: 3, color: CYAN, marginBottom: 14, fontWeight: 700 },
  heroTitle: {
    fontFamily: HEAD, fontSize: 38, fontWeight: 900,
    letterSpacing: 3, marginBottom: 16, color: G0, textTransform: "uppercase",
  },
  heroDesc: {
    fontSize: 14, color: G2, lineHeight: 1.7,
    maxWidth: 560, margin: "0 auto",
  },

  // Steps
  steps: { display: "flex", flexDirection: "column", gap: 24 },
  step: {
    display: "flex", gap: 20, alignItems: "flex-start",
    padding: 22, border: "1px solid #242629",
    borderRadius: 12, background: "#101010",
  },
  stepNum: {
    flexShrink: 0, width: 44, height: 44,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: HEAD, fontSize: 18, fontWeight: 900,
    color: CYAN, border: `1px solid ${CYAN}44`,
    borderRadius: 10, background: CYAN_BG,
  },
  stepTitle: {
    fontFamily: HEAD, fontSize: 14, fontWeight: 800,
    color: G0, letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase",
  },
  stepDesc: { fontSize: 13, color: G2, lineHeight: 1.7 },

  // Demo Grid
  demoSection: { marginTop: 48, textAlign: "center" },
  demoLabel: {
    fontFamily: HEAD, fontSize: 12, fontWeight: 800,
    letterSpacing: 2, color: G2, marginBottom: 16, textTransform: "uppercase",
  },
  demoGridWrap: { display: "inline-block", position: "relative", padding: 12 },
  demoGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, width: 300 },
  demoCell: {
    aspectRatio: "1", borderRadius: 8,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 2, fontSize: 9, fontWeight: 600, animation: "cellAppear 0.4s ease both",
  },
  cornerTL: { position: "absolute", top: 0, left: 0, width: 18, height: 18, borderLeft: `2px solid ${CYAN}`, borderTop: `2px solid ${CYAN}`, opacity: 0.6 },
  cornerTR: { position: "absolute", top: 0, right: 0, width: 18, height: 18, borderRight: `2px solid ${CYAN}`, borderTop: `2px solid ${CYAN}`, opacity: 0.6 },
  cornerBL: { position: "absolute", bottom: 0, left: 0, width: 18, height: 18, borderLeft: `2px solid ${CYAN}`, borderBottom: `2px solid ${CYAN}`, opacity: 0.6 },
  cornerBR: { position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRight: `2px solid ${CYAN}`, borderBottom: `2px solid ${CYAN}`, opacity: 0.6 },

  // Cell zones
  dcDark: {
    background: "#1B1C1D",
    border: "1px solid #2F3337", color: G4,
  },
  dcLight: {
    background: "#1B1C1D",
    border: "1px solid #242629", color: G3,
  },
  dcOpening: {
    background: "#242629",
    border: "1px solid #383D42", color: G2,
  },
  dcPicked: { background: CYAN_BG, borderColor: CYAN_DK, color: CYAN_LT },
  dcYours: {
    background: CYAN_BG, borderColor: CYAN, color: CYAN,
    animation: "glowCyan 2s ease-in-out infinite",
  },
  dcWinner: {
    background: CYAN_BG, borderColor: CYAN,
    color: CYAN, animation: "winnerGlow 1.5s ease-in-out infinite",
  },

  legend: { display: "flex", justifyContent: "center", gap: 20, marginTop: 16, flexWrap: "wrap" },

  // Info Cards
  infoGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 48,
  },
  infoCard: {
    border: "1px solid #242629", borderRadius: 10,
    background: "#101010", padding: 20,
  },
  infoCardTitle: {
    fontFamily: HEAD, fontSize: 11, fontWeight: 800,
    letterSpacing: 1.5, color: G1, marginBottom: 8, textTransform: "uppercase",
  },
  infoCardText: { fontSize: 12, color: G2, lineHeight: 1.6 },

  // Specials
  specialsSection: { marginTop: 48 },
  specialsTitle: {
    fontFamily: HEAD, fontSize: 14, fontWeight: 800,
    letterSpacing: 2, color: G0, marginBottom: 20, textAlign: "center", textTransform: "uppercase",
  },
  specialCards: { display: "flex", gap: 16 },
  specialMotherlode: {
    flex: 1, borderRadius: 10, padding: 20, textAlign: "center",
    border: "1px solid rgba(248,194,79,0.3)",
    background: "rgba(248,194,79,0.04)",
  },
  specialBonus: {
    flex: 1, borderRadius: 10, padding: 20, textAlign: "center",
    border: `1px solid ${CYAN}33`,
    background: CYAN_BG,
  },
  specialName: { fontFamily: HEAD, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" },
  specialDesc: { fontSize: 12, color: G2, lineHeight: 1.6 },

  // CTA
  ctaSection: { marginTop: 56, textAlign: "center" },
  ctaBtn: {
    fontFamily: HEAD, fontSize: 14, fontWeight: 800,
    padding: "18px 48px", borderRadius: 10, border: "none", cursor: "pointer",
    letterSpacing: 2, background: CYAN,
    color: "#04181E", boxShadow: `0 4px 28px ${CYAN}44`,
    textTransform: "uppercase", textDecoration: "none", display: "inline-block",
  },
  ctaSub: { fontSize: 11, color: G4, marginTop: 12, letterSpacing: 1.5 },

  // Footer
  footer: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 20px", borderTop: "1px solid #1B1C1D",
    background: "rgba(12,12,12,0.95)", zIndex: 10, position: "relative",
  },
  footerDot: {
    display: "inline-block", width: 6, height: 6, borderRadius: "50%",
    background: CYAN, boxShadow: `0 0 8px ${CYAN}`,
  },
  footerOnline: {
    fontSize: 12, fontWeight: 800, color: CYAN, letterSpacing: 1.5,
    fontFamily: HEAD,
    animation: "scanGlow 3s ease-in-out infinite",
  },
};
