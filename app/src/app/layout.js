import Providers from "@/components/Providers";
import "./globals.css";

export const metadata = {
  title: "gridZERO — 5×5 On-Chain Game on Initia",
  description: "5×5 grid game on Initia. Pick a cell, win INIT + $ZERO tokens. Provably fair on-chain randomness (keccak-derived VRF), fully settled on Initia.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#060606" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
