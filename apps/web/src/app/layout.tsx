import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "../features/auth/session-provider";
import { ApplicationFrame } from "../components/workspace-shell";

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
        <SessionProvider>
          <ApplicationFrame>{children}</ApplicationFrame>
        </SessionProvider>
      </body>
    </html>
  );
}
