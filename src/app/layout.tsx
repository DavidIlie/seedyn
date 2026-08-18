import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

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
    { media: "(prefers-color-scheme: light)", color: "#f8f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#211f1c" },
  ],
};

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="bg-background text-foreground min-h-dvh font-sans">
        {children}
      </body>
    </html>
  );
}
