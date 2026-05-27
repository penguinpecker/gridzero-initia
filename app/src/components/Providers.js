"use client";
// The Initia wallet provider is browser-only and is needed ONLY by the /play
// screen, so it is mounted there (see PlayApp.js) rather than globally. This
// keeps the marketing/how-to-play pages free of the wallet bundle and lets them
// prerender normally. Providers is now a passthrough.
export default function Providers({ children }) {
  return children;
}
