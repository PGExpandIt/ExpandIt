"use client";

import React, { useState } from "react";

// Set NEXT_PUBLIC_LICENSE_API to the deployed license-signup edge origin (see
// playwrightRunner-ts/documentation-ignored/licensing-signup.md). Left unset, the
// form falls back to a mailto request so a plain static deployment still works.
const API = process.env.NEXT_PUBLIC_LICENSE_API?.replace(/\/$/, "") ?? "";
const RECIPIENT = "sales@vallus.eu";

const fieldClass =
    "mt-1.5 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-bone placeholder:text-muted/70 focus:border-accent focus:outline-none";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type Status = "idle" | "submitting" | "success" | "error";

export default function LicenseRequest() {
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);

        // Honeypot: a real user never fills a field hidden from view. Silently
        // treat a filled one as done so the bot gets no signal.
        if (((data.get("website") as string) ?? "").trim()) {
            setStatus("success");
            return;
        }

        const company = ((data.get("company") as string) ?? "").trim();
        const email = ((data.get("email") as string) ?? "").trim();
        if (!company || !email) {
            setStatus("error");
            setError("Company and work e-mail are both required.");
            return;
        }

        // Optional marketing consent — the only true GDPR consent here. The
        // operational data (company + e-mail) is processed to perform the licence
        // agreement, not on consent, so it is not gated by this box.
        const marketing = data.get("marketing") != null;

        // No backend configured → hand the request to the visitor's mail client.
        if (!API) {
            const subject = encodeURIComponent(`Free licence request — ${company}`);
            const body = encodeURIComponent(
                `Company (exact, case-sensitive — this goes into the key): ${company}\n` +
                    `Work e-mail: ${email}\n` +
                    `Product-update e-mails: ${marketing ? "yes" : "no"}\n\n` +
                    `I request a free vallus licence and accept the free licence terms ` +
                    `and privacy policy shown on the Free page.`,
            );
            window.location.href = `mailto:${RECIPIENT}?subject=${subject}&body=${body}`;
            setStatus("success");
            return;
        }

        setStatus("submitting");
        setError(null);
        try {
            const res = await fetch(`${API}/register`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ company, email, marketing }),
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                throw new Error(
                    (payload?.error as string) ?? `The request failed (${res.status}). Please try again.`,
                );
            }
            setStatus("success");
        } catch (e) {
            setStatus("error");
            setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
        }
    }

    if (status === "success") {
        return (
            <div className="rounded-lg border border-line bg-surface p-8">
                <h3 className="text-lg font-semibold text-bone">Request received</h3>
                <p className="mt-4 max-w-2xl leading-relaxed text-muted">
                    Check your inbox and confirm your e-mail — that verification is what
                    releases the key. Once confirmed, your free licence is delivered to that
                    address <span className="text-bone">within 24 hours</span>, with the exact
                    company name to enter.
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-surface p-8">
            <h3 className="text-lg font-semibold text-bone">Request a free key</h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
                Delivered within 24 hours of e-mail confirmation. The free licence runs for
                6 months and is renewable — it is never perpetual.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                    <label className={labelClass} htmlFor="company">
                        Company *
                    </label>
                    <input
                        id="company"
                        name="company"
                        required
                        autoComplete="organization"
                        className={fieldClass}
                        placeholder="Acme Inc."
                    />
                    <p className="mt-1.5 text-xs text-muted">
                        Used exactly as typed — the key is bound to this name, matched
                        case-sensitively.
                    </p>
                </div>
                <div>
                    <label className={labelClass} htmlFor="email">
                        Work e-mail *
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        className={fieldClass}
                        placeholder="alex@acme.com"
                    />
                    <p className="mt-1.5 text-xs text-muted">
                        The key is delivered here after you confirm the address.
                    </p>
                </div>
            </div>

            {/* Honeypot — off-screen, not display:none, so bots that skip hidden
                fields still fill it. aria-hidden + tabIndex keep it away from users. */}
            <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor="website">Leave this field empty</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            {/* Required — acceptance of the licence terms and privacy notice. This
                is NOT GDPR consent: the company + e-mail are processed to perform
                the licence agreement (necessary), not on a consent basis. */}
            <label className="mt-6 flex items-start gap-3 text-sm text-muted">
                <input type="checkbox" name="terms" required className="mt-1 shrink-0" />
                <span>
                    I accept the free licence terms and the{" "}
                    <a href="/privacy/" className="text-bone underline hover:text-accent">
                        privacy notice
                    </a>
                    . To issue, deliver and renew the key, ExpandIt stores my company name and
                    e-mail — necessary to provide the licence. If I have this data erased, the
                    free licence ends: the key may no longer be used and, on request, I will
                    confirm its removal.
                </span>
            </label>

            {/* Optional — the only true GDPR consent. Withdrawable at any time with
                no effect on the licence, so it must not be `required`. */}
            <label className="mt-4 flex items-start gap-3 text-sm text-muted">
                <input type="checkbox" name="marketing" className="mt-1 shrink-0" />
                <span>
                    Optional: e-mail me product updates about vallus. I can withdraw this
                    anytime — it has no effect on my licence.
                </span>
            </label>

            {error && (
                <p
                    role="alert"
                    className="mt-4 rounded-md border border-amber/60 bg-ink px-4 py-3 text-sm text-amber"
                >
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={status === "submitting"}
                className="mt-6 w-full cursor-pointer rounded-md bg-accent px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-60"
            >
                {status === "submitting" ? "Sending…" : "Request free key"}
            </button>
        </form>
    );
}
