// Calls the off-edge mailer to deliver a code. The edge never opens SMTP itself
// (Bunny discourages it and it risks the account); it hands the code to the mailer
// over HTTP, signing the body with the shared secret so only we can trigger a send.

import { hmacHex } from "./otp.js";

export const sendCodeViaMailer = async (
    mailerUrl: string,
    mailerSecret: string,
    email: string,
    code: string,
): Promise<void> => {
    const raw = JSON.stringify({ email, code });
    const signature = await hmacHex(mailerSecret, raw);
    const res = await fetch(`${mailerUrl}/send-code`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-signature": signature },
        body: raw,
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`mailer /send-code → ${res.status}: ${detail.slice(0, 200)}`);
    }
};

/** Why the mailer declined to issue a key automatically. */
export type ManualReason = "personal_email" | "company_has_licence";

export type LicenseOutcome =
    /** Mailed. `reissued` when the organisation already had a valid key and got it again. */
    | { sent: true; expires: string; reissued: boolean }
    /** Nothing mailed: the mailer's one-licence-per-organisation rule wants a human. */
    | { sent: false; reason: ManualReason };

/**
 * Asks the mailer to sign a free licence for `company` and mail it to `email`. The key
 * never comes back here - only its expiry, for the notification in the channel.
 */
export const sendLicenseViaMailer = async (
    mailerUrl: string,
    mailerSecret: string,
    email: string,
    company: string,
): Promise<LicenseOutcome> => {
    const raw = JSON.stringify({ email, company });
    const signature = await hmacHex(mailerSecret, raw);
    const res = await fetch(`${mailerUrl}/send-license`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-signature": signature },
        body: raw,
    });
    if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { reason?: unknown };
        if (body.reason === "personal_email" || body.reason === "company_has_licence") {
            return { sent: false, reason: body.reason };
        }
    }
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`mailer /send-license → ${res.status}: ${detail.slice(0, 200)}`);
    }
    const body = (await res.json()) as { expires?: unknown; reissued?: unknown };
    if (typeof body.expires !== "string") throw new Error("mailer /send-license answered without an expiry");
    return { sent: true, expires: body.expires, reissued: body.reissued === true };
};
