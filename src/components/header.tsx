import React from "react";
import Link from "next/link";
import VallusMark from "@/components/vallusMark";
import MobileMenu from "@/components/mobileMenu";

// Hrefs are homepage-relative (`/#section`) so the header works from any route -
// it is reused on /free and the legal pages, where a bare `#section` anchor would
// resolve against the wrong page. next/link scrolls to the hash on the homepage
// and navigates there first from elsewhere. `/free/` and `/articles/` are real routes.
const NAV = [
    { href: "/#product", label: "Product" },
    { href: "/#features", label: "Features" },
    { href: "/#evidence", label: "Evidence" },
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
                {/* Not between lg and xl: there the nav shares the row, and with Evidence
                    added the row wrapped its labels onto two lines at 1024px. */}
                <span className="hidden text-xs text-muted sm:inline lg:hidden xl:inline">by ExpandIt</span>
            </Link>

            <nav aria-label="Main" className="hidden items-center gap-4 lg:flex xl:gap-6">
                {NAV.map(({ href, label }) => (
                    <Link
                        key={href}
                        href={href}
                        className="whitespace-nowrap text-sm text-muted transition-colors hover:text-bone"
                    >
                        {label}
                    </Link>
                ))}
            </nav>

            {/* Below lg the nav above is hidden, and the menu button beside the call
                to action carries the same links. */}
            <div className="flex items-center gap-2">
                <Link
                    href="/#demo"
                    className="whitespace-nowrap rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim"
                >
                    Book a demo
                </Link>
                <MobileMenu items={NAV} />
            </div>
        </div>
    </header>
);

export default Header;
