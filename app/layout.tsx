import "./globals.css";
import type { Metadata, Viewport } from "next";
import NavBar from "../components/NavBar";
import RouteContainer from "../components/RouteContainer";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Food App",
  description: "Food ordering app",

  // ✅ PWA metadata (installable app)
  applicationName: "Food App",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Food App",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f7f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={inter.className}
        style={{
          margin: 0,
          background: "#f7f7f7",
        }}
      >
        <NavBar />
        {/* This will keep normal pages in maxWidth, but /admin will go full width */}
        <RouteContainer>{children}</RouteContainer>
      </body>
    </html>
  );
}
