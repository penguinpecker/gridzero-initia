"use client";
import { useEffect, useState } from "react";
import { CHAIN_ID } from "@/lib/initia";
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
          background: "#060606",
          color: "#8a8a8a",
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
    <Provider chainId={CHAIN_ID} theme="dark">
      <TheGrid />
    </Provider>
  );
}
