"use client";

// /tx/[hash] — gridzero-1 transaction viewer.
//
// scan.initia.xyz/gridzero-1/... shows "Network error" because gridzero-1
// isn't in initia-labs/initia-registry yet (PR #835 pending). Until it merges,
// this page is the canonical explorer view: pulls tx data from our public
// REST proxy, renders the cosmos-sdk fields cleanly. When the PR merges, links
// can switch back to Initia Scan and this page becomes a redirect.

import { useEffect, useState, use } from "react";
import { REST_URL, CHAIN_ID } from "@/lib/initia";

const CYAN = "#2B6BFF";
const G0 = "#0C0C0C", G1 = "#EDEDED", G2 = "#A1A6AA", G3 = "#585F67", G4 = "#1B1C1D";
const WIN = "#55F678", LOSE = "#F85454";
const MONO = "'JetBrains Mono', monospace";
const HEAD = "'Archivo', sans-serif";

const fmtAmt = (raw, dec = 6) => {
  const n = Number(raw) / Math.pow(10, dec);
  return n.toLocaleString(undefined, { maximumFractionDigits: dec });
};

export default function TxPage({ params }) {
  const { hash } = use(params);
  const [tx, setTx] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hash) return;
    setLoading(true);
    fetch(`${REST_URL}/cosmos/tx/v1beta1/txs/${hash}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.code === 5 || d.message?.includes("not found")) {
          setErr("Transaction not found on " + CHAIN_ID);
        } else if (d.tx_response) {
          setTx(d.tx_response);
        } else {
          setErr(d.message || "Unexpected response from chain RPC");
        }
      })
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [hash]);

  return (
    <div style={{ background: G0, minHeight: "100vh", color: G1, fontFamily: HEAD, padding: "24px 16px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <a href="/" style={{ color: G3, fontSize: 11, textDecoration: "none", letterSpacing: 2, fontWeight: 700 }}>◇ ◈ GRIDZERO ◈ ◇</a>
          <a href="/play" style={{ color: CYAN, fontSize: 11, textDecoration: "none", letterSpacing: 2, fontWeight: 700 }}>← BACK TO GAME</a>
        </div>

        <div style={{ fontSize: 10, letterSpacing: 2, color: G3, fontWeight: 700, marginBottom: 6 }}>
          TRANSACTION · {CHAIN_ID}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 14, color: G1, wordBreak: "break-all", marginBottom: 24, lineHeight: 1.5 }}>
          {hash}
        </div>

        {loading && (
          <div style={{ padding: 24, border: `1px solid ${G4}`, borderRadius: 8, color: G2, fontSize: 12, letterSpacing: 1 }}>
            ⟐ FETCHING FROM {REST_URL.replace(/^https?:\/\//, "")}...
          </div>
        )}

        {err && (
          <div style={{ padding: 24, border: `1px solid #2F1414`, borderRadius: 8, background: "#1A0808", color: LOSE, fontSize: 12 }}>
            △ {err}
          </div>
        )}

        {tx && (
          <>
            <Section title="STATUS">
              <Row k="Height"     v={tx.height} mono />
              <Row k="Code"       v={`${tx.code} ${tx.code === 0 ? "(success)" : "(failed)"}`} color={tx.code === 0 ? WIN : LOSE} />
              <Row k="Gas used"   v={`${Number(tx.gas_used).toLocaleString()} / ${Number(tx.gas_wanted).toLocaleString()}`} />
              <Row k="Timestamp"  v={tx.timestamp} />
              {tx.raw_log && tx.code !== 0 && <Row k="Error"    v={tx.raw_log.slice(0, 300)} color={LOSE} />}
            </Section>

            <Section title="MESSAGES">
              {(tx.tx?.body?.messages || []).map((m, i) => (
                <Row key={i} k={`#${i + 1}`} v={m["@type"] || JSON.stringify(m).slice(0, 100)} mono />
              ))}
            </Section>

            <Section title="EVENTS">
              <div style={{ fontSize: 10, color: G3, fontFamily: MONO, lineHeight: 1.6 }}>
                {(tx.events || []).slice(0, 40).map((e, i) => (
                  <div key={i} style={{ marginBottom: 6, padding: "6px 10px", background: "#101010", borderRadius: 4, borderLeft: `2px solid ${CYAN}` }}>
                    <span style={{ color: CYAN, fontWeight: 700 }}>{e.type}</span>
                    {(e.attributes || []).map((a, j) => (
                      <div key={j} style={{ paddingLeft: 12, color: G2 }}>
                        <span style={{ color: G3 }}>{a.key}:</span> <span style={{ color: G1 }}>{(a.value || "").slice(0, 200)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Section>

            <div style={{ marginTop: 24, padding: 16, border: `1px solid ${G4}`, borderRadius: 8, background: "#101010" }}>
              <div style={{ fontSize: 9, color: G3, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>RAW JSON</div>
              <details>
                <summary style={{ cursor: "pointer", color: CYAN, fontSize: 10, fontFamily: MONO, letterSpacing: 1 }}>show full response</summary>
                <pre style={{
                  marginTop: 12, padding: 12, background: "#0A0A0A", borderRadius: 4,
                  fontSize: 10, color: G2, fontFamily: MONO, overflowX: "auto", maxHeight: 480,
                }}>
                  {JSON.stringify(tx, null, 2)}
                </pre>
              </details>
            </div>

            <div style={{ marginTop: 16, fontSize: 9, color: G3, letterSpacing: 1, lineHeight: 1.6 }}>
              Source: <a href={`${REST_URL}/cosmos/tx/v1beta1/txs/${hash}`} target="_blank" rel="noopener noreferrer" style={{ color: CYAN }}>
                {REST_URL.replace(/^https?:\/\//, "")}/cosmos/tx/v1beta1/txs/{hash.slice(0, 12)}…
              </a>
              <br />
              <span style={{ color: G3 }}>
                Once <a href="https://github.com/initia-labs/initia-registry/pull/835" target="_blank" rel="noopener noreferrer" style={{ color: G2 }}>registry PR #835</a>{" "}
                merges, scan.initia.xyz/{CHAIN_ID} will render this tx too.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 9, color: G3, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ border: `1px solid ${G4}`, borderRadius: 8, background: "#101010", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ k, v, mono = false, color }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "140px 1fr",
      padding: "10px 14px", borderBottom: `1px solid ${G4}`,
      fontSize: 11, alignItems: "center",
    }}>
      <span style={{ color: G3, letterSpacing: 1, fontSize: 10, fontWeight: 700 }}>{k}</span>
      <span style={{
        color: color || G1, fontFamily: mono ? MONO : HEAD,
        wordBreak: "break-all", lineHeight: 1.5,
      }}>
        {v}
      </span>
    </div>
  );
}
