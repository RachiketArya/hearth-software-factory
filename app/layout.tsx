import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hearth — your agent office",
  description: "A shared office for your AI engineering team. Give them a mission and watch the work happen.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
