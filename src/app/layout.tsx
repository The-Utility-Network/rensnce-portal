import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1.0,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "RENSNCEDAO//MKVLITKN",
  description:
    "RENSNCEDAO is a community‑driven organization fostering open‑source innovation, art, and governance. Join the renaissance in decentralized collaboration.",
  openGraph: {
    title: "RENSNCEDAO//MKVLITKN",
    description:
      "RENSNCE DAO harnesses blockchain governance to empower creators and builders through transparent, token‑based participation.",
    type: "website",
    url: "https://portal.rensnce.com",
    images: [
      {
        url: "https://engram1.blob.core.windows.net/rensnce/rensncebanner.png",
        width: 1950,
        height: 500,
        alt: "RENSNCE DAO Black & White Banner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RENSNCE DAO: Decentralized Renaissance of Innovation",
    description:
      "Discover how RENSNCE DAO is redefining collaborative creation and funding through on‑chain governance.",
    images: [
      {
        url: "https://engram1.blob.core.windows.net/rensnce/rensncebanner.png",
        alt: "RENSNCE DAO Black & White Banner",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Apple Home-screen icon */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        {/* (optionally) Safari pinned-tab & theme colours */}
        <link rel="mask-icon" href="/RENSNCELogo.png" color="#FFFFFF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="color-scheme" content="dark light" />

        {/* Open Graph Meta Tags */}
        <meta
          property="og:title"
          content="RENSNCEDAO: Decentralized Renaissance of Innovation"
        />
        <meta
          property="og:description"
          content="Join RENSNCEDAO and co-create the future of open innovation through transparent, community-led governance."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://portal.rensnce.com" />
        <meta
          property="og:image"
          content="https://engram1.blob.core.windows.net/rensnce/rensncebanner.png"
        />
        <meta property="og:image:width" content="1950" />
        <meta property="og:image:height" content="500" />
        <meta
          property="og:image:alt"
          content="RENSNCEDAO Black & White Banner"
        />
        <meta property="og:site_name" content="RENSNCE DAO" />

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="RENSNCEDAO: Decentralized Renaissance of Innovation"
        />
        <meta
          name="twitter:description"
          content="RENSNCEDAO empowers creators through token‑based participation and decentralized governance."
        />
        <meta
          name="twitter:image"
          content="https://engram1.blob.core.windows.net/rensnce/rensncebanner.png"
        />
        <meta
          name="twitter:image:alt"
          content="RENSNCEDAO Black & White Banner"
        />

        {/* SEO and Rich Link Metadata */}
        <meta property="og:locale" content="en_US" />
        <meta property="og:updated_time" content="2025-05-20T00:00:00Z" />
        <meta property="article:author" content="RENSNCE DAO" />

        {/* Canonical Link */}
        <link rel="canonical" href="https://portal.rensnce.com" />
      </head>
      <body suppressHydrationWarning className={`${inter.className} bg-black text-white`}>{children}</body>
    </html>
  );
}
