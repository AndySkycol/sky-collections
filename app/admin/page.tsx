import Script from "next/script";
import { redirect } from "next/navigation";
import { AdminClient } from "../../components/admin-client";
import { allowedAdminEmails, isLocalPreview } from "../../lib/admin-auth";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const currentUser = await getChatGPTUser();
  const localPreview = process.env.NODE_ENV === "development" || await isLocalPreview();
  if (!currentUser && !localPreview) {
    redirect(chatGPTSignInPath("/admin"));
  }

  const user = currentUser ?? {
    email: "superfeliz697@gmail.com",
    displayName: "Vista local",
  };
  const permitted =
    localPreview ||
    allowedAdminEmails.has(user.email.toLowerCase());

  if (!permitted) {
    return (
      <main className="admin-page">
        <div className="admin-wrap admin-panel">
          <h1>Acceso restringido</h1>
          <p>La cuenta {user.email} no está autorizada para administrar Sky Collections.</p>
          <p><a href={chatGPTSignOutPath("/admin")}>Cerrar sesión y usar otra cuenta</a></p>
        </div>
      </main>
    );
  }

  return (
    <>
      <Script src="/assets/catalog-data.js" strategy="beforeInteractive" />`r`n      <Script src="/assets/october-10-cards.js" strategy="beforeInteractive" />
      <AdminClient
        email={user.email}
        displayName={user.displayName}
        signOutPath={chatGPTSignOutPath("/")}
      />
    </>
  );
}
