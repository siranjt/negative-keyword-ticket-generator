import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const gothicA1 = localFont({
  src: [
    {
      path: "../public/fonts/GothicA1-Black.woff2",
      weight: "900",
      style: "normal",
    },
    {
      path: "../public/fonts/GothicA1-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-gothic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Negative Keyword Alerts | Zoca",
  description: "Retention risk monitoring dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${gothicA1.variable}`}>
      <body className="font-[var(--font-inter)] antialiased">{children}</body>
    </html>
  );
}
