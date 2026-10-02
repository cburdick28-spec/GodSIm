"use client";

// app/page.tsx
//
// Thin entry point: the real dashboard (app/GameApp.tsx) is loaded
// client-only. The simulation's initial world is randomly generated inside
// a useReducer lazy initializer, which runs during render — server
// rendering that would re-run it once on the server and again on the
// client during hydration with a different random result, causing a React
// hydration mismatch. ssr:false sidesteps that entirely: the server sends
// only the loading placeholder, and the real (randomized) dashboard exists
// solely on the client.

import dynamic from "next/dynamic";

const GameApp = dynamic(() => import("./GameApp"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">
      Conjuring a world…
    </div>
  ),
});

export default function Page() {
  return <GameApp />;
}
