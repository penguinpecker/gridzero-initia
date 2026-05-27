"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════
// gridZERO — marketing home (Initia brand)
// Palette: #0C0C0C canvas · gray ramp · #2B6BFF cyan signature accent
// Gold #F8C24F = Motherlode · headings = Archivo (wide grotesk)
// ═══════════════════════════════════════════════════════════════

// Brand tokens
const CYAN = "#2B6BFF", CYAN_LT = "#5E90FF", CYAN_DK = "#173C99", CYAN_BG = "#0C1733";
const GOLD = "#F8C24F";
const G0 = "#F5F5F5", G1 = "#EDEDED", G2 = "#A1A6AA", G3 = "#757C82", G4 = "#585F67";
const HEAD = "'Archivo', sans-serif";
const MONO = "'JetBrains Mono', monospace";

const DARK = new Set([0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24]);
const OPEN = new Set([11,12,13]);
const LBL = [];
for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) LBL.push(String.fromCharCode(65+r)+(c+1));
const CLAIMED = [7,9,12,13];

// Original ASCII-art backdrop — a deterministic field of gridZERO cell glyphs
// (dotted-art motif in the Initia aesthetic), framed around the hero via a mask.
const ASCII_GLYPHS = ["·","·","·","·","◇","·","×","·","·","✓","·","◈","·","·","★","·","·","·"];
const ASCII_FIELD = Array.from({ length: 30 }, (_, r) =>
  Array.from({ length: 64 }, (_, c) => ASCII_GLYPHS[(r * 5 + c * 3) % ASCII_GLYPHS.length]).join(" ")
).join("\n");

function LogoIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" style={{display:"inline-block",verticalAlign:"middle",flexShrink:0}}>
      <defs><linearGradient id={`lg${size}`} x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={CYAN}/><stop offset="100%" stopColor={CYAN_DK}/>
      </linearGradient></defs>
      <rect x="4" y="4" width="72" height="72" rx="16" fill="#101010" stroke={CYAN} strokeWidth="2" strokeOpacity="0.55"/>
      <line x1="30" y1="4" x2="30" y2="76" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5"/>
      <line x1="50" y1="4" x2="50" y2="76" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5"/>
      <line x1="4" y1="30" x2="76" y2="30" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5"/>
      <line x1="4" y1="50" x2="76" y2="50" stroke="rgba(43,107,255,0.18)" strokeWidth="1.5"/>
      <text x="40" y="56" textAnchor="middle" fontFamily={HEAD} fontWeight="900" fontSize="48" fill={`url(#lg${size})`} letterSpacing="-2">0</text>
    </svg>
  );
}

function MechCard({ title, children, gold }) {
  return (
    <div style={{padding:20,border:`1px solid ${gold?"rgba(248,194,79,0.3)":"#242629"}`,borderRadius:8,background:gold?"rgba(248,194,79,0.04)":"#101010",display:"flex",flexDirection:"column",gap:10}}>
      <div style={{fontFamily:HEAD,fontSize:12,fontWeight:800,letterSpacing:1.5,textTransform:"uppercase",color:gold?GOLD:G1}}>{title}</div>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{height:1,background:`linear-gradient(90deg,transparent,${CYAN}33,transparent)`}}/>;
}

// $ZERO tokenomics — community-first split, rendered as a dependency-free SVG donut.
function Tokenomics() {
  const slices = [
    { label: "Community Rewards", pct: 80, color: CYAN,      note: "Emitted to players as round + Motherlode wins" },
    { label: "Liquidity Pool",    pct: 12, color: GOLD,      note: "DEX liquidity on Initia" },
    { label: "Treasury & Ecosystem", pct: 5, color: "#5E90FF", note: "Grants, ops, reserve" },
    { label: "Team",              pct: 3,  color: "#585F67", note: "Vested" },
  ];
  const r = 58, sw = 26, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"center",gap:44}}>
      <div style={{position:"relative",width:208,height:208,flexShrink:0}}>
        <svg width="208" height="208" viewBox="0 0 160 160" style={{transform:"rotate(0deg)"}}>
          <circle cx="80" cy="80" r={r} fill="none" stroke="#1B1C1D" strokeWidth={sw}/>
          {slices.map((s) => {
            const dash = (C * s.pct) / 100;
            const rot = -90 + (360 * acc) / 100;
            acc += s.pct;
            return (
              <circle key={s.label} cx="80" cy="80" r={r} fill="none" stroke={s.color}
                strokeWidth={sw} strokeDasharray={`${dash} ${C}`} strokeLinecap="butt"
                transform={`rotate(${rot} 80 80)`} />
            );
          })}
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{fontFamily:HEAD,fontWeight:900,fontSize:30,color:G0,lineHeight:1}}>1B</div>
          <div style={{fontFamily:MONO,fontSize:9,letterSpacing:2,color:G3,marginTop:4}}>$ZERO SUPPLY</div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14,minWidth:240,flex:1,maxWidth:380}}>
        {slices.map((s) => (
          <div key={s.label} style={{display:"flex",alignItems:"flex-start",gap:12}}>
            <span style={{width:12,height:12,borderRadius:3,background:s.color,flexShrink:0,marginTop:3,boxShadow:`0 0 8px ${s.color}66`}}/>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"baseline"}}>
                <span style={{fontFamily:HEAD,fontSize:13,fontWeight:700,color:G1,letterSpacing:0.5}}>{s.label}</span>
                <span style={{fontFamily:HEAD,fontSize:15,fontWeight:800,color:s.color}}>{s.pct}%</span>
              </div>
              <div style={{fontFamily:MONO,fontSize:10,color:G4,marginTop:2}}>{s.note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [scanY, setScanY] = useState(0);
  const [winner, setWinner] = useState(-1);
  const [zkStep, setZkStep] = useState(2);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeSuccess, setCodeSuccess] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const winIdx = useRef(0);
  const zkIdx = useRef(2);

  useEffect(() => {
    const s1 = setInterval(() => setScanY(p => (p + 1) % 100), 40);
    const s2 = setInterval(() => { winIdx.current = (winIdx.current + 1) % CLAIMED.length; setWinner(CLAIMED[winIdx.current]); }, 1800);
    const s3 = setInterval(() => { zkIdx.current = (zkIdx.current + 1) % 6; setZkStep(zkIdx.current); }, 1000);
    return () => { clearInterval(s1); clearInterval(s2); clearInterval(s3); };
  }, []);

  function formatCode(val) {
    let v = val.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
    if (v.length > 4) v = v.slice(0, 4) + "-" + v.slice(4);
    setCode(v); setCodeError("");
  }

  function redeemCode() {
    if (!code || code.length < 9) { setCodeError("Enter a valid code in XXXX-XXXX format"); return; }
    setCodeLoading(true);
    setTimeout(() => { setCodeLoading(false); setCodeSuccess(true); }, 1200);
  }

  const ZK_STEPS = [
    "Round ends — block time ≥ end_time",
    "Fulfiller derives keccak VRF over occupied cells",
    "Winning cell computed deterministically on-chain",
    "resolve_round() executed on Initia",
    "Winners auto-paid in same transaction",
    "Result settled permanently on Initia",
  ];

  const scanBg = `linear-gradient(180deg,transparent ${scanY-2}%,rgba(43,107,255,0.05) ${scanY-1}%,rgba(43,107,255,0.14) ${scanY}%,rgba(43,107,255,0.05) ${scanY+1}%,transparent ${scanY+2}%)`;

  return (
    <div style={{fontFamily:MONO,background:"radial-gradient(ellipse at 50% -10%,#0C1733 0%,#101010 38%,#0C0C0C 100%)",minHeight:"100vh",color:G2,position:"relative"}}>
      {/* Dotted grid texture */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:1,backgroundImage:"radial-gradient(rgba(43,107,255,0.05) 1px, transparent 1px)",backgroundSize:"22px 22px"}}/>
      {/* CRT scanlines */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:1,background:"repeating-linear-gradient(0deg,transparent 0px,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)"}}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:2,transition:"background 0.04s linear",background:scanBg}}/>
      {/* ASCII-art backdrop — gridZERO glyph field, framed around the hero */}
      <pre aria-hidden="true" style={{position:"fixed",inset:0,margin:0,zIndex:0,pointerEvents:"none",userSelect:"none",fontFamily:MONO,fontSize:13,lineHeight:"1.4",letterSpacing:"1px",color:"#202225",whiteSpace:"pre",overflow:"hidden",maskImage:"radial-gradient(ellipse 62% 55% at 50% 30%, transparent 0%, transparent 42%, black 80%)",WebkitMaskImage:"radial-gradient(ellipse 62% 55% at 50% 30%, transparent 0%, transparent 42%, black 80%)"}}>{ASCII_FIELD}</pre>

      {/* Header */}
      <header style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",padding:"0 24px",height:56,borderBottom:"1px solid #1B1C1D",background:"rgba(12,12,12,0.92)",backdropFilter:"blur(8px)",zIndex:100,position:"sticky",top:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>router.push("/")}>
          <LogoIcon size={26}/>
          <span style={{fontFamily:HEAD,fontWeight:900,fontSize:16,color:G0,letterSpacing:2}}>GRID</span>
          <span style={{fontFamily:HEAD,fontWeight:600,fontSize:16,color:CYAN,letterSpacing:2}}>ZERO</span>
          <div style={{width:6,height:6,borderRadius:"50%",background:CYAN,boxShadow:`0 0 8px ${CYAN}`,animation:"pulse 2s ease-in-out infinite",marginLeft:4}}/>
        </div>
        <nav style={{display:"flex",alignItems:"center",gap:4}}>
          <button onClick={()=>router.push("/")} className="nav-btn-home" style={{background:"transparent",border:"none",fontFamily:HEAD,fontSize:10,fontWeight:700,color:G4,cursor:"pointer",letterSpacing:2,padding:"7px 16px",borderRadius:3,transition:"color 0.2s"}}>HOME</button>
          <button onClick={()=>router.push("/play")} className="nav-btn-play-hp" style={{background:"transparent",border:"none",fontFamily:HEAD,fontSize:10,fontWeight:700,color:CYAN,cursor:"pointer",letterSpacing:2,padding:"7px 16px",borderRadius:3,animation:"navGlow 3s ease-in-out infinite",transition:"color 0.2s"}}>PLAY</button>
        </nav>
        <div/>
      </header>

      {/* ── HERO — single column ── */}
      <section style={{position:"relative",zIndex:5,padding:"56px 20px 40px",maxWidth:680,margin:"0 auto"}}>

        {/* Title block — centered */}
        <div style={{marginBottom:32,textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{fontSize:10,letterSpacing:3,color:CYAN,fontWeight:700,marginBottom:14,display:"flex",alignItems:"center",gap:7}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:CYAN,boxShadow:`0 0 8px ${CYAN}`,animation:"pulse 2s ease-in-out infinite"}}/>
            LIVE ON INITIA MAINNET
          </div>
          <div style={{fontFamily:HEAD,fontWeight:900,lineHeight:1.05,letterSpacing:1,marginBottom:18,fontSize:"clamp(36px,9vw,64px)",textTransform:"uppercase"}}>
            <div style={{color:G0}}>ONCHAIN</div>
            <div style={{color:CYAN,textShadow:`0 0 28px ${CYAN}44`}}>BETTING</div>
          </div>
          <div style={{fontSize:13,color:G2,lineHeight:1.8,marginBottom:22,maxWidth:520}}>
            Pick a cell on the 5×5 grid. Provably fair on-chain randomness (keccak-derived VRF) selects the winner from occupied cells only. Winners share the pot — or keep everything if they picked alone.
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {["1 INIT per round","60s rounds","Provably fair every round","Auto-pay on resolve"].map(c=>(
              <div key={c} style={{fontSize:10,padding:"4px 10px",borderRadius:4,background:"#101010",border:"1px solid #242629",color:G2}}>{c}</div>
            ))}
          </div>
        </div>

        {/* Grid — centered below title */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:20}}>
          <div style={{position:"relative",padding:12,border:"1px solid #242629",borderRadius:10,background:"#101010"}}>
            {[["tl",{top:0,left:0,borderLeft:`2px solid ${CYAN}`,borderTop:`2px solid ${CYAN}`}],
              ["tr",{top:0,right:0,borderRight:`2px solid ${CYAN}`,borderTop:`2px solid ${CYAN}`}],
              ["bl",{bottom:0,left:0,borderLeft:`2px solid ${CYAN}`,borderBottom:`2px solid ${CYAN}`}],
              ["br",{bottom:0,right:0,borderRight:`2px solid ${CYAN}`,borderBottom:`2px solid ${CYAN}`}]
            ].map(([k,s])=><div key={k} style={{position:"absolute",width:14,height:14,opacity:0.6,...s}}/>)}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,width:"min(260px, calc(100vw - 120px))"}}>
              {LBL.map((lbl,i) => {
                const isWin = i===winner, isClaimed = CLAIMED.includes(i)&&!isWin;
                return (
                  <div key={i} style={{aspectRatio:"1",borderRadius:6,border:`1px solid ${isWin?CYAN:isClaimed?CYAN_DK:DARK.has(i)?"#2F3337":OPEN.has(i)?"#383D42":"#242629"}`,background:isWin?CYAN_BG:DARK.has(i)?"#1B1C1D":OPEN.has(i)?"#242629":"#1B1C1D",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,animation:isWin?"winnerGlow 1.5s ease-in-out infinite":"cellAppear 0.4s ease both",animationDelay:`${Math.floor(i/5)*0.06}s`,color:isWin?CYAN:isClaimed?CYAN_LT:DARK.has(i)?G4:G3}}>
                    <span style={{fontSize:9,letterSpacing:1}}>{lbl}</span>
                    <span style={{fontSize:11,opacity:isWin||isClaimed?1:0.3}}>{isWin?"★":isClaimed?"◈":"◇"}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap"}}>
            {[["ROUND","#30144"],["POT","4.00 INIT",CYAN],["PLAYERS","4"]].map(([l,v,vc])=>(
              <div key={l} style={{fontSize:10,color:G4}}>{l} <b style={{fontFamily:HEAD,fontSize:11,fontWeight:800,color:vc||G1}}>{v}</b></div>
            ))}
          </div>
          <div style={{fontSize:9,letterSpacing:2,color:G4}}>LIVE · INITIA MAINNET · VRF SECURED</div>
        </div>

        {/* Code entry — full width below grid */}
        <div style={{width:"100%",border:"1px solid #242629",borderRadius:10,background:"#101010",overflow:"hidden"}}>
          {!codeSuccess ? (
            <>
              <div style={{padding:"12px 18px",borderBottom:"1px solid #1B1C1D",background:"#0C0C0C",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:HEAD,fontSize:11,fontWeight:800,letterSpacing:2,color:G1}}>GOT A CODE?</span>
                <span style={{fontSize:10,color:G4}}>Redeem for free rounds</span>
              </div>
              <div style={{padding:"14px 18px",display:"flex",flexDirection:"column",gap:9}}>
                <div style={{position:"relative"}}>
                  <input type="text" value={code} placeholder="XXXX-XXXX" maxLength={9} autoComplete="off" spellCheck={false}
                    onChange={e=>formatCode(e.target.value)}
                    onFocus={()=>setShowCursor(false)}
                    onBlur={()=>{if(!code)setShowCursor(true);}}
                    onKeyDown={e=>e.key==="Enter"&&redeemCode()}
                    style={{width:"100%",background:"#0C0C0C",border:`1px solid ${codeError?"#F85454":"#2F3337"}`,borderRadius:7,padding:"12px",fontFamily:HEAD,fontSize:20,fontWeight:800,color:G0,textAlign:"center",letterSpacing:6,outline:"none",display:"block",caretColor:CYAN}}/>
                  {showCursor&&!code&&(
                    <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:2,height:22,background:CYAN,animation:"caretBlink 1s step-end infinite",pointerEvents:"none"}}/>
                  )}
                </div>
                {codeError&&<div style={{fontSize:10,color:"#F85454",textAlign:"center"}}>{codeError}</div>}
                <button onClick={redeemCode} disabled={codeLoading} style={{width:"100%",fontFamily:HEAD,fontSize:11,fontWeight:800,padding:12,borderRadius:7,border:"none",background:CYAN,color:"#04181E",cursor:"pointer",letterSpacing:1.5,opacity:codeLoading?0.7:1}}>
                  {codeLoading?"VERIFYING...":"REDEEM CODE"}
                </button>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1,height:1,background:"#1B1C1D"}}/>
                  <span style={{fontSize:9,color:G4,letterSpacing:2}}>OR</span>
                  <div style={{flex:1,height:1,background:"#1B1C1D"}}/>
                </div>
                <button onClick={()=>router.push("/play")} style={{width:"100%",fontFamily:MONO,fontSize:10,padding:10,borderRadius:6,border:`1px solid ${CYAN}55`,background:CYAN_BG,color:CYAN,cursor:"pointer",letterSpacing:1}}>PLAY WITH INIT →</button>
              </div>
            </>
          ) : (
            <div style={{padding:"24px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:12,textAlign:"center"}}>
              <div style={{width:48,height:48,borderRadius:"50%",background:CYAN_BG,border:`2px solid ${CYAN}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round"><path d="M5 13l4 4L19 7"/></svg>
              </div>
              <div style={{fontFamily:HEAD,fontSize:13,fontWeight:800,letterSpacing:2,color:G1}}>CODE ACTIVATED</div>
              <div style={{display:"flex",alignItems:"center",gap:12,background:CYAN_BG,border:`1px solid ${CYAN}55`,borderRadius:8,padding:"12px 20px"}}>
                <span style={{fontFamily:HEAD,fontSize:36,fontWeight:900,color:CYAN,lineHeight:1}}>2</span>
                <span style={{fontSize:10,color:G2,letterSpacing:1,lineHeight:1.5}}>Free<br/>Rounds<br/>Credited</span>
              </div>
              <button onClick={()=>router.push("/play")} style={{width:"100%",fontFamily:HEAD,fontSize:11,fontWeight:800,padding:12,borderRadius:7,border:"none",background:CYAN,color:"#04181E",cursor:"pointer",letterSpacing:1.5}}>ENTER THE GRID →</button>
            </div>
          )}
        </div>
      </section>

      <Divider/>

      {/* ── HOW IT WORKS ── */}
      <section id="how-section" style={{position:"relative",zIndex:5,padding:"60px 20px",maxWidth:960,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontSize:10,letterSpacing:3,color:CYAN,fontWeight:700,marginBottom:8}}>HOW IT WORKS</div>
          <div style={{fontFamily:HEAD,fontSize:26,fontWeight:800,letterSpacing:1,color:G0,textTransform:"uppercase"}}>Four Steps to Win</div>
        </div>
        <div className="steps-grid">
          {[
            {n:"01",icon:"◈",t:"CONNECT",d:"Connect the Initia Wallet extension or Keplr. You'll need INIT to play — it's the native gas and entry token on Initia."},
            {n:"02",icon:"⬡",t:"PICK A CELL",d:"Choose any cell on the 5×5 grid. Costs 1 INIT. Multiple players can pick the same cell — they'll split if it wins."},
            {n:"03",icon:"◎",t:"PROVABLY FAIR",d:"When the 60s round ends, provably fair on-chain randomness (keccak-derived VRF) runs. The winning cell is picked from occupied cells only — fully settled on Initia."},
            {n:"04",icon:"◆",t:"GET PAID",d:"Winners are paid automatically during resolution. No claim step. INIT goes straight to your wallet plus $ZERO rewards."},
          ].map(({n,icon,t,d})=>(
            <div key={n} style={{padding:20,border:"1px solid #242629",borderRadius:8,background:"#101010",display:"flex",flexDirection:"column",gap:10}}>
              <span style={{fontFamily:HEAD,fontSize:10,fontWeight:800,color:CYAN,background:CYAN_BG,borderRadius:4,padding:"2px 7px",display:"inline-block",letterSpacing:1,alignSelf:"flex-start"}}>{n}</span>
              <div style={{fontSize:20,color:CYAN}}>{icon}</div>
              <div style={{fontFamily:HEAD,fontSize:12,fontWeight:800,color:G1,letterSpacing:1,textTransform:"uppercase"}}>{t}</div>
              <div style={{fontSize:11,color:G2,lineHeight:1.7}}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      <Divider/>

      {/* ── MECHANICS ── */}
      <section style={{position:"relative",zIndex:5,padding:"60px 20px",maxWidth:960,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontSize:10,letterSpacing:3,color:CYAN,fontWeight:700,marginBottom:8}}>GAME MECHANICS</div>
          <div style={{fontFamily:HEAD,fontSize:26,fontWeight:800,letterSpacing:1,color:G0,textTransform:"uppercase"}}>Know the Rules</div>
        </div>
        <div className="two-col-grid">
          <MechCard title="PAYOUT MATH">
            <p style={{fontSize:11,color:G2,lineHeight:1.75,margin:0}}>Every player adds 1 INIT to the pot. A 5% protocol fee and 0.1 INIT resolver reward are deducted, then the rest goes to winners on the winning cell.</p>
            <div style={{background:"#0C0C0C",border:"1px solid #1B1C1D",borderRadius:6,padding:"10px 12px",fontSize:11,color:G3,lineHeight:1.9}}>
              pool = <b style={{color:CYAN}}>N</b> × 1 INIT<br/>
              fee = pool × <b style={{color:CYAN}}>5%</b><br/>
              distributable = pool − fee − <b style={{color:CYAN}}>0.1 INIT</b><br/>
              each winner = distributable ÷ <b style={{color:G1}}>winners on cell</b>
            </div>
          </MechCard>
          <MechCard title="STRATEGY">
            <p style={{fontSize:11,color:G2,lineHeight:1.75,margin:0}}>Cells with many players give you better win odds but smaller payouts. Lonely cells pay the entire pot if they win.</p>
            <div style={{background:"#0C0C0C",border:"1px solid #1B1C1D",borderRadius:6,padding:"10px 12px",fontSize:11,color:G3,lineHeight:1.9}}>
              <span style={{color:G4}}>{`// 20 players, 3 on winning cell`}</span><br/>
              pool = <b style={{color:CYAN}}>20 INIT</b><br/>
              distributable ≈ <b style={{color:CYAN}}>18.9 INIT</b><br/>
              each winner = <b style={{color:"#55F678"}}>+6.30 INIT</b>
            </div>
          </MechCard>
          <MechCard title="$ZERO REWARDS">
            <p style={{fontSize:11,color:G2,lineHeight:1.75,margin:0}}>Every resolved round mints <b style={{color:CYAN}}>$ZERO tokens</b> to winners on top of INIT. TGE is deferred until meaningful user milestones — it&apos;s a gameplay reward, not a speculative asset.</p>
          </MechCard>
          <MechCard title="◆ MOTHERLODE ROUNDS" gold>
            <p style={{fontSize:11,color:G2,lineHeight:1.75,margin:0}}>1 in 100 rounds is a Motherlode. Winners get <b style={{color:GOLD}}>10× the normal INIT payout</b> plus 10× $ZERO emission. Determined by secondary VRF derivation.</p>
          </MechCard>
        </div>
      </section>

      <Divider/>

      {/* ── $ZERO ── */}
      <section style={{position:"relative",zIndex:5,padding:"60px 20px",maxWidth:960,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontSize:10,letterSpacing:3,color:CYAN,fontWeight:700,marginBottom:8}}>TOKEN</div>
          <div style={{fontFamily:HEAD,fontSize:26,fontWeight:900,letterSpacing:1,color:CYAN,textShadow:`0 0 24px ${CYAN}33`}}>$ZERO</div>
        </div>
        <div className="four-col-grid" style={{marginBottom:16}}>
          {[
            {l:"MAX SUPPLY",v:"5,000,000",s:"Minted to winners each round — 20.9K in circulation",vc:G1},
            {l:"EMISSION / ROUND",v:"100",s:"$ZERO split among winning cell players",vc:CYAN},
            {l:"MOTHERLODE",v:"1000",s:"10× emission on bonus rounds (1 in 100)",vc:GOLD,gold:true},
            {l:"TGE",v:"DEFERRED",s:"Unlocks only after meaningful user milestones",vc:G2,vs:15},
          ].map(({l,v,s,vc,vs,gold})=>(
            <div key={l} style={{padding:16,border:`1px solid ${gold?"rgba(248,194,79,0.3)":"#242629"}`,borderRadius:8,background:gold?"rgba(248,194,79,0.04)":"#101010",display:"flex",flexDirection:"column",gap:6}}>
              <div style={{fontSize:9,letterSpacing:2,color:G4,fontWeight:700}}>{l}</div>
              <div style={{fontFamily:HEAD,fontSize:vs||20,fontWeight:900,color:vc||G1,lineHeight:1.2}}>{v}</div>
              <div style={{fontSize:10,color:G2}}>{s}</div>
            </div>
          ))}
        </div>
        <div className="two-col-grid">
          <div style={{padding:20,border:"1px solid #242629",borderRadius:8,background:"#101010",display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontFamily:HEAD,fontSize:12,fontWeight:800,letterSpacing:1,color:G1,textTransform:"uppercase"}}>How You Earn</div>
            {[
              {n:"01",text:<>Pick the winning cell — <b style={{color:CYAN}}>100 $ZERO</b> split among all players on that cell</>},
              {n:"02",text:<>Pick alone on winning cell — keep the entire <b style={{color:CYAN}}>100 $ZERO</b> yourself</>},
              {n:"◆",text:<>Win a Motherlode — earn <b style={{color:GOLD}}>1000 $ZERO</b> on top of 10× INIT</>,gold:true},
            ].map(({n,text,gold})=>(
              <div key={n} style={{display:"flex",alignItems:"flex-start",gap:10,fontSize:11,color:G2,lineHeight:1.6}}>
                <span style={{fontFamily:HEAD,fontSize:9,fontWeight:800,color:gold?GOLD:CYAN,background:gold?"rgba(248,194,79,0.1)":CYAN_BG,padding:"2px 6px",borderRadius:3,flexShrink:0,marginTop:2}}>{n}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
          <div style={{padding:20,border:"1px solid #242629",borderRadius:8,background:"#101010",display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontFamily:HEAD,fontSize:12,fontWeight:800,letterSpacing:1,color:G1,textTransform:"uppercase"}}>TGE Terms</div>
            <div style={{fontSize:11,color:G2,lineHeight:1.8}}>The TGE is <b style={{color:G1}}>intentionally deferred</b> until GridZero reaches meaningful player milestones. $ZERO earned now accumulates in your wallet.</div>
            <div style={{background:"#0C0C0C",border:"1px solid #1B1C1D",borderRadius:6,padding:"10px 12px",fontSize:11,color:G3,lineHeight:1.8}}>
              <b style={{color:CYAN}}>$ZERO is a gameplay reward</b> — not a speculative asset. Utility will be defined before TGE.
            </div>
          </div>
        </div>
      </section>

      <Divider/>

      {/* ── PROVABLY FAIR ── */}
      <section style={{position:"relative",zIndex:5,padding:"60px 20px",maxWidth:960,margin:"0 auto"}}>
        <div style={{border:"1px solid #242629",borderRadius:10,background:"#101010",padding:"32px 28px",display:"flex",flexDirection:"column",gap:32}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{fontSize:10,letterSpacing:3,color:CYAN,fontWeight:700}}>PROVABLY FAIR</div>
            <div style={{fontFamily:HEAD,fontSize:22,fontWeight:800,color:G0,letterSpacing:1,lineHeight:1.3,textTransform:"uppercase"}}>Provably Fair Every Round</div>
            <div style={{fontSize:11,color:G2,lineHeight:1.8}}>Every winner selection uses provably fair on-chain randomness (keccak-derived VRF), computed deterministically over the occupied cells and fully settled on Initia.</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {["KECCAK VRF","ON-CHAIN","DETERMINISTIC"].map(p=><span key={p} style={{fontSize:9,padding:"3px 8px",borderRadius:3,fontWeight:700,letterSpacing:1,background:CYAN_BG,color:CYAN,border:`1px solid ${CYAN}44`}}>{p}</span>)}
              {["MOVE VM","SETTLED ON INITIA"].map(p=><span key={p} style={{fontSize:9,padding:"3px 8px",borderRadius:3,fontWeight:700,letterSpacing:1,background:"#1B1C1D",color:G2,border:"1px solid #2F3337"}}>{p}</span>)}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {ZK_STEPS.map((label,i)=>{
              const done=i<zkStep,active=i===zkStep;
              return (
                <div key={i}>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:6,border:`1px solid ${active?`${CYAN}55`:done?"#242629":"transparent"}`,background:active?CYAN_BG:done?"#1B1C1D":"transparent",transition:"all 0.3s"}}>
                    <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:active?CYAN:done?CYAN_DK:"#2F3337",boxShadow:active?`0 0 8px ${CYAN}`:"none",animation:active?"pulse 1.5s ease-in-out infinite":"none"}}/>
                    <span style={{fontSize:11,color:active?CYAN:done?G2:G4,fontWeight:active||done?600:400}}>{label}</span>
                  </div>
                  {i<ZK_STEPS.length-1&&<div style={{width:1,height:8,background:"#242629",marginLeft:16}}/>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Divider/>

      {/* ── TOKENOMICS ── */}
      <section style={{position:"relative",zIndex:5,padding:"60px 20px",maxWidth:960,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:10,letterSpacing:3,color:CYAN,fontWeight:700,marginBottom:8}}>$ZERO TOKEN</div>
          <div style={{fontFamily:HEAD,fontSize:26,fontWeight:800,letterSpacing:1,color:G0,textTransform:"uppercase"}}>Tokenomics</div>
          <div style={{fontFamily:MONO,fontSize:12,color:G3,marginTop:10,maxWidth:540,marginLeft:"auto",marginRight:"auto",lineHeight:1.6}}>1,000,000,000 $ZERO, community-first. No presale, no VC allocation. The vast majority is emitted directly to players as round and Motherlode rewards.</div>
        </div>
        <div style={{border:"1px solid #242629",borderRadius:10,background:"#101010",padding:"36px 24px"}}>
          <Tokenomics/>
        </div>
      </section>

      <Divider/>

      {/* ── CONTRACT / ON-CHAIN INFO ── */}
      <section style={{position:"relative",zIndex:5,padding:"60px 20px",maxWidth:960,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:10,letterSpacing:3,color:CYAN,fontWeight:700,marginBottom:8}}>ON-CHAIN</div>
          <div style={{fontFamily:HEAD,fontSize:26,fontWeight:800,letterSpacing:1,color:G0,textTransform:"uppercase"}}>Contract</div>
        </div>
        <div style={{border:"1px solid #242629",borderRadius:10,background:"#101010",overflow:"hidden"}}>
          {[
            {l:"GRIDZERO PACKAGE",v:"init1ujldjupk47tslx87ad2e84h3nwdu5xyex9rcdc",link:"https://scan.initia.xyz/interwoven-1/account/init1ujldjupk47tslx87ad2e84h3nwdu5xyex9rcdc",mono:true},
            {l:"$ZERO ASSET",v:"Native fungible asset · 6 decimals"},
            {l:"CHAIN",v:"interwoven-1 (Initia mainnet)"},
            {l:"ENTRY / RANDOMNESS",v:"Native INIT entry · keccak-derived on-chain VRF"},
          ].map(({l,v,link,mono},i)=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,padding:"12px 16px",borderTop:i?"1px solid #1B1C1D":"none",flexWrap:"wrap"}}>
              <span style={{fontSize:9,letterSpacing:2,color:G4,fontWeight:700,flexShrink:0}}>{l}</span>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" style={{fontFamily:MONO,fontSize:11,color:CYAN,textDecoration:"none",wordBreak:"break-all",textAlign:"right"}}>{v} ↗</a>
              ) : (
                <span style={{fontFamily:mono?MONO:MONO,fontSize:11,color:G1,textAlign:"right",wordBreak:"break-all"}}>{v}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"16px 24px",borderTop:"1px solid #1B1C1D",background:"rgba(12,12,12,0.95)",zIndex:10,position:"relative"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <LogoIcon size={16}/>
          <span style={{fontFamily:HEAD,fontSize:10,fontWeight:800,color:CYAN,letterSpacing:1.5,animation:"scanGlow 3s ease-in-out infinite"}}>GRID ONLINE</span>
        </div>
        <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
          <a href="https://x.com/gridzerogg" target="_blank" rel="noopener noreferrer"
            style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:G2,textDecoration:"none",letterSpacing:1,padding:"4px 10px",borderRadius:4,border:"1px solid #242629",background:"#101010"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            @gridzerogg
          </a>
          <a href="https://scan.initia.xyz/interwoven-1/account/init1ujldjupk47tslx87ad2e84h3nwdu5xyex9rcdc" target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:G3,textDecoration:"none",letterSpacing:1}}>CONTRACT</a>
          <a href="https://scan.initia.xyz/interwoven-1" target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:G3,textDecoration:"none",letterSpacing:1}}>EXPLORER</a>
        </div>
        <div style={{fontSize:10,color:G4,letterSpacing:1}}>ON-CHAIN · INITIA · VRF</div>
      </footer>

      <style>{`
        @keyframes cellAppear{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
        @keyframes winnerGlow{0%,100%{box-shadow:0 0 10px rgba(43,107,255,0.4)}50%{box-shadow:0 0 28px rgba(43,107,255,0.85)}}
        @keyframes scanGlow{0%,100%{text-shadow:0 0 4px ${CYAN}}50%{text-shadow:0 0 14px ${CYAN}}}
        @keyframes caretBlink{0%,100%{opacity:1}50%{opacity:0}}
        .nav-btn-home:hover{color:${G0}!important}
        .nav-btn-play-hp:hover{color:${CYAN_LT}!important}
        @keyframes navGlow{0%,100%{text-shadow:0 0 6px rgba(43,107,255,0.5)}50%{text-shadow:0 0 14px rgba(43,107,255,0.95)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        *{box-sizing:border-box}
        input::placeholder{color:#383D42}
        .steps-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        .two-col-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .four-col-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        @media(max-width:700px){
          .steps-grid{grid-template-columns:1fr 1fr}
          .two-col-grid{grid-template-columns:1fr}
          .four-col-grid{grid-template-columns:1fr 1fr}
        }
        @media(max-width:420px){
          .steps-grid{grid-template-columns:1fr}
          .four-col-grid{grid-template-columns:1fr}
        }
      `}</style>
    </div>
  );
}
