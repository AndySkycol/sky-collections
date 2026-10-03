import { getChatGPTUser } from "../app/chatgpt-auth";
import { headers } from "next/headers";

export const allowedAdminEmails = new Set([
  "jairo.andres1999@gmail.com",
  "cielotatiana.1009@gmail.com",
  "superfeliz697@gmail.com",
]);

export async function getAuthorizedAdmin() {
  const user = await getChatGPTUser();
  if (user && allowedAdminEmails.has(user.email.toLowerCase())) return user;
  if (process.env.NODE_ENV === "development" || await isLocalPreview()) {
    return user ?? {
      userId: "local-preview",
      displayName: "Vista local",
      email: "superfeliz697@gmail.com",
      fullName: "Vista local",
    };
  }
  return null;
}

export async function isLocalPreview() {
  const host = (await headers()).get("host")?.toLowerCase() ?? "";
  return host.startsWith("127.0.0.1:") || host.startsWith("localhost:");
}

export async function requireAdminApi() {
  const user = await getAuthorizedAdmin();
  if (!user) {
    return {
      user: null,
      response: Response.json({ error: "No tienes acceso a este panel." }, { status: 403 }),
    };
  }
  return { user, response: null };
}
