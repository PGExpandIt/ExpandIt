"use client";

import React, { useEffect, useMemo, useState } from "react";
import { fetchKchatConfig, solveChallenge, requestCode, errorFrom, type KchatConfig } from "@/lib/kchat";

// Set NEXT_PUBLIC_KCHAT_API to the deployed relay base (see kchat-api). Left unset,
// the form falls back to a mailto so a bare static deploy still works.
const API = process.env.NEXT_PUBLIC_KCHAT_API?.replace(/\/$/, "") ?? "";
const RECIPIENT = "sales@vallus.eu";

const fieldClass =
    "mt-1.5 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-bone placeholder:text-muted/70 focus:border-accent focus:outline-none";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

interface Draft {
    name: string;
    email: string;
    subject: string;
    message: string;
}

type Phase = "form" | "code" | "success";

export default function ContactKchat() {
    const [phase, setPhase] = useState<Phase>("form");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [config, setConfig] = useState<KchatConfig | null>(null);
    const [solution, setSolution] = useState<number | null>(null);

    const [draft, setDraft] = useState<Draft | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<number>(0);
    const [now, setNow] = useState<number>(() => Date.now());

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
                /* offline - submit still works, one-step, or via mailto */
            });
        return () => {
            cancelled = true;
        };
    }, []);

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

    async function submitMessage(payload: Record<string, unknown>): Promise<void> {
        const res = await fetch(`${API}/message`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await errorFrom(res, `The message could not be sent (${res.status}).`));
    }

    async function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting) return;
        const data = new FormData(event.currentTarget);
        const website = ((data.get("website") as string) ?? "").trim();
        if (website) {
            setPhase("success");
            return;
        }

        const name = ((data.get("name") as string) ?? "").trim();
        const email = ((data.get("email") as string) ?? "").trim();
        const subject = ((data.get("subject") as string) ?? "").trim();
        const message = ((data.get("message") as string) ?? "").trim();
        if (!message) {
            setError("Please write a message.");
            return;
        }
        if (config?.otp && !email) {
            setError("An e-mail is required so we can send you a verification code.");
            return;
        }

        // No backend → mailto.
        if (!API) {
            const mailSubject = encodeURIComponent(subject || "Message from the vallus website");
            const body = encodeURIComponent(`${message}\n\n- ${name || "(no name)"}${email ? ` <${email}>` : ""}`);
            window.location.href = `mailto:${RECIPIENT}?subject=${mailSubject}&body=${body}`;
            setPhase("success");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            if (config?.otp) {
                if (config.challenge && solution === null) {
                    throw new Error("Still preparing - please try again in a second.");
                }
                const issued = await requestCode(API, { email, challenge: config.challenge, solution, website });
                setDraft({ name, email, subject, message });
                setToken(issued.token);
                setExpiresAt(issued.expiresAt);
                setNow(Date.now());
                setPhase("code");
            } else {
                if (config?.challenge && solution === null) {
                    throw new Error("Still preparing - please try again in a second.");
                }
                await submitMessage({
                    name,
                    email,
                    subject,
                    message,
                    website,
                    challenge: config?.challenge?.token,
                    solution,
                });
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
            await submitMessage({ ...draft, code, token });
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
                <h3 className="text-lg font-semibold text-bone">Message sent</h3>
                <p className="mt-4 max-w-2xl leading-relaxed text-muted">
                    Thanks - it has reached our team. We will get back to you at the address you
                    left, usually within one business day.
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
                    to confirm the address and send your message.
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
                        {remaining > 0 ? `Valid for ${mmss}.` : "The code has expired - resend a new one."}
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
            <h3 className="text-lg font-semibold text-bone">Send us a message</h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
                A question about vallus? Write to us and it lands straight with the team.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                    <label className={labelClass} htmlFor="name">
                        Name
                    </label>
                    <input id="name" name="name" autoComplete="name" className={fieldClass} placeholder="Alex Doe" />
                </div>
                <div>
                    <label className={labelClass} htmlFor="email">
                        E-mail
                    </label>
                    <input id="email" name="email" type="email" autoComplete="email" className={fieldClass} placeholder="alex@acme.com" />
                    <p className="mt-1.5 text-xs text-muted">So we can reply.</p>
                </div>
            </div>

            <div className="mt-5">
                <label className={labelClass} htmlFor="subject">
                    Subject
                </label>
                <input id="subject" name="subject" className={fieldClass} placeholder="What is this about?" />
            </div>

            <div className="mt-5">
                <label className={labelClass} htmlFor="message">
                    Message *
                </label>
                <textarea id="message" name="message" required rows={5} className={`${fieldClass} resize-y`} placeholder="How can we help?" />
            </div>

            {/* Honeypot */}
            <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor="website">Leave this field empty</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

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
                {submitting ? "Sending…" : config?.otp ? "Send verification code" : "Send message"}
            </button>
        </form>
    );
}
