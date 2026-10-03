import { env } from "cloudflare:workers";
import { requireAdminApi } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAdminApi();
  if (auth.response || !auth.user) return auth.response!;
  const draft = await env.DB.prepare(
    "SELECT data FROM site_snapshots WHERE id = ?",
  ).bind("draft").first<{ data: string }>();
  if (!draft) {
    return Response.json({ error: "Primero guarda un borrador." }, { status: 409 });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO site_snapshots (id, data, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
  ).bind("published", draft.data, now, auth.user.email).run();
  return Response.json({ ok: true, publishedAt: now });
}
