import React from "react";

// New in 1.7: the Evidence tab and release sign-off. Every claim here is checked
// against INSTRUCTION.md §10a in both runners - the licence line in particular
// follows the `signoff` feature of the key presets (Business, Enterprise, source
// and evaluation keys carry it; Team and Free do not), so edit the two together.

const STEPS = [
    {
        step: "01",
        title: "Every test in one catalogue",
        body: "The Evidence tab lists every test your workflows ran, across all of them: last result, pass rate, flakiness and history, with the full text of its latest error. Filter by tag, status or file, for one environment or all of them.",
    },
    {
        step: "02",
        title: "Requirements traced from tags",
        body: "Name a tag prefix such as REQ- and a test tagged @REQ-12 counts towards that requirement. You see which requirements are met, not met or not verified - and a test that quietly stopped running shows as not run, so its requirement cannot look met by omission. Exports to CSV.",
    },
    {
        step: "03",
        title: "Releases an approver signs",
        body: "Gather a release's runs, review its requirement matrix and sign. The approver re-enters their password, nobody may sign a release they helped assemble, and signing over a requirement that is not met needs a written justification.",
    },
];

const PACK = [
    "Signing freezes the release into an evidence pack: a summary, a readable report, and a manifest with the SHA-256 of every file.",
    "Every creation, change of runs, signature and rejection is an entry in a hash-chained audit trail.",
    "Each run records the code it ran - the commit, or a content hash where there is no git - so a release names exactly what was tested.",
    "The runs of a signed release are never removed by history retention.",
];

const Evidence = () => (
    <section id="evidence" className="border-b border-line bg-ink-soft">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                New in 1.7 · Test evidence
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-bone sm:text-4xl">
                From a green run to a signed release your auditor can check
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
                A regulated team is asked more than whether the tests passed: what was tested,
                against which requirement, on which version of the code, and who approved it.
                vallus now answers all four - on your own server, with the proof in a file that
                travels without it.
            </p>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
                {STEPS.map(({ step, title, body }) => (
                    <article key={step} className="rounded-lg border border-line bg-surface p-6">
                        <span className="font-mono text-sm text-accent">{step}</span>
                        <h3 className="mt-3 text-lg font-semibold text-bone">{title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                    </article>
                ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <article className="rounded-lg border border-line bg-surface p-6">
                    <h3 className="text-lg font-semibold text-bone">The evidence pack</h3>
                    <ul className="mt-4 space-y-2.5">
                        {PACK.map((point) => (
                            <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                                <span aria-hidden="true" className="text-accent">
                                    ✓
                                </span>
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                </article>

                {/* min-w-0: a grid item is as wide as its longest line by default, and
                    the command below widened the whole page on a phone. */}
                <div className="flex min-w-0 flex-col rounded-lg border border-line bg-surface p-6">
                    <h3 className="text-lg font-semibold text-bone">Checked offline, without vallus running</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                        An auditor needs the ZIP and the vallus binary - no instance, no login, no
                        network.
                    </p>
                    <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-ink p-5">
                        {/* The output is the one pack.rs and pack.ts print, word for word. */}
                        <pre className="font-mono text-xs leading-relaxed text-muted sm:text-sm">
                            <code>{`$ vallus --verify-pack \\
    rel-20261010142200-7c3e-evidence-pack.zip
Pack verified: every file matches manifest.json.
packSha256 3b9e41c07a2d...5d81f`}</code>
                        </pre>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-muted">
                        Keep that hash somewhere outside the instance: it, not the audit trail
                        alone, is what proves a pack unchanged.
                    </p>
                </div>
            </div>

            <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">
                <span className="font-semibold text-bone">In every plan:</span> the test catalogue
                and requirement coverage, and reading and verifying signed releases.{" "}
                <span className="font-semibold text-bone">Business and above:</span> creating,
                signing and rejecting releases.
            </p>
        </div>
    </section>
);

export default Evidence;
