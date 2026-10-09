"use client";

import { useEffect, useRef } from "react";
import type { CatalogSnapshot } from "../lib/catalog-types";

export default function Home() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const latestSnapshot = useRef<CatalogSnapshot | null>(null);

  const sendSnapshot = (snapshot: CatalogSnapshot) => {
    frameRef.current?.contentWindow?.postMessage(
      { type: "sky-catalog-update", snapshot },
      window.location.origin,
    );
  };

  useEffect(() => {
    let active = true;

    const refreshCatalog = async () => {
      for (let attempt = 0; attempt < 3 && active; attempt += 1) {
        try {
          const response = await fetch("/api/catalog");
          const snapshot: CatalogSnapshot | null = response.ok
            ? await response.json()
            : null;
          if (snapshot?.products) {
            localStorage.setItem("skyAdminProducts", JSON.stringify(snapshot.products));
            localStorage.setItem("skyAdminBreaks", JSON.stringify(snapshot.breaks ?? []));
            latestSnapshot.current = snapshot;
            sendSnapshot(snapshot);
            return;
          }
        } catch {
          // A brief retry covers an occasional cold start without blocking the store.
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    };

    void refreshCatalog();
    return () => { active = false; };
  }, []);

  return (
    <main className="store-shell">
      <iframe
        ref={frameRef}
        className="store-frame"
        src="/catalog.html"
        title="Sky Collections"
        onLoad={() => {
          if (latestSnapshot.current) sendSnapshot(latestSnapshot.current);
        }}
      />
    </main>
  );
}
