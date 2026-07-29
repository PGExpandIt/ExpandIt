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
  title: "vallus — Playwright test runner with a dashboard | ExpandIt",
  description:
    "vallus is a self-hosted dashboard that turns your Playwright projects into managed workflows: run on demand, on schedule or from CI, with reports, traces, RBAC and cross-run analytics. Built and licensed by ExpandIt.",
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
    title: "vallus — Schedule, run and analyze your Playwright tests from one dashboard",
    description:
      "Self-hosted, air-gapped-ready Playwright automation: workflows, scheduling, CI webhooks, RBAC, Allure trends and trace viewer. A product of ExpandIt.",
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
        {children}
      </body>
    </html>
  );
}
