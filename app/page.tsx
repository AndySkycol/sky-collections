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
    let previewing = false;
    const withoutPromotion = new URLSearchParams(window.location.search).get("preview") === "no-promo";

    const receivePreview = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "sky-promotion-preview") return;
      const snapshot = event.data.snapshot as CatalogSnapshot | undefined;
      if (!snapshot?.products) return;
      previewing = true;
      latestSnapshot.current = snapshot;
      sendSnapshot(snapshot);
    };
    window.addEventListener("message", receivePreview);

    const refreshCatalog = async () => {
      for (let attempt = 0; attempt < 3 && active; attempt += 1) {
        try {
          const response = await fetch("/api/catalog");
          const snapshot: CatalogSnapshot | null = response.ok
            ? await response.json()
            : null;
          if (snapshot?.products && !previewing) {
            const displaySnapshot = withoutPromotion ? { ...snapshot, promotion: undefined } : snapshot;
            localStorage.setItem("skyAdminProducts", JSON.stringify(displaySnapshot.products));
            localStorage.setItem("skyAdminBreaks", JSON.stringify(displaySnapshot.breaks ?? []));
            latestSnapshot.current = displaySnapshot;
            sendSnapshot(displaySnapshot);
            return;
          }
        } catch {
          // A brief retry covers an occasional cold start without blocking the store.
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    };

    void refreshCatalog();
    return () => { active = false; window.removeEventListener("message", receivePreview); };
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
