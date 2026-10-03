import { env } from "cloudflare:workers";
import { requireAdminApi } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size === 0) {
    return Response.json({ error: "Selecciona una imagen válida." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "La imagen debe pesar menos de 10 MB." }, { status: 413 });
  }
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  const key = `catalog/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
  });
  return Response.json({ url: `/api/images/${encodeURIComponent(key)}` });
}
