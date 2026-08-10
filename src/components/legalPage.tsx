import React from "react";
import Link from "next/link";
import VallusMark from "@/components/vallusMark";

// Shared chrome for the legal pages, so the English and Polish versions cannot
// drift apart in layout - only in words.

export const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mt-10">
        <h2 className="text-xl font-semibold text-bone">{title}</h2>
        <div className="mt-3 space-y-3 leading-relaxed text-muted">{children}</div>
    </section>
);

export const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => (
    <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
            <thead>
                <tr>
                    {head.map((cell) => (
                        <th
                            key={cell}
                            className="border border-line bg-ink-soft px-3 py-2 text-left font-medium text-bone"
                        >
                            {cell}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, index) => (
                    <tr key={index}>
                        {row.map((cell, cellIndex) => (
                            <td
                                key={cellIndex}
                                className="border border-line px-3 py-2 align-top text-muted"
                            >
                                {cell}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

interface LegalPageProps {
    /** BCP 47 tag for this page's content - set on the wrapper so assistive tech and
     *  translation tools do not read Polish as English. */
    lang: string;
    title: string;
    subtitle: React.ReactNode;
    backLabel: string;
    /** The other version: where it lives, what to call it, and what language it is in. */
    otherLanguage: { href: string; label: string; lang?: string };
    children: React.ReactNode;
    footnote: React.ReactNode;
}

export const LegalPage = ({
    lang,
    title,
    subtitle,
    backLabel,
    otherLanguage,
    children,
    footnote,
}: LegalPageProps) => (
    <div lang={lang} className="min-h-screen bg-ink">
        <header className="border-b border-line">
            <div className="mx-auto flex h-16 max-w-3xl items-center gap-4 px-6">
                <Link href="/" className="flex items-center gap-3">
                    <VallusMark className="h-6 w-auto text-accent" />
                    <span className="text-lg font-semibold tracking-tight text-bone">vallus</span>
                </Link>
                <div className="ml-auto flex items-center gap-5 text-sm">
                    {/* hrefLang and lang so a screen reader announces "Polski" in Polish
                        rather than reading it with an English voice. */}
                    <Link
                        href={otherLanguage.href}
                        hrefLang={otherLanguage.lang}
                        lang={otherLanguage.lang}
                        className="text-muted transition-colors hover:text-bone"
                    >
                        {otherLanguage.label}
                    </Link>
                    <Link href="/" className="text-muted transition-colors hover:text-bone">
                        {backLabel}
                    </Link>
                </div>
            </div>
        </header>

        {/* tabIndex -1: without it the skip link scrolls but leaves focus on <body>,
            so the next Tab goes back to the navigation it was meant to skip. */}
        <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-16 focus:outline-none">
            <h1 className="text-3xl font-bold tracking-tight text-bone sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm text-muted">{subtitle}</p>
            {children}
            <div className="mt-12 rounded-lg border border-line bg-ink-soft p-5 text-sm leading-relaxed text-muted">
                {footnote}
            </div>
        </main>

        <footer className="border-t border-line">
            <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-muted">
                &copy; {new Date().getFullYear()} ExpandIt.{" "}
                <Link href="/" className="underline decoration-line underline-offset-4 hover:decoration-accent">
                    vallus.eu
                </Link>
            </div>
        </footer>
    </div>
);
