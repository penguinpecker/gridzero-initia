"use client";
import dynamic from "next/dynamic";

// Client-only: PlayApp loads the wallet provider and mounts TheGrid inside it.
const PlayApp = dynamic(() => import("../../components/PlayApp"), {
  ssr: false,
});

export default function PlayPage() {
  return <PlayApp />;
}
