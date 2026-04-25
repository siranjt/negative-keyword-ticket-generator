import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Negative Keyword Alerts | Zoca",
  description: "Retention risk monitoring dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
