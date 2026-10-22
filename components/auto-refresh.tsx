"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Short application-state polling; not a claim about source freshness. */
export function AutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAt(new Date().toLocaleTimeString("fr-FR"));
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return <span className="text-xs text-slate-500">{at ? `View refreshed ${at}` : "Live view"}</span>;
}
