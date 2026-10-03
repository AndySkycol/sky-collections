import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key } = await context.params;
  const object = await env.BUCKET.get(key.join("/"));
  if (!object) return new Response("Imagen no encontrada", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", headers.get("Cache-Control") || "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
