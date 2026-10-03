import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = await env.DB.prepare(
      "SELECT data, updated_at AS updatedAt FROM site_snapshots WHERE id = ?",
    ).bind("published").first<{ data: string; updatedAt: string }>();
    if (!row) return Response.json(null, { headers: { "Cache-Control": "no-store" } });
    return Response.json(JSON.parse(row.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(null, { headers: { "Cache-Control": "no-store" } });
  }
}
