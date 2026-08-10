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
  // Makes canonical and hreflang links absolute, which is what crawlers expect.
  metadataBase: new URL("https://vallus.eu"),
  title: "vallus - Playwright test runner with a dashboard | ExpandIt",
  // Keep at 160 characters or fewer - Google truncates the snippet past roughly that.
  description:
    "vallus is a self-hosted dashboard for Playwright: run suites on demand, on a schedule or from CI, with reports, traces, RBAC and cross-run analytics.",
  keywords: [
    "Playwright",
    "test automation",
    "test runner",
    "QA dashboard",
    "self-hosted",
    "Allure",
    "pytest-playwright",
    "ExpandIt",
    "vallus",
  ],
  authors: [{ name: "ExpandIt" }],
  openGraph: {
    title: "vallus - Schedule, run and analyze your Playwright tests from one dashboard",
    description:
      "Self-hosted Playwright automation: workflows, scheduling, CI webhooks, RBAC, Allure trends and the trace viewer. Runs on your own infrastructure.",
    type: "website",
    siteName: "vallus by ExpandIt",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* WCAG 2.4.1: eight navigation links precede the content on every page.
            Hidden until focused, so it costs sighted visitors nothing. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
