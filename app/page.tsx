"use client";

import { useEffect, useState } from "react";
import type { CatalogSnapshot } from "../lib/catalog-types";

export default function Home() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/catalog", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((snapshot: CatalogSnapshot | null) => {
        if (snapshot?.products?.length) {
          localStorage.setItem("skyAdminProducts", JSON.stringify(snapshot.products));
          localStorage.setItem("skyAdminBreaks", JSON.stringify(snapshot.breaks ?? []));
        } else {
          localStorage.removeItem("skyAdminProducts");
          localStorage.removeItem("skyAdminBreaks");
        }
      })
      .catch(() => undefined)
      .finally(() => active && setReady(true));
    return () => { active = false; };
  }, []);

  return (
    <main className="store-shell">
      {!ready && <div className="store-loading">Preparando Sky Collections…</div>}
      {ready && <iframe className="store-frame" src="/catalog.html" title="Sky Collections" />}
    </main>
  );
}
