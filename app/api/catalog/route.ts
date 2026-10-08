import { env } from "cloudflare:workers";
import { mergeOctober10Cards } from "../../../lib/october-10-cards";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const row = await env.DB.prepare(
      "SELECT data, updated_at AS updatedAt FROM site_snapshots WHERE id = ?",
    ).bind("published").first<{ data: string; updatedAt: string }>();
    if (!row) return Response.json(null, { headers: { "Cache-Control": "no-store" } });
    const snapshot = mergeOctober10Cards(JSON.parse(row.data));
    return Response.json({ products: snapshot.products ?? [], breaks: snapshot.breaks ?? [] }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30" },
    });
  } catch {
    return Response.json(null, { headers: { "Cache-Control": "no-store" } });
  }
}
