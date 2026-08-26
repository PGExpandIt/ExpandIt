// Calls the off-edge mailer to deliver a code. Copy of kchat-api's client - see
// the note at the top of otp.ts for why these are duplicated, not shared.
//
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
