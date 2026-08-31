import React from "react";
import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legalPage";

export const metadata: Metadata = {
    title: "Third-party licences - vallus | ExpandIt",
    description:
        "Open-source software and typefaces distributed as part of the vallus website, with their copyright notices and licences.",
    alternates: { canonical: "/licenses/" },
};

// Only what is actually distributed belongs here - the build tools that never leave
// the machine create no obligations. Verified by searching the exported output:
// no sharp, lightningcss, caniuse-lite or axe-core end up in it.

interface Entry {
    name: string;
    what: string;
    copyright: string;
    licence: string;
    href: string;
}

const SOFTWARE: Entry[] = [
    {
        name: "Next.js",
        what: "The framework this site is built and exported with; its runtime ships in the page.",
        copyright: "Copyright (c) 2025 Vercel, Inc.",
        licence: "MIT",
        href: "https://github.com/vercel/next.js/blob/canary/license.md",
    },
    {
        name: "React and React DOM",
        what: "The UI library behind the interactive parts - the booking calendar and this page's chrome.",
        copyright: "Copyright (c) Meta Platforms, Inc. and affiliates.",
        licence: "MIT",
        href: "https://github.com/facebook/react/blob/main/LICENSE",
    },
    {
        name: "Tailwind CSS",
        what: "Generates the stylesheet served with the site.",
        copyright: "Copyright (c) Tailwind Labs, Inc.",
        licence: "MIT",
        href: "https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE",
    },
    {
        name: "Bunny Edge Scripting SDK",
        what: "Runs the booking service that this site talks to.",
        copyright: "Copyright (c) bunny.net",
        licence: "MIT",
        href: "https://www.npmjs.com/package/@bunny.net/edgescript-sdk",
    },
];

const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

export default function Licenses() {
    return (
        <LegalPage
            lang="en"
            title="Third-party licences"
            subtitle={
                <>
                    Open-source software and typefaces distributed as part of this site, with the
                    notices their licences require. Last reviewed 2 August 2026.
                </>
            }
            backLabel="← Back to the site"
            otherLanguage={{ href: "/privacy/", label: "Privacy notice", lang: "en" }}
            footnote={
                <>
                    This page lists what is actually served to your browser. Tools used only to
                    build the site never reach it and are not listed. vallus itself is not
                    open-source software: it is proprietary, distributed in binary form under
                    its End User Licence Agreement, and needs a valid licence key to run. Its
                    source code is not published.
                </>
            }
        >
            <Section title="Typefaces">
                <p>
                    <strong className="text-bone">Geist</strong> and{" "}
                    <strong className="text-bone">Geist Mono</strong> are served from this site as
                    web fonts.
                </p>
                <pre className="mt-4 overflow-x-auto rounded-md border border-line bg-ink p-4 font-mono text-xs leading-relaxed text-muted">
                    {`Copyright (c) 2023 Vercel, in collaboration with basement.studio

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is available with a FAQ at: https://openfontlicense.org`}
                </pre>
                <p>
                    Full text:{" "}
                    <a
                        href="https://github.com/vercel/geist-font/blob/main/LICENSE.txt"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-bone underline decoration-line underline-offset-4 hover:decoration-accent"
                    >
                        vercel/geist-font - LICENSE.txt
                    </a>
                </p>
            </Section>

            <Section title="Software">
                <p>
                    Each of the following is used under the MIT licence, whose text is reproduced
                    once below.
                </p>
                <div className="mt-4 space-y-4">
                    {SOFTWARE.map((entry) => (
                        <div key={entry.name} className="rounded-md border border-line bg-ink-soft p-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h3 className="text-base font-semibold text-bone">{entry.name}</h3>
                                <a
                                    href={entry.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-muted underline decoration-line underline-offset-4 hover:text-bone"
                                >
                                    {entry.licence} licence
                                </a>
                            </div>
                            <p className="mt-1 text-sm text-muted">{entry.what}</p>
                            <p className="mt-2 font-mono text-xs text-muted">{entry.copyright}</p>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="The MIT licence">
                <pre className="overflow-x-auto rounded-md border border-line bg-ink p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted">
                    {MIT_TEXT}
                </pre>
            </Section>

            <Section title="Trademarks">
                <p>
                    Playwright, Allure, Jira, Xray, Jenkins, GitHub, Azure, Keycloak, Grafana and
                    ReportPortal are trademarks of their respective owners. They are named on this
                    site only to describe what vallus works with, and their owners neither endorse
                    nor are affiliated with it.
                </p>
            </Section>
        </LegalPage>
    );
}
