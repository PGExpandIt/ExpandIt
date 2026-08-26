import React from "react";
import Link from "next/link";
import VallusMark from "@/components/vallusMark";

// Hrefs are homepage-relative (`/#section`) so the header works from any route -
// it is reused on /free and the legal pages, where a bare `#section` anchor would
// resolve against the wrong page. next/link scrolls to the hash on the homepage
// and navigates there first from elsewhere. `/free/` and `/articles/` are real routes.
const NAV = [
    { href: "/#product", label: "Product" },
    { href: "/#features", label: "Features" },
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#integrations", label: "Integrations" },
    { href: "/#development", label: "Roadmap" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/articles/", label: "Articles" },
    { href: "/#manufacturer", label: "Company" },
];

const Header = () => (
    <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-3">
                <VallusMark className="h-6 w-auto text-accent" />
                <span className="text-lg font-semibold tracking-tight text-bone">vallus</span>
                <span className="hidden text-xs text-muted sm:inline">by ExpandIt</span>
            </Link>

            <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
                {NAV.map(({ href, label }) => (
                    <Link
                        key={href}
                        href={href}
                        className="text-sm text-muted transition-colors hover:text-bone"
                    >
                        {label}
                    </Link>
                ))}
            </nav>

            <Link
                href="/#demo"
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim"
            >
                Book a demo
            </Link>
        </div>
    </header>
);

export default Header;
