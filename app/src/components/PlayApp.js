"use client";
import { useEffect, useState } from "react";
import { CHAIN_ID } from "@/lib/initia";
import { GRIDZERO_LAYER } from "@/lib/gridzeroLayer";
import TheGrid from "./TheGrid";

// Loads the browser-only Initia WalletWidgetProvider, then mounts TheGrid INSIDE
// it. TheGrid calls useWallet()/useAddress(), so it must never render outside the
// provider — we gate its mount on the provider being ready (avoids the
// "Cannot destructure 'onboard' of null" context error). This whole component is
// dynamically imported with ssr:false from /play, so nothing here runs on the server.
export default function PlayApp() {
  const [Provider, setProvider] = useState(null);

  useEffect(() => {
    let alive = true;
    import("@initia/react-wallet-widget").then((m) => {
      if (alive) setProvider(() => m.WalletWidgetProvider);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!Provider) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0C0C0C",
          color: "#2B6BFF",
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 2,
          fontSize: 12,
        }}
      >
        ⟐ LOADING gridZERO…
      </div>
    );
  }

  return (
    <Provider chainId={CHAIN_ID} customLayer={GRIDZERO_LAYER} theme="dark">
      <TheGrid />
    </Provider>
  );
}
