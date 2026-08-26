import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/header";
import Footer from "@/components/footer";
import CookieNotice from "@/components/cookieNotice";
import LicenseRequest from "@/components/licenseRequest";

export const metadata: Metadata = {
    title: "Free licence - vallus | ExpandIt",
    description:
        "Request a free vallus licence: 2 users, 1 project, 1 concurrent run. A 6-month renewable term, delivered within 24 hours of e-mail confirmation.",
    alternates: { canonical: "/free/" },
};

// What the free tier grants - kept in sync with the free-key preset in
// playwrightRunner-*/documentation-ignored/licenseGen.md and licensing-signup.md.
const INCLUDED: { label: string; detail: string }[] = [
    { label: "2 users", detail: "Two accounts on the runner." },
    { label: "1 project", detail: "A single project connected to the runner." },
    { label: "1 concurrent run", detail: "One test run executes at a time." },
    {
        label: "Core runner",
        detail: "Scheduling, containerised runs, reports and history - the full engine.",
    },
];

export default function FreePage() {
    return (
        <div className="min-h-screen bg-ink">
            <Header />
            <main id="main" tabIndex={-1} className="focus:outline-none">
                <section className="border-b border-line bg-ink">
                    <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
                        <p className="text-xs font-medium uppercase tracking-wide text-accent">
                            Free licence
                        </p>
                        <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                            Run vallus for free
                        </h1>
                        <p className="mt-4 max-w-2xl text-muted">
                            A free key for small teams and evaluation. It is a 6-month term you
                            can renew - never perpetual - and it grants the core runner without
                            the gated integrations. Request one below; it arrives within 24
                            hours of confirming your e-mail.
                        </p>

                        <div className="mt-10 grid gap-10 lg:grid-cols-2">
                            {/* What you get */}
                            <div>
                                <h2 className="text-lg font-semibold text-bone">What is included</h2>
                                <ul className="mt-4 space-y-3">
                                    {INCLUDED.map((item) => (
                                        <li
                                            key={item.label}
                                            className="rounded-lg border border-line bg-surface p-4"
                                        >
                                            <span className="text-sm font-semibold text-bone">
                                                {item.label}
                                            </span>
                                            <span className="mt-1 block text-sm text-muted">
                                                {item.detail}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                <h2 className="mt-8 text-lg font-semibold text-bone">
                                    Not included
                                </h2>
                                <p className="mt-2 text-sm text-muted">
                                    The gated integrations - Xray, SSO, Grafana and ReportPortal -
                                    are reserved for paid tiers. Need those or more capacity? See
                                    the{" "}
                                    <Link
                                        href="/#pricing"
                                        className="text-bone underline hover:text-accent"
                                    >
                                        paid plans
                                    </Link>
                                    .
                                </p>

                                <div className="mt-8 rounded-lg border border-line bg-ink-soft p-5">
                                    <h3 className="text-sm font-semibold text-bone">
                                        Term, renewal and your data
                                    </h3>
                                    <ul className="mt-3 space-y-2 text-sm text-muted">
                                        <li>
                                            The free licence lasts 6 months and can be renewed - it
                                            is never perpetual.
                                        </li>
                                        <li>
                                            Delivery is within 24 hours of confirming your e-mail
                                            address.
                                        </li>
                                        <li>
                                            We store your company name and e-mail because they are
                                            needed to issue, deliver and renew the key - this is
                                            part of providing the licence, not a marketing opt-in.
                                        </li>
                                        <li>
                                            Having that data erased ends the free licence: the key
                                            may no longer be used and, on request, you confirm its
                                            removal. Product-update e-mails are separate and
                                            optional - you can opt out at any time with no effect on
                                            the licence.
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            {/* The form */}
                            <div>
                                <LicenseRequest />
                            </div>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
            <CookieNotice />
        </div>
    );
}
