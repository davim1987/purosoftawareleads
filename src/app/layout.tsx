import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Purosoftware Leads B2B",
  description: "Búsqueda y compra de leads B2B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
