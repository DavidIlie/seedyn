import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

export const metadata: Metadata = {
  title: {
    template: "%s · Seedyn",
    default: "Seedyn",
  },
  description: "Private uploads. Public-by-link URLs.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Light and dark are the same palette at different lightness; telling the
  // browser which one is active keeps form controls, scrollbars, and the
  // address bar from rendering against the wrong surface.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#101317" },
  ],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="bg-background text-foreground min-h-dvh font-sans">
        {children}
      </body>
    </html>
  );
}
