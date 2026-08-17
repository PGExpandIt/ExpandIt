import React from "react";
import Link from "next/link";
import VallusMark from "@/components/vallusMark";

const Footer = () => (
    <footer className="bg-ink">
        <div className="mx-auto max-w-6xl px-6 py-12">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <VallusMark className="h-6 w-auto text-accent" />
                    <div>
                        <p className="text-sm font-semibold text-bone">vallus</p>
                        <p className="text-xs text-muted">
                            Playwright test runner with a web dashboard
                        </p>
                    </div>
                </div>

                <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
                    {[
                        { href: "/#features", label: "Features" },
                        { href: "/#pricing", label: "Pricing" },
                        { href: "/free/", label: "Free" },
                        { href: "/#deployment", label: "Security" },
                        { href: "/#faq", label: "FAQ" },
                        { href: "/#demo", label: "Book a demo" },
                        { href: "/privacy/", label: "Privacy" },
                        { href: "/licenses/", label: "Licences" },
                    ].map(({ href, label }) => (
                        <Link
                            key={href}
                            href={href}
                            className="text-sm text-muted transition-colors hover:text-bone"
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
            </div>

            <div className="mt-8 border-t border-line pt-6 text-xs leading-relaxed text-muted">
                <p>
                    &copy; {new Date().getFullYear()} ExpandIt. All rights reserved. vallus is
                    licensed under the Business Source License 1.1; production use requires a
                    commercial license from the licensor.
                </p>
                <p className="mt-2">
                    Playwright, Allure, Jira, Xray, Jenkins, GitHub, Azure, Keycloak, Grafana and
                    ReportPortal are trademarks of their respective owners and are referenced here
                    for compatibility purposes only. Open-source notices are on the{" "}
                    <Link
                        href="/licenses/"
                        className="underline decoration-line underline-offset-4 hover:decoration-accent"
                    >
                        licences page
                    </Link>
                    .
                </p>
            </div>
        </div>
    </footer>
);

export default Footer;
