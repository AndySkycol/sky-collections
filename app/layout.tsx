import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sky Collections",
  description: "Tarjetas deportivas, cajas selladas y breaks.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [{ url: "/assets/logo-favicon.png", type: "image/png" }],
    shortcut: "/assets/logo-favicon.png",
    apple: "/assets/logo-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
