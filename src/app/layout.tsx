import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { Azeret_Mono, Geologica, Onest } from "next/font/google";

export const metadata: Metadata = {
  title: {
    template: "%s · Seedyn",
    default: "Seedyn",
  },
  description: "Private uploads. Public-by-link URLs.",
  icons: {
    icon: [{ rel: "icon", url: "/seedyn-mark.svg", type: "image/svg+xml" }],
    shortcut: "/seedyn-mark.svg",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Light and dark are the same palette at different lightness; telling the
  // browser which one is active keeps form controls, scrollbars, and the
  // address bar from rendering against the wrong surface.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#101827" },
  ],
};

const onest = Onest({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-onest",
  display: "swap",
});

const geologica = Geologica({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-geologica",
  display: "swap",
});

const azeretMono = Azeret_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-azeret-mono",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${onest.variable} ${geologica.variable} ${azeretMono.variable}`}
    >
      <body className="bg-background text-foreground min-h-dvh font-sans">
        {children}
      </body>
    </html>
  );
}
