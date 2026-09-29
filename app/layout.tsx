import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trader · Cuaderno de proceso",
  description: "Tu plan, tus decisiones y una práctica para la próxima oportunidad.",
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
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
