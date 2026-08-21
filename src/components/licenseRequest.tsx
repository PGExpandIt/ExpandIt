"use client";

import React, { useEffect, useMemo, useState } from "react";
import { fetchKchatConfig, solveChallenge, requestCode, errorFrom, type KchatConfig } from "@/lib/kchat";

// Set NEXT_PUBLIC_LICENSE_API to the deployed relay base (see kchat-api). Left
// unset, the form falls back to a mailto so a bare static deploy still works.
const API = process.env.NEXT_PUBLIC_LICENSE_API?.replace(/\/$/, "") ?? "";
const RECIPIENT = "sales@vallus.eu";

const fieldClass =
    "mt-1.5 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-bone placeholder:text-muted/70 focus:border-accent focus:outline-none";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

interface Draft {
    company: string;
    email: string;
    marketing: boolean;
}

type Phase = "form" | "code" | "success";

export default function LicenseRequest() {
    const [phase, setPhase] = useState<Phase>("form");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Relay capabilities, resolved once after mount.
    const [config, setConfig] = useState<KchatConfig | null>(null);
    const [solution, setSolution] = useState<number | null>(null);

    // Carried between step 1 (details) and step 2 (code).
    const [draft, setDraft] = useState<Draft | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<number>(0);
    const [now, setNow] = useState<number>(() => Date.now());

    // Resolve the challenge in the background so it is ready before submit.
    useEffect(() => {
        if (!API) return;
        let cancelled = false;
        void fetchKchatConfig(API)
            .then((cfg) => {
                if (cancelled) return;
                setConfig(cfg);
                if (cfg.challenge) {
                    void solveChallenge(cfg.challenge).then((n) => {
                        if (!cancelled) setSolution(n);
                    });
                }
            })
            .catch(() => {
                /* offline — submit still works, one-step, or via mailto */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Countdown while the code is pending.
    useEffect(() => {
        if (phase !== "code") return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [phase]);

    const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
    const mmss = useMemo(() => {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
    }, [remaining]);

    async function submitRegister(payload: Record<string, unknown>): Promise<void> {
        const res = await fetch(`${API}/register`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await errorFrom(res, `The request failed (${res.status}).`));
    }

    async function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting) return;
        const data = new FormData(event.currentTarget);
        const website = ((data.get("website") as string) ?? "").trim();
        if (website) {
            setPhase("success"); // honeypot — pretend
            return;
        }

        const company = ((data.get("company") as string) ?? "").trim();
        const email = ((data.get("email") as string) ?? "").trim();
        const marketing = data.get("marketing") != null;
        if (!company || !email) {
            setError("Company and work e-mail are both required.");
            return;
        }

        // No backend → mailto.
        if (!API) {
            const subject = encodeURIComponent(`Free licence request — ${company}`);
            const body = encodeURIComponent(
                `Company (exact, case-sensitive): ${company}\nWork e-mail: ${email}\n\n` +
                    `I request a free vallus licence and accept the free licence terms and privacy notice.`,
            );
            window.location.href = `mailto:${RECIPIENT}?subject=${subject}&body=${body}`;
            setPhase("success");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            if (config?.otp) {
                if (config.challenge && solution === null) {
                    throw new Error("Still preparing — please try again in a second.");
                }
                const issued = await requestCode(API, { email, challenge: config.challenge, solution, website });
                setDraft({ company, email, marketing });
                setToken(issued.token);
                setExpiresAt(issued.expiresAt);
                setNow(Date.now());
                setPhase("code");
            } else {
                await submitRegister({ company, email, marketing, website });
                setPhase("success");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting || !draft || !token) return;
        const code = ((new FormData(event.currentTarget).get("code") as string) ?? "").trim();
        if (!code) {
            setError("Enter the code from the e-mail.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await submitRegister({ ...draft, code, token });
            setPhase("success");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    async function resend() {
        if (submitting || !draft) return;
        setSubmitting(true);
        setError(null);
        try {
            // The proof-of-work is single-use, so fetch and solve a fresh one.
            const cfg = await fetchKchatConfig(API);
            const sol = cfg.challenge ? await solveChallenge(cfg.challenge) : null;
            const issued = await requestCode(API, { email: draft.email, challenge: cfg.challenge, solution: sol });
            setToken(issued.token);
            setExpiresAt(issued.expiresAt);
            setNow(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not resend the code.");
        } finally {
            setSubmitting(false);
        }
    }

    if (phase === "success") {
        return (
            <div className="rounded-lg border border-line bg-surface p-8">
                <h3 className="text-lg font-semibold text-bone">Request received</h3>
                <p className="mt-4 max-w-2xl leading-relaxed text-muted">
                    Thanks — we have your request. Your free licence is delivered to the address
                    you gave us <span className="text-bone">within 24 hours</span>, with the exact
                    company name to enter.
                </p>
            </div>
        );
    }

    if (phase === "code") {
        return (
            <form onSubmit={handleCodeSubmit} className="rounded-lg border border-line bg-surface p-8">
                <h3 className="text-lg font-semibold text-bone">Enter the code</h3>
                <p className="mt-2 max-w-2xl text-sm text-muted">
                    We e-mailed a code to <span className="text-bone">{draft?.email}</span>. Enter it
                    to confirm the address and send your request.
                </p>

                <div className="mt-6">
                    <label className={labelClass} htmlFor="code">
                        Verification code
                    </label>
                    <input
                        id="code"
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        className={`${fieldClass} tracking-[0.3em]`}
                        placeholder="123456"
                    />
                    <p className="mt-1.5 text-xs text-muted">
                        {remaining > 0 ? `Valid for ${mmss}.` : "The code has expired — resend a new one."}
                    </p>
                </div>

                {error && (
                    <p role="alert" className="mt-4 rounded-md border border-amber/60 bg-ink px-4 py-3 text-sm text-amber">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={submitting || remaining === 0}
                    className="mt-6 w-full cursor-pointer rounded-md bg-accent px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {submitting ? "Verifying…" : "Confirm and send"}
                </button>

                <button
                    type="button"
                    onClick={resend}
                    disabled={submitting}
                    className="mt-3 w-full cursor-pointer text-sm text-muted underline transition-colors hover:text-bone disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Resend the code
                </button>
            </form>
        );
    }

    return (
        <form onSubmit={handleFormSubmit} className="rounded-lg border border-line bg-surface p-8">
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
                    <input id="company" name="company" required autoComplete="organization" className={fieldClass} placeholder="Acme Inc." />
                    <p className="mt-1.5 text-xs text-muted">
                        Used exactly as typed — the key is bound to this name, matched case-sensitively.
                    </p>
                </div>
                <div>
                    <label className={labelClass} htmlFor="email">
                        Work e-mail *
                    </label>
                    <input id="email" name="email" type="email" required autoComplete="email" className={fieldClass} placeholder="alex@acme.com" />
                    <p className="mt-1.5 text-xs text-muted">The key is delivered here after you confirm the address.</p>
                </div>
            </div>

            {/* Honeypot */}
            <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor="website">Leave this field empty</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

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

            <label className="mt-4 flex items-start gap-3 text-sm text-muted">
                <input type="checkbox" name="marketing" className="mt-1 shrink-0" />
                <span>
                    Optional: e-mail me product updates about vallus. I can withdraw this anytime —
                    it has no effect on my licence.
                </span>
            </label>

            {error && (
                <p role="alert" className="mt-4 rounded-md border border-amber/60 bg-ink px-4 py-3 text-sm text-amber">
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={submitting}
                className="mt-6 w-full cursor-pointer rounded-md bg-accent px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-60"
            >
                {submitting ? "Sending…" : config?.otp ? "Send verification code" : "Request free key"}
            </button>
        </form>
    );
}
