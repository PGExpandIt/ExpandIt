import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/header";
import Footer from "@/components/footer";
import CookieNotice from "@/components/cookieNotice";
import {
    articleHref,
    articleOfflineHref,
    articlesByDate,
    formatPublished,
} from "@/lib/articles";

export const metadata: Metadata = {
    title: "Articles - vallus | ExpandIt",
    description:
        "Writing on test automation, reporting and running suites in closed environments - the constraints we keep meeting on customer infrastructure.",
    alternates: { canonical: "/articles/" },
};

// Cards link to static files under public/articles, so the anchors are plain <a>
// rather than next/link: there is no route to prefetch, and next/link would only
// add a client-side navigation that ends in a full document load anyway.
//
// The card is not one big link. The heading anchor covers the whole card through
// an ::after overlay, and the offline download sits above it on the z-axis - that
// way the card is one tab stop for the article plus one for the download, instead
// of a nested-interactive element that screen readers cannot announce.
export default function ArticlesPage() {
    const articles = articlesByDate();

    return (
        <div className="min-h-screen bg-ink">
            <Header />
            <main id="main" tabIndex={-1} className="focus:outline-none">
                <section className="border-b border-line bg-ink">
                    <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
                        <p className="text-xs font-medium uppercase tracking-wide text-accent">
                            Writing
                        </p>
                        <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                            Articles
                        </h1>
                        <p className="mt-4 max-w-2xl text-muted">
                            Notes on test automation, reporting and the constraints of running
                            suites on infrastructure you do not control. Every piece also comes as
                            an offline copy: one file with the images, fonts and styles inlined,
                            which opens on a machine with no network at all.
                        </p>

                        <ul className="mt-12 grid gap-4">
                            {articles.map((article) => {
                                const href = articleHref(article);

                                return (
                                    <li
                                        key={article.slug}
                                        className="group relative rounded-lg border border-line bg-ink-soft p-6 transition-colors hover:border-accent/50 hover:bg-surface sm:p-8"
                                    >
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                                            <time dateTime={article.published}>
                                                {formatPublished(article.published)}
                                            </time>
                                            <span aria-hidden="true" className="text-line">
                                                ·
                                            </span>
                                            <span>{article.readingMinutes} min read</span>
                                            <span aria-hidden="true" className="text-line">
                                                ·
                                            </span>
                                            <span className="uppercase">{article.language}</span>
                                        </div>

                                        <h2 className="mt-3 text-xl font-semibold tracking-tight text-bone sm:text-2xl">
                                            <a
                                                href={href}
                                                hrefLang={article.language}
                                                className="transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-accent"
                                            >
                                                {article.title}
                                            </a>
                                        </h2>

                                        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
                                            {article.summary}
                                        </p>

                                        <div className="mt-5 flex flex-wrap items-center gap-2">
                                            {article.topics.map((topic) => (
                                                <span
                                                    key={topic}
                                                    className="rounded-full border border-line px-3 py-1 text-xs text-muted"
                                                >
                                                    {topic}
                                                </span>
                                            ))}

                                            <span className="ml-auto flex items-center gap-4">
                                                <a
                                                    href={articleOfflineHref(article)}
                                                    download
                                                    className="relative z-10 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-bone"
                                                    title={`Self-contained copy that opens without a network (${article.offlineSize})`}
                                                >
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        width="13"
                                                        height="13"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2.2"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        aria-hidden="true"
                                                    >
                                                        <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
                                                    </svg>
                                                    Offline copy
                                                    <span className="text-line">·</span>
                                                    {article.offlineSize}
                                                </a>
                                                <span className="text-sm font-semibold text-accent">
                                                    Read
                                                    <span
                                                        aria-hidden="true"
                                                        className="ml-1 inline-block transition-transform group-hover:translate-x-0.5"
                                                    >
                                                        →
                                                    </span>
                                                </span>
                                            </span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>

                        {articles.length === 1 && (
                            <p className="mt-8 text-sm text-muted">
                                More is being written. If there is something you would like covered,
                                the{" "}
                                <Link
                                    href="/#demo"
                                    className="underline decoration-line underline-offset-4 hover:decoration-accent"
                                >
                                    contact form
                                </Link>{" "}
                                reaches us.
                            </p>
                        )}
                    </div>
                </section>
            </main>
            <Footer />
            <CookieNotice />
        </div>
    );
}
