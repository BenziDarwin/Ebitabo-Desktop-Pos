import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { AppProviders } from "@/provider/app-providers";
import { appTheme } from "@/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ebtabo POS",
  description: "Modern Point of Sale System",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

const shouldEnableVercelAnalytics =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "true";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`bg-background ${appTheme.classes}`}
      suppressHydrationWarning
    >
      <head>
        <style id="app-theme-tokens">{appTheme.cssVariables}</style>
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
        {shouldEnableVercelAnalytics && <Analytics />}
      </body>
    </html>
  );
}
