import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = await env.DB.prepare(
      "SELECT data, updated_at AS updatedAt FROM site_snapshots WHERE id = ?",
    ).bind("published").first<{ data: string; updatedAt: string }>();
    if (!row) return Response.json(null, { headers: { "Cache-Control": "no-store" } });
    const snapshot = JSON.parse(row.data);
    return Response.json({ products: snapshot.products ?? [], breaks: snapshot.breaks ?? [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(null, { headers: { "Cache-Control": "no-store" } });
  }
}
