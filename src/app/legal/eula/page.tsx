import React from "react";
import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legalPage";
import { readEula, isDraft } from "@/lib/eula";

// The licence customers are bound by, rendered from the file that ships with the
// product rather than transcribed. See src/lib/eula.ts for why.
//
// NOT LINKED FROM ANYWHERE YET, AND DELIBERATELY NOT INDEXED. Publishing a licence
// is the act that makes it apply: anyone who obtains the Software after reading it
// here is bound by these words, including the liability cap. While the file still
// carries its DRAFT banner that has not been through a lawyer, so the page exists
// to be reviewed, not to be found. Before linking it:
//
//   1. remove the draft banner from the LICENSE files once the review is done,
//   2. re-copy it to public/legal/vallus-eula.txt (the page reads that copy),
//   3. drop the `robots` block below,
//   4. add it to src/app/sitemap.ts and to the footer.
//
// Step 3 is the one to be deliberate about. The rest are reversible.

const eula = readEula();
const draft = isDraft(eula);

export const metadata: Metadata = {
    title: "End User Licence Agreement - vallus | ExpandIt",
    description:
        "The licence that governs use of vallus: a proprietary, binary-only licence gated by a signed key, for self-hosted installations including networks with no route to the internet.",
    alternates: { canonical: "/legal/eula/" },
    // Removed when the licence goes live. Until then an unlinked page is still a
    // crawlable one, and a draft licence in a search index is a draft licence
    // somebody can rely on.
    ...(draft ? { robots: { index: false, follow: false } } : {}),
};

export default function EulaPage() {
    return (
        <LegalPage
            lang="en"
            title="End User Licence Agreement"
            subtitle={
                <>
                    vallus, binary distribution. This is the licence supplied in the distribution
                    archive as <code className="text-bone">LICENSE</code>; the copy in your archive
                    is the one that binds.{" "}
                    <a
                        href="/legal/vallus-eula.txt"
                        className="underline decoration-line underline-offset-4 hover:decoration-accent"
                    >
                        Plain text
                    </a>
                    .
                </>
            }
            backLabel="Back to vallus.eu"
            otherLanguage={{ href: "/licenses/", label: "Third-party licences" }}
            footnote={
                <p>
                    <strong className="text-bone">What this licence is not.</strong> It is not an
                    open-source licence and does not convert into one. The source code of vallus is
                    not published and no right to it is granted here. Open-source components
                    distributed with the product keep their own terms, listed in{" "}
                    <code className="text-bone">THIRD_PARTY_NOTICES.txt</code> in the archive and
                    summarised on the{" "}
                    <a
                        href="/licenses/"
                        className="underline decoration-line underline-offset-4 hover:decoration-accent"
                    >
                        third-party licences page
                    </a>
                    .
                </p>
            }
        >
            {draft && (
                <div
                    role="note"
                    className="mt-8 rounded-lg border border-amber/40 bg-amber/5 p-5 text-sm leading-relaxed text-muted"
                >
                    <strong className="text-amber">Draft, not in force.</strong> This text has not
                    been reviewed by a lawyer and is published here for review only. It does not
                    govern any copy of the Software distributed so far. The terms that apply to a
                    given copy are the ones in that copy&apos;s own{" "}
                    <code className="text-bone">LICENSE</code> file.
                </div>
            )}

            <div className="mt-8 space-y-1 text-sm text-muted">
                {eula.preamble.map((line) => (
                    <p key={line}>{line}</p>
                ))}
            </div>

            {eula.sections.map((section) => (
                <Section key={section.number} title={`${section.number}. ${section.title}`}>
                    {section.clauses.map((clause, index) => (
                        <div key={`${section.number}-${index}`}>
                            <p>
                                {clause.number && (
                                    <span className="font-medium text-bone">{clause.number} </span>
                                )}
                                {clause.text}
                            </p>
                            {clause.items.length > 0 && (
                                <ul className="mt-2 space-y-2 pl-5">
                                    {clause.items.map((item) => (
                                        <li key={item} className="list-none">
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </Section>
            ))}
        </LegalPage>
    );
}
