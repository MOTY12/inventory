import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "../features/auth/session-provider";

export const metadata: Metadata = {
  title: "Stockroom | Inventory workspace",
  description: "A clear starting point for your stock operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
