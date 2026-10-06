import { env } from "cloudflare:workers";
import { requireAdminApi } from "../../../../lib/admin-auth";
import { isCatalogSnapshot } from "../../../../lib/catalog-types";
import { mergeOctober10Cards } from "../../../../lib/october-10-cards";

export const dynamic = "force-dynamic";

type SnapshotRow = { id: string; data: string; updatedAt: string; updatedBy: string };

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const result = await env.DB.prepare(
    "SELECT id, data, updated_at AS updatedAt, updated_by AS updatedBy FROM site_snapshots WHERE id IN (?, ?)",
  ).bind("draft", "published").all<SnapshotRow>();
  const rows = Object.fromEntries(
    result.results.map((row) => [row.id, { data: mergeOctober10Cards(JSON.parse(row.data)), updatedAt: row.updatedAt, updatedBy: row.updatedBy }]),
  );
  return Response.json({ draft: rows.draft ?? null, published: rows.published ?? null });
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response || !auth.user) return auth.response!;
  const body = await request.json().catch(() => null);
  if (!isCatalogSnapshot(body)) {
    return Response.json({ error: "Los datos del catálogo no son válidos." }, { status: 400 });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO site_snapshots (id, data, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
  ).bind("draft", JSON.stringify(body), now, auth.user.email).run();
  return Response.json({ ok: true, updatedAt: now });
}
