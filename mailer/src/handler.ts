// The mailer API as one Web-standard handler: Request in, Response out. Only the
// edge calls it, authenticated by an HMAC signature over the raw body - there is no
// CORS or browser here, so a bad signature is the only gate that matters.

import type { Config } from "./config.js";
import { verify } from "./hmac.js";
import type { CodeSender } from "./mailer.js";

const MAX_BODY_BYTES = 4 * 1024;
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
const CODE = /^\d{4,8}$/;

const json = (status: number, payload: unknown): Response =>
    new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });

/** Per-recipient send attempts, so a leaked signing secret still cannot bomb one inbox. */
const attempts = new Map<string, number[]>();

const rateLimited = (email: string, perHour: number): boolean => {
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recent = (attempts.get(email) ?? []).filter((at) => at > hourAgo);
    attempts.set(email, recent);
    if (recent.length >= perHour) return true;
    recent.push(Date.now());
    return false;
};

export const createHandler = (config: Config, sender: CodeSender) => {
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/health") {
            return json(200, { ok: true });
        }

        if (request.method !== "POST" || url.pathname !== "/send-code") {
            return json(404, { error: "not_found" });
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });

        // Authenticate: the signature must cover the exact bytes we received.
        const signature = request.headers.get("x-signature") ?? "";
        if (!(await verify(config.authSecret, raw, signature))) {
            return json(401, { error: "bad_signature" });
        }

        let body: any;
        try {
            body = JSON.parse(raw || "{}");
        } catch {
            return json(400, { error: "bad_request" });
        }

        const email = String(body?.email ?? "").trim();
        const code = String(body?.code ?? "").trim();
        if (!EMAIL.test(email) || email.length > 200) return json(400, { error: "invalid_email" });
        if (!CODE.test(code)) return json(400, { error: "invalid_code" });

        if (rateLimited(email.toLowerCase(), config.rateLimitPerHour)) {
            return json(429, { error: "rate_limited" });
        }

        try {
            await sender.sendCode(email, code);
        } catch (error) {
            // The SMTP error can carry the mailbox address or server detail - log it,
            // return something generic.
            console.error(`[mailer] send to ${email} failed:`, error);
            return json(502, { error: "send_failed" });
        }

        return json(200, { ok: true });
    };
};
