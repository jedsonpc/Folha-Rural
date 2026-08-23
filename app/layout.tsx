import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Folha Rural",
  description: "Sistema moderno de folha de pagamento rural.",
  applicationName: "Folha Rural",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Folha Rural",
  },
  other: {
    google: "notranslate",
  },
  icons: {
    icon: [
      { url: "/folha-rural-32.png", sizes: "32x32", type: "image/png" },
      { url: "/folha-rural-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/folha-rural.ico",
    apple: "/folha-rural-180.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" translate="no">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased notranslate`}
      >
        {children}
      </body>
    </html>
  );
}
